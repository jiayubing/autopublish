const {
  defineContract,
  exactObject,
  stringField,
  integerField,
  optionalField,
  nullableField,
  enumField,
  multilineStringField,
  numberField,
  arrayField,
} = require("./registry");
const {
  MEDIA_RESOURCE_TYPES,
  finiteMediaPrice,
  projectMediaResource,
  projectMediaDraft,
  projectMediaArticleSummary,
  projectMediaResourcePage,
  projectMediaPoolPage,
  projectMediaRefreshResult,
  projectMediaOrder,
} = require("../../application/read-models/media-read-model");

const safeText = (max, min = 0) =>
  stringField({ max, min, pattern: /^[^\x00-\x1f\x7f]*$/u });
const filename = stringField({
  max: 255,
  min: 1,
  pattern: /^[^\\/\x00-\x1f\x7f]+$/u,
});
const identifier = stringField({
  max: 256,
  min: 1,
  pattern: /^[^\\/\x00-\x1f\x7f]+$/u,
});
const emptyRequest = exactObject({});
const completed = exactObject({ completed: "boolean" });
const mediaResourceType = enumField(MEDIA_RESOURCE_TYPES);

const COMMON_ERRORS = {
  AUTH_REQUIRED: {
    category: "authentication",
    retryability: "never",
    userMessage: "请先完成登录后再继续。",
  },
  IPC_REQUEST_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "请求数据无效，请刷新页面后重试。",
  },
  IPC_RESULT_INVALID: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "操作结果未通过安全校验，请刷新后重试。",
  },
  IPC_INTERNAL: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "操作未能安全完成，请稍后重试或检查诊断信息。",
  },
  MEDIA_CONFIG_NOT_SET: {
    category: "validation",
    retryability: "never",
    userMessage: "请先配置付费媒体服务。",
  },
  MEDIA_ENDPOINT_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请先配置付费媒体服务 endpoint。",
  },
  MEDIA_CONFIG_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "付费媒体服务配置无效，请检查 endpoint 和访问设置。",
  },
  MEDIA_HTTP_CONFIRMATION_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "媒体服务 HTTP endpoint 需要先完成安全确认。",
  },
  MEDIA_REDIRECT_REJECTED: {
    category: "transport",
    retryability: "never",
    userMessage: "媒体服务重定向已拒绝，请检查 endpoint 配置。",
  },
  MEDIA_TLS_CERTIFICATE_ERROR: {
    category: "transport",
    retryability: "manual-check",
    userMessage: "媒体服务 TLS 证书校验失败，请检查网络和证书。",
  },
  MEDIA_TLS_HOSTNAME_MISMATCH: {
    category: "transport",
    retryability: "manual-check",
    userMessage: "媒体服务 TLS 主机名校验失败，请检查 endpoint。",
  },
  MEDIA_CONNECT_TIMEOUT: {
    category: "transport",
    retryability: "safe",
    userMessage: "媒体资源列表连接超时，请稍后重试或检查诊断信息。",
  },
  MEDIA_READ_TIMEOUT: {
    category: "transport",
    retryability: "manual-check",
    userMessage: "媒体资源列表读取超时，请稍后重试或检查诊断信息。",
  },
  MEDIA_NETWORK_ERROR: {
    category: "transport",
    retryability: "manual-check",
    userMessage: "媒体资源列表请求失败，请稍后重试或检查诊断信息。",
  },
  MEDIA_SERVER_ERROR: {
    category: "remote",
    retryability: "safe",
    userMessage: "媒体服务暂时异常，请稍后重试。",
  },
  MEDIA_TRANSPORT_UNAVAILABLE: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "媒体传输能力不可用，请检查诊断信息。",
  },
  MEDIA_CONNECTION_FAILED: {
    category: "transport",
    retryability: "safe",
    userMessage: "媒体服务连接失败，请检查诊断信息。",
  },
  MEDIA_SUPPLIER_PORT_UNAVAILABLE: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "媒体供应商资源接口不可用，请检查媒体服务配置。",
  },
  MEDIA_RESOURCE_TRANSPORT_ERROR: {
    category: "transport",
    retryability: "safe",
    userMessage: "媒体资源列表请求失败，请稍后重试或检查诊断信息。",
  },
  MEDIA_RESOURCE_TIMEOUT: {
    category: "transport",
    retryability: "safe",
    userMessage: "媒体资源列表请求超时，请稍后重试或检查诊断信息。",
  },
  MEDIA_RESOURCE_REMOTE_REJECTED: {
    category: "remote",
    retryability: "never",
    userMessage: "媒体服务拒绝获取资源列表，请检查权限或账号能力。",
  },
  MEDIA_RESOURCE_SUPPLIER_PROTOCOL_ERROR: {
    category: "transport",
    retryability: "manual-check",
    userMessage: "媒体服务资源列表响应格式无法识别，请检查诊断信息。",
  },
  MEDIA_RESOURCE_NORMALIZATION_FAILED: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "媒体服务返回的资源数据无法识别，请检查诊断信息。",
  },
  MEDIA_RESOURCE_PERSISTENCE_FAILED: {
    category: "storage",
    retryability: "manual-check",
    userMessage: "媒体资源库保存失败，请检查本地存储和诊断信息。",
  },
  MEDIA_RESOURCE_REFRESH_FAILED: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "媒体资源刷新未能安全完成，请稍后重试或检查诊断信息。",
  },
  MEDIA_RESOURCE_PAGE_SIZE_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "资源分页大小必须介于 1 到 100。",
  },
  MEDIA_RESOURCE_REFRESH_OPTIONS_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "资源刷新边界只能由主进程控制。",
  },
  MEDIA_POOL_CAPACITY_EXCEEDED: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "资源池超过安全容量，请清理后重试。",
  },
  MEDIA_RESOURCE_PRICE_INVALID: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "媒体报价无效，无法用于投稿。",
  },
  SUBMISSION_INPUT_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "投稿输入无效，请重新选择稿件和媒体资源。",
  },
  DRAFT_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "草稿数据无效，请检查后重试。",
  },
  PUBLICATION_WORKFLOW_UNAVAILABLE: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "投稿工作流当前不可用，请检查诊断信息。",
  },
  MEDIA_ORDER_NOT_PUBLISHED: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "该订单尚未发布，暂时没有可打开的发布页面。",
  },
  MEDIA_ORDER_URL_UNAVAILABLE: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "该订单没有可安全打开的发布链接，请先同步订单。",
  },
  MEDIA_ORDER_OPEN_FAILED: {
    category: "transport",
    retryability: "safe",
    userMessage: "无法打开发布页面，请稍后重试。",
  },
  MEDIA_ORDER_SYNC_FAILED: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "订单同步未能安全完成，请稍后重试。",
  },
  MEDIA_ORDER_STATUS_ANOMALY: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "订单状态无法安全确认，已保留原事实并进入人工核对。",
  },
  ORDER_STATUS_ANOMALY_OPEN: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "订单状态异常尚未收口，请先完成人工核对。",
  },
  ORDER_STATUS_ANOMALY_NOT_OPEN: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "订单状态异常已变化，请刷新后重新核对。",
  },
  ORDER_STATUS_ANOMALY_TOKEN_STALE: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "核对凭据已过期，请重新准备。",
  },
  ORDER_STATUS_ANOMALY_STATE_STALE: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "订单事实已变化，请刷新后重新核对。",
  },
  ORDER_STATUS_ANOMALY_QUERY_STALE: {
    category: "conflict",
    retryability: "safe",
    userMessage: "核对查询期间订单事实已变化，请刷新后重新准备。",
  },
  ORDER_OBSERVATION_QUERY_STALE: {
    category: "conflict",
    retryability: "safe",
    userMessage: "同步查询期间订单事实已变化，请刷新后重试。",
  },
  ORDER_TRANSITION_TERMINAL: {
    category: "conflict",
    retryability: "never",
    userMessage: "订单已有明确终态，旧状态不会覆盖当前事实。",
  },
  ORDER_OBSERVATION_STATUS_REGRESSION: {
    category: "conflict",
    retryability: "never",
    userMessage: "订单旧状态不会覆盖更新的跟踪事实。",
  },
  ORDER_CUSTOMER_SNAPSHOT_UNAVAILABLE: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "订单缺少下单时客户快照，文章继续冻结等待人工核对。",
  },
  ORDER_STATUS_ANOMALY_RESOLUTION_OPPOSITE: {
    category: "conflict",
    retryability: "never",
    userMessage: "该订单已按相反结论完成核对。",
  },
  ORDER_CANCELLATION_INTENT_OPEN: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "订单取消仍在处理中，请先完成取消核对。",
  },
  ORDER_CANCELLATION_NOT_ALLOWED: {
    category: "conflict",
    retryability: "never",
    userMessage: "当前订单状态不允许取消。",
  },
  ORDER_CANCELLATION_CONFIRMATION_STALE: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "取消确认已过期，请刷新后重新准备。",
  },
  ORDER_CANCELLATION_OBSERVATION_STALE: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "订单事实已变化，请刷新后重新核对取消状态。",
  },
  ORDER_CANCELLATION_ATTEMPT_NOT_FOUND: {
    category: "validation",
    retryability: "never",
    userMessage: "未找到对应的取消记录。",
  },
  ORDER_CANCELLATION_ALREADY_RESOLVED: {
    category: "conflict",
    retryability: "never",
    userMessage: "该取消记录已经完成人工核对。",
  },
  ORDER_CANCELLATION_RESOLUTION_STALE: {
    category: "conflict",
    retryability: "manual-check",
    userMessage: "取消核对确认已过期，请重新准备。",
  },
  ORDER_CANCELLATION_RESOLUTION_CONFLICT: {
    category: "conflict",
    retryability: "never",
    userMessage: "该取消记录已按相反结论完成核对。",
  },
  PAID_ORDER_RESOLUTION_QUERY_FAILED: {
    category: "transport",
    retryability: "manual-check",
    userMessage: "订单核对查询失败，文章仍保持冻结。",
  },
  PAID_ORDER_RESOLUTION_EVIDENCE_INSUFFICIENT: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "订单信息不足，无法安全补录。",
  },
  PAID_ORDER_RESOLUTION_EVIDENCE_MISMATCH: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "订单信息与原投稿不匹配，文章仍保持冻结。",
  },
  PAID_ORDER_RESOLUTION_TOKEN_STALE: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "核对确认已过期，请重新获取当前核对信息。",
  },
  PAID_ORDER_RESOLUTION_STATE_STALE: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "文章或订单事实已变化，请刷新后重新核对。",
  },
  PAID_ORDER_RESOLUTION_OPPOSITE: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "该人工决定已被相反决定收口，不能覆盖原事实。",
  },
  PAID_ORDER_SUCCESS_WINS: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "已发现可信订单事实，不能确认没有订单。",
  },
  PAID_ORDER_NEW_TARGET_CONFLICT: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "订单与新的活动目标发生冲突，文章已冻结待处理。",
  },
  PAID_ORDER_RESOLUTION_NOT_AVAILABLE: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "该订单当前不提供人工核对动作。",
  },
  PAID_ORDER_RESOLUTION_ALREADY_COMPLETED: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "该人工核对已经完成，请刷新查看当前订单事实。",
  },
  PAID_ORDER_ATTEMPT_INVALID: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "投稿尝试标识无效，请刷新后重新核对。",
  },
  PAID_ORDER_ATTEMPT_NOT_FOUND: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "找不到对应的投稿尝试，请刷新后重新核对。",
  },
  PAID_ORDER_ID_INVALID: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "订单号格式无效，请核对后重试。",
  },
  PAID_ORDER_EVIDENCE_CONFLICT: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "订单证据与当前事实冲突，文章仍保持冻结。",
  },
  PAID_ORDER_PHASE_INVALID: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "投稿尝试状态已变化，请刷新后重新核对。",
  },
  OPERATIONAL_ORDER_CONFLICT: {
    category: "validation",
    retryability: "manual-check",
    userMessage: "订单号已绑定其他投稿尝试，当前文章仍保持冻结。",
  },
};

