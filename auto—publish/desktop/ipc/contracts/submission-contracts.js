const {
  arrayField,
  defineContract,
  enumField,
  exactObject,
  integerField,
  literalField,
  multilineStringField,
  numberField,
  nullableField,
  optionalField,
  stringField,
} = require("./registry");

const id = stringField({ min: 1, max: 200, pattern: /^[A-Za-z0-9_.:-]+$/u });
const clientIdentity = stringField({
  max: 200,
  pattern: /^(?!\.{1,2}$)(?!.*[\\/])(?=\S)[^\x00-\x1f\x7f]*\S$/u,
});
const safeText = (max, min = 0) =>
  stringField({ min, max, pattern: /^[^\x00-\x1f\x7f\\/]*$/u });
const contentText = (max, min = 0) => multilineStringField({ min, max });
const code = stringField({ min: 1, max: 128, pattern: /^[A-Z][A-Z0-9_]*$/u });
const count = integerField({ min: 0, max: 100000 });
const revision = integerField({ min: 0, max: Number.MAX_SAFE_INTEGER });
const emptyRequest = exactObject({});
const noArgs = () => ({});
const noLegacyInput = () => [undefined];
const directArgs = (args) => args[0] || {};
const directInput = (payload) => [payload];

const platform = exactObject({
  id,
  displayName: safeText(200, 1),
  contentQueueImport: "boolean",
});
const batchItem = exactObject({
  itemId: optionalField(id),
  articleId: id,
  targetPlatformId: id,
  accountProfileId: optionalField(id),
  filename: optionalField(safeText(255, 1)),
  contentHash: optionalField(id),
  status: safeText(64, 1),
  revision: optionalField(revision),
  publicationId: optionalField(nullableField(id)),
  attemptId: optionalField(nullableField(id)),
  reasonCode: optionalField(nullableField(code)),
  reasonCodes: optionalField(arrayField(code, { max: 100 })),
  reasons: optionalField(arrayField(safeText(500, 1), { max: 100 })),
  cleanable: optionalField("boolean"),
  allowed: optionalField("boolean"),
  fingerprint: optionalField(id),
  repairAction: optionalField(
    nullableField(
      enumField([
        "cancel",
        "cleanup",
        "cleanupPublishedLocal",
        "cleanupCancelledLocal",
      ]),
    ),
  ),
  evaluationFingerprint: optionalField(nullableField(id)),
  action: optionalField(
    enumField([
      "cancel",
      "cleanup",
      "cleanupPublishedLocal",
      "cleanupCancelledLocal",
    ]),
  ),
  resultStatus: optionalField(safeText(64, 1)),
});
const batch = exactObject({
  id,
  batchId: optionalField(id),
  clientId: nullableField(clientIdentity),
  status: safeText(64, 1),
  revision: optionalField(revision),
  createdAt: optionalField(safeText(64, 1)),
  updatedAt: optionalField(safeText(64, 1)),
  items: arrayField(batchItem, { max: 10000 }),
});
const changedScopes = arrayField(safeText(64, 1), { max: 32 });
const cancelPreview = exactObject({
  batchId: id,
  planId: id,
  allowedCount: count,
  blockedCount: count,
  items: arrayField(batchItem, { max: 10000 }),
});
const cancelResult = exactObject({
  batchId: id,
  planId: id,
  cancelledCount: count,
  idempotentCount: count,
  skippedCount: count,
  batchStatus: safeText(64, 1),
  changedScopes,
  blockedItems: optionalField(arrayField(batchItem, { max: 10000 })),
  items: arrayField(batchItem, { max: 10000 }),
});
const retryPreview = exactObject({
  publicationId: nullableField(id),
  requiresConfirmation: "boolean",
  eligible: optionalField("boolean"),
  reasonCode: optionalField(nullableField(code)),
  clientId: optionalField(clientIdentity),
  articleId: optionalField(id),
  targetPlatformId: optionalField(id),
  titleSnapshot: optionalField(safeText(500, 1)),
  failureCount: optionalField(count),
  message: optionalField(safeText(1000, 1)),
  queueableTaskCount: optionalField(count),
  idempotentCount: optionalField(count),
  conflictCount: optionalField(count),
});
const retryResult = exactObject({
  batchId: id,
  publicationId: id,
  attemptId: nullableField(id),
  clientId: clientIdentity,
  articleId: id,
  targetPlatformId: id,
  changedScopes,
});
const residueItem = exactObject({
  itemId: optionalField(id),
  articleId: optionalField(id),
  publicationId: optionalField(id),
  targetPlatformId: optionalField(id),
  status: safeText(64, 1),
  reasonCode: nullableField(code),
  repairAction: optionalField(
    nullableField(
      enumField([
        "cancel",
        "cleanup",
        "cleanupPublishedLocal",
        "cleanupCancelledLocal",
      ]),
    ),
  ),
  evaluationFingerprint: optionalField(nullableField(id)),
  action: optionalField(
    enumField([
      "cancel",
      "cleanup",
      "cleanupPublishedLocal",
      "cleanupCancelledLocal",
    ]),
  ),
  resultStatus: optionalField(safeText(64, 1)),
});
const residuePreview = exactObject({
  items: arrayField(residueItem, { max: 10000 }),
  cleanableItems: arrayField(residueItem, { max: 10000 }),
  reportedItems: arrayField(residueItem, { max: 10000 }),
  cleanableCount: count,
  reportedCount: count,
});
const residueResult = exactObject({
  status: enumField(["failed", "completed", "no-op"]),
  cleanedCount: count,
  failedCount: count,
  remainingCount: count,
  cleanableCount: count,
  reportedCount: count,
  items: arrayField(residueItem, { max: 10000 }),
  remainingItems: arrayField(residueItem, { max: 10000 }),
});
const articleRef = exactObject({ clientId: clientIdentity, articleId: id });
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
});
const paidExecutionBatch = exactObject({
  batchId: id,
  mediaResourceId: id,
  status: enumField(["queued", "needs_attention", "completed"]),
  pauseIntent: enumField(["none", "manual", "system"]),
  paused: "boolean",
  runState: enumField(["paused", "running", "in_flight"]),
  articleCount: count,
  quotedPrice: numberField({ min: 0, max: 100000000 }),
  estimatedTotal: numberField({ min: 0, max: 1000000000 }),
  createdAt: safeText(64, 1),
  updatedAt: safeText(64, 1),
  items: arrayField(paidExecutionItem, { max: 1000 }),
});
const paidExecutionResult = exactObject({
  executionStatus: optionalField(safeText(64, 1)),
  batch: paidExecutionBatch,
});

