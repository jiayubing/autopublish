const {
  arrayField,
  enumField,
  exactObject,
  integerField,
  literalField,
  nullableField,
  optionalField,
} = require("./registry");
const {
  articleRef,
  code,
  count,
  directArgs,
  directInput,
  emptyRequest,
  id,
  include,
  noArgs,
  noLegacyInput,
  projectArticleRef,
  revision,
  safeText,
  submissionContract,
} = require("./submission-contract-shared");

const regularQueueItem = exactObject({
  articleRef,
  articleId: id,
  itemId: optionalField(id),
  batchId: optionalField(id),
  publicationId: optionalField(nullableField(id)),
  attemptId: optionalField(nullableField(id)),
  targetKey: optionalField(safeText(256, 1)),
  queueGroupId: optionalField(id),
  position: optionalField(
    integerField({ min: 1, max: Number.MAX_SAFE_INTEGER }),
  ),
  status: safeText(64, 1),
  idempotent: optionalField("boolean"),
  reasonCode: optionalField(nullableField(code)),
  reasonCodes: optionalField(arrayField(code, { max: 32 })),
});
const regularQueueTarget = exactObject({
  platformId: id,
  accountProfileId: id,
});
const regularQueueConfig = exactObject({ queueGroupId: optionalField(id) });
const regularAdmissionFields = {
  articleRefs: arrayField(articleRef, { min: 1, max: 1000 }),
  platformId: id,
  accountProfileId: id,
  queueConfig: optionalField(regularQueueConfig),
};
const regularAdmissionPreview = exactObject({
  target: regularQueueTarget,
  articleRefs: arrayField(articleRef, { min: 1, max: 1000 }),
  items: arrayField(regularQueueItem, { max: 1000 }),
  totalCount: count,
  queueableCount: count,
  idempotentCount: count,
  missingCount: count,
  conflictCount: count,
});
const regularAdmissionResult = exactObject({
  batchId: id,
  target: regularQueueTarget,
  articleRefs: arrayField(articleRef, { min: 1, max: 1000 }),
  items: arrayField(regularQueueItem, { max: 1000 }),
  admittedCount: count,
  idempotentCount: count,
  missingCount: count,
  conflictCount: count,
});
const regularRemovalItemRequest = exactObject({
  articleRef,
  itemId: id,
  batchId: id,
  targetKey: optionalField(safeText(256, 1)),
});
const regularRemovalRequest = exactObject({
  items: arrayField(regularRemovalItemRequest, { min: 1, max: 1000 }),
  operationId: optionalField(id),
  confirmed: literalField(true),
});
const regularRemovalResult = exactObject({
  items: arrayField(regularQueueItem, { max: 1000 }),
  removedCount: count,
  idempotentCount: count,
  conflictCount: count,
});
const regularQueueCurrentItem = exactObject({
  itemId: id,
  batchId: id,
  articleId: id,
  regularPublicationAttemptId: id,
  phase: nullableField(safeText(64, 1)),
  claimUntil: nullableField(safeText(64, 1)),
});
const regularQueueRemainingItem = exactObject({
  itemId: id,
  batchId: id,
  articleId: id,
  regularPublicationAttemptId: id,
  position: integerField({ min: 1, max: Number.MAX_SAFE_INTEGER }),
});
const regularQueueGroupSnapshot = exactObject({
  queueGroupId: id,
  platformId: id,
  accountProfileId: id,
  runState: enumField(["paused", "running", "in_flight"]),
  pauseIntent: enumField(["none", "manual", "system"]),
  manuallyPaused: "boolean",
  current: nullableField(regularQueueCurrentItem),
  remaining: arrayField(regularQueueRemainingItem, { max: 20000 }),
  actions: exactObject({
    canStart: "boolean",
    canPause: "boolean",
    reasonCode: nullableField(code),
  }),
  revision: integerField({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  createdAt: safeText(64, 1),
  updatedAt: safeText(64, 1),
});
const regularQueueGroupList = exactObject({
  items: arrayField(regularQueueGroupSnapshot, { max: 10000 }),
});

const submissionRegularContracts = Object.freeze([
  submissionContract({
    capability: "content.previewRegularQueueAdmission",
    channel: "content:preview-regular-queue-admission",
    kind: "query",
    request: exactObject(regularAdmissionFields),
    success: regularAdmissionPreview,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  submissionContract({
    capability: "content.admitRegularQueueItems",
    channel: "content:admit-regular-queue-items",
    kind: "command",
    request: exactObject(
      Object.assign({}, regularAdmissionFields, {
        confirmed: literalField(true),
      }),
    ),
    success: regularAdmissionResult,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  submissionContract({
    capability: "content.removePendingQueueItems",
    channel: "content:remove-pending-queue-items",
    kind: "command",
    request: regularRemovalRequest,
    success: regularRemovalResult,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  submissionContract({
    capability: "content.listRegularQueueGroups",
    channel: "content:list-regular-queue-groups",
    kind: "query",
    request: emptyRequest,
    success: regularQueueGroupList,
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  submissionContract({
    capability: "content.startRegularQueueGroup",
    channel: "content:start-regular-queue-group",
    kind: "command",
    request: exactObject({ queueGroupId: id }),
    success: regularQueueGroupList,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  submissionContract({
    capability: "content.pauseRegularQueueGroup",
    channel: "content:pause-regular-queue-group",
    kind: "command",
    request: exactObject({ queueGroupId: id }),
    success: regularQueueGroupList,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  submissionContract({
    capability: "content.startAllRegularQueueGroups",
    channel: "content:start-all-regular-queue-groups",
    kind: "command",
    request: emptyRequest,
    success: regularQueueGroupList,
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  submissionContract({
    capability: "content.pauseAllRegularQueueGroups",
    channel: "content:pause-all-regular-queue-groups",
    kind: "command",
    request: emptyRequest,
    success: regularQueueGroupList,
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
]);

function projectRegularQueueItem(value) {
  const input = value || {};
  const output = {
    articleRef: projectArticleRef(input.articleRef || input),
    articleId: input.articleId,
    status: input.status,
  };
  for (const key of [
    "itemId",
    "batchId",
    "publicationId",
    "attemptId",
    "targetKey",
    "queueGroupId",
    "position",
    "idempotent",
    "reasonCode",
    "reasonCodes",
  ])
    include(output, input, key);
  return output;
}
function projectRegularTarget(value) {
  const target = value && value.kind === "platform" ? value : value || {};
  return {
    platformId: target.platformId,
    accountProfileId: target.accountProfileId,
  };
}
function projectRegularAdmission(value, kind) {
  const input = value || {};
  const output = {
    target: projectRegularTarget(input.target),
    articleRefs: (input.articleRefs || []).map(projectArticleRef),
    items: (input.items || []).map(projectRegularQueueItem),
    idempotentCount: input.idempotentCount,
    missingCount: input.missingCount,
    conflictCount: input.conflictCount,
  };
  if (kind === "preview") {
    output.totalCount = input.totalCount;
    output.queueableCount = input.queueableCount;
  } else {
    output.batchId = input.batchId;
    output.admittedCount = input.admittedCount;
  }
  return output;
}

function projectRegularRemovalResult(value) {
  return {
    items: (value.items || []).map(projectRegularQueueItem),
    removedCount: value.removedCount,
    idempotentCount: value.idempotentCount,
    conflictCount: value.conflictCount,
  };
}

const submissionRegularContractFixtures = Object.freeze([
  {
    channel: "content:preview-regular-queue-admission",
    owner: "content",
    productionCaller: "desktopConsole.content.previewRegularQueueAdmission",
    request: {
      articleRefs: [{ clientId: "client-1", articleId: "article-1" }],
      platformId: "toutiao",
      accountProfileId: "profile-1",
    },
    result: {
      target: { platformId: "toutiao", accountProfileId: "profile-1" },
      articleRefs: [{ clientId: "client-1", articleId: "article-1" }],
      items: [
        {
          articleRef: { clientId: "client-1", articleId: "article-1" },
          articleId: "article-1",
          status: "queueable",
        },
      ],
      totalCount: 1,
      queueableCount: 1,
      idempotentCount: 0,
      missingCount: 0,
      conflictCount: 0,
    },
  },
  {
    channel: "content:admit-regular-queue-items",
    owner: "content",
    productionCaller: "desktopConsole.content.admitRegularQueueItems",
    request: {
      articleRefs: [{ clientId: "client-1", articleId: "article-1" }],
      platformId: "toutiao",
      accountProfileId: "profile-1",
      confirmed: true,
    },
    result: {
      batchId: "regular-batch-1",
      target: { platformId: "toutiao", accountProfileId: "profile-1" },
      articleRefs: [{ clientId: "client-1", articleId: "article-1" }],
      items: [
        {
          articleRef: { clientId: "client-1", articleId: "article-1" },
          articleId: "article-1",
          itemId: "regular-item-1",
          batchId: "regular-batch-1",
          status: "queued",
        },
      ],
      admittedCount: 1,
      idempotentCount: 0,
      missingCount: 0,
      conflictCount: 0,
    },
  },
  {
    channel: "content:remove-pending-queue-items",
    owner: "content",
    productionCaller: "desktopConsole.content.removePendingQueueItems",
    request: {
      items: [
        {
          articleRef: { clientId: "client-1", articleId: "article-1" },
          itemId: "regular-item-1",
          batchId: "regular-batch-1",
        },
      ],
      confirmed: true,
    },
    result: {
      items: [
        {
          articleRef: { clientId: "client-1", articleId: "article-1" },
          articleId: "article-1",
          itemId: "regular-item-1",
          batchId: "regular-batch-1",
          status: "cancelled",
          idempotent: false,
        },
      ],
      removedCount: 1,
      idempotentCount: 0,
      conflictCount: 0,
    },
  },
]);

module.exports = {
  submissionRegularContracts,
  submissionRegularContractFixtures,
  projectRegularAdmission,
  projectRegularRemovalResult,
};