const BASE_ERROR_CODES = [
  "AUTH_REQUIRED",
  "IPC_REQUEST_INVALID",
  "IPC_RESULT_INVALID",
  "IPC_INTERNAL",
];

function errors(...codes) {
  const errorCodes = [...new Set([...BASE_ERROR_CODES, ...codes])];
  return {
    errorCodes,
    errors: Object.fromEntries(
      errorCodes.map((code) => [code, COMMON_ERRORS[code]]),
    ),
  };
}

const resource = exactObject({
  resourceId: identifier,
  name: safeText(500),
  price: nullableField(numberField({ min: 0, max: 100000000 })),
  type: mediaResourceType,
  url: optionalField(safeText(2048)),
  duration: optionalField(safeText(64)),
  resolution: optionalField(safeText(64)),
  size: optionalField(safeText(64)),
  createdAt: safeText(64),
});

const selectedResource = exactObject({
  resourceId: identifier,
  name: optionalField(safeText(500)),
  price: optionalField(numberField({ min: 0, max: 100000000 })),
  type: optionalField(mediaResourceType),
});

const draft = exactObject({
  filename,
  title: safeText(1000),
  remark: safeText(10000),
  ignoreImages: "boolean",
  selectedResources: arrayField(resource, { max: 100 }),
  updatedAt: optionalField(safeText(64)),
});

