const crypto = require("node:crypto");
const { canonicalArticleRefKey, normalizeArticleRef } = require("./article-ref");

function removalError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function selection(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.clientId !== "string" ||
    !value.clientId.trim() ||
    typeof value.articleId !== "string" ||
    !value.articleId.trim()
  )
    throw removalError("CONTENT_INPUT_INVALID", "Article selection is invalid");
  try {
    return normalizeArticleRef(value, "CONTENT_INPUT_INVALID");
  } catch (error) {
    throw removalError("CONTENT_INPUT_INVALID", "Article selection is invalid");
  }
}

function selections(input) {
  const values = Array.isArray(input) ? input : input && input.selections;
  if (!Array.isArray(values) || !values.length)
    throw removalError(
      "CONTENT_INPUT_INVALID",
      "At least one article is required",
    );
  const result = values.map(selection);
  const seen = new Set();
  result.forEach(function (value) {
    const key = canonicalArticleRefKey(value);
    if (seen.has(key))
      throw removalError(
        "CONTENT_INPUT_INVALID",
        "Article selection contains duplicates",
      );
    seen.add(key);
  });
  return result;
}

function fingerprint(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}

function transactionFingerprint(selectionsValue) {
  return fingerprint({
    selections: (selectionsValue || [])
      .map(canonicalArticleRefKey)
      .sort(),
  });
}

function isOpenStatus(status) {
  return ["pending_auto_recovery", "pending_recovery", "needs_repair"].includes(
    status,
  );
}

function isRepairableError(error) {
  return (
    !!error &&
    [
      "ARTICLE_REMOVAL_OPERATION_IN_FLIGHT",
      "ARTICLE_REMOVAL_OPERATION_CONFLICT",
      "ARTICLE_REMOVAL_CONTENT_CHANGED",
      "ARTICLE_REMOVAL_BLOCKED",
      "ARTICLE_MUTATION_RESULT_UNCERTAIN",
      "ARTICLE_TOMBSTONE_CHANGED",
    ].includes(error.code)
  );
}

function titleSnapshot(article) {
  return typeof article.title === "string" && article.title.trim()
    ? article.title.trim().slice(0, 200)
    : null;
}

function tombstoneReferences(article) {
  return ["generationBatchId", "generationTaskId"]
    .filter(function (field) {
      return typeof article[field] === "string" && article[field].trim();
    })
    .map(function (field) {
      return {
        type:
          field === "generationBatchId"
            ? "generation-batch"
            : "generation-task",
        id: article[field],
      };
    });
}

module.exports = {
  removalError,
  clone,
  selection,
  selections,
  fingerprint,
  transactionFingerprint,
  isOpenStatus,
  isRepairableError,
  titleSnapshot,
  tombstoneReferences,
};
