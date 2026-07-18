const crypto = require("node:crypto");

const PATH_CHARACTERS = /[<>:"/\\|?*\x00-\x1f]/;

function publicationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeId(value, code) {
  if (typeof value !== "string") {
    throw publicationError(code, "Publication identity is invalid");
  }
  const normalized = value.trim();
  if (!normalized || normalized === "." || normalized === ".." || PATH_CHARACTERS.test(normalized)) {
    throw publicationError(code, "Publication identity is invalid");
  }
  return normalized;
}

function normalizeText(value) {
  return String(value)
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function resolveArticleIdentity(input) {
  const values = input || {};
  const clientId = normalizeId(values.clientId, "PUBLICATION_ARTICLE_ID_INVALID");
  const hasArticleId = Object.prototype.hasOwnProperty.call(values, "articleId");

  if (hasArticleId) {
    const articleId = normalizeId(values.articleId, "PUBLICATION_ARTICLE_ID_INVALID");
    return {
      kind: "generated",
      articleKey: "generated:" + clientId + ":" + articleId,
      clientId: clientId,
      articleId: articleId,
      contentHash: null
    };
  }

  if (typeof values.title !== "string" || typeof values.content !== "string") {
    throw publicationError("PUBLICATION_ARTICLE_CONTENT_REQUIRED", "Manual article title and content are required");
  }

  const title = normalizeText(values.title);
  const content = normalizeText(values.content);
  if (!title) {
    throw publicationError("PUBLICATION_ARTICLE_CONTENT_REQUIRED", "Manual article title and content are required");
  }

  const contentHash = crypto.createHash("sha256")
    .update(title + "\n\n" + content, "utf8")
    .digest("hex");
  return {
    kind: "manual",
    articleKey: "content:" + contentHash,
    clientId: clientId,
    articleId: null,
    contentHash: contentHash
  };
}

module.exports = {
  normalizeArticleText: normalizeText,
  resolveArticleIdentity
};