const articleSummary = exactObject({
  filename,
  title: safeText(1000),
  autoTitle: safeText(1000),
  remark: safeText(10000),
  hasImages: "boolean",
  imageCount: integerField({ min: 0, max: 10000 }),
  ignoreImages: "boolean",
  selectedResources: arrayField(resource, { max: 100 }),
});

const orderAnomaly = exactObject({
  reason: enumField(["order-missing", "unknown-status", "unsettled-aftercare"]),
  openedAt: safeText(64),
});

const orderCancellation = exactObject({
  orderId: identifier,
  state: enumField(["none", "open", "resolved"]),
  cancellationAttemptId: nullableField(identifier),
  outcome: nullableField(enumField(["cancelled", "rejected"])),
  actionLabel: nullableField(enumField(["取消订单", "尝试取消"])),
  riskCode: nullableField(enumField(["CANCELLATION_MAY_BE_REJECTED"])),
  manualResolutionRequired: "boolean",
});

const order = exactObject({
  title: safeText(1000),
  orderNid: identifier,
  statusCode: safeText(64),
  createdAt: safeText(64),
  submittedAt: safeText(64),
  publishedAt: safeText(64),
  resourceName: safeText(500),
  price: safeText(128),
  actualAmount: safeText(128),
  hasPublishedUrl: "boolean",
  anomaly: nullableField(orderAnomaly),
  cancellation: nullableField(orderCancellation),
});

