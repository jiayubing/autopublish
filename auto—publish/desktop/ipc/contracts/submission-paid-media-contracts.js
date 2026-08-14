const {
  arrayField,
  enumField,
  exactObject,
  integerField,
  literalField,
  nullableField,
  numberField,
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
  safeText,
  submissionContract,
} = require("./submission-contract-shared");

const paidArticleSummary = exactObject({
  articleRef,
  articleId: id,
  title: safeText(1000),
  contentFingerprint: optionalField(nullableField(id)),
  status: enumField(["ready", "blocked"]),
  reasonCodes: arrayField(code, { max: 32 }),
  riskCodes: arrayField(code, { max: 8 }),
});
const paidRiskWarning = exactObject({
  code,
  message: safeText(500, 1),
  count,
});
const paidPreflightResult = exactObject({
  version: integerField({ min: 1, max: 10 }),
  status: enumField(["ready", "blocked"]),
  canConfirm: "boolean",
  confirmationToken: id,
  confirmationFingerprint: id,
  articleRefs: arrayField(articleRef, { min: 1, max: 1000 }),
  articleCount: count,
  articles: arrayField(paidArticleSummary, { max: 1000 }),
  mediaResourceId: id,
  mediaName: safeText(500),
  mediaRemarks: safeText(10000),
  resourceFingerprint: id,
  resourceAvailable: "boolean",
  quotedPrice: nullableField(numberField({ min: 0, max: 100000000 })),
  estimatedTotal: nullableField(numberField({ min: 0, max: 1000000000 })),
  systemSubmissionCode: safeText(128),
  blockers: arrayField(code, { max: 64 }),
  risks: arrayField(paidRiskWarning, { max: 8 }),
  createdAt: safeText(64, 1),
  expiresAt: safeText(64, 1),
});
const paidAdmissionItem = exactObject({
  articleRef,
  articleId: id,
  itemId: id,
  batchId: id,
  publicationId: id,
  attemptId: id,
  targetKey: safeText(256, 1),
  status: safeText(64, 1),
  idempotent: "boolean",
});
const paidAdmissionResult = exactObject({
  batchId: id,
  targetKey: safeText(256, 1),
  mediaResourceId: id,
  status: safeText(64, 1),
  articleCount: count,
  idempotent: "boolean",
  items: arrayField(paidAdmissionItem, { min: 1, max: 1000 }),
  articleRefs: arrayField(articleRef, { min: 1, max: 1000 }),
  confirmationFingerprint: id,
  quotedPrice: numberField({ min: 0, max: 100000000 }),
  estimatedTotal: numberField({ min: 0, max: 1000000000 }),
});
const paidExecutionItem = exactObject({
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
  paused: "boolean",
  runState: enumField(["paused", "running", "in_flight"]),
  actions: exactObject({
    canStart: "boolean",
    canPause: "boolean",
    canCancelRemaining: optionalField("boolean"),
  }),
  articleCount: count,
  mediaName: optionalField(safeText(500)),
  mediaRemarks: optionalField(safeText(10000)),
  createdOrderCount: optionalField(count),
  remainingCount: optionalField(count),
  currentItem: optionalField(nullableField(paidExecutionItem)),
  pauseReason: optionalField(nullableField(safeText(128, 1))),
  quotedPrice: numberField({ min: 0, max: 100000000 }),
  estimatedTotal: numberField({ min: 0, max: 1000000000 }),
  createdAt: safeText(64, 1),
  updatedAt: safeText(64, 1),
  items: arrayField(paidExecutionItem, { max: 1000 }),
});
const paidExecutionResult = exactObject({
  executionStatus: optionalField(safeText(64, 1)),
  cancelledCount: optionalField(count),
  idempotentCount: optionalField(count),
  skippedCount: optionalField(count),
  batch: paidExecutionBatch,
});

