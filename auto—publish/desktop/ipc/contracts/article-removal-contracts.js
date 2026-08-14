const {
  arrayField,
  customField,
  exactObject,
  integerField,
  literalField,
  optionalField,
  nullableField,
  stringField,
} = require("./registry");
const {
  parseDeletionTransactionIdentityV1,
  parseTombstoneIdentityV1,
} = require("../../../src/domain/article-lifecycle-terminal-contract");
const { generatedArticle } = require("./article-editor-contracts");
const {
  contentContract,
  directArgs,
  directInput,
  id,
  multiline,
  opaqueToken,
  optionalNullableText,
  own,
  projectFields,
  text,
  timestamp,
} = require("./content-core-contract-shared");

const selection = exactObject({ clientId: id, articleId: id });
const trashReference = exactObject({ type: text(80), id });
const tombstoneIdentityField = customField(function (value) {
  return parseTombstoneIdentityV1(value);
});
const trashRecord = exactObject({
  version: literalField(1),
  deletedAt: timestamp,
  clientId: id,
  articleId: id,
  status: text(80),
  references: arrayField(trashReference, { max: 1000 }),
  titleSnapshot: optionalField(nullableField(multiline(1000))),
  tombstoneIdentityV1: optionalField(tombstoneIdentityField),
});
const impactItem = exactObject({
  clientId: optionalField(id),
  articleId: optionalField(id),
  batchId: optionalNullableText(200),
  publicationId: optionalNullableText(200),
  attemptId: optionalNullableText(200),
  itemId: optionalNullableText(200),
  platformId: optionalNullableText(200),
  targetPlatformId: optionalNullableText(200),
  targetKey: optionalNullableText(200),
  displayName: optionalNullableText(1000),
  reasonCode: optionalNullableText(128),
  status: optionalNullableText(80),
  source: optionalNullableText(80),
  mediaResourceId: optionalNullableText(200),
  orderId: optionalNullableText(200),
  orderNid: optionalNullableText(200),
  titleSnapshot: optionalNullableText(1000),
  state: optionalField(text(80)),
});
const impactPreview = exactObject({
  token: optionalField(opaqueToken),
  articleCount: integerField({ min: 0, max: 10000 }),
  blockedItems: arrayField(impactItem, { max: 10000 }),
  canCommit: "boolean",
  selections: optionalField(arrayField(selection, { max: 10000 })),
  expiresAt: optionalField(timestamp),
  transactionId: optionalNullableText(200),
  openTransactionId: optionalNullableText(200),
});
const articleRemovalTransaction = exactObject({
  id: optionalField(id),
  transactionId: optionalField(id),
  status: stringField({ max: 80 }),
  phase: optionalNullableText(80),
  errorCode: optionalNullableText(128),
  reasonCode: optionalNullableText(128),
  createdAt: optionalNullableText(64),
  updatedAt: optionalNullableText(64),
  articleCount: optionalField(integerField({ min: 0, max: 100000 })),
  articleCursor: optionalField(integerField({ min: 0, max: 100000 })),
  revision: optionalField(integerField({ min: 0 })),
  changedScopes: optionalField(
    arrayField(stringField({ max: 80 }), { max: 32 }),
  ),
  deletionTransactionIdentityV1: optionalField(
    customField(function (value) {
      return parseDeletionTransactionIdentityV1(value);
    }),
  ),
});
const trashCommitResult = exactObject({
  moved: optionalField(arrayField(trashRecord, { max: 10000 })),
  skipped: optionalField(arrayField(trashRecord, { max: 10000 })),
  rejected: optionalField(
    arrayField(exactObject({ clientId: id, articleId: id, code: text(128) }), {
      max: 10000,
    }),
  ),
  transactionId: optionalField(id),
  status: optionalField(text(80)),
  articleCount: optionalField(integerField({ min: 0, max: 10000 })),
  errorCode: optionalNullableText(128),
  reasonCode: optionalNullableText(128),
  phase: optionalNullableText(80),
  transaction: optionalField(nullableField(articleRemovalTransaction)),
});
const permanentDeleteConfirmation = exactObject({
  token: opaqueToken,
  clientId: id,
  articleId: id,
  deletedAt: timestamp,
  status: text(80),
  version: optionalField(integerField({ min: 1, max: 1000 })),
  fingerprint: optionalField(text(256)),
  issuedAt: optionalField(timestamp),
  expiresAt: optionalField(timestamp),
  permanentlyDeleted: optionalField("boolean"),
});
const permanentDeleteResult = exactObject({
  clientId: id,
  articleId: id,
  deleted: literalField(true),
  deletedAt: timestamp,
  tombstoneIdentityV1: optionalField(tombstoneIdentityField),
});
const removalPreviewRequest = exactObject({
  selections: optionalField(arrayField(selection, { min: 1, max: 10000 })),
});
const removalCommitRequest = exactObject({
  selections: optionalField(arrayField(selection, { min: 1, max: 10000 })),
  token: optionalField(opaqueToken),
  confirmed: literalField(true),
});

function articleRemovalContract(channel, kind) {
  const retry = channel === "content:retry-article-removal-transaction";
  return contentContract({
    capability: retry
      ? "content.retryArticleRemovalTransaction"
      : "content.getArticleRemovalTransaction",
    channel,
    feature: "content",
    kind,
    request: exactObject({
      transactionId: id,
      ...(retry ? { confirmed: literalField(true) } : {}),
    }),
    success: exactObject({ transaction: articleRemovalTransaction }),
    fromArgs: directArgs,
    toArgs: directInput,
  });
}