const cancellationPreparation = exactObject({
  orderId: identifier,
  cancellationAttemptId: identifier,
  expectedObservationFingerprint: safeText(64, 64),
  actionLabel: enumField(["取消订单", "尝试取消"]),
  riskCode: nullableField(enumField(["CANCELLATION_MAY_BE_REJECTED"])),
  confirmationToken: safeText(256, 1),
  expiresAt: safeText(64, 1),
});
const cancellationResult = exactObject({
  status: enumField(["cancelled", "rejected", "uncertain"]),
  cancellationAttemptId: identifier,
  manualCheckRequired: "boolean",
  idempotent: "boolean",
  publishedWins: "boolean",
});
const cancellationResolutionPreparation = exactObject({
  version: integerField({ min: 1, max: 1 }),
  cancellationAttemptId: identifier,
  orderId: identifier,
  expectedObservationFingerprint: safeText(64, 64),
  classification: enumField([
    "verified_cancelled",
    "verified_active",
    "inconclusive",
  ]),
  evidenceFingerprint: safeText(64, 64),
  evidenceSummary: exactObject({
    source: enumField(["supplier_query"]),
    status: nullableField(safeText(64)),
    observed: "boolean",
  }),
  confirmationToken: safeText(256, 1),
  preparedAt: safeText(64, 1),
  expiresAt: safeText(64, 1),
});
const cancellationManualResult = exactObject({
  status: enumField(["cancelled", "rejected"]),
  idempotent: "boolean",
  publishedWins: optionalField("boolean"),
});

