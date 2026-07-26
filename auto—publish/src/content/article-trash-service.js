const crypto = require("crypto");
const { createArticleRemovalService } = require("./article-removal-service");

function trashError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertId(value, label) {
  if (typeof value !== "string" || !value.trim() || value.includes("/") || value.includes("\\")) {
    throw trashError("CONTENT_INPUT_INVALID", label + " is required");
  }
}

function selection(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw trashError("CONTENT_INPUT_INVALID", "Article selection is required");
  }
  assertId(input.clientId, "Client id");
  assertId(input.articleId, "Article id");
  return { clientId: input.clientId, articleId: input.articleId };
}

function createArticleTrashService(options) {
  const opts = options || {};
  if (!opts.contentStore) throw trashError("ARTICLE_TRASH_SERVICE_INVALID", "Content store is required");
  const contentStore = opts.contentStore;
  const now = opts.now || function() { return new Date().toISOString(); };
  const tokenTtlMs = Number.isFinite(opts.permanentDeleteTokenTtlMs) && opts.permanentDeleteTokenTtlMs > 0 ? opts.permanentDeleteTokenTtlMs : 5 * 60 * 1000;
  const confirmations = new Map();
  const removalService = opts.articleRemovalService || (opts.submissionService && opts.workspaceRoot
    ? createArticleRemovalService({
      workspaceRoot: opts.workspaceRoot,
      contentStore: contentStore,
      submissionService: opts.submissionService,
      transactionStore: opts.transactionStore,
      transactionDirectory: opts.transactionDirectory,
      now: opts.now,
      tokenTtlMs: opts.tokenTtlMs,
      tokenGenerator: opts.tokenGenerator,
      afterQueueAction: opts.afterQueueAction,
      afterArticleMove: opts.afterArticleMove,
      onTransactionStatus: opts.onTransactionStatus
    }) : null);

  function buildTombstone(article) {
    const references = [];
    if (typeof article.generationBatchId === "string" && article.generationBatchId.trim()) {
      references.push({ type: "generation-batch", id: article.generationBatchId });
    }
    if (typeof article.generationTaskId === "string" && article.generationTaskId.trim()) {
      references.push({ type: "generation-task", id: article.generationTaskId });
    }
    return {
      version: 1,
      deletedAt: now(),
      clientId: article.clientId,
      articleId: article.id,
      status: article.status,
      references: references,
      titleSnapshot: typeof article.title === "string" && article.title.trim() ? article.title.trim().slice(0, 200) : null,
      contentFingerprint: typeof contentStore.fingerprintArticle === "function" ? contentStore.fingerprintArticle(article) : undefined
    };
  }

  function tombstoneFingerprint(tombstone) {
    return crypto.createHash("sha256").update(JSON.stringify({
      version: tombstone.version, deletedAt: tombstone.deletedAt, clientId: tombstone.clientId,
      articleId: tombstone.articleId, status: tombstone.status, references: tombstone.references,
      contentFingerprint: tombstone.contentFingerprint || null
    })).digest("hex");
  }

  function listTrashedArticles(clientId) {
    assertId(clientId, "Client id");
    return contentStore.listTrashedArticles(clientId);
  }

  function trashArticles(input) {
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        (!removalService && (!Array.isArray(input.articles) || input.articles.length < 1)) ||
        (removalService && (!Array.isArray(input.selections || input.articles) || !(input.selections || input.articles).length))) {
      throw trashError("CONTENT_INPUT_INVALID", "At least one article is required");
    }
    if (removalService) {
      return removalService.applyArticleRemovalImpact({
        selections: input.selections || input.articles,
        token: input.token,
        confirmed: input.confirmed
      });
    }
    if (input.confirmed !== true) throw trashError("ARTICLE_TRASH_CONFIRMATION_REQUIRED", "Article trash confirmation is required");
    const moved = [];
    const skipped = [];
    const rejected = [];
    input.articles.forEach(function(rawSelection) {
      const item = selection(rawSelection);
      try {
        const article = contentStore.getArticle(item.clientId, item.articleId);
        const tombstone = contentStore.moveArticleToTrash(item.clientId, item.articleId, buildTombstone(article));
        moved.push(tombstone);
      } catch (error) {
        if (error && error.code === "ARTICLE_NOT_FOUND") {
          const existing = contentStore.listTrashedArticles(item.clientId).find(function(value) { return value.articleId === item.articleId; });
          if (existing) {
            skipped.push(existing);
            return;
          }
        }
        rejected.push({ clientId: item.clientId, articleId: item.articleId, code: error.code || "ARTICLE_TRASH_FAILED" });
      }
    });
    return { moved: moved, skipped: skipped, rejected: rejected };
  }

  function previewTrashArticles(input) {
    if (!removalService) throw trashError("ARTICLE_REMOVAL_UNAVAILABLE", "Article removal preview is unavailable");
    return removalService.previewArticleRemovalImpact(input);
  }

  function restoreArticle(input) {
    const item = selection(input);
    const restored = contentStore.restoreTrashedArticle(item.clientId, item.articleId);
    for (const [token, binding] of confirmations) {
      if (binding.clientId === item.clientId && binding.articleId === item.articleId) confirmations.delete(token);
    }
    return removalService ? { article: restored, restored: true, queueRestored: false, message: "文章已恢复，投稿队列不会自动恢复" } : restored;
  }

  function preparePermanentDelete(input) {
    const item = selection(input);
    const tombstone = contentStore.getTrashedTombstone(item.clientId, item.articleId);
    if (!tombstone) throw trashError("ARTICLE_NOT_FOUND", "Trashed article was not found");
    const issuedAt = now();
    const issuedMs = Date.parse(issuedAt);
    if (Number.isNaN(issuedMs)) throw trashError("ARTICLE_PERMANENT_DELETE_CLOCK_INVALID", "Permanent deletion clock is invalid");
    const fingerprint = tombstoneFingerprint(tombstone);
    const token = crypto.randomUUID();
    confirmations.set(token, { clientId: item.clientId, articleId: item.articleId, fingerprint, issuedAt, expiresAt: new Date(issuedMs + tokenTtlMs).toISOString() });
    return { token: token, clientId: item.clientId, articleId: item.articleId, deletedAt: tombstone.deletedAt, version: tombstone.version, fingerprint, issuedAt, expiresAt: new Date(issuedMs + tokenTtlMs).toISOString(), status: tombstone.status, permanentlyDeleted: tombstone.permanentlyDeleted === true };
  }

  function permanentlyDeleteArticle(input) {
    const item = selection(input);
    if (typeof input.token !== "string" || !input.token.trim()) {
      throw trashError("ARTICLE_PERMANENT_DELETE_CONFIRMATION_REQUIRED", "Permanent deletion confirmation is required");
    }
    const confirmed = confirmations.get(input.token);
    if (!confirmed || confirmed.clientId !== item.clientId || confirmed.articleId !== item.articleId) {
      throw trashError("ARTICLE_PERMANENT_DELETE_CONFIRMATION_INVALID", "Permanent deletion confirmation is invalid");
    }
    const executionAt = Date.parse(now());
    if (Number.isNaN(executionAt)) throw trashError("ARTICLE_PERMANENT_DELETE_CLOCK_INVALID", "Permanent deletion clock is invalid");
    if (executionAt >= Date.parse(confirmed.expiresAt)) {
      confirmations.delete(input.token);
      throw trashError("ARTICLE_PERMANENT_DELETE_CONFIRMATION_EXPIRED", "Permanent deletion confirmation has expired");
    }
    const current = contentStore.getTrashedTombstone(item.clientId, item.articleId);
    const fingerprint = tombstoneFingerprint(current);
    if (fingerprint !== confirmed.fingerprint) {
      confirmations.delete(input.token);
      throw trashError("ARTICLE_PERMANENT_DELETE_CONFIRMATION_STALE", "Permanent deletion confirmation is stale");
    }
    const tombstone = contentStore.permanentlyDeleteTrashedArticle(item.clientId, item.articleId, now());
    for (const [token, binding] of confirmations) {
      if (binding.clientId === item.clientId && binding.articleId === item.articleId) confirmations.delete(token);
    }
    return { clientId: item.clientId, articleId: item.articleId, deleted: true, deletedAt: tombstone.deletedAt };
  }

  return {
    listTrashedArticles,
    trashArticles,
    previewTrashArticles,
    previewArticleRemovalImpact: previewTrashArticles,
    restoreArticle,
    preparePermanentDelete,
    permanentlyDeleteArticle,
    recoverPendingRemovals: removalService && removalService.recoverPendingRemovals,
    getArticleRemovalTransaction: removalService && removalService.getArticleRemovalTransaction,
    listArticleRemovalTransactions: removalService && removalService.listArticleRemovalTransactions,
    retryArticleRemovalTransaction: removalService && removalService.retryArticleRemovalTransaction
  };
}

module.exports = { createArticleTrashService };
