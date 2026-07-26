const crypto = require("node:crypto");
const { createArticleRemovalTransactionStore } = require("./article-removal-transaction-store");

function removalError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function clone(value) { return value === undefined ? value : JSON.parse(JSON.stringify(value)); }

function selection(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      typeof value.clientId !== "string" || !value.clientId.trim() ||
      typeof value.articleId !== "string" || !value.articleId.trim()) {
    throw removalError("CONTENT_INPUT_INVALID", "Article selection is invalid");
  }
  return { clientId: value.clientId, articleId: value.articleId };
}

function selections(input) {
  const values = Array.isArray(input) ? input : input && (input.selections || input.articles);
  if (!Array.isArray(values) || !values.length) throw removalError("CONTENT_INPUT_INVALID", "At least one article is required");
  const result = values.map(selection);
  const seen = new Set();
  result.forEach(function(value) {
    const key = value.clientId + "\0" + value.articleId;
    if (seen.has(key)) throw removalError("CONTENT_INPUT_INVALID", "Article selection contains duplicates");
    seen.add(key);
  });
  return result;
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function actionIdentity(action) {
  return {
    clientId: action.clientId,
    articleId: action.articleId,
    batchId: action.batchId || null,
    publicationId: action.publicationId || null,
    targetPlatformId: action.targetPlatformId || null,
    attemptId: action.attemptId || null,
    action: action.action || null
  };
}

function transactionFingerprint(selectionsValue, queueActions) {
  const selectionKeys = selectionsValue.map(function(item) { return item.clientId + "\0" + item.articleId; }).sort();
  const actionKeys = (queueActions || []).map(actionIdentity).sort(function(left, right) { return JSON.stringify(left).localeCompare(JSON.stringify(right)); });
  return fingerprint({ selections: selectionKeys, actions: actionKeys });
}

function isOpenStatus(status) {
  return ["pending_auto_recovery", "pending_recovery", "needs_repair"].includes(status);
}

function isRepairableError(error) {
  return !!error && [
    "SUBMISSION_QUEUE_CHANGED",
    "SUBMISSION_IDENTITY_CONFLICT",
    "SUBMISSION_CONTENT_CHANGED",
    "PUBLICATION_REMOTE_STARTED",
    "SUBMISSION_QUEUE_ITEM_NOT_FOUND",
    "SUBMISSION_ACTION_STALE",
    "PUBLICATION_ATTEMPT_MISMATCH",
    "PUBLICATION_ATTEMPT_NOT_FAILED",
    "PUBLICATION_STATUS_NOT_FAILED",
    "PUBLICATION_STATUS_NOT_QUEUED",
    "SUBMISSION_STATUS_CONFLICT",
    "SUBMISSION_BATCH_ITEM_NOT_FOUND",
    "SUBMISSION_BATCH_REBIND_CONFLICT",
    "SUBMISSION_ACTION_OPERATION_CONFLICT",
    "SUBMISSION_ACTION_PROTOCOL_UNAVAILABLE"
    ,"ARTICLE_REMOVAL_OPERATION_IN_FLIGHT"
  ].includes(error.code);
}

function titleSnapshot(article) {
  return typeof article.title === "string" && article.title.trim() ? article.title.trim().slice(0, 200) : null;
}

function createArticleRemovalService(options) {
  const opts = options || {};
  if (!opts.contentStore) throw removalError("ARTICLE_REMOVAL_SERVICE_INVALID", "Content store is required");
  if (!opts.submissionService) throw removalError("ARTICLE_REMOVAL_SERVICE_INVALID", "Content submission service is required");
  const contentStore = opts.contentStore;
  const submissionService = opts.submissionService;
  const transactionStore = opts.transactionStore || createArticleRemovalTransactionStore({
    workspaceRoot: opts.workspaceRoot,
    directory: opts.transactionDirectory,
    createId: opts.createTransactionId,
    now: opts.now
  });
  const clock = opts.now || function() { return new Date().toISOString(); };
  const ttlMs = Number.isFinite(opts.tokenTtlMs) ? Math.max(1000, opts.tokenTtlMs) : 5 * 60 * 1000;
  const maxRecoveryAttempts = Number.isFinite(opts.maxRecoveryAttempts) ? Math.max(1, opts.maxRecoveryAttempts) : 5;
  const recoveryBackoffMs = Number.isFinite(opts.recoveryBackoffMs) ? Math.max(1, opts.recoveryBackoffMs) : 1000;
  const makeToken = opts.tokenGenerator || function() { return crypto.randomUUID(); };
  const runnerId = String(opts.runnerId || makeToken());
  const tokens = new Map();
  const completedTransactions = new Map();

  function nowIso() {
    const value = typeof clock === "function" ? clock() : clock;
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw removalError("ARTICLE_REMOVAL_CLOCK_INVALID", "Removal clock is invalid");
    return date.toISOString();
  }

  function persist(transaction) {
    let saved;
    if (transaction && transaction.claimToken && transactionStore.compareAndUpdate) {
      const now = Date.parse(nowIso());
      saved = transactionStore.compareAndUpdate(transaction.id, transaction.revision || 0, function(current) {
        const lease = Date.parse(current.claimLeaseExpiresAt || 0);
        if (current.claimOwner !== runnerId || current.claimToken !== transaction.claimToken || !Number.isFinite(lease) || lease <= now) return null;
        const next = clone(transaction);
        next.claimOwner = runnerId;
        next.claimToken = transaction.claimToken;
        next.claimLeaseExpiresAt = new Date(now + ttlMs).toISOString();
        next.updatedAt = nowIso();
        return next;
      });
      if (!saved) throw removalError("ARTICLE_REMOVAL_CLAIM_LOST", "Removal transaction claim was lost");
      Object.assign(transaction, clone(saved));
    } else saved = transactionStore.save(transaction);
    if (typeof opts.onTransactionStatus === "function") {
      try { opts.onTransactionStatus(clone(saved)); } catch (_) {}
    }
    return saved;
  }

  function validAutomaticState(transaction) {
    return !!transaction && (
      (transaction.status === "pending_auto_recovery" && ["intent", "queue-actions", "articles", "committed"].includes(transaction.phase)) ||
      (transaction.status === "pending_recovery" && ["intent", "queue-actions", "articles", "committed"].includes(transaction.phase))
    );
  }

  function contentIdentity(article) {
    if (!article || article.missing) return { missing: true, clientId: article && article.clientId, articleId: article && article.articleId };
    if (contentStore && typeof contentStore.snapshotArticle === "function") return contentStore.snapshotArticle(article);
    return {
      clientId: article.clientId, articleId: article.id || article.articleId,
      title: article.title || null, content: article.content || article.markdown || article.body || null,
      status: article.status || null, generationBatchId: article.generationBatchId || null,
      generationTaskId: article.generationTaskId || null,
      ...(Object.prototype.hasOwnProperty.call(article, "remark") ? { remark: article.remark } : {}),
      ...(Object.prototype.hasOwnProperty.call(article, "ignoreImages") ? { ignoreImages: article.ignoreImages } : {}),
      ...(Object.prototype.hasOwnProperty.call(article, "source") ? { source: article.source } : {}),
      ...(Object.prototype.hasOwnProperty.call(article, "materialSnapshots") ? { materialSnapshots: article.materialSnapshots } : {}),
      ...(Object.prototype.hasOwnProperty.call(article, "researchSnapshots") ? { researchSnapshots: article.researchSnapshots } : {}),
      ...(Object.prototype.hasOwnProperty.call(article, "templateSnapshot") ? { templateSnapshot: article.templateSnapshot } : {}),
      ...(Object.prototype.hasOwnProperty.call(article, "reviewedAt") ? { reviewedAt: article.reviewedAt } : {}),
      ...(Object.prototype.hasOwnProperty.call(article, "updatedAt") ? { updatedAt: article.updatedAt } : {})
    };
  }

  function articleFingerprint(article) {
    if (contentStore && typeof contentStore.fingerprintArticle === "function") return contentStore.fingerprintArticle(article);
    return fingerprint(contentIdentity(article));
  }

  function operationId(transaction, kind, index) {
    return transaction.id + ":" + kind + ":" + index;
  }

  function beginOperation(transaction, kind, index, item) {
    const expected = operationId(transaction, kind, index);
    if (transaction.activeOperation) {
      if (transaction.activeOperation.operationId === expected && transaction.activeOperation.owner === runnerId) return transaction;
      throw removalError("ARTICLE_REMOVAL_OPERATION_IN_FLIGHT", "Removal operation is already in flight");
    }
    transaction.activeOperation = {
      operationId: expected,
      kind: kind,
      cursor: index,
      owner: runnerId,
      clientId: item && item.clientId || null,
      articleId: item && (item.articleId || item.id) || null
    };
    persist(transaction);
    return transaction;
  }

  function finishOperation(transaction) {
    delete transaction.activeOperation;
  }

  function claim(transaction) {
    if (!transactionStore.compareAndUpdate) return transaction;
    const now = Date.parse(nowIso());
    const leaseExpiresAt = new Date(now + ttlMs).toISOString();
    return transactionStore.compareAndUpdate(transaction.id, transaction.revision || 0, function(current) {
      const owner = current.claimOwner || null;
      const lease = Date.parse(current.claimLeaseExpiresAt || 0);
      if (owner && owner !== runnerId && Number.isFinite(lease) && lease > now) return null;
      current.claimToken = String(makeToken());
      current.claimOwner = runnerId;
      current.claimLeaseExpiresAt = leaseExpiresAt;
      current.claimedAt = nowIso();
      return current;
    });
  }

  function transitionToRepair(transaction, code, resolutionCode) {
    if (transaction.phase !== "needs_repair") transaction.resumePhase = transaction.phase;
    if (transaction.resumePhase === "needs_repair" || !["intent", "queue-actions", "articles", "committed"].includes(transaction.resumePhase)) transaction.resumePhase = "articles";
    transaction.status = "needs_repair";
    transaction.phase = "needs_repair";
    transaction.errorCode = code || "ARTICLE_REMOVAL_RECOVERY_REQUIRED";
    transaction.resolutionCode = resolutionCode || "REMOVAL_REVALIDATION_FAILED";
    transaction.updatedAt = nowIso();
    persist(transaction);
    return transaction;
  }

  function revalidate(transaction) {
    if (!transaction.contentFingerprint) return { ok: false, transaction: transitionToRepair(transaction, "ARTICLE_REMOVAL_CONTENT_FINGERPRINT_MISSING", "LEGACY_CONTENT_FINGERPRINT_REQUIRED") };
    const impact = buildImpact(transaction.selections);
    const resolvedArticles = transaction.selections.map(articleFor);
    const unreadable = resolvedArticles.find(function(article) {
      return article.missing && article.code && article.code !== "ARTICLE_NOT_FOUND";
    });
    if (unreadable) throw removalError(unreadable.code, "Article content could not be revalidated");
    const currentArticles = resolvedArticles.map(contentIdentity);
    const remaining = (transaction.queueActions || []).slice(Number(transaction.queueCursor || 0));
    const fresh = submissionServiceActions(impact);
    const recoverable = [];
    remaining.forEach(function(action, offset) {
      if (typeof submissionService.reconcileArticleRemovalAction !== "function") return;
      const expected = operationId(transaction, "queue", Number(transaction.queueCursor || 0) + offset);
      let proof;
      try { proof = submissionService.reconcileArticleRemovalAction(Object.assign(clone(action), { operationId: expected }), expected); }
      catch (_) { return; }
      if (proof && proof.operationId === expected && ["retryable", "completed"].includes(proof.status)) recoverable.push(action);
    });
    const effectiveFresh = fresh.slice();
    recoverable.forEach(function(action) {
      if (!effectiveFresh.some(function(candidate) { return sameQueueAction(candidate, action); })) effectiveFresh.push(action);
    });
    const blocked = (impact.blockedItems || []).filter(function(blockedItem) {
      return !recoverable.some(function(action) {
        return action.clientId === blockedItem.clientId && action.articleId === blockedItem.articleId &&
          action.batchId === blockedItem.batchId && action.publicationId === blockedItem.publicationId &&
          action.targetPlatformId === blockedItem.targetPlatformId && action.attemptId === blockedItem.attemptId;
      });
    });
    const sameActions = fingerprint(remaining.map(actionIdentity).sort()) === fingerprint(effectiveFresh.map(actionIdentity).sort());
    if (blocked.length) return { ok: false, transaction: transitionToRepair(transaction, "ARTICLE_REMOVAL_BLOCKED", "REMOVAL_BLOCKED_REVALIDATION") };
    if (transaction.contentFingerprint && transaction.contentFingerprint !== fingerprint(currentArticles)) return { ok: false, transaction: transitionToRepair(transaction, "ARTICLE_REMOVAL_CONTENT_CHANGED", "CONTENT_IDENTITY_REVALIDATION_FAILED") };
    if (!sameActions) return { ok: false, transaction: transitionToRepair(transaction, "ARTICLE_REMOVAL_FINGERPRINT_CHANGED", "QUEUE_FINGERPRINT_REVALIDATION_FAILED") };
    return { ok: true, transaction: transaction };
  }

  function revalidateContentRemaining(transaction) {
    if (!transaction.contentFingerprint || !Array.isArray(transaction.contentArticleFingerprints)) return { ok: false, transaction: transitionToRepair(transaction, "ARTICLE_REMOVAL_CONTENT_FINGERPRINT_MISSING", "LEGACY_CONTENT_FINGERPRINT_REQUIRED") };
    const impact = buildImpact(transaction.selections);
    if ((impact.blockedItems || []).length) return { ok: false, transaction: transitionToRepair(transaction, "ARTICLE_REMOVAL_BLOCKED", "REMOVAL_BLOCKED_REVALIDATION") };
    const remaining = (transaction.queueActions || []).slice(Number(transaction.queueCursor || 0));
    let fresh = submissionServiceActions(impact);
    // A completed cancel operation intentionally changes a queued item into a
    // cancelled item.  The preview then derives cleanupCancelledLocal, which is
    // not a new destructive obligation when the original durable operation has
    // already proven both the state transition and stage cleanup.
    const completedCancels = (transaction.queueActions || []).slice(0, Number(transaction.queueCursor || 0)).filter(function(action, index) {
      if (action.action !== "cancel" || typeof submissionService.reconcileArticleRemovalAction !== "function") return false;
      const expected = operationId(transaction, "queue", index);
      try { const proof = submissionService.reconcileArticleRemovalAction(Object.assign(clone(action), { operationId: expected }), expected); return proof && proof.operationId === expected && proof.status === "completed"; }
      catch (_) { return false; }
    });
    if (completedCancels.length) fresh = fresh.filter(function(action) {
      return !(action.action === "cleanupCancelledLocal" && completedCancels.some(function(cancel) {
        return cancel.clientId === action.clientId && cancel.articleId === action.articleId && cancel.batchId === action.batchId && cancel.itemId === action.itemId;
      }));
    });
    if (fingerprint(remaining.map(actionIdentity).sort()) !== fingerprint(fresh.map(actionIdentity).sort())) return { ok: false, transaction: transitionToRepair(transaction, "ARTICLE_REMOVAL_FINGERPRINT_CHANGED", "QUEUE_FINGERPRINT_REVALIDATION_FAILED") };
    const start = Number(transaction.articleCursor || 0);
    for (let index = start; index < transaction.selections.length; index += 1) {
      const article = articleFor(transaction.selections[index]);
      if (article.missing && article.code && article.code !== "ARTICLE_NOT_FOUND") {
        throw removalError(article.code, "Article content could not be revalidated");
      }
      if (article.missing || articleFingerprint(article) !== transaction.contentArticleFingerprints[index]) return { ok: false, transaction: transitionToRepair(transaction, "ARTICLE_REMOVAL_CONTENT_CHANGED", "CONTENT_IDENTITY_REVALIDATION_FAILED") };
    }
    return { ok: true, transaction };
  }

  function transactionDto(transaction) {
    if (!transaction) return null;
    return {
      id: transaction.id,
      transactionId: transaction.id,
      status: transaction.status,
      phase: transaction.phase || null,
      errorCode: transaction.errorCode || null,
      reasonCode: transaction.reasonCode || null,
      resolutionCode: transaction.resolutionCode || null,
      createdAt: transaction.createdAt || null,
      updatedAt: transaction.updatedAt || null,
      articleCount: Array.isArray(transaction.articles) ? transaction.articles.length : Array.isArray(transaction.selections) ? transaction.selections.length : 0,
      queueCursor: Number(transaction.queueCursor || 0),
      articleCursor: Number(transaction.articleCursor || 0)
    };
  }

  function articleFor(item) {
    try { return contentStore.getArticle(item.clientId, item.articleId); }
    catch (error) {
      return { missing: true, clientId: item.clientId, articleId: item.articleId, code: error && error.code || "ARTICLE_NOT_FOUND" };
    }
  }

  function buildImpact(items) {
    const impact = submissionService.previewArticleRemovalImpact({ selections: items });
    return impact && typeof impact === "object" ? impact : { items: [], queuedToCancel: [], failedToClean: [], publishedToClean: [], cancelledToClean: [], blockedItems: [] };
  }

  function canonicalizeOpenTransactions() {
    const groups = new Map();
    transactionStore.list().filter(function(transaction) { return isOpenStatus(transaction.status); }).forEach(function(transaction) {
      const value = transaction.fingerprint || transactionFingerprint(transaction.selections || [], transaction.queueActions || []);
      if (!transaction.fingerprint) {
        transaction.fingerprint = value;
        persist(transaction);
      }
      if (!groups.has(value)) groups.set(value, []);
      groups.get(value).push(transaction);
    });
    groups.forEach(function(values) {
      values.sort(function(left, right) { return String(left.createdAt || "").localeCompare(String(right.createdAt || "")) || String(left.id).localeCompare(String(right.id)); });
      values.slice(1).forEach(function(transaction) {
        transaction.status = "superseded";
        transaction.phase = "superseded";
        transaction.errorCode = "DUPLICATE_REMOVAL_TRANSACTION";
        transaction.updatedAt = nowIso();
        persist(transaction);
        transactionStore.remove(transaction.id);
      });
    });
    return transactionStore.list().filter(function(transaction) {
      return isOpenStatus(transaction.status);
    });
  }

  function findOpenTransaction(items, queueActions) {
    const targetFingerprint = transactionFingerprint(items, queueActions);
    return canonicalizeOpenTransactions().filter(function(transaction) {
      return isOpenStatus(transaction.status) && transaction.fingerprint === targetFingerprint;
    }).sort(function(left, right) { return String(left.createdAt || "").localeCompare(String(right.createdAt || "")); })[0] || null;
  }

  function previewArticleRemovalImpact(input) {
    const items = selections(input);
    const blockedItems = [];
    const articles = items.map(function(item) {
      const article = articleFor(item);
      if (article.missing) {
        blockedItems.push({ clientId: item.clientId, articleId: item.articleId, reasonCode: article.code });
        return { clientId: item.clientId, articleId: item.articleId, titleSnapshot: null, state: "missing" };
      }
      return { clientId: item.clientId, articleId: item.articleId, titleSnapshot: titleSnapshot(article), state: "available" };
    });
    const submissionImpact = buildImpact(items);
    (submissionImpact.blockedItems || []).forEach(function(item) { blockedItems.push(clone(item)); });
    const binding = {
      selections: items,
      articles: articles,
      submission: submissionImpact
    };
    const token = String(makeToken());
    const createdAt = nowIso();
    tokens.set(token, { token, createdAt, expiresAt: Date.parse(createdAt) + ttlMs, fingerprint: fingerprint(binding), binding: binding });
    const previewActions = submissionServiceActions(submissionImpact);
    const openTransaction = findOpenTransaction(items, previewActions);
    const result = Object.assign({}, clone(submissionImpact), {
      token,
      createdAt,
      expiresAt: new Date(Date.parse(createdAt) + ttlMs).toISOString(),
      articleCount: items.length,
      selections: items,
      articles,
      blockedItems: blockedItems,
      canCommit: blockedItems.length === 0
    });
    if (openTransaction) {
      result.openTransactionId = openTransaction.id;
      result.openTransaction = transactionDto(openTransaction);
      result.transactionId = openTransaction.id;
      result.transaction = transactionDto(openTransaction);
    }
    result.selectionFingerprint = fingerprint(binding);
    return result;
  }

  function tokenValue(input) {
    if (!input || typeof input.token !== "string" || !input.token.trim()) throw removalError("ARTICLE_TRASH_CONFIRMATION_REQUIRED", "Article trash confirmation is required");
    const value = tokens.get(input.token);
    let currentTime;
    try { currentTime = Date.parse(nowIso()); } catch (_) { currentTime = Date.now(); }
    if (!value || currentTime >= value.expiresAt) {
      tokens.delete(input.token);
      throw removalError("ARTICLE_TRASH_PREVIEW_EXPIRED", "Article trash preview has expired");
    }
    return value;
  }

  function verifyFresh(value) {
    const currentArticles = value.binding.selections.map(function(item) {
      const article = articleFor(item);
      return { clientId: item.clientId, articleId: item.articleId, titleSnapshot: article.missing ? null : titleSnapshot(article), state: article.missing ? "missing" : "available" };
    });
    const currentSubmission = buildImpact(value.binding.selections);
    const current = Object.assign({}, clone(currentSubmission), { articles: currentArticles });
    const currentBinding = { selections: value.binding.selections, articles: currentArticles, submission: currentSubmission };
    if ((currentSubmission.blockedItems || []).length || fingerprint(currentBinding) !== fingerprint(value.binding)) {
      throw removalError("ARTICLE_TRASH_PREVIEW_STALE", "Article trash preview is stale");
    }
    return current;
  }

  function tombstoneFor(article, operationId) {
    const references = [];
    ["generationBatchId", "generationTaskId"].forEach(function(field) {
      if (typeof article[field] === "string" && article[field].trim()) references.push({ type: field === "generationBatchId" ? "generation-batch" : "generation-task", id: article[field] });
    });
    return {
      version: 1,
      deletedAt: nowIso(),
      clientId: article.clientId,
      articleId: article.id,
      status: article.status,
      references: references,
      titleSnapshot: titleSnapshot(article),
      contentFingerprint: articleFingerprint(article),
      operationId: operationId
    };
  }

  function operationItem(transaction, operation) {
    const expected = operationId(transaction, operation.kind, operation.cursor);
    const items = operation.kind === "queue" ? transaction.queueActions : transaction.articles;
    const item = Array.isArray(items) ? items[Number(operation.cursor)] : null;
    if (!item || operation.operationId !== expected || Number(operation.cursor) < 0 ||
        operation.clientId !== item.clientId || operation.articleId !== (item.articleId || item.id)) {
      return { error: transitionToRepair(transaction, "ARTICLE_REMOVAL_OPERATION_CONFLICT", "REMOVAL_OPERATION_ID_CONFLICT") };
    }
    return { expected, item };
  }

  function matchingTombstone(transaction, item, tombstone, expected) {
    const index = Number(transaction.activeOperation.cursor);
    const expectedFingerprint = Array.isArray(transaction.contentArticleFingerprints) ? transaction.contentArticleFingerprints[index] : null;
    if (!tombstone || tombstone.clientId !== item.clientId || tombstone.articleId !== item.articleId ||
        tombstone.operationId !== expected ||
        (transaction.articles[index] && transaction.articles[index].titleSnapshot !== undefined && tombstone.titleSnapshot !== transaction.articles[index].titleSnapshot) ||
        (expectedFingerprint && tombstone.contentFingerprint !== expectedFingerprint)) return false;
    return true;
  }

  function reconcileActiveOperation(transaction) {
    const operation = transaction && transaction.activeOperation;
    if (!operation) return { status: "none", transaction };
    const located = operationItem(transaction, operation);
    if (located.error) return { status: "repair", transaction: located.error };
    const expected = located.expected;
    const item = located.item;
    if (operation.kind === "queue") {
      if (typeof submissionService.reconcileArticleRemovalAction !== "function") {
        return { status: "repair", transaction: transitionToRepair(transaction, "ARTICLE_REMOVAL_OPERATION_RESULT_UNPROVABLE", "REMOVAL_OPERATION_RESULT_UNPROVABLE") };
      }
      let proof;
      try { proof = submissionService.reconcileArticleRemovalAction(Object.assign(clone(item), { operationId: expected }), expected); }
      catch (error) { return { status: "retry", error }; }
      if (proof && proof.operationId !== undefined && proof.operationId !== expected) {
        return { status: "repair", transaction: transitionToRepair(transaction, "ARTICLE_REMOVAL_OPERATION_CONFLICT", "REMOVAL_OPERATION_ID_CONFLICT") };
      }
      if (proof && proof.status === "cleanup_pending") {
        transaction.activeOperation.owner = runnerId;
        persist(transaction);
        try {
          const command = Object.assign(clone(item), { operationId: expected });
          if (item.action === "cancel") submissionService.cancelArticleSubmissionItem(command);
          else if (item.action === "cleanupPublishedLocal") submissionService.cleanupPublishedArticleLocal(command);
          else if (item.action === "cleanupCancelledLocal") submissionService.cleanupCancelledArticleLocal(command);
          else submissionService.cleanupArticleSubmissionItem(command);
          proof = submissionService.reconcileArticleRemovalAction(command, expected);
        } catch (error) { return { status: "retry", error }; }
      }
      if (!proof || proof.status !== "completed") {
        if (proof && proof.status === "retryable") {
          transaction.activeOperation.owner = runnerId;
          persist(transaction);
          return { status: "retryable", transaction };
        }
        return { status: "repair", transaction: transitionToRepair(transaction, "ARTICLE_REMOVAL_OPERATION_RESULT_UNPROVABLE", proof && proof.reasonCode || "REMOVAL_OPERATION_RESULT_UNPROVABLE") };
      }
      transaction.activeOperation.owner = runnerId;
      transaction.queueResults = transaction.queueResults || [];
      transaction.queueResults[Number(operation.cursor)] = clone(proof.result || { idempotent: true });
      transaction.queueCursor = Number(operation.cursor) + 1;
      finishOperation(transaction);
      transaction.resolutionCode = "QUEUE_OPERATION_RECONCILED";
      persist(transaction);
      return { status: "resolved", transaction };
    }
    let tombstone = null;
    let tombstoneMissing = false;
    try { tombstone = typeof contentStore.getTrashedTombstone === "function" ? contentStore.getTrashedTombstone(item.clientId, item.articleId) : null; tombstoneMissing = !tombstone; }
    catch (error) { if (error && error.code === "ARTICLE_NOT_FOUND") tombstoneMissing = true; else return { status: "retry", error }; }
    if (tombstone && !matchingTombstone(transaction, item, tombstone, expected)) {
      return { status: "repair", transaction: transitionToRepair(transaction, "ARTICLE_REMOVAL_OPERATION_CONFLICT", "REMOVAL_OPERATION_RESULT_UNPROVABLE") };
    }
    if (tombstone && !tombstoneMissing) {
      try { contentStore.getArticle(item.clientId, item.articleId); return { status: "repair", transaction: transitionToRepair(transaction, "ARTICLE_REMOVAL_OPERATION_CONFLICT", "REMOVAL_SOURCE_AND_TRASH_BOTH_EXIST") }; }
      catch (error) { if (!error || error.code !== "ARTICLE_NOT_FOUND") return { status: "retry", error }; }
      transaction.articleCursor = Number(operation.cursor) + 1;
      finishOperation(transaction);
      transaction.resolutionCode = "ARTICLE_OPERATION_RECONCILED";
      persist(transaction);
      return { status: "resolved", transaction };
    }
    if (!tombstoneMissing || typeof contentStore.getTrashedTombstone !== "function" || contentStore.supportsIdempotentRemovalOperation !== true) {
      return { status: "repair", transaction: transitionToRepair(transaction, "ARTICLE_REMOVAL_OPERATION_RESULT_UNPROVABLE", "REMOVAL_OPERATION_RESULT_UNPROVABLE") };
    }
    let article;
    try { article = contentStore.getArticle(item.clientId, item.articleId); }
    catch (error) { return { status: "retry", error }; }
    const expectedFingerprint = Array.isArray(transaction.contentArticleFingerprints) ? transaction.contentArticleFingerprints[Number(operation.cursor)] : null;
    if (!expectedFingerprint || articleFingerprint(article) !== expectedFingerprint) {
      return { status: "repair", transaction: transitionToRepair(transaction, "ARTICLE_REMOVAL_CONTENT_CHANGED", "CONTENT_IDENTITY_REVALIDATION_FAILED") };
    }
    transaction.activeOperation.owner = runnerId;
    persist(transaction);
    try {
      contentStore.moveArticleToTrash(
        item.clientId,
        item.articleId,
        tombstoneFor(article, expected),
        expected,
        expectedFingerprint,
      );
    }
    catch (error) { return { status: "retry", error }; }
    let completedTombstone;
    try { completedTombstone = contentStore.getTrashedTombstone(item.clientId, item.articleId); }
    catch (error) { return { status: "retry", error }; }
    if (!matchingTombstone(transaction, item, completedTombstone, expected)) {
      return { status: "repair", transaction: transitionToRepair(transaction, "ARTICLE_REMOVAL_OPERATION_CONFLICT", "REMOVAL_OPERATION_RESULT_UNPROVABLE") };
    }
    transaction.articleCursor = Number(operation.cursor) + 1;
    finishOperation(transaction);
    transaction.resolutionCode = "ARTICLE_OPERATION_RECONCILED_AFTER_RETRY";
    persist(transaction);
    return { status: "resolved", transaction };
  }

  function sameQueueAction(left, right) {
    return left && right && left.clientId === right.clientId && left.articleId === right.articleId &&
      left.batchId === right.batchId && left.publicationId === right.publicationId &&
      left.targetPlatformId === right.targetPlatformId && left.attemptId === right.attemptId &&
      left.action === right.action;
  }

  function refreshQueueActions(transaction) {
    if (!transaction || !Array.isArray(transaction.selections) || typeof submissionService.previewArticleRemovalImpact !== "function") return transaction;
    const impact = submissionService.previewArticleRemovalImpact({ selections: transaction.selections });
    const fresh = (submissionServiceActions(impact));
    transaction.queueActions = (Array.isArray(transaction.queueActions) ? transaction.queueActions : []).map(function(action) {
      const replacement = fresh.find(function(candidate) { return sameQueueAction(candidate, action); });
      if (replacement) return clone(replacement);
      const copy = clone(action);
      delete copy.evaluationFingerprint;
      return copy;
    });
    return transaction;
  }

  function submissionServiceActions(impact) {
    return clone((impact.queuedToCancel || []).map(function(item) { return Object.assign({}, item, { action: "cancel" }); })
      .concat((impact.failedToClean || []).map(function(item) { return Object.assign({}, item, { action: "cleanup" }); }))
      .concat((impact.publishedToClean || []).map(function(item) { return Object.assign({}, item, { action: "cleanupPublishedLocal" }); }))
      .concat((impact.cancelledToClean || []).map(function(item) { return Object.assign({}, item, { action: "cleanupCancelledLocal" }); })));
  }

  function performSteps(transaction, requireRevalidation) {
    let current = transaction;
    if (current.phase === "committed") {
      current.status = "committed";
      current.resolutionCode = "ARTICLE_REMOVAL_COMMITTED";
      current.errorCode = null;
      delete current.nextAttemptAt;
      current.updatedAt = nowIso();
      persist(current);
      completedTransactions.set(current.id, clone(current));
      return current;
    }
    let actions = Array.isArray(current.queueActions) ? current.queueActions : [];
    let reconciledOperation = false;
    if (current.activeOperation) {
      const reconciliation = reconcileActiveOperation(current);
      if (reconciliation.status === "retry") throw reconciliation.error;
      current = reconciliation.transaction;
      if (reconciliation.status === "repair") return current;
      reconciledOperation = reconciliation.status === "resolved";
      actions = Array.isArray(current.queueActions) ? current.queueActions : [];
      if (current.phase === "needs_repair") {
        current.status = "pending_auto_recovery";
        current.phase = current.resumePhase || (current.activeOperation && current.activeOperation.kind === "queue" ? "queue-actions" : "articles");
        delete current.resumePhase;
        current.errorCode = null;
        persist(current);
      }
    }
    if (current.phase === "needs_repair") {
      const validation = revalidate(current);
      current = validation.transaction;
      if (!validation.ok) return current;
      actions = Array.isArray(current.queueActions) ? current.queueActions : [];
      current.status = "pending_auto_recovery";
      current.phase = current.resumePhase || "articles";
      delete current.resumePhase;
      current.errorCode = null;
      current.resolutionCode = "QUEUE_ACTIONS_REVALIDATED";
      current.updatedAt = nowIso();
      persist(current);
    } else if (current.status === "pending_recovery") {
      current.status = "pending_auto_recovery";
      persist(current);
    }
    if (reconciledOperation) {
      const validation = revalidateContentRemaining(current);
      current = validation.transaction;
      if (!validation.ok) return current;
    } else if (requireRevalidation || current.phase === "intent") {
      const validation = revalidate(current);
      current = validation.transaction;
      if (!validation.ok) return current;
    }
    if (current.phase === "intent") {
      current.phase = "queue-actions";
      current.status = "pending_auto_recovery";
      persist(current);
    }
    if (current.phase === "queue-actions") {
      for (let index = current.queueCursor || 0; index < actions.length; index += 1) {
        const action = actions[index];
        try {
          persist(current); // token-fenced checkpoint and lease renewal before I/O
          beginOperation(current, "queue", index, action);
          const actionWithOperation = Object.assign({}, action, { operationId: operationId(current, "queue", index) });
          const result = action.action === "cancel"
            ? submissionService.cancelArticleSubmissionItem(actionWithOperation)
            : action.action === "cleanupPublishedLocal"
              ? submissionService.cleanupPublishedArticleLocal(actionWithOperation)
              : action.action === "cleanupCancelledLocal"
                ? submissionService.cleanupCancelledArticleLocal(actionWithOperation)
                : submissionService.cleanupArticleSubmissionItem(actionWithOperation);
          current.queueResults = current.queueResults || [];
          current.queueResults[index] = clone(result);
          current.resolutionCode = result && result.idempotent ? "QUEUE_PAIR_ALREADY_RESOLVED" : action.action === "cancel" ? "QUEUE_RESERVATION_CANCELLED" : action.action === "cleanupPublishedLocal" ? "PUBLISHED_LOCAL_COPY_CLEANED" : action.action === "cleanupCancelledLocal" ? "CANCELLED_LOCAL_COPY_CLEANED" : "QUEUE_ITEM_CLEANED";
          current.queueCursor = index + 1;
          finishOperation(current);
          persist(current);
          if (typeof opts.afterQueueAction === "function") opts.afterQueueAction(clone(action), index, clone(current));
        } catch (error) {
          // Only the durable stage-cleanup failure proves the state transition
          // may already have happened. Other queue failures retain their prior
          // retry semantics and do not manufacture an in-flight operation.
          if (!error || error.code !== "CONTENT_SUBMISSION_QUEUE_STAGE_CLEANUP_FAILED") finishOperation(current);
          return recordRetry(current, error, "QUEUE_ACTION_RETRY_REQUIRED");
        }
      }
      current.phase = "articles";
      current.status = "pending_auto_recovery";
      persist(current);
      const validation = revalidateContentRemaining(current);
      current = validation.transaction;
      if (!validation.ok) return current;
    }
    if (current.phase === "articles") {
      for (let index = current.articleCursor || 0; index < current.articles.length; index += 1) {
        const item = current.articles[index];
        let article;
        try { article = contentStore.getArticle(item.clientId, item.articleId); }
        catch (error) {
          if (error && error.code === "ARTICLE_NOT_FOUND" && contentStore.isArticleTrashed && contentStore.isArticleTrashed(item.clientId, item.articleId)) {
            current.articleCursor = index + 1;
            persist(current);
            continue;
          }
          return recordRetry(current, error, "ARTICLE_READ_RETRY_REQUIRED");
        }
        try {
          if (contentStore.isArticleTrashed && contentStore.isArticleTrashed(item.clientId, item.articleId)) {
            current.articleCursor = index + 1;
            persist(current);
            continue;
          }
          const expectedFingerprint = Array.isArray(current.contentArticleFingerprints)
            ? current.contentArticleFingerprints[index]
            : null;
          if (!expectedFingerprint || articleFingerprint(article) !== expectedFingerprint) {
            return transitionToRepair(
              current,
              expectedFingerprint
                ? "ARTICLE_REMOVAL_CONTENT_CHANGED"
                : "ARTICLE_REMOVAL_CONTENT_FINGERPRINT_MISSING",
              "CONTENT_IDENTITY_REVALIDATION_FAILED",
            );
          }
          persist(current);
          beginOperation(current, "article", index, item);
          contentStore.moveArticleToTrash(
            item.clientId,
            item.articleId,
            tombstoneFor(article, operationId(current, "article", index)),
            operationId(current, "article", index),
            expectedFingerprint,
          );
        }
        catch (error) {
          if (error && error.code === "ARTICLE_REMOVAL_CONTENT_CHANGED") {
            finishOperation(current);
            return transitionToRepair(
              current,
              error.code,
              "CONTENT_IDENTITY_REVALIDATION_FAILED",
            );
          }
          if (!error || error.code !== "ARTICLE_REMOVAL_CLAIM_LOST") finishOperation(current);
          return recordRetry(current, error, "ARTICLE_MOVE_RETRY_REQUIRED");
        }
        current.articleCursor = index + 1;
        current.status = "pending_auto_recovery";
        finishOperation(current);
        persist(current);
        if (typeof opts.afterArticleMove === "function") opts.afterArticleMove(clone(item), index, clone(current));
      }
      current.phase = "committed";
      current.status = "committed";
      current.resolutionCode = "ARTICLE_REMOVAL_COMMITTED";
      current.errorCode = null;
      delete current.nextAttemptAt;
      current.updatedAt = nowIso();
      persist(current);
      completedTransactions.set(current.id, clone(current));
    }
    return current;
  }

  function recordRetry(transaction, error, resolutionCode) {
    if (isRepairableError(error)) return transitionToRepair(transaction, error && error.code, "REMOVAL_MANUAL_REPAIR_REQUIRED");
    transaction.updatedAt = nowIso();
    transaction.errorCode = error && error.code || "ARTICLE_REMOVAL_RECOVERY_REQUIRED";
    transaction.resolutionCode = resolutionCode || "RECOVERY_RETRY_REQUIRED";
    transaction.retryCount = Number(transaction.retryCount || 0) + 1;
    transaction.attempt = transaction.retryCount;
    if (transaction.retryCount >= maxRecoveryAttempts) {
      if (transaction.phase !== "needs_repair") transaction.resumePhase = transaction.phase;
      transaction.status = "needs_repair";
      transaction.phase = "needs_repair";
      transaction.resolutionCode = "RECOVERY_ATTEMPTS_EXHAUSTED";
    } else {
      transaction.status = "pending_auto_recovery";
      if (transaction.phase === "committed") transaction.phase = "articles";
      transaction.nextAttemptAt = new Date(Date.parse(transaction.updatedAt) + recoveryBackoffMs * Math.pow(2, transaction.retryCount - 1)).toISOString();
    }
    try { persist(transaction); } catch (_) {}
    return transaction;
  }

  function perform(transaction, requireRevalidation) {
    try { return performSteps(transaction, requireRevalidation); }
    catch (error) {
      // A failed attempt to persist a fail-closed revalidation result must not
      // turn it back into an automatically executable transaction in memory.
      if (transaction.phase === "needs_repair") return transaction;
      return recordRetry(transaction, error, "PERSISTENCE_RETRY_REQUIRED");
    }
  }

  function applyArticleRemovalImpact(input) {
    const value = input || {};
    if (value.confirmed !== true) throw removalError("ARTICLE_TRASH_CONFIRMATION_REQUIRED", "Article trash confirmation is required");
    const token = tokenValue(value);
    if (value.selections || value.articles) {
      const requested = selections(value);
      if (fingerprint(requested) !== fingerprint(token.binding.selections)) {
        throw removalError("ARTICLE_TRASH_PREVIEW_STALE", "Article trash preview is stale");
      }
    }
    const fresh = verifyFresh(token);
    if (!fresh.canCommit) throw removalError("ARTICLE_TRASH_BLOCKED", "Article trash is blocked by an active submission");
    tokens.delete(value.token);
    const createdAt = nowIso();
    const queueActions = submissionServiceActions(fresh);
    const existing = findOpenTransaction(token.binding.selections, queueActions);
    if (existing) {
      return {
        transactionId: existing.id,
        status: existing.status === "pending_recovery" ? "pending_auto_recovery" : existing.status,
        articleCount: existing.articles ? existing.articles.length : token.binding.selections.length,
        queueActions: existing.queueResults || [],
        reused: true,
        errorCode: existing.errorCode || null
      };
    }
    const transaction = {
      version: 1,
      id: String(transactionStore.createId()),
      kind: "article-removal",
      status: "pending_auto_recovery",
      phase: "intent",
      createdAt,
      updatedAt: createdAt,
      selections: clone(token.binding.selections),
      articles: clone(token.binding.articles),
      contentArticleFingerprints: token.binding.selections.map(articleFor).map(articleFingerprint),
      queueActions: queueActions,
      fingerprint: transactionFingerprint(token.binding.selections, queueActions),
      contentFingerprint: fingerprint(token.binding.selections.map(articleFor).map(contentIdentity)),
      revision: 0
    };
    persist(transaction);
    const claimed = claim(transaction);
    if (!claimed) {
      const persisted = transactionStore.get(transaction.id);
      return { transactionId: transaction.id, status: persisted.status, articleCount: transaction.articles.length, queueActions: persisted.queueResults || [], errorCode: persisted.errorCode || "ARTICLE_REMOVAL_CLAIM_UNAVAILABLE" };
    }
    const result = perform(claimed);
    return {
      transactionId: result.id,
      status: result.status,
      articleCount: result.articles.length,
      queueActions: result.queueResults || [],
      errorCode: result.errorCode || null
    };
  }

  function recoverPendingRemovals(lifecycle) {
    if (lifecycle && lifecycle.isDisposed && lifecycle.isDisposed()) return [];
    const now = Date.parse(nowIso());
    return canonicalizeOpenTransactions().filter(function(transaction) {
      return validAutomaticState(transaction) && (!transaction.nextAttemptAt || Date.parse(transaction.nextAttemptAt) <= now);
    }).map(function(transaction) {
      if (lifecycle && lifecycle.isDisposed && lifecycle.isDisposed()) return transaction;
      const claimed = claim(transaction);
      if (!claimed) return transaction;
      try { return perform(claimed, true); }
      catch (error) {
        return recordRetry(claimed, error, "RECOVERY_IO_RETRY_REQUIRED");
      }
    });
  }

  function getArticleRemovalTransaction(transactionId) {
    return transactionDto(transactionStore.get(transactionId));
  }

  function listArticleRemovalTransactions() {
    return canonicalizeOpenTransactions().map(transactionDto);
  }

  function retryArticleRemovalTransaction(input) {
    if (!input || typeof input.transactionId !== "string" || !input.transactionId.trim()) throw removalError("ARTICLE_REMOVAL_TRANSACTION_ID_INVALID", "Removal transaction id is invalid");
    if (input.confirmed !== true) throw removalError("ARTICLE_TRASH_CONFIRMATION_REQUIRED", "Article trash confirmation is required");
    let transaction;
    try { transaction = transactionStore.get(input.transactionId); }
    catch (error) {
      const completed = completedTransactions.get(input.transactionId);
      if (completed) return transactionDto(completed);
      throw error;
    }
    if (transaction.status === "superseded" || transaction.phase === "superseded") return transactionDto(transaction);
    if (transaction.status === "committed" && transaction.phase === "committed") return transactionDto(transaction);
    const claimed = claim(transaction);
    if (!claimed) return transactionDto(transaction);
    try { return transactionDto(perform(claimed, true)); }
    catch (_) {
      return transactionDto(transactionStore.get(transaction.id));
    }
  }

  return {
    previewArticleRemovalImpact,
    applyArticleRemovalImpact,
    recoverPendingRemovals,
    recover: recoverPendingRemovals,
    getArticleRemovalTransaction,
    listArticleRemovalTransactions,
    retryArticleRemovalTransaction,
    transactionStore
  };
}

module.exports = { createArticleRemovalService };
