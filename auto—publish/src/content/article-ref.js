const { isSafeSegment } = require("./content-identity");

function identityError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function normalizeArticleRef(value, code) {
  const invalidCode = code || "ARTICLE_IDENTITY_INVALID";
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.clientId !== "string" ||
    typeof value.articleId !== "string"
  ) {
    throw identityError(invalidCode, "Article identity is invalid");
  }
  const clientId = normalizedKeyPart(value.clientId);
  const articleId = normalizedKeyPart(value.articleId);
  if (
    !clientId ||
    !articleId ||
    !isSafeSegment(clientId) ||
    !isSafeSegment(articleId) ||
    clientId.includes("\u0000") ||
    articleId.includes("\u0000")
  ) {
    throw identityError(invalidCode, "Article identity is invalid");
  }
  return Object.freeze({
    clientId,
    articleId,
  });
}

function normalizedKeyPart(value) {
  return String(value).normalize("NFKC").trim();
}

function canonicalArticleRefKey(value) {
  const ref = normalizeArticleRef(value);
  return ref.clientId + "\u0000" + ref.articleId;
}

function articleRefOf(value) {
  if (!value || typeof value !== "object") {
    throw identityError("ARTICLE_IDENTITY_UNRESOLVED", "Article identity could not be resolved");
  }
  return normalizeArticleRef({
    clientId: value.clientId,
    articleId: value.articleId === undefined ? value.id : value.articleId,
  }, "ARTICLE_IDENTITY_UNRESOLVED");
}

function canonicalArticleRefs(values) {
  if (!Array.isArray(values) || !values.length) {
    throw identityError("ARTICLE_IDENTITY_INVALID", "At least one article identity is required");
  }
  const byKey = new Map();
  values.forEach(function (value) {
    const ref = normalizeArticleRef(value);
    byKey.set(canonicalArticleRefKey(ref), ref);
  });
  return [...byKey.entries()]
    .sort(function (left, right) {
      return left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0;
    })
    .map(function (entry) { return entry[1]; });
}

module.exports = {
  articleRefOf,
  canonicalArticleRefKey,
  canonicalArticleRefs,
  normalizeArticleRef,
};
