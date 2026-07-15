function reviewError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function hasText(value) {
  return typeof value === "string" && Boolean(value.trim());
}

function isCompleteSource(article) {
  const source = article && article.source;
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  if (!["client_material", "doubao_answer", "references", "template"].every(function(field) {
    return typeof source[field] === "boolean";
  })) return false;
  if (!Array.isArray(article.materialSnapshots) || article.materialSnapshots.length < 1) return false;
  if (!Array.isArray(article.researchSnapshots) || article.researchSnapshots.length < 1) return false;
  const template = article.templateSnapshot;
  return Boolean(template && typeof template === "object" && !Array.isArray(template) &&
    hasText(template.platform) && hasText(template.id) && hasText(template.name) &&
    hasText(template.scenario) && hasText(template.body) && hasText(template.bodyHash));
}

function validateSelection(selection) {
  if (!selection || typeof selection !== "object" || Array.isArray(selection) ||
      typeof selection.clientId !== "string" || !selection.clientId.trim() ||
      typeof selection.articleId !== "string" || !selection.articleId.trim()) {
    throw reviewError("ARTICLE_REVIEW_INPUT_INVALID", "Client id and article id are required");
  }
}

function createArticleReviewService(options) {
  const opts = options || {};
  const articleStore = opts.articleStore;
  if (!articleStore || typeof articleStore.getArticle !== "function" ||
      typeof articleStore.saveArticle !== "function") {
    throw reviewError("ARTICLE_REVIEW_SERVICE_INVALID", "Article store is required");
  }
  const now = typeof opts.now === "function" ? opts.now : function() { return new Date().toISOString(); };

  function rejection(articleId, code) {
    return { articleId: articleId, code: code };
  }

  function persistReviewed(article, reviewedAt) {
    if (typeof articleStore.reviewArticle === "function") {
      return articleStore.reviewArticle(article.clientId, article.id, reviewedAt);
    }
    return articleStore.saveArticle(Object.assign({}, article, { status: "saved", reviewedAt: reviewedAt }));
  }

  function reviewMany(selections) {
    if (!Array.isArray(selections) || selections.length > 500) {
      throw reviewError("ARTICLE_REVIEW_INPUT_INVALID", "At most 500 articles can be reviewed at once");
    }
    const approved = [];
    const rejected = [];
    const skipped = [];
    const seen = new Set();
    selections.forEach(function(selection) {
      validateSelection(selection);
      const key = selection.clientId + "\u0000" + selection.articleId;
      if (seen.has(key)) return;
      seen.add(key);
      let article;
      try {
        article = articleStore.getArticle(selection.clientId, selection.articleId);
      } catch (error) {
        rejected.push(rejection(selection.articleId, error && error.code === "ARTICLE_INVALID" ? "ARTICLE_CORRUPTED" : "ARTICLE_NOT_FOUND"));
        return;
      }
      if (!article || article.clientId !== selection.clientId) {
        rejected.push(rejection(selection.articleId, "ARTICLE_NOT_FOUND"));
        return;
      }
      if (article.status === "saved") {
        skipped.push(article.id);
        return;
      }
      if (article.status !== "generated") {
        rejected.push(rejection(article.id, "ARTICLE_NOT_GENERATED"));
        return;
      }
      if (!hasText(article.title)) {
        rejected.push(rejection(article.id, "ARTICLE_TITLE_INVALID"));
        return;
      }
      if (!hasText(article.content)) {
        rejected.push(rejection(article.id, "ARTICLE_CONTENT_INVALID"));
        return;
      }
      if (!isCompleteSource(article)) {
        rejected.push(rejection(article.id, "ARTICLE_SOURCE_INCOMPLETE"));
        return;
      }
      persistReviewed(article, now());
      approved.push(article.id);
    });
    return { approved: approved, rejected: rejected, skipped: skipped };
  }

  return { reviewMany: reviewMany };
}

module.exports = { createArticleReviewService };
