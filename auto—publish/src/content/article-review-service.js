function reviewError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function hasText(value) {
  return typeof value === "string" && Boolean(value.trim());
}

const { evaluateArticleSubmissionEligibility, REASON_CODES } = require("./article-submission-eligibility");

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
      const eligibility = evaluateArticleSubmissionEligibility(article);
      if (!eligibility.eligible) {
        const code = eligibility.reasonCodes[0];
        const legacyCode = code === REASON_CODES.ARTICLE_TITLE_EMPTY ? "ARTICLE_TITLE_INVALID"
          : code === REASON_CODES.ARTICLE_CONTENT_EMPTY ? "ARTICLE_CONTENT_INVALID"
            : code === REASON_CODES.ARTICLE_PROVENANCE_INCOMPLETE ? "ARTICLE_SOURCE_INCOMPLETE" : code;
        rejected.push(rejection(article.id, legacyCode));
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