const COMMON_ERRORS = Object.freeze({
  AUTH_REQUIRED: {
    category: "authentication",
    retryability: "never",
    userMessage: "请先完成登录后再继续。",
  },
  IPC_REQUEST_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "投稿请求无效，请刷新后重试。",
  },
  IPC_RESULT_INVALID: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "投稿结果未通过安全校验，请刷新后重试。",
  },
  IPC_INTERNAL: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "投稿操作未能安全完成，请检查诊断信息。",
  },
  CONTENT_EXPORT_CONFIRMATION_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请确认导出后继续。",
  },
  CONTENT_EXPORT_TARGET_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "投稿目标无效。",
  },
  CONTENT_EXPORT_NOT_READY: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "文章尚未满足投稿条件。",
  },
  CONTENT_EXPORT_CONFLICT: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "投稿队列中存在冲突。",
  },
  CONTENT_SUBMISSION_BATCH_INPUT_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "投稿批次请求无效。",
  },
  CONTENT_SUBMISSION_INPUT_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "投稿操作请求无效。",
  },
  CONTENT_SUBMISSION_CONFIRMATION_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请确认投稿操作后继续。",
  },
  ACCOUNT_PROFILE_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请为每个投稿平台选择账号。",
  },
  CONTENT_SUBMISSION_ARTICLE_NOT_FOUND: {
    category: "validation",
    retryability: "never",
    userMessage: "所选文章不存在。",
  },
  SUBMISSION_ACTION_PLAN_INVALID: {
    category: "conflict",
    retryability: "safe",
    userMessage: "操作预检已失效，请重新预检。",
  },
  SUBMISSION_ACTION_STALE: {
    category: "conflict",
    retryability: "safe",
    userMessage: "投稿状态已变化，请重新预检。",
  },
  PUBLICATION_RETRY_REQUIRES_WORKFLOW: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "请从失败投稿工作流发起重试。",
  },
  ARTICLE_ATTENTION_STALE: {
    category: "conflict",
    retryability: "safe",
    userMessage: "投稿状态已变化，请重新预检。",
  },
  REGULAR_QUEUE_INPUT_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "普通平台队列请求无效。",
  },
  REGULAR_QUEUE_CONFIRMATION_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请确认加入或移除普通平台队列。",
  },
  REGULAR_QUEUE_SINGLE_TARGET_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "一次只能选择一个普通平台和账号。",
  },
  REGULAR_QUEUE_PLATFORM_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请选择普通平台，不支持网站媒体目标。",
  },
  REGULAR_QUEUE_PLATFORM_UNSUPPORTED: {
    category: "validation",
    retryability: "never",
    userMessage: "该平台当前不支持普通队列。",
  },
  REGULAR_QUEUE_TARGET_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "普通平台目标无效。",
  },
  REGULAR_QUEUE_CONFIG_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "普通平台队列配置无效。",
  },
  REGULAR_QUEUE_ARTICLES_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请选择至少一篇文章。",
  },
  REGULAR_QUEUE_ARTICLE_IDENTITY_INVALID: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "文章身份无法安全解析。",
  },
  REGULAR_QUEUE_ITEMS_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请选择至少一个待执行队列项。",
  },
  REGULAR_QUEUE_ITEM_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "普通平台队列项无效。",
  },
  REGULAR_QUEUE_ITEM_NOT_FOUND: {
    category: "conflict",
    retryability: "safe",
    userMessage: "队列项已不存在，请刷新后重试。",
  },
  REGULAR_QUEUE_ITEM_NOT_REMOVABLE: {
    category: "conflict",
    retryability: "never",
    userMessage: "该队列项已经开始或结果需要核对，不能本地移除。",
  },
  REGULAR_QUEUE_FACT_CONFLICT: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "普通平台队列事实不一致，需要刷新或人工核对。",
  },
  REGULAR_QUEUE_TRANSITION_UNAVAILABLE: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "普通平台队列事务当前不可用。",
  },
  REGULAR_QUEUE_SNAPSHOT_INVALID: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "投稿快照未通过安全校验。",
  },
  REGULAR_QUEUE_ADMISSION_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "普通平台入队事实无效。",
  },
  REGULAR_QUEUE_BATCH_CONFLICT: {
    category: "conflict",
    retryability: "safe",
    userMessage: "普通平台入队批次已变化，请刷新后重试。",
  },
  REGULAR_QUEUE_ITEM_CONFLICT: {
    category: "conflict",
    retryability: "safe",
    userMessage: "普通平台队列项发生冲突，请刷新后重试。",
  },
  ACCOUNT_PROFILE_NOT_FOUND: {
    category: "validation",
    retryability: "never",
    userMessage: "平台账号档案不存在。",
  },
  ACCOUNT_PROFILE_PLATFORM_MISMATCH: {
    category: "validation",
    retryability: "never",
    userMessage: "平台账号档案与普通平台不匹配。",
  },
  ARTICLE_ACTIVE_TARGET_CONFLICT: {
    category: "conflict",
    retryability: "safe",
    userMessage: "文章已有活动投稿目标，请刷新后重试。",
  },
  ARTICLE_OPERATION_FROZEN: {
    category: "conflict",
    retryability: "safe",
    userMessage: "文章当前处于冻结阶段。",
  },
  ARTICLE_CONTENT_INCOMPLETE: {
    category: "validation",
    retryability: "never",
    userMessage: "文章标题和正文必须完整。",
  },
  ARTICLE_NOT_FOUND: {
    category: "validation",
    retryability: "never",
    userMessage: "所选文章不存在。",
  },
  PUBLICATION_UNCERTAIN: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "投稿结果不确定，需要人工核对。",
  },
  PUBLICATION_CANCELLED: {
    category: "conflict",
    retryability: "never",
    userMessage: "该投稿事实已终止，不能继续写入远端结果。",
  },
  REGULAR_QUEUE_SINGLE_CLIENT_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "一次普通平台入队只能包含同一客户的文章。",
  },
  PAID_MEDIA_ARTICLES_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请至少选择一篇文章进行付费预检。",
  },
  PAID_MEDIA_ARTICLE_IDENTITY_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "付费投稿文章身份无效。",
  },
  PAID_MEDIA_ARTICLE_NOT_FOUND: {
    category: "validation",
    retryability: "never",
    userMessage: "所选付费文章不存在。",
  },
  PAID_MEDIA_RESOURCE_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请选择一个媒体资源。",
  },
  PAID_MEDIA_RESOURCE_QUERY_FAILED: {
    category: "transport",
    retryability: "safe",
    userMessage: "媒体资源状态读取失败，请重新预检。",
  },
  PAID_MEDIA_RESOURCE_RECHECK_FAILED: {
    category: "transport",
    retryability: "safe",
    userMessage: "媒体资源复核失败，请重新预检。",
  },
  PAID_MEDIA_RESOURCE_UNAVAILABLE: {
    category: "conflict",
    retryability: "safe",
    userMessage: "媒体资源当前不可接单，请重新选择资源。",
  },
  PAID_MEDIA_RESOURCE_PRICE_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "媒体资源报价无效，无法确认费用。",
  },
  PAID_MEDIA_ARTICLE_CONTENT_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "文章标题和正文必须完整。",
  },
  PAID_MEDIA_TITLE_TOO_LONG: {
    category: "validation",
    retryability: "never",
    userMessage: "网站媒体标题不能超过 30 个字符。",
  },
  PAID_MEDIA_SYSTEM_SUBMISSION_CODE_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请先配置系统投稿标识码。",
  },
  PAID_MEDIA_SYSTEM_SUBMISSION_CODE_CHANGED: {
    category: "conflict",
    retryability: "safe",
    userMessage: "系统投稿标识码已变化，请重新预检。",
  },
  PAID_MEDIA_CONFIRMATION_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请先完成付费费用预检。",
  },
  PAID_MEDIA_CONFIRMATION_BLOCKED: {
    category: "validation",
    retryability: "never",
    userMessage: "当前内容或媒体资源不满足付费确认条件。",
  },
  PAID_MEDIA_CONFIRMATION_STALE: {
    category: "conflict",
    retryability: "safe",
    userMessage: "付费确认已过期，请重新预检。",
  },
  PAID_MEDIA_CUSTOMER_SNAPSHOT_INVALID: {
    category: "conflict",
    retryability: "never",
    userMessage: "客户身份快照不可用，未创建付费批次。",
  },
  PAID_MEDIA_CUSTOMER_SNAPSHOT_RESOLVER_REQUIRED: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "客户身份读取能力不可用，未创建付费批次。",
  },
  PAID_ADMISSION_CUSTOMER_SNAPSHOT_INVALID: {
    category: "conflict",
    retryability: "never",
    userMessage: "客户身份快照无效，未创建付费批次。",
  },
  PAID_ADMISSION_TRANSITION_UNAVAILABLE: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "付费批次事务当前不可用。",
  },
  PAID_ADMISSION_CONFIRMATION_FINGERPRINT_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "付费确认指纹缺失，请重新预检。",
  },
  PAID_ADMISSION_CONFIRMATION_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "付费确认快照无效，请重新预检。",
  },
  PAID_ADMISSION_TARGET_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "付费媒体资源目标无效。",
  },
  PAID_ADMISSION_MEDIA_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "付费批次必须绑定一个媒体资源。",
  },
  PAID_ADMISSION_ARTICLES_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "付费批次至少需要一篇文章。",
  },
  PAID_ADMISSION_ARTICLE_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "付费批次文章身份无效。",
  },
  PAID_ADMISSION_ITEM_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "付费批次项无效，请重新预检。",
  },
  PAID_ADMISSION_SNAPSHOT_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "付费文章快照无效，请重新预检。",
  },
  PAID_ADMISSION_ARTICLE_DUPLICATE: {
    category: "validation",
    retryability: "never",
    userMessage: "同一付费批次不能重复选择文章。",
  },
  PAID_ADMISSION_ARTICLE_COUNT_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "付费批次文章数量已变化，请重新预检。",
  },
  PAID_ADMISSION_PRICE_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "付费确认金额无效，请重新预检。",
  },
  PAID_ADMISSION_BATCH_CONFLICT: {
    category: "conflict",
    retryability: "safe",
    userMessage: "付费批次已发生变化，请刷新后重新预检。",
  },
  PAID_ADMISSION_TRANSACTION_FAILED: {
    category: "storage",
    retryability: "safe",
    userMessage: "付费批次事务已回滚，请重试确认。",
  },
  PAID_ADMISSION_FAILED: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "付费批次未能安全建立，请检查诊断信息。",
  },
  PAID_EXECUTION_BATCH_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "付费批次身份无效。",
  },
  PAID_EXECUTION_BATCH_NOT_FOUND: {
    category: "conflict",
    retryability: "safe",
    userMessage: "付费批次已不存在，请刷新后重试。",
  },
  PAID_EXECUTION_MANUAL_RESOLUTION_REQUIRED: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "该付费批次需要先完成人工核对，不能继续创建订单。",
  },
  PAID_MEDIA_EXECUTION_UNAVAILABLE: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "付费批次执行当前不可用。",
  },
  OPERATIONAL_SYSTEM_SUBMISSION_CODE_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请先配置系统投稿标识码。",
  },
  PUBLICATION_DUPLICATE: {
    category: "conflict",
    retryability: "safe",
    userMessage: "文章已有该媒体资源的发布记录。",
  },
  PUBLICATION_TARGET_CONFLICT: {
    category: "conflict",
    retryability: "safe",
    userMessage: "文章已有其他活动投稿目标。",
  },
  ARTICLE_MUTATION_BUSY: {
    category: "conflict",
    retryability: "safe",
    userMessage: "文章正在被其他操作修改，请稍后重试。",
  },
  ARTICLE_MUTATION_RESULT_UNCERTAIN: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "付费文章状态需要人工核对。",
  },
  PAID_MEDIA_PREFLIGHT_UNAVAILABLE: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "付费媒体预检当前不可用。",
  },
});
const errorCodes = Object.freeze(Object.keys(COMMON_ERRORS));
function contract(input) {
  return defineContract({
    feature: "content",
    ...input,
    errorCodes,
    errors: COMMON_ERRORS,
  });
}