const submissionPaidMediaContracts = Object.freeze([
  submissionContract({
    capability: "content.previewPaidMediaPreflight",
    channel: "content:preview-paid-media-preflight",
    kind: "query",
    request: exactObject({
      articleRefs: arrayField(articleRef, { min: 1, max: 1000 }),
      mediaResourceId: id,
    }),
    success: paidPreflightResult,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  submissionContract({
    capability: "content.confirmPaidMediaBatch",
    channel: "content:confirm-paid-media-batch",
    kind: "command",
    request: exactObject({
      confirmationToken: id,
      confirmed: literalField(true),
    }),
    success: paidAdmissionResult,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  submissionContract({
    capability: "content.listPaidMediaBatches",
    channel: "content:list-paid-media-batches",
    kind: "query",
    request: emptyRequest,
    success: exactObject({
      items: arrayField(paidExecutionBatch, { max: 20000 }),
    }),
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  submissionContract({
    capability: "content.startPaidMediaBatch",
    channel: "content:start-paid-media-batch",
    kind: "command",
    request: exactObject({ batchId: id }),
    success: paidExecutionResult,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  submissionContract({
    capability: "content.pausePaidMediaBatch",
    channel: "content:pause-paid-media-batch",
    kind: "command",
    request: exactObject({ batchId: id }),
    success: paidExecutionResult,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  submissionContract({
    capability: "content.cancelRemainingPaidMediaBatchItems",
    channel: "content:cancel-remaining-paid-media-batch-items",
    kind: "command",
    request: exactObject({ batchId: id }),
    success: paidExecutionResult,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
]);

function projectPaidExecutionItem(value) {
  const input = value || {};
  const article = input.articleIdentityV1 || input.articleRef || {};
  const result = {
    itemId: input.itemId,
    articleRef: {
      clientId: article.clientId,
      articleId: article.articleId,
    },
    status: input.status,
    phase: input.phase,
  };
  if (typeof input.title === "string") result.title = input.title;
  return result;
}

function projectPaidExecutionBatch(value) {
  const input = value || {};
  const result = {
    batchId: input.batchId,
    mediaResourceId: input.mediaResourceId,
    status: input.status,
    pauseIntent: input.pauseIntent,
    paused: input.paused === true,
    runState: input.runState,
    actions: {
      canStart: input.actions?.canStart === true,
      canPause: input.actions?.canPause === true,
      ...(input.actions && "canCancelRemaining" in input.actions
        ? { canCancelRemaining: input.actions.canCancelRemaining === true }
        : {}),
    },
    articleCount: input.articleCount,
    quotedPrice: input.quotedPrice,
    estimatedTotal: input.estimatedTotal,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    items: (input.items || []).map(projectPaidExecutionItem),
  };
  if (typeof input.mediaName === "string") result.mediaName = input.mediaName;
  if (typeof input.mediaRemarks === "string")
    result.mediaRemarks = input.mediaRemarks;
  if (Number.isInteger(input.createdOrderCount))
    result.createdOrderCount = input.createdOrderCount;
  if (Number.isInteger(input.remainingCount))
    result.remainingCount = input.remainingCount;
  if (input.currentItem !== undefined)
    result.currentItem = input.currentItem
      ? projectPaidExecutionItem(input.currentItem)
      : null;
  if (input.pauseReason !== undefined) result.pauseReason = input.pauseReason;
  return result;
}

function projectPaidArticleSummary(value) {
  const input = value || {};
  return {
    articleRef: projectArticleRef(input.articleRef || input),
    articleId: input.articleId,
    title: input.title || "",
    contentFingerprint:
      input.contentFingerprint === undefined ? null : input.contentFingerprint,
    status: input.status,
    reasonCodes: Array.isArray(input.reasonCodes) ? input.reasonCodes : [],
    riskCodes: Array.isArray(input.riskCodes) ? input.riskCodes : [],
  };
}
function projectPaidPreflight(value) {
  const input = value || {};
  return {
    version: input.version,
    status: input.status,
    canConfirm: input.canConfirm === true,
    confirmationToken: input.confirmationToken,
    confirmationFingerprint: input.confirmationFingerprint,
    articleRefs: (input.articleRefs || []).map(projectArticleRef),
    articleCount: input.articleCount,
    articles: (input.articles || []).map(projectPaidArticleSummary),
    mediaResourceId: input.mediaResourceId,
    mediaName: input.mediaName || "",
    mediaRemarks: input.mediaRemarks || "",
    resourceFingerprint: input.resourceFingerprint,
    resourceAvailable: input.resourceAvailable === true,
    quotedPrice: input.quotedPrice,
    estimatedTotal: input.estimatedTotal,
    systemSubmissionCode: input.systemSubmissionCode || "",
    blockers: input.blockers || [],
    risks: (input.risks || []).map((risk) => ({
      code: risk.code,
      message: risk.message,
      count: risk.count,
    })),
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
  };
}
function projectPaidAdmission(value) {
  const input = value || {};
  return {
    batchId: input.batchId,
    targetKey: input.targetKey,
    mediaResourceId: input.mediaResourceId,
    status: input.status,
    articleCount: input.articleCount,
    idempotent: input.idempotent === true,
    items: (input.items || []).map((item) => ({
      articleRef: projectArticleRef(item.articleRef || item),
      articleId: item.articleId,
      itemId: item.itemId,
      batchId: item.batchId || input.batchId,
      publicationId: item.publicationId,
      attemptId: item.attemptId,
      targetKey: item.targetKey || input.targetKey,
      status: item.status,
      idempotent: item.idempotent === true,
    })),
    articleRefs: (input.articleRefs || []).map(projectArticleRef),
    confirmationFingerprint: input.confirmationFingerprint,
    quotedPrice: input.quotedPrice,
    estimatedTotal: input.estimatedTotal,
  };
}

function projectPaidMediaBatchList(value) {
  return { items: (value.items || []).map(projectPaidExecutionBatch) };
}

function projectPaidExecutionResult(value) {
  const result = { batch: projectPaidExecutionBatch(value.batch) };
  if (value.executionStatus !== undefined)
    result.executionStatus = value.executionStatus;
  for (const name of ["cancelledCount", "idempotentCount", "skippedCount"])
    if (Number.isInteger(value[name])) result[name] = value[name];
  return result;
}

const paidExecutionBatchFixture = {
  batchId: "paid-batch-1",
  mediaResourceId: "media-1",
  status: "queued",
  pauseIntent: "manual",
  paused: true,
  runState: "paused",
  actions: { canStart: true, canPause: false },
  articleCount: 1,
  quotedPrice: 12.5,
  estimatedTotal: 12.5,
  createdAt: "2026-08-07T00:00:00.000Z",
  updatedAt: "2026-08-07T00:00:00.000Z",
  items: [
    {
      itemId: "paid-item-1",
      articleRef: { clientId: "client-1", articleId: "article-1" },
      status: "queued",
      phase: "paid-admitted",
    },
  ],
};

const submissionPaidMediaContractFixtures = Object.freeze([
  {
    channel: "content:preview-paid-media-preflight",
    owner: "content",
    productionCaller: "desktopConsole.content.previewPaidMediaPreflight",
    request: {
      articleRefs: [{ clientId: "client-1", articleId: "article-1" }],
      mediaResourceId: "media-1",
    },
    result: {
      version: 1,
      status: "ready",
      canConfirm: true,
      confirmationToken: "token-1",
      confirmationFingerprint: "fingerprint-1",
      articleRefs: [{ clientId: "client-1", articleId: "article-1" }],
      articleCount: 1,
      articles: [
        {
          articleRef: { clientId: "client-1", articleId: "article-1" },
          articleId: "article-1",
          title: "标题",
          contentFingerprint: "content-fingerprint-1",
          status: "ready",
          reasonCodes: [],
          riskCodes: [],
        },
      ],
      mediaResourceId: "media-1",
      mediaName: "媒体一",
      mediaRemarks: "备注",
      resourceFingerprint: "resource-fingerprint-1",
      resourceAvailable: true,
      quotedPrice: 12.5,
      estimatedTotal: 12.5,
      systemSubmissionCode: "system-id",
      blockers: [],
      risks: [],
      createdAt: "2026-08-07T00:00:00.000Z",
      expiresAt: "2026-08-07T00:05:00.000Z",
    },
  },
  {
    channel: "content:confirm-paid-media-batch",
    owner: "content",
    productionCaller: "desktopConsole.content.confirmPaidMediaBatch",
    request: { confirmationToken: "token-1", confirmed: true },
    result: {
      batchId: "paid-batch-1",
      targetKey: "media-resource:media-1",
      mediaResourceId: "media-1",
      status: "queued",
      articleCount: 1,
      idempotent: false,
      items: [
        {
          articleRef: { clientId: "client-1", articleId: "article-1" },
          articleId: "article-1",
          itemId: "paid-item-1",
          batchId: "paid-batch-1",
          publicationId: "paid-publication-1",
          attemptId: "paid-attempt-1",
          targetKey: "media-resource:media-1",
          status: "queued",
          idempotent: false,
        },
      ],
      articleRefs: [{ clientId: "client-1", articleId: "article-1" }],
      confirmationFingerprint: "fingerprint-1",
      quotedPrice: 12.5,
      estimatedTotal: 12.5,
    },
  },
  {
    channel: "content:list-paid-media-batches",
    owner: "content",
    productionCaller: "desktopConsole.content.listPaidMediaBatches",
    request: {},
    result: { items: [paidExecutionBatchFixture] },
  },
  {
    channel: "content:start-paid-media-batch",
    owner: "content",
    productionCaller: "desktopConsole.content.startPaidMediaBatch",
    request: { batchId: "paid-batch-1" },
    result: { executionStatus: "paid_processing", batch: paidExecutionBatchFixture },
  },
  {
    channel: "content:pause-paid-media-batch",
    owner: "content",
    productionCaller: "desktopConsole.content.pausePaidMediaBatch",
    request: { batchId: "paid-batch-1" },
    result: { batch: paidExecutionBatchFixture },
  },
  {
    channel: "content:cancel-remaining-paid-media-batch-items",
    owner: "content",
    productionCaller:
      "desktopConsole.content.cancelRemainingPaidMediaBatchItems",
    request: { batchId: "paid-batch-1" },
    result: {
      executionStatus: "remaining_cancelled",
      cancelledCount: 1,
      idempotentCount: 0,
      skippedCount: 0,
      batch: paidExecutionBatchFixture,
    },
  },
]);

module.exports = {
  submissionPaidMediaContracts,
  submissionPaidMediaContractFixtures,
  projectPaidPreflight,
  projectPaidAdmission,
  projectPaidMediaBatchList,
  projectPaidExecutionResult,
};
