const crypto = require("crypto");

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
  if (!opts.articleStore) throw trashError("ARTICLE_TRASH_SERVICE_INVALID", "Article store is required");
  const articleStore = opts.articleStore;
  const now = opts.now || function() { return new Date().toISOString(); };
  const confirmations = new Map();

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
      references: references
    };
  }

  function listTrashedArticles(clientId) {
    assertId(clientId, "Client id");
    return articleStore.listTrashedArticles(clientId);
  }

  function trashArticles(input) {
    if (!input || typeof input !== "object" || Array.isArray(input) || !Array.isArray(input.articles) || input.articles.length < 1) {
      throw trashError("CONTENT_INPUT_INVALID", "At least one article is required");
    }
    if (input.confirmed !== true) throw trashError("ARTICLE_TRASH_CONFIRMATION_REQUIRED", "Article trash confirmation is required");
    const moved = [];
    const skipped = [];
    const rejected = [];
    input.articles.forEach(function(rawSelection) {
      const item = selection(rawSelection);
      try {
        const article = articleStore.getArticle(item.clientId, item.articleId);
        const tombstone = articleStore.moveArticleToTrash(item.clientId, item.articleId, buildTombstone(article));
        moved.push(tombstone);
      } catch (error) {
        if (error && error.code === "ARTICLE_NOT_FOUND") {
          const existing = articleStore.listTrashedArticles(item.clientId).find(function(value) { return value.articleId === item.articleId; });
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

  function restoreArticle(input) {
    const item = selection(input);
    return articleStore.restoreTrashedArticle(item.clientId, item.articleId);
  }

  function preparePermanentDelete(input) {
    const item = selection(input);
    const tombstone = articleStore.listTrashedArticles(item.clientId).find(function(value) { return value.articleId === item.articleId; });
    if (!tombstone) throw trashError("ARTICLE_NOT_FOUND", "Trashed article was not found");
    const token = crypto.randomUUID();
    confirmations.set(token, item);
    return { token: token, clientId: item.clientId, articleId: item.articleId, deletedAt: tombstone.deletedAt, status: tombstone.status };
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
    const tombstone = articleStore.permanentlyDeleteTrashedArticle(item.clientId, item.articleId);
    confirmations.delete(input.token);
    return { clientId: item.clientId, articleId: item.articleId, deleted: true, deletedAt: tombstone.deletedAt };
  }

  return { listTrashedArticles, trashArticles, restoreArticle, preparePermanentDelete, permanentlyDeleteArticle };
}

module.exports = { createArticleTrashService };