const listBatchesRequest = exactObject({
  clientId: optionalField(clientIdentity),
});

const submissionContracts = Object.freeze([
  contract({
    capability: "content.listSubmissionPlatforms",
    channel: "content:list-submission-platforms",
    kind: "query",
    request: emptyRequest,
    success: exactObject({ platforms: arrayField(platform, { max: 32 }) }),
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  contract({
    capability: "content.cancelSubmissionBatch",
    channel: "content:cancel-submission-batch",
    kind: "command",
    request: exactObject({
      batchId: id,
      planId: id,
      confirmed: literalField(true),
    }),
    success: cancelResult,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  contract({
    capability: "content.previewTrashedArticleQueueResidue",
    channel: "content:preview-trashed-article-queue-residue",
    kind: "query",
    request: emptyRequest,
    success: residuePreview,
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  contract({
    capability: "content.cleanupTrashedArticleQueueResidue",
    channel: "content:cleanup-trashed-article-queue-residue",
    kind: "command",
    request: exactObject({ confirmed: literalField(true) }),
    success: residueResult,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  contract({
    capability: "content.previewRegularQueueAdmission",
    channel: "content:preview-regular-queue-admission",
    kind: "query",
    request: exactObject(regularAdmissionFields),
    success: regularAdmissionPreview,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  contract({
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
  contract({
    capability: "content.removePendingQueueItems",
    channel: "content:remove-pending-queue-items",
    kind: "command",
    request: regularRemovalRequest,
    success: regularRemovalResult,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  contract({
    capability: "content.listRegularQueueGroups",
    channel: "content:list-regular-queue-groups",
    kind: "query",
    request: emptyRequest,
    success: regularQueueGroupList,
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  contract({
    capability: "content.startRegularQueueGroup",
    channel: "content:start-regular-queue-group",
    kind: "command",
    request: exactObject({ queueGroupId: id }),
    success: regularQueueGroupList,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  contract({
    capability: "content.pauseRegularQueueGroup",
    channel: "content:pause-regular-queue-group",
    kind: "command",
    request: exactObject({ queueGroupId: id }),
    success: regularQueueGroupList,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  contract({
    capability: "content.startAllRegularQueueGroups",
    channel: "content:start-all-regular-queue-groups",
    kind: "command",
    request: emptyRequest,
    success: regularQueueGroupList,
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  contract({
    capability: "content.pauseAllRegularQueueGroups",
    channel: "content:pause-all-regular-queue-groups",
    kind: "command",
    request: emptyRequest,
    success: regularQueueGroupList,
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  contract({
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
  contract({
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
  contract({
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
  contract({
    capability: "content.startPaidMediaBatch",
    channel: "content:start-paid-media-batch",
    kind: "command",
    request: exactObject({ batchId: id }),
    success: paidExecutionResult,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  contract({
    capability: "content.pausePaidMediaBatch",
    channel: "content:pause-paid-media-batch",
    kind: "command",
    request: exactObject({ batchId: id }),
    success: paidExecutionResult,
    fromArgs: directArgs,
    toArgs: directInput,
  }),
]);

function include(output, input, key) {
  if (input[key] !== undefined) output[key] = input[key];
}
function projectBatchItem(value) {
  const input = value || {};
  const output = {};
  for (const key of ["articleId", "targetPlatformId", "status"])
    include(output, input, key);
  for (const key of [
    "itemId",
    "accountProfileId",
    "filename",
    "contentHash",
    "revision",
    "queueGroupId",
    "position",
    "publicationId",
    "attemptId",
    "reasonCode",
    "reasonCodes",
    "reasons",
    "cleanable",
    "allowed",
    "fingerprint",
    "repairAction",
    "evaluationFingerprint",
    "action",
    "resultStatus",
  ])
    include(output, input, key);
  return output;
}
function projectBatch(value) {
  const input = value || {};
  const output = {
    id: input.id || input.batchId,
    clientId: input.clientId == null ? null : input.clientId,
    status: input.status,
    items: Array.isArray(input.items) ? input.items.map(projectBatchItem) : [],
  };
  for (const key of ["batchId", "revision", "createdAt", "updatedAt"])
    include(output, input, key);
  return output;
}
function projectPaidExecutionBatch(value) {
  const input = value || {};
  return {
    batchId: input.batchId,
    mediaResourceId: input.mediaResourceId,
    status: input.status,
    pauseIntent: input.pauseIntent,
    paused: input.paused === true,
    runState: input.runState,
    articleCount: input.articleCount,
    quotedPrice: input.quotedPrice,
    estimatedTotal: input.estimatedTotal,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    items: (input.items || []).map((item) => ({
      itemId: item.itemId,
      articleRef: {
        clientId: item.articleIdentityV1 && item.articleIdentityV1.clientId,
        articleId: item.articleIdentityV1 && item.articleIdentityV1.articleId,
      },
      status: item.status,
      phase: item.phase,
    })),
  };
}
function projectArticleRef(value) {
  const input = value || {};
  return { clientId: input.clientId, articleId: input.articleId };
}
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
function projectResidueItem(value) {
  const input = value || {};
  const output = {
    status: input.status,
    reasonCode: input.reasonCode == null ? null : input.reasonCode,
  };
  for (const key of [
    "itemId",
    "articleId",
    "publicationId",
    "targetPlatformId",
    "repairAction",
    "evaluationFingerprint",
    "action",
    "resultStatus",
  ])
    include(output, input, key);
  return output;
}
function projectSubmissionResult(channel, value) {
  if (channel === "content:list-submission-platforms")
    return {
      platforms: (Array.isArray(value) ? value : []).map((item) => ({
        id: item.id,
        displayName: item.displayName,
        contentQueueImport: item.contentQueueImport === true,
      })),
    };
  if (channel === "content:cancel-submission-batch") {
    const result = {
      batchId: value.batchId,
      planId: value.planId,
      cancelledCount: value.cancelledCount,
    };
    for (const key of [
      "idempotentCount",
      "skippedCount",
      "batchStatus",
      "changedScopes",
    ])
      include(result, value, key);
    if (Array.isArray(value.items))
      result.items = value.items.map(projectBatchItem);
    if (Array.isArray(value.blockedItems))
      result.blockedItems = value.blockedItems.map(projectBatchItem);
    return result;
  }
  if (channel === "content:preview-trashed-article-queue-residue") {
    const result = {
      items: (value.items || []).map(projectResidueItem),
      cleanableCount: value.cleanableCount,
      reportedCount: value.reportedCount,
    };
    if (Array.isArray(value.cleanableItems))
      result.cleanableItems = value.cleanableItems.map(projectResidueItem);
    if (Array.isArray(value.reportedItems))
      result.reportedItems = value.reportedItems.map(projectResidueItem);
    return result;
  }
  if (channel === "content:cleanup-trashed-article-queue-residue") {
    const result = {
      status: value.status,
      cleanedCount: value.cleanedCount,
      failedCount: value.failedCount,
      remainingCount: value.remainingCount,
      items: (value.items || []).map(projectResidueItem),
    };
    for (const key of ["cleanableCount", "reportedCount"])
      include(result, value, key);
    if (Array.isArray(value.remainingItems))
      result.remainingItems = value.remainingItems.map(projectResidueItem);
    return result;
  }
  if (channel === "content:preview-regular-queue-admission")
    return projectRegularAdmission(value, "preview");
  if (channel === "content:admit-regular-queue-items")
    return projectRegularAdmission(value, "admit");
  if (channel === "content:remove-pending-queue-items")
    return {
      items: (value.items || []).map(projectRegularQueueItem),
      removedCount: value.removedCount,
      idempotentCount: value.idempotentCount,
      conflictCount: value.conflictCount,
    };
  if (channel === "content:preview-paid-media-preflight")
    return projectPaidPreflight(value);
  if (channel === "content:confirm-paid-media-batch")
    return projectPaidAdmission(value);
  if (channel === "content:list-paid-media-batches")
    return { items: (value.items || []).map(projectPaidExecutionBatch) };
  if (
    channel === "content:start-paid-media-batch" ||
    channel === "content:pause-paid-media-batch"
  ) {
    const result = { batch: projectPaidExecutionBatch(value.batch) };
    if (value.executionStatus !== undefined)
      result.executionStatus = value.executionStatus;
    return result;
  }
  return value;
}

const paidExecutionBatchFixture = {
  batchId: "paid-batch-1",
  mediaResourceId: "media-1",
  status: "queued",
  pauseIntent: "manual",
  paused: true,
  runState: "paused",
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
const submissionContractFixtures = Object.freeze([
  {
    channel: "content:list-submission-platforms",
    owner: "content",
    productionCaller: "desktopConsole.content.listSubmissionPlatforms",
    request: {},
    result: {
      platforms: [
        { id: "toutiao", displayName: "头条", contentQueueImport: true },
      ],
    },
  },
  {
    channel: "content:cancel-submission-batch",
    owner: "content",
    productionCaller: "desktopConsole.content.cancelSubmissionBatch",
    request: { batchId: "batch-1", planId: "plan-1", confirmed: true },
    result: {
      batchId: "batch-1",
      planId: "plan-1",
      cancelledCount: 1,
      idempotentCount: 0,
      skippedCount: 0,
      batchStatus: "cancelled",
      changedScopes: ["articleManagement"],
      items: [],
    },
  },
  {
    channel: "content:preview-trashed-article-queue-residue",
    owner: "content",
    productionCaller:
      "desktopConsole.content.previewTrashedArticleQueueResidue",
    request: {},
    result: {
      items: [
        {
          publicationId: "publication-1",
          targetPlatformId: "toutiao",
          status: "failed",
          reasonCode: "SOURCE_ARTICLE_TRASHED",
          repairAction: "cleanup",
          evaluationFingerprint: "fingerprint-1",
        },
      ],
      cleanableItems: [
        {
          publicationId: "publication-1",
          targetPlatformId: "toutiao",
          status: "failed",
          reasonCode: "SOURCE_ARTICLE_TRASHED",
          repairAction: "cleanup",
          evaluationFingerprint: "fingerprint-1",
        },
      ],
      reportedItems: [],
      cleanableCount: 1,
      reportedCount: 0,
    },
  },
  {
    channel: "content:cleanup-trashed-article-queue-residue",
    owner: "content",
    productionCaller:
      "desktopConsole.content.cleanupTrashedArticleQueueResidue",
    request: { confirmed: true },
    result: {
      status: "completed",
      cleanedCount: 1,
      failedCount: 0,
      remainingCount: 0,
      cleanableCount: 0,
      reportedCount: 0,
      items: [
        {
          publicationId: "publication-1",
          targetPlatformId: "toutiao",
          status: "cleaned",
          reasonCode: null,
          action: "cleanup",
          resultStatus: "failed-cleaned",
        },
      ],
      remainingItems: [],
    },
  },
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
]);

module.exports = {
  submissionContracts,
  submissionContractFixtures,
  projectSubmissionResult,
  projectBatchItem,
};