const articleRemovalContracts = Object.freeze([
  contentContract({
    capability: "content.previewArticleRemovalImpact",
    channel: "content:preview-article-removal-impact",
    feature: "content",
    kind: "query",
    request: removalPreviewRequest,
    success: impactPreview,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  contentContract({
    capability: "content.trashArticles",
    channel: "content:trash-articles",
    feature: "content",
    kind: "command",
    request: removalCommitRequest,
    success: trashCommitResult,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  contentContract({
    capability: "content.restoreArticle",
    channel: "content:restore-article",
    feature: "content",
    kind: "command",
    request: selection,
    success: exactObject({
      article: generatedArticle,
      restored: "boolean",
      queueRestored: "boolean",
      message: text(1000),
    }),
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  contentContract({
    capability: "content.preparePermanentDeleteArticle",
    channel: "content:prepare-permanent-delete-article",
    feature: "content",
    kind: "command",
    request: selection,
    success: permanentDeleteConfirmation,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  contentContract({
    capability: "content.permanentlyDeleteArticle",
    channel: "content:permanently-delete-article",
    feature: "content",
    kind: "command",
    request: exactObject({ clientId: id, articleId: id, token: opaqueToken }),
    success: permanentDeleteResult,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  articleRemovalContract("content:get-article-removal-transaction", "query"),
  articleRemovalContract(
    "content:retry-article-removal-transaction",
    "command",
  ),
]);

const articleRemovalEventContracts = Object.freeze([
  contentContract({
    capability: "content.articleRemovalTransactionChanged",
    channel: "content:article-removal-transaction",
    feature: "content",
    kind: "event",
    event: articleRemovalTransaction,
  }),
]);

function projectTrashRecord(value) {
  const output = projectFields(value, [
    "version",
    "deletedAt",
    "clientId",
    "articleId",
    "status",
    "titleSnapshot",
    "tombstoneIdentityV1",
  ]);
  output.references = Array.isArray(value && value.references)
    ? value.references.map((item) => projectFields(item, ["type", "id"]))
    : [];
  return output;
}

function projectImpactItem(value) {
  return projectFields(value, [
    "clientId",
    "articleId",
    "batchId",
    "publicationId",
    "attemptId",
    "itemId",
    "platformId",
    "targetPlatformId",
    "targetKey",
    "displayName",
    "reasonCode",
    "status",
    "source",
    "mediaResourceId",
    "orderId",
    "orderNid",
    "titleSnapshot",
    "state",
  ]);
}

function projectImpactPreview(value) {
  const output = projectFields(value, [
    "token",
    "articleCount",
    "canCommit",
    "expiresAt",
    "transactionId",
    "openTransactionId",
  ]);
  output.blockedItems = Array.isArray(value && value.blockedItems)
    ? value.blockedItems.map(projectImpactItem)
    : [];
  if (own(value, "selections"))
    output.selections = Array.isArray(value.selections)
      ? value.selections.map((item) =>
          projectFields(item, ["clientId", "articleId"]),
        )
      : value.selections;
  return output;
}

function projectArticleRemovalTransaction(input) {
  const value =
    input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const output = {};
  for (const field of [
    "id",
    "transactionId",
    "status",
    "phase",
    "errorCode",
    "reasonCode",
    "createdAt",
    "updatedAt",
    "articleCount",
    "articleCursor",
    "revision",
    "changedScopes",
    "deletionTransactionIdentityV1",
  ]) {
    if (Object.prototype.hasOwnProperty.call(value, field))
      output[field] = value[field];
  }
  return output;
}

function projectTrashCommitResult(value) {
  const output = projectFields(value, [
    "transactionId",
    "status",
    "articleCount",
    "errorCode",
    "reasonCode",
    "phase",
  ]);
  if (own(value, "moved"))
    output.moved = Array.isArray(value.moved)
      ? value.moved.map(projectTrashRecord)
      : value.moved;
  if (own(value, "skipped"))
    output.skipped = Array.isArray(value.skipped)
      ? value.skipped.map(projectTrashRecord)
      : value.skipped;
  if (own(value, "rejected"))
    output.rejected = Array.isArray(value.rejected)
      ? value.rejected.map((item) =>
          projectFields(item, ["clientId", "articleId", "code"]),
        )
      : value.rejected;
  if (own(value, "transaction"))
    output.transaction =
      value.transaction === null
        ? null
        : projectArticleRemovalTransaction(value.transaction);
  return output;
}

function projectPermanentDeleteConfirmation(value) {
  return projectFields(value, [
    "token",
    "clientId",
    "articleId",
    "deletedAt",
    "status",
    "version",
    "fingerprint",
    "issuedAt",
    "expiresAt",
    "permanentlyDeleted",
  ]);
}

function projectPermanentDeleteResult(value) {
  return projectFields(value, [
    "clientId",
    "articleId",
    "deleted",
    "deletedAt",
    "tombstoneIdentityV1",
  ]);
}

module.exports = {
  articleRemovalContracts,
  articleRemovalEventContracts,
  articleRemovalTransaction,
  projectArticleRemovalTransaction,
  projectImpactPreview,
  projectPermanentDeleteConfirmation,
  projectPermanentDeleteResult,
  projectTrashCommitResult,
  projectTrashRecord,
  trashRecord,
};
