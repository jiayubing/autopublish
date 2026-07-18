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

  function nowIso() {
    const value = typeof clock === "function" ? clock() : clock;
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw removalError("ARTICLE_REMOVAL_CLOCK_INVALID", "Removal clock is invalid");
    return date.toISOString();
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

  function perform(transaction) {
    let current = transaction;
    const actions = Array.isArray(current.queueActions) ? current.queueActions : [];
    if (current.phase === "intent") {
      current.phase = "queue-actions";
      transactionStore.save(current);
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
          current.queueCursor = index + 1;
          transactionStore.save(current);
          if (typeof opts.afterQueueAction === "function") opts.afterQueueAction(clone(action), index, clone(current));
        } catch (error) {
          if (error && ["SUBMISSION_QUEUE_CHANGED", "PUBLICATION_ATTEMPT_MISMATCH", "SUBMISSION_STATUS_CONFLICT"].indexOf(error.code) !== -1) {
            current.phase = "needs_repair";
            current.errorCode = error.code;
            transactionStore.save(current);
            throw error;
          }
          throw error;
        }
      }
      current.phase = "articles";
      transactionStore.save(current);
    }
    if (current.phase === "articles") {
      for (let index = current.articleCursor || 0; index < current.articles.length; index += 1) {
        const item = current.articles[index];
        let article;
        try { article = articleStore.getArticle(item.clientId, item.articleId); }
        catch (error) {
          if (error && error.code === "ARTICLE_NOT_FOUND" && articleStore.isArticleTrashed && articleStore.isArticleTrashed(item.clientId, item.articleId)) {
            current.articleCursor = index + 1;
            transactionStore.save(current);
            continue;
          }
          throw error;
        }
        articleStore.moveArticleToTrash(item.clientId, item.articleId, tombstoneFor(article));
        current.articleCursor = index + 1;
        transactionStore.save(current);
        if (typeof opts.afterArticleMove === "function") opts.afterArticleMove(clone(item), index, clone(current));
      }
      current.phase = "committed";
      transactionStore.save(current);
    }
    if (current.phase === "committed") transactionStore.remove(current.id);
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
    const transaction = {
      version: 1,
      id: String(transactionStore.createId()),
      kind: "article-removal",
      status: "pending_recovery",
      phase: "intent",
      createdAt,
      updatedAt: createdAt,
      selections: clone(token.binding.selections),
      articles: clone(token.binding.articles),
      queueActions: clone((fresh.queuedToCancel || []).map(function(item) { return Object.assign({}, item, { action: "cancel" }); })
        .concat((fresh.failedToClean || []).map(function(item) { return Object.assign({}, item, { action: "cleanup" }); })))
    };
    transactionStore.save(transaction);
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
      return { transactionId: transaction.id, status: "pending_recovery", articleCount: transaction.articles.length, queueActions: transaction.queueResults || [], errorCode: error && error.code || "ARTICLE_REMOVAL_RECOVERY_REQUIRED" };
    }
  }

  function recoverPendingRemovals() {
    return transactionStore.list().filter(function(transaction) { return transaction.phase !== "committed"; }).map(function(transaction) {
      try { return perform(transaction); }
      catch (error) { return Object.assign({}, transaction, { status: "pending_recovery", errorCode: error && error.code || "ARTICLE_REMOVAL_RECOVERY_REQUIRED" }); }
    });
  }

  return { previewArticleRemovalImpact, applyArticleRemovalImpact, recoverPendingRemovals, recover: recoverPendingRemovals, transactionStore };
}

module.exports = { createArticleRemovalService };
