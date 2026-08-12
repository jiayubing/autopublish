"use strict";

const {
  ArticleId,
  ClientId,
  MediaResourceId,
} = require("./identities");
const { dtoError } = require("./safe-operational-error");

function invalid(code) {
  throw dtoError(code);
}

function closedRecord(input, fields, code) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    invalid(code);
  if (Object.keys(input).some((field) => !fields.includes(field)))
    invalid(code);
}

function parseArticleRef(input, code) {
  closedRecord(input, ["clientId", "articleId"], code);
  try {
    return Object.freeze({
      clientId: ClientId.serialize(ClientId.parse(input.clientId)),
      articleId: ArticleId.serialize(ArticleId.parse(input.articleId)),
    });
  } catch (_) {
    invalid(code);
  }
}

function parseMediaResourceId(value, code) {
  if (value === null) return null;
  try {
    return MediaResourceId.serialize(MediaResourceId.parse(value));
  } catch (_) {
    invalid(code);
  }
}

function parseInstant(value, code) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    invalid(code);
  return value;
}

function parsePaidStagingItem(input) {
  const code = "PAID_STAGING_ITEM_INVALID";
  closedRecord(
    input,
    ["articleRef", "selectedMediaResourceId", "createdAt", "updatedAt"],
    code,
  );
  return Object.freeze({
    articleRef: parseArticleRef(input.articleRef, code),
    selectedMediaResourceId: parseMediaResourceId(
      input.selectedMediaResourceId,
      code,
    ),
    createdAt: parseInstant(input.createdAt, code),
    updatedAt: parseInstant(input.updatedAt, code),
  });
}

function parsePaidStagingArticleRefs(input) {
  const code = "PAID_STAGING_ARTICLES_REQUIRED";
  if (!Array.isArray(input) || input.length === 0) invalid(code);
  const byKey = new Map();
  input.forEach((value) => {
    const articleRef = parseArticleRef(
      value && value.articleRef ? value.articleRef : value,
      "PAID_STAGING_ARTICLE_IDENTITY_INVALID",
    );
    byKey.set(`${articleRef.clientId}\u0000${articleRef.articleId}`, articleRef);
  });
  return Object.freeze(
    [...byKey.values()].sort((left, right) => {
      const leftKey = `${left.clientId}\u0000${left.articleId}`;
      const rightKey = `${right.clientId}\u0000${right.articleId}`;
      return leftKey.localeCompare(rightKey);
    }),
  );
}

module.exports = Object.freeze({
  parsePaidStagingArticleRefs,
  parsePaidStagingItem,
  parsePaidStagingMediaResourceId: (value) =>
    parseMediaResourceId(value, "PAID_STAGING_MEDIA_RESOURCE_ID_INVALID"),
});
