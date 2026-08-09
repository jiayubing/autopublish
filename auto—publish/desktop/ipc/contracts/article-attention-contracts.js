const {
  arrayField,
  exactObject,
  integerField,
  optionalField,
  stringField,
} = require("./registry");
const {
  contentContract,
  id,
  optionalNullableText,
  projectFields,
  text,
} = require("./content-core-contract-shared");

const articleAttentionItem = exactObject({
  attentionId: id,
  kind: stringField({ max: 80 }),
  articleId: optionalNullableText(200),
  titleSnapshot: optionalNullableText(1000),
  clientId: optionalNullableText(200),
  platformId: optionalNullableText(100),
  displayName: optionalNullableText(200),
  batchId: optionalNullableText(200),
  publicationId: optionalNullableText(200),
  attemptId: optionalNullableText(200),
  orderCreationAttemptId: optionalNullableText(200),
  resolutionActions: optionalField(
    arrayField(stringField({ max: 80 }), { max: 8 }),
  ),
  transactionId: optionalNullableText(200),
  status: optionalNullableText(80),
  reasonCode: optionalNullableText(128),
  pairState: optionalNullableText(80),
  recommendedAction: optionalNullableText(80),
  allowedActions: arrayField(stringField({ max: 80 }), { max: 32 }),
  updatedAt: optionalNullableText(64),
  message: optionalNullableText(1000),
});
const articleAttentionList = exactObject({
  revision: integerField({ min: 0 }),
  items: arrayField(articleAttentionItem, { max: 10000 }),
  counts: exactObject({
    total: integerField({ min: 0 }),
    actionable: integerField({ min: 0 }),
  }),
});

const articleAttentionContracts = Object.freeze([
  contentContract({
    capability: "attention.listArticleAttention",
    channel: "content:list-article-attention",
    feature: "attention",
    kind: "query",
    request: exactObject({ clientId: optionalField(id) }),
    success: articleAttentionList,
    fromArgs: (args) => args[0] || {},
    toArgs: (payload) => [payload],
  }),
  contentContract({
    capability: "attention.previewArticleAttention",
    channel: "content:preview-article-attention",
    feature: "attention",
    kind: "query",
    request: exactObject({
      attentionId: id,
      action: stringField({ max: 80 }),
      clientId: optionalField(id),
    }),
    success: exactObject({
      attentionId: id,
      revision: integerField({ min: 0 }),
      action: stringField({ max: 80 }),
      requiresConfirmation: "boolean",
      message: text(1000),
      changedScopes: arrayField(stringField({ max: 80 }), { max: 32 }),
    }),
    fromArgs: (args) => args[0] || {},
    toArgs: (payload) => [payload],
  }),
  contentContract({
    capability: "attention.resolveArticleAttention",
    channel: "content:resolve-article-attention",
    feature: "attention",
    kind: "command",
    request: exactObject({
      attentionId: id,
      action: stringField({ max: 80 }),
      expectedRevision: integerField({ min: 0 }),
      confirmed: optionalField("boolean"),
      clientId: optionalField(id),
    }),
    success: exactObject({
      outcome: stringField({ max: 80 }),
      attentionId: id,
      changedScopes: arrayField(stringField({ max: 80 }), { max: 32 }),
    }),
    fromArgs: (args) => args[0] || {},
    toArgs: (payload) => [payload],
  }),
]);

function projectArticleAttentionItem(input) {
  const value =
    input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return projectFields(value, [
    "attentionId",
    "kind",
    "articleId",
    "titleSnapshot",
    "clientId",
    "platformId",
    "displayName",
    "batchId",
    "publicationId",
    "attemptId",
    "orderCreationAttemptId",
    "resolutionActions",
    "transactionId",
    "status",
    "reasonCode",
    "pairState",
    "recommendedAction",
    "allowedActions",
    "updatedAt",
    "message",
  ]);
}

function projectArticleAttentionList(input) {
  const value =
    input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return {
    revision: value.revision,
    items: Array.isArray(value.items)
      ? value.items.map(projectArticleAttentionItem)
      : value.items,
    counts:
      value.counts &&
      typeof value.counts === "object" &&
      !Array.isArray(value.counts)
        ? { total: value.counts.total, actionable: value.counts.actionable }
        : value.counts,
  };
}

function projectArticleAttentionPreview(input) {
  const value =
    input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return {
    attentionId: value.attentionId,
    revision: value.revision,
    action: value.action,
    requiresConfirmation: value.requiresConfirmation,
    message: value.message,
    changedScopes: value.changedScopes,
  };
}

function projectArticleAttentionResolution(input) {
  const value =
    input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return {
    outcome: value.outcome,
    attentionId: value.attentionId,
    changedScopes: value.changedScopes,
  };
}

module.exports = {
  articleAttentionContracts,
  articleAttentionList,
  projectArticleAttentionItem,
  projectArticleAttentionList,
  projectArticleAttentionPreview,
  projectArticleAttentionResolution,
};
