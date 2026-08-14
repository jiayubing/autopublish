const {
  arrayField,
  enumField,
  exactObject,
  integerField,
  nullableField,
  optionalField,
  stringField,
} = require("./registry");
const {
  contentContract,
  id,
  opaqueToken,
  optionalNullableText,
  projectFields,
  text,
} = require("./content-core-contract-shared");

const attentionResolutionInput = exactObject({
  orderId: optionalField(id),
  observedAt: optionalField(text(64)),
  remoteUrl: optionalField(text(2048)),
  reasonCode: optionalField(
    stringField({ max: 128, pattern: /^[A-Z][A-Z0-9_]{0,127}$/u }),
  ),
});

const attentionKinds = enumField([
  "regular_platform_failed",
  "regular_platform_uncertain",
  "paid_order_creation_uncertain",
  "order_status_anomaly",
  "removal_needs_repair",
  "published_archive_failed",
]);
const attentionOwners = enumField([
  "regular-platform-outcome",
  "paid-order-creation",
  "order-reconciliation",
  "article-removal-recovery",
  "publication-archive",
]);
const attentionActions = enumField([
  "open-submission",
  "open-article",
  "open-publication",
  "inspect",
  "confirm-regular-accepted",
  "confirm-regular-not-accepted",
  "bind-paid-order-number",
  "confirm-paid-order-absent",
  "resume-order-tracking",
  "confirm-order-published",
  "confirm-order-not-published",
  "retry-removal",
  "retry-archive",
]);

const attentionSafeFacts = exactObject({
  articleId: optionalNullableText(200),
  clientId: optionalNullableText(100),
  platformId: optionalNullableText(100),
  targetKey: optionalNullableText(512),
  publicationId: optionalNullableText(160),
  attemptId: optionalNullableText(160),
  orderCreationAttemptId: optionalNullableText(160),
  orderId: optionalNullableText(160),
  transactionId: optionalNullableText(160),
  jobId: optionalNullableText(160),
  status: optionalNullableText(80),
  reasonCode: optionalNullableText(128),
  updatedAt: optionalNullableText(64),
  articleStatus: optionalNullableText(80),
});

const articleAttentionItem = exactObject({
  attentionId: id,
  kind: attentionKinds,
  owner: attentionOwners,
  freeze: exactObject({
    article: "boolean",
    reasonCode: optionalNullableText(128),
  }),
  resolutionPriority: integerField({ min: 0 }),
  safeFacts: attentionSafeFacts,
  articleId: optionalNullableText(200),
  titleSnapshot: optionalNullableText(1000),
  clientId: optionalNullableText(200),
  platformId: optionalNullableText(100),
  displayName: optionalNullableText(200),
  batchId: optionalNullableText(200),
  publicationId: optionalNullableText(200),
  attemptId: optionalNullableText(200),
  orderCreationAttemptId: optionalNullableText(200),
  orderId: optionalNullableText(200),
  accountProfileId: optionalNullableText(200),
  targetKey: optionalNullableText(512),
  jobId: optionalNullableText(200),
  remoteId: optionalNullableText(512),
  remoteUrl: optionalNullableText(2048),
  transactionId: optionalNullableText(200),
  status: optionalNullableText(80),
  reasonCode: optionalNullableText(128),
  pairState: optionalNullableText(80),
  recommendedAction: optionalField(nullableField(attentionActions)),
  allowedActions: arrayField(attentionActions, { max: 32 }),
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
      action: attentionActions,
      expectedRevision: optionalField(integerField({ min: 0 })),
      resolutionInput: optionalField(attentionResolutionInput),
      clientId: optionalField(id),
    }),
    success: exactObject({
      attentionId: id,
      revision: integerField({ min: 0 }),
      action: attentionActions,
      requiresConfirmation: "boolean",
      confirmationToken: optionalField(opaqueToken),
      resolutionInput: optionalField(attentionResolutionInput),
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
      action: attentionActions,
      expectedRevision: integerField({ min: 0 }),
      confirmed: optionalField("boolean"),
      confirmationToken: optionalField(opaqueToken),
      resolutionInput: optionalField(attentionResolutionInput),
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
    "owner",
    "freeze",
    "resolutionPriority",
    "safeFacts",
    "articleId",
    "titleSnapshot",
    "clientId",
    "platformId",
    "displayName",
    "batchId",
    "publicationId",
    "attemptId",
    "orderCreationAttemptId",
    "orderId",
    "accountProfileId",
    "targetKey",
    "jobId",
    "remoteId",
    "remoteUrl",
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
  const output = {
    attentionId: value.attentionId,
    revision: value.revision,
    action: value.action,
    requiresConfirmation: value.requiresConfirmation,
    message: value.message,
    changedScopes: value.changedScopes,
  };
  if (value.confirmationToken !== undefined)
    output.confirmationToken = value.confirmationToken;
  if (value.resolutionInput !== undefined)
    output.resolutionInput = value.resolutionInput;
  return output;
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
