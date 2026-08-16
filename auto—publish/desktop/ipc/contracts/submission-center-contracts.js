"use strict";

const {
  arrayField,
  enumField,
  exactObject,
  integerField,
  nullableField,
  numberField,
  optionalField,
} = require("./registry");
const {
  clientIdentity,
  articleRef,
  code,
  count,
  directArgs,
  directInput,
  id,
  safeText,
  submissionContract,
} = require("./submission-contract-shared");
const { articleAttentionItem } = require("./article-attention-contracts");

const regularSummary = exactObject({
  title: safeText(512, 1),
  customerName: safeText(256, 1),
});
const regularItemFields = {
  itemId: id,
  batchId: id,
  articleId: id,
  articleRef,
  articleSummary: regularSummary,
  regularPublicationAttemptId: id,
};
const regularCurrent = exactObject(Object.assign({}, regularItemFields, {
  phase: nullableField(safeText(64, 1)),
}));
const regularRemaining = exactObject(Object.assign({}, regularItemFields, {
  position: integerField({ min: 1, max: Number.MAX_SAFE_INTEGER }),
}));
const regularQueueGroupSnapshot = exactObject({
  queueGroupId: id,
  platformId: id,
  accountProfileId: id,
  imageCount: integerField({ min: 0, max: 5 }),
  imagePublishingSupported: "boolean",
  runState: enumField(["paused", "running", "in_flight"]),
  pauseIntent: enumField(["none", "manual", "system"]),
  current: nullableField(regularCurrent),
  remaining: arrayField(regularRemaining, { max: 20000 }),
  actions: exactObject({
    canStart: "boolean",
    canPause: "boolean",
    reasonCode: nullableField(code),
  }),
  revision: integerField({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  createdAt: safeText(64, 1),
  updatedAt: safeText(64, 1),
});

const paidItem = exactObject({
  itemId: id,
  articleRef,
  status: safeText(64, 1),
  phase: safeText(64, 1),
  title: optionalField(safeText(1000)),
});
const paidExecutionBatch = exactObject({
  batchId: id,
  mediaResourceId: id,
  status: enumField(["queued", "needs_attention", "completed"]),
  pauseIntent: enumField(["none", "manual", "system"]),
  runState: enumField(["paused", "running", "in_flight"]),
  actions: exactObject({
    canStart: "boolean",
    canPause: "boolean",
    canCancelRemaining: optionalField("boolean"),
  }),
  articleCount: count,
  mediaName: optionalField(safeText(500)),
  createdOrderCount: optionalField(count),
  remainingCount: optionalField(count),
  currentItem: optionalField(nullableField(paidItem)),
  pauseReason: optionalField(nullableField(safeText(128, 1))),
  quotedPrice: numberField({ min: 0, max: 100000000 }),
  estimatedTotal: numberField({ min: 0, max: 1000000000 }),
  createdAt: safeText(64, 1),
  updatedAt: safeText(64, 1),
  items: arrayField(paidItem, { max: 1000 }),
});

const attentionItem = exactObject(Object.assign({}, articleAttentionItem.fields, {
  targetLabel: require("./content-core-contract-shared").text(500),
}));

const submissionCenterSnapshot = exactObject({
  schemaVersion: require("./registry").literalField(1),
  clientId: clientIdentity,
  revision: integerField({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  regular: exactObject({ groups: arrayField(regularQueueGroupSnapshot, { max: 10000 }) }),
  paid: exactObject({ batches: arrayField(paidExecutionBatch, { max: 10000 }) }),
  attention: exactObject({ items: arrayField(attentionItem, { max: 10000 }) }),
  counts: exactObject({
    regularItems: integerField({ min: 0, max: 100000 }),
    paidBatches: integerField({ min: 0, max: 100000 }),
    attentionItems: integerField({ min: 0, max: 100000 }),
    total: integerField({ min: 0, max: 100000 }),
  }),
});

const submissionCenterContracts = Object.freeze([
  submissionContract({
    capability: "content.getSubmissionCenterSnapshot",
    channel: "content:get-submission-center-snapshot",
    kind: "query",
    request: exactObject({ clientId: clientIdentity }),
    success: submissionCenterSnapshot,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
]);

module.exports = { submissionCenterContracts, submissionCenterSnapshot };