const orderSyncItem = exactObject({
  orderNid: identifier,
  ok: "boolean",
  errorCode: nullableField(safeText(128)),
});

const anomalyClassification = enumField([
  "verified_trackable",
  "verified_published",
  "verified_non_published_terminal",
  "inconclusive",
]);
const anomalyAction = enumField([
  "resumeOrderTracking",
  "confirmOrderPublished",
  "confirmOrderNotPublished",
]);
const anomalyPreparation = exactObject({
  orderId: identifier,
  classification: anomalyClassification,
  confirmationToken: safeText(256),
  expiresAt: safeText(64),
  allowedActions: arrayField(anomalyAction, { max: 1 }),
});
const anomalyResolution = exactObject({
  orderId: identifier,
  status: enumField(["tracking_resumed", "published", "not_published"]),
  idempotent: "boolean",
});

const resourcePage = exactObject({
  items: arrayField(resource, { max: 100 }),
  total: integerField({ min: 0, max: 20000 }),
  page: integerField({ min: 1, max: 20000 }),
  pageSize: integerField({ min: 1, max: 100 }),
  totalPages: integerField({ min: 0, max: 20000 }),
  hasPrev: "boolean",
  hasNext: "boolean",
});

const poolPage = exactObject({
  items: arrayField(resource, { max: 100 }),
  memberResourceIds: arrayField(identifier, { max: 100 }),
  total: integerField({ min: 0, max: 20000 }),
  page: integerField({ min: 1, max: 20000 }),
  pageSize: integerField({ min: 1, max: 100 }),
  totalPages: integerField({ min: 0, max: 20000 }),
  hasPrev: "boolean",
  hasNext: "boolean",
});

const diagnostic = exactObject({
  code: safeText(128, 1),
  page: optionalField(integerField({ min: 1, max: 200 })),
  count: optionalField(integerField({ min: 0, max: 100000 })),
  loadedCount: optionalField(integerField({ min: 0, max: 20000 })),
});

function noArgs() {
  return {};
}

function noLegacyInput() {
  return [undefined];
}

function oneObject(args) {
  return args[0] === undefined ? {} : args[0];
}

function selectedResourceFromArgs(args) {
  const value = args[0] || {};
  const resource = { resourceId: value.resourceId };
  if (value.name !== undefined) resource.name = value.name;
  if (value.price !== undefined) resource.price = value.price;
  if (value.type !== undefined) resource.type = value.type;
  return { resource };
}

function contract(input, errorCodes = []) {
  return defineContract({
    feature: "media",
    ...input,
    ...errors(...errorCodes),
  });
}

