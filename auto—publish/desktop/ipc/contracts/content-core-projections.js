const ARTICLE_REMOVAL_FIELDS = Object.freeze([
  "id",
  "transactionId",
  "status",
  "phase",
  "errorCode",
  "reasonCode",
  "createdAt",
  "updatedAt",
  "articleCount",
  "queueCursor",
  "articleCursor",
  "revision",
  "changedScopes",
]);

function projectArticleRemovalTransaction(input) {
  const value =
    input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const output = {};
  for (const field of ARTICLE_REMOVAL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(value, field))
      output[field] = value[field];
  }
  return output;
}

const ATTENTION_ITEM_FIELDS = Object.freeze([
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
  "transactionId",
  "status",
  "reasonCode",
  "pairState",
  "recommendedAction",
  "allowedActions",
  "updatedAt",
  "message",
]);

function projectArticleAttentionItem(input) {
  const value =
    input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const output = {};
  for (const field of ATTENTION_ITEM_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(value, field))
      output[field] = value[field];
  }
  return output;
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
  projectArticleAttentionItem,
  projectArticleAttentionList,
  projectArticleAttentionPreview,
  projectArticleAttentionResolution,
  projectArticleRemovalTransaction,
};
