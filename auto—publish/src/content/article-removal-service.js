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
    "SUBMISSION_BATCH_REBIND_CONFLICT"
  ].includes(error.code);
}

function titleSnapshot(article) {
  return typeof article.title === "string" && article.title.trim() ? article.title.trim().slice(0, 200) : null;
}

function createArticleRemovalService(options) {
  const opts = options || {};
  if (!opts.articleStore) throw removalError("ARTICLE_REMOVAL_SERVICE_INVALID", "Article store is required");
  if (!opts.submissionService) throw removalError("ARTICLE_REMOVAL_SERVICE_INVALID", "Content submission service is required");
  const articleStore = opts.articleStore;
  const submissionService = opts.submissionService;
  const transactionStore = opts.transactionStore || createArticleRemovalTransactionStore({
    workspaceRoot: opts.workspaceRoot,
    directory: opts.transactionDirectory,
    createId: opts.createTransactionId,
    now: opts.now
  });
  const clock = opts.now || function() { return new Date().toISOString(); };
  const ttlMs = Number.isFinite(opts.tokenTtlMs) ? Math.max(1000, opts.tokenTtlMs) : 5 * 60 * 1000;
  const makeToken = opts.tokenGenerator || function() { return crypto.randomUUID(); };
  const tokens = new Map();
  const completedTransactions = new Map();

  function nowIso() {
    const value = typeof clock === "function" ? clock() : clock;
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw removalError("ARTICLE_REMOVAL_CLOCK_INVALID", "Removal clock is invalid");
    return date.toISOString();
  }

  function persist(transaction) {
    const saved = transactionStore.save(transaction);
    if (typeof opts.onTransactionStatus === "function") {
      try { opts.onTransactionStatus(clone(saved)); } catch (_) {}
    }
    return saved;
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
    try { return articleStore.getArticle(item.clientId, item.articleId); }
    catch (error) {
      return { missing: true, clientId: item.clientId, articleId: item.articleId, code: error && error.code || "ARTICLE_NOT_FOUND" };
    }
  }

  function buildImpact(items) {
    const impact = submissionService.previewArticleRemovalImpact({ selections: items });
    return impact && typeof impact === "object" ? impact : { items: [], queuedToCancel: [], failedToClean: [], blockedItems: [] };
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
    return transactionStore.list();
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
    const previewActions = clone((submissionImpact.queuedToCancel || []).map(function(item) { return Object.assign({}, item, { action: "cancel" }); })
      .concat((submissionImpact.failedToClean || []).map(function(item) { return Object.assign({}, item, { action: "cleanup" }); })));
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

  function tombstoneFor(article) {
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
      titleSnapshot: titleSnapshot(article)
    };
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
      .concat((impact.failedToClean || []).map(function(item) { return Object.assign({}, item, { action: "cleanup" }); })));
  }

  function perform(transaction) {
    let current = transaction;
    let actions = Array.isArray(current.queueActions) ? current.queueActions : [];
    if (current.phase === "needs_repair") {
      current = refreshQueueActions(current);
      actions = Array.isArray(current.queueActions) ? current.queueActions : [];
      current.status = "pending_auto_recovery";
      current.phase = "queue-actions";
      current.errorCode = null;
      current.resolutionCode = "QUEUE_ACTIONS_REVALIDATED";
      current.updatedAt = nowIso();
      persist(current);
    } else if (current.status === "pending_recovery") {
      current.status = "pending_auto_recovery";
      persist(current);
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
          const result = action.action === "cancel"
            ? submissionService.cancelArticleSubmissionItem(action)
            : submissionService.cleanupArticleSubmissionItem(action);
          current.queueResults = current.queueResults || [];
          current.queueResults[index] = clone(result);
          current.resolutionCode = result && result.idempotent ? "QUEUE_PAIR_ALREADY_RESOLVED" : action.action === "cancel" ? "QUEUE_RESERVATION_CANCELLED" : "QUEUE_ITEM_CLEANED";
          current.queueCursor = index + 1;
          persist(current);
          if (typeof opts.afterQueueAction === "function") opts.afterQueueAction(clone(action), index, clone(current));
        } catch (error) {
          current.updatedAt = nowIso();
          current.errorCode = error && error.code || "ARTICLE_REMOVAL_RECOVERY_REQUIRED";
          current.resolutionCode = "QUEUE_ACTION_RETRY_REQUIRED";
          if (isRepairableError(error)) {
            current.status = "needs_repair";
            current.phase = "needs_repair";
          } else {
            current.status = "pending_auto_recovery";
            current.phase = "queue-actions";
            current.retryCount = Number(current.retryCount || 0) + 1;
          }
          persist(current);
          throw error;
        }
      }
      current.phase = "articles";
      current.status = "pending_auto_recovery";
      persist(current);
    }
    if (current.phase === "articles") {
      for (let index = current.articleCursor || 0; index < current.articles.length; index += 1) {
        const item = current.articles[index];
        let article;
        try { article = articleStore.getArticle(item.clientId, item.articleId); }
        catch (error) {
          if (error && error.code === "ARTICLE_NOT_FOUND" && articleStore.isArticleTrashed && articleStore.isArticleTrashed(item.clientId, item.articleId)) {
            current.articleCursor = index + 1;
            persist(current);
            continue;
          }
          throw error;
        }
        articleStore.moveArticleToTrash(item.clientId, item.articleId, tombstoneFor(article));
        current.articleCursor = index + 1;
        current.status = "pending_auto_recovery";
        persist(current);
        if (typeof opts.afterArticleMove === "function") opts.afterArticleMove(clone(item), index, clone(current));
      }
      current.phase = "committed";
      persist(current);
    }
    if (current.phase === "committed") {
      current.status = "committed";
      current.resolutionCode = "ARTICLE_REMOVAL_COMMITTED";
      current.updatedAt = nowIso();
      persist(current);
      completedTransactions.set(current.id, clone(current));
      transactionStore.remove(current.id);
    }
    return current;
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
    const queueActions = clone((fresh.queuedToCancel || []).map(function(item) { return Object.assign({}, item, { action: "cancel" }); })
      .concat((fresh.failedToClean || []).map(function(item) { return Object.assign({}, item, { action: "cleanup" }); })));
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
      queueActions: queueActions,
      fingerprint: transactionFingerprint(token.binding.selections, queueActions)
    };
    persist(transaction);
    try {
      const result = perform(transaction);
      return {
        transactionId: result.id,
        status: "committed",
        articleCount: result.articles.length,
        queueActions: result.queueResults || []
      };
    } catch (error) {
      if (error && error.code === "ARTICLE_TRASH_PREVIEW_STALE") throw error;
      const persisted = transactionStore.get(transaction.id);
      return { transactionId: transaction.id, status: persisted.status, articleCount: transaction.articles.length, queueActions: persisted.queueResults || [], errorCode: persisted.errorCode || error && error.code || "ARTICLE_REMOVAL_RECOVERY_REQUIRED" };
    }
  }

  function recoverPendingRemovals() {
    return canonicalizeOpenTransactions().filter(function(transaction) { return transaction.phase !== "committed" && transaction.phase !== "superseded"; }).map(function(transaction) {
      try { return perform(transaction); }
      catch (error) {
        try { return transactionStore.get(transaction.id); }
        catch (_) { return Object.assign({}, transaction, { status: isRepairableError(error) ? "needs_repair" : "pending_auto_recovery", errorCode: error && error.code || "ARTICLE_REMOVAL_RECOVERY_REQUIRED" }); }
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
    try { return transactionDto(perform(transaction)); }
    catch (_) { return transactionDto(transactionStore.get(transaction.id)); }
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