const mediaContracts = [
  contract(
    {
      capability: "media.refreshResources",
      channel: "media:refresh-resources",
      kind: "command",
      request: emptyRequest,
      success: exactObject({
        status: enumField(["complete", "truncated"]),
        complete: "boolean",
        truncated: "boolean",
        truncationReason: nullableField(safeText(64)),
        pageCount: integerField({ min: 0, max: 200 }),
        resourceCount: integerField({ min: 0, max: 20000 }),
        diagnostics: arrayField(diagnostic, { max: 1000 }),
        refreshedAt: safeText(64, 1),
      }),
      fromArgs: oneObject,
      toArgs: () => [{ fetchAll: true }],
    },
    [
      "MEDIA_CONFIG_NOT_SET",
      "MEDIA_ENDPOINT_REQUIRED",
      "MEDIA_CONFIG_INVALID",
      "MEDIA_HTTP_CONFIRMATION_REQUIRED",
      "MEDIA_REDIRECT_REJECTED",
      "MEDIA_TLS_CERTIFICATE_ERROR",
      "MEDIA_TLS_HOSTNAME_MISMATCH",
      "MEDIA_CONNECT_TIMEOUT",
      "MEDIA_READ_TIMEOUT",
      "MEDIA_NETWORK_ERROR",
      "MEDIA_SERVER_ERROR",
      "MEDIA_TRANSPORT_UNAVAILABLE",
      "MEDIA_CONNECTION_FAILED",
      "MEDIA_SUPPLIER_PORT_UNAVAILABLE",
      "MEDIA_RESOURCE_TRANSPORT_ERROR",
      "MEDIA_RESOURCE_TIMEOUT",
      "MEDIA_RESOURCE_REMOTE_REJECTED",
      "MEDIA_RESOURCE_SUPPLIER_PROTOCOL_ERROR",
      "MEDIA_RESOURCE_NORMALIZATION_FAILED",
      "MEDIA_RESOURCE_PERSISTENCE_FAILED",
      "MEDIA_RESOURCE_REFRESH_FAILED",
      "MEDIA_RESOURCE_PAGE_SIZE_INVALID",
      "MEDIA_RESOURCE_REFRESH_OPTIONS_INVALID",
    ],
  ),
  contract(
    {
      capability: "media.getResourcePage",
      channel: "media:get-resource-page",
      kind: "query",
      request: exactObject({
        page: integerField({ min: 1, max: 20000 }),
        pageSize: integerField({ min: 1, max: 100 }),
      }),
      success: resourcePage,
      fromArgs: oneObject,
      toArgs: (payload) => [payload],
    },
    ["MEDIA_RESOURCE_PAGE_SIZE_INVALID"],
  ),
  contract(
    {
      capability: "media.searchResourcePage",
      channel: "media:search-resource-page",
      kind: "query",
      request: exactObject({
        query: safeText(500),
        page: integerField({ min: 1, max: 20000 }),
        pageSize: integerField({ min: 1, max: 100 }),
      }),
      success: resourcePage,
      fromArgs: oneObject,
      toArgs: (payload) => [
        {
          keyword: payload.query,
          page: payload.page,
          pageSize: payload.pageSize,
        },
      ],
    },
    ["MEDIA_RESOURCE_PAGE_SIZE_INVALID"],
  ),
  contract(
    {
      capability: "media.getPool",
      channel: "media:get-pool",
      kind: "query",
      request: exactObject({
        page: integerField({ min: 1, max: 20000 }),
        pageSize: integerField({ min: 1, max: 100 }),
        resourceIds: arrayField(identifier, { max: 100 }),
      }),
      success: poolPage,
      fromArgs: oneObject,
      toArgs: (payload) => [payload],
    },
    ["MEDIA_RESOURCE_PAGE_SIZE_INVALID", "MEDIA_POOL_CAPACITY_EXCEEDED"],
  ),
  contract({
    capability: "media.addToPool",
    channel: "media:add-to-pool",
    kind: "command",
    request: exactObject({ resource: selectedResource }),
    success: exactObject({ resource }),
    fromArgs: selectedResourceFromArgs,
    toArgs: (payload) => [payload.resource],
  }),
  contract({
    capability: "media.removeFromPool",
    channel: "media:remove-from-pool",
    kind: "command",
    request: exactObject({ resourceId: identifier }),
    success: completed,
    fromArgs: (args) => ({ resourceId: args[0] }),
    toArgs: (payload) => [payload.resourceId],
  }),
  contract({
    capability: "media.getDrafts",
    channel: "media:get-drafts",
    kind: "query",
    request: emptyRequest,
    success: exactObject({ items: arrayField(draft, { max: 1000 }) }),
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  contract({
    capability: "media.scanArticles",
    channel: "media:scan-articles",
    kind: "query",
    request: emptyRequest,
    success: exactObject({ items: arrayField(articleSummary, { max: 1000 }) }),
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  contract({
    capability: "media.getOrders",
    channel: "media:get-orders",
    kind: "query",
    request: emptyRequest,
    success: exactObject({ items: arrayField(order, { max: 20000 }) }),
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  contract(
    {
      capability: "media.syncOrder",
      channel: "media:sync-order",
      kind: "command",
      request: exactObject({ orderNid: identifier }),
      success: exactObject({ order }),
      fromArgs: (args) => ({ orderNid: args[0] }),
      toArgs: (payload) => [payload.orderNid],
    },
    [
      "MEDIA_CONFIG_NOT_SET",
      "MEDIA_ORDER_SYNC_FAILED",
      "MEDIA_ORDER_STATUS_ANOMALY",
      "ORDER_STATUS_ANOMALY_OPEN",
      "ORDER_CANCELLATION_INTENT_OPEN",
      "ORDER_OBSERVATION_QUERY_STALE",
      "ORDER_OBSERVATION_STATUS_REGRESSION",
      "ORDER_TRANSITION_TERMINAL",
      "ORDER_CUSTOMER_SNAPSHOT_UNAVAILABLE",
    ],
  ),
  contract({
    capability: "media.syncAllOrders",
    channel: "media:sync-all-orders",
    kind: "command",
    request: emptyRequest,
    success: exactObject({
      items: arrayField(orderSyncItem, { max: 20000 }),
      succeeded: integerField({ min: 0, max: 20000 }),
      failed: integerField({ min: 0, max: 20000 }),
    }),
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  contract(
    {
      capability: "media.prepareOrderCancellation",
      channel: "media:prepare-order-cancellation",
      kind: "command",
      request: exactObject({ orderId: identifier }),
      success: cancellationPreparation,
      fromArgs: (args) => args[0],
      toArgs: (payload) => [payload],
    },
    ["ORDER_CANCELLATION_NOT_ALLOWED", "ORDER_CANCELLATION_INTENT_OPEN"],
  ),
  contract(
    {
      capability: "media.cancelOrder",
      channel: "media:cancel-order",
      kind: "command",
      request: exactObject({
        orderId: identifier,
        confirmationToken: safeText(256, 1),
      }),
      success: cancellationResult,
      fromArgs: (args) => args[0],
      toArgs: (payload) => [payload],
    },
    [
      "ORDER_CANCELLATION_CONFIRMATION_STALE",
      "ORDER_CANCELLATION_OBSERVATION_STALE",
      "ORDER_CANCELLATION_INTENT_OPEN",
    ],
  ),
  contract(
    {
      capability: "media.prepareCancellationResolution",
      channel: "media:prepare-cancellation-resolution",
      kind: "command",
      request: exactObject({ cancellationAttemptId: identifier }),
      success: cancellationResolutionPreparation,
      fromArgs: (args) => args[0],
      toArgs: (payload) => [payload],
    },
    [
      "ORDER_CANCELLATION_ATTEMPT_NOT_FOUND",
      "ORDER_CANCELLATION_ALREADY_RESOLVED",
    ],
  ),
  ...[
    ["confirmCancellationSucceeded", "confirm-cancellation-succeeded"],
    ["confirmCancellationNotApplied", "confirm-cancellation-not-applied"],
  ].map(([capabilityName, channelName]) =>
    contract(
      {
        capability: `media.${capabilityName}`,
        channel: `media:${channelName}`,
        kind: "command",
        request: exactObject({
          cancellationAttemptId: identifier,
          confirmationToken: safeText(256, 1),
          evidenceFingerprint: safeText(64, 64),
        }),
        success: cancellationManualResult,
        fromArgs: (args) => args[0],
        toArgs: (payload) => [payload],
      },
      [
        "ORDER_CANCELLATION_RESOLUTION_STALE",
        "ORDER_CANCELLATION_RESOLUTION_CONFLICT",
        "ORDER_CANCELLATION_OBSERVATION_STALE",
      ],
    ),
  ),
  contract(
    {
      capability: "media.prepareOrderStatusAnomalyResolution",
      channel: "media:prepare-order-status-anomaly-resolution",
      kind: "command",
      request: exactObject({ orderId: identifier }),
      success: anomalyPreparation,
      fromArgs: (args) => args[0],
      toArgs: (payload) => [payload],
    },
    [
      "MEDIA_CONFIG_NOT_SET",
      "MEDIA_ORDER_SYNC_FAILED",
      "ORDER_STATUS_ANOMALY_NOT_OPEN",
      "ORDER_STATUS_ANOMALY_QUERY_STALE",
    ],
  ),
  ...[
    ["resumeOrderTracking", "resume-order-tracking"],
    ["confirmOrderPublished", "confirm-order-published"],
    ["confirmOrderNotPublished", "confirm-order-not-published"],
  ].map(([capabilityName, channelName]) =>
    contract(
      {
        capability: `media.${capabilityName}`,
        channel: `media:${channelName}`,
        kind: "command",
        request: exactObject({
          orderId: identifier,
          confirmationToken: safeText(256, 1),
        }),
        success: anomalyResolution,
        fromArgs: (args) => args[0],
        toArgs: (payload) => [payload],
      },
      [
        "ORDER_STATUS_ANOMALY_NOT_OPEN",
        "ORDER_STATUS_ANOMALY_TOKEN_STALE",
        "ORDER_STATUS_ANOMALY_STATE_STALE",
        "ORDER_STATUS_ANOMALY_RESOLUTION_OPPOSITE",
        "ORDER_CANCELLATION_INTENT_OPEN",
        "ORDER_CUSTOMER_SNAPSHOT_UNAVAILABLE",
      ],
    ),
  ),
  contract(
    {
      capability: "media.openPublishedUrl",
      channel: "media:open-published-url",
      kind: "command",
      request: exactObject({ orderNid: identifier }),
      success: completed,
      fromArgs: (args) => ({ orderNid: args[0] }),
      toArgs: (payload) => [payload.orderNid],
    },
    [
      "MEDIA_ORDER_NOT_PUBLISHED",
      "MEDIA_ORDER_URL_UNAVAILABLE",
      "MEDIA_ORDER_OPEN_FAILED",
    ],
  ),
];

const mediaLifecycleContracts = Object.freeze([
  contract(
    {
      capability: "media.getBalance",
      channel: "media:get-balance",
      kind: "query",
      request: emptyRequest,
      success: exactObject({ balance: safeText(128, 0) }),
      fromArgs: noArgs,
      toArgs: noLegacyInput,
    },
    ["MEDIA_CONFIG_NOT_SET"],
  ),
]);

module.exports = {
  mediaContracts,
  mediaLifecycleContracts,
  finiteMediaPrice,
  projectMediaResource,
  projectMediaDraft,
  projectMediaArticleSummary,
  projectMediaResourcePage,
  projectMediaPoolPage,
  projectMediaRefreshResult,
  projectMediaOrder,
};
