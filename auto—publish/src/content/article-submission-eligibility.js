const REASON_CODES = Object.freeze({
  ARTICLE_IDENTITY_INVALID: "ARTICLE_IDENTITY_INVALID",
  ARTICLE_STATUS_INVALID: "ARTICLE_STATUS_INVALID",
  ARTICLE_TITLE_EMPTY: "ARTICLE_TITLE_EMPTY",
  ARTICLE_CONTENT_EMPTY: "ARTICLE_CONTENT_EMPTY",
  ARTICLE_PROVENANCE_INCOMPLETE: "ARTICLE_PROVENANCE_INCOMPLETE",
  ARTICLE_TARGET_UNSUPPORTED: "ARTICLE_TARGET_UNSUPPORTED"
});

const REASONS = Object.freeze({
  [REASON_CODES.ARTICLE_IDENTITY_INVALID]: "文章身份不完整",
  [REASON_CODES.ARTICLE_STATUS_INVALID]: "文章状态不支持投稿",
  [REASON_CODES.ARTICLE_TITLE_EMPTY]: "标题为空",
  [REASON_CODES.ARTICLE_CONTENT_EMPTY]: "正文为空",
  [REASON_CODES.ARTICLE_PROVENANCE_INCOMPLETE]: "生成来源或模板快照不完整",
  [REASON_CODES.ARTICLE_TARGET_UNSUPPORTED]: "投稿目标不支持队列导入"
});

function hasText(value) {
  return typeof value === "string" && Boolean(value.trim());
}

function isCompleteProvenance(article) {
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

function evaluateArticleSubmissionEligibility(article, options) {
  const value = article && typeof article === "object" && !Array.isArray(article) ? article : {};
  const opts = options && typeof options === "object" ? options : {};
  const reasonCodes = [];
  if (!hasText(value.id) || !hasText(value.clientId)) reasonCodes.push(REASON_CODES.ARTICLE_IDENTITY_INVALID);
  if (!["generated", "saved"].includes(value.status)) reasonCodes.push(REASON_CODES.ARTICLE_STATUS_INVALID);
  if (!hasText(value.title)) reasonCodes.push(REASON_CODES.ARTICLE_TITLE_EMPTY);
  if (!hasText(value.content)) reasonCodes.push(REASON_CODES.ARTICLE_CONTENT_EMPTY);
  if (!isCompleteProvenance(value)) reasonCodes.push(REASON_CODES.ARTICLE_PROVENANCE_INCOMPLETE);
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
  isArticleSubmissionEligible,
  isCompleteProvenance
};
