const REASON_CODES = Object.freeze({
  ARTICLE_IDENTITY_INVALID: "ARTICLE_IDENTITY_INVALID",
  ARTICLE_TITLE_EMPTY: "ARTICLE_TITLE_EMPTY",
  ARTICLE_CONTENT_EMPTY: "ARTICLE_CONTENT_EMPTY",
  ARTICLE_TARGET_UNSUPPORTED: "ARTICLE_TARGET_UNSUPPORTED"
});

const REASONS = Object.freeze({
  [REASON_CODES.ARTICLE_IDENTITY_INVALID]: "文章身份不完整",
  [REASON_CODES.ARTICLE_TITLE_EMPTY]: "标题为空",
  [REASON_CODES.ARTICLE_CONTENT_EMPTY]: "正文为空",
  [REASON_CODES.ARTICLE_TARGET_UNSUPPORTED]: "投稿目标不支持队列导入"
});

function hasText(value) {
  return typeof value === "string" && Boolean(value.trim());
}

function evaluateArticleSubmissionEligibility(article, options) {
  const value = article && typeof article === "object" && !Array.isArray(article) ? article : {};
  const opts = options && typeof options === "object" ? options : {};
  const reasonCodes = [];
  if (!hasText(value.id) || !hasText(value.clientId)) reasonCodes.push(REASON_CODES.ARTICLE_IDENTITY_INVALID);
  if (!hasText(value.title)) reasonCodes.push(REASON_CODES.ARTICLE_TITLE_EMPTY);
  if (!hasText(value.content)) reasonCodes.push(REASON_CODES.ARTICLE_CONTENT_EMPTY);
  if (opts.targetPlatform && opts.targetPlatform.contentQueueImport !== true) reasonCodes.push(REASON_CODES.ARTICLE_TARGET_UNSUPPORTED);
  return {
    eligible: reasonCodes.length === 0,
    reasonCodes: reasonCodes,
    reasons: reasonCodes.map(function(code) { return REASONS[code] || code; })
  };
}

function isArticleSubmissionEligible(article, options) {
  return evaluateArticleSubmissionEligibility(article, options).eligible;
}

module.exports = {
  REASON_CODES,
  REASONS,
  evaluateArticleSubmissionEligibility,
  checkArticleSubmissionEligibility: evaluateArticleSubmissionEligibility,
  isArticleSubmissionEligible
};
