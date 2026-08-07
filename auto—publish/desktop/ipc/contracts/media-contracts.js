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
const MEDIA_RESOURCE_TYPES = Object.freeze([
  "image",
  "video",
  "audio",
  "document",
]);
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

const draftInput = exactObject({
  title: optionalField(safeText(1000)),
  remark: optionalField(safeText(10000)),
  ignoreImages: optionalField("boolean"),
  selectedResources: optionalField(arrayField(selectedResource, { max: 100 })),
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

const articlePreview = exactObject({
  filename,
  title: safeText(1000),
  content: multilineStringField({ min: 0, max: 2000000 }),
  selectedResources: arrayField(resource, { max: 100 }),
});

const order = exactObject({
  title: safeText(1000),
  orderNid: identifier,
  statusCode: safeText(64),
  submittedAt: safeText(64),
  publishedAt: safeText(64),
  resourceName: safeText(500),
  price: safeText(128),
  hasPublishedUrl: "boolean",
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
  contract(
    {
      capability: "media.getDraft",
      channel: "media:get-draft",
      kind: "query",
      request: exactObject({ filename }),
      success: exactObject({ draft: nullableField(draft) }),
      fromArgs: (args) => ({ filename: args[0] }),
      toArgs: (payload) => [payload.filename],
    },
    ["SUBMISSION_INPUT_INVALID"],
  ),
  contract(
    {
      capability: "media.setDraft",
      channel: "media:set-draft",
      kind: "command",
      request: exactObject({ filename, draft: draftInput }),
      success: completed,
      fromArgs: (args) => ({ filename: args[0], draft: args[1] }),
      toArgs: (payload) => [payload.filename, payload.draft],
    },
    ["SUBMISSION_INPUT_INVALID", "DRAFT_INVALID"],
  ),
  contract({
    capability: "media.scanArticles",
    channel: "media:scan-articles",
    kind: "query",
    request: emptyRequest,
    success: exactObject({ items: arrayField(articleSummary, { max: 1000 }) }),
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  contract(
    {
      capability: "media.previewArticle",
      channel: "media:preview-article",
      kind: "query",
      request: exactObject({ filename }),
      success: exactObject({ article: articlePreview }),
      fromArgs: (args) => ({ filename: args[0] }),
      toArgs: (payload) => [payload.filename],
    },
    ["SUBMISSION_INPUT_INVALID"],
  ),
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
    ["MEDIA_CONFIG_NOT_SET", "MEDIA_ORDER_SYNC_FAILED"],
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
  contract(
    {
      capability: "media.prepareBindPaidOrderNumber",
      channel: "media:prepare-bind-paid-order-number",
      kind: "command",
      request: exactObject({
        orderCreationAttemptId: identifier,
        orderId: identifier,
      }),
      success: exactObject({
        orderCreationAttemptId: identifier,
        action: enumField(["bind_verified_order"]),
        confirmationToken: safeText(256, 1),
        expiresAt: safeText(64, 1),
        orderId: identifier,
        observationFingerprint: safeText(128, 1),
      }),
      fromArgs: oneObject,
      toArgs: (payload) => [payload],
    },
    [
      "PAID_ORDER_ATTEMPT_INVALID",
      "PAID_ORDER_ATTEMPT_NOT_FOUND",
      "PAID_ORDER_ID_INVALID",
      "PAID_ORDER_RESOLUTION_QUERY_FAILED",
      "PAID_ORDER_RESOLUTION_EVIDENCE_INSUFFICIENT",
      "PAID_ORDER_RESOLUTION_EVIDENCE_MISMATCH",
      "PAID_ORDER_RESOLUTION_NOT_AVAILABLE",
      "PAID_ORDER_RESOLUTION_ALREADY_COMPLETED",
      "PAID_ORDER_RESOLUTION_OPPOSITE",
    ],
  ),
  contract(
    {
      capability: "media.bindPaidOrderNumber",
      channel: "media:bind-paid-order-number",
      kind: "command",
      request: exactObject({
        orderCreationAttemptId: identifier,
        orderId: identifier,
        confirmationToken: safeText(256, 1),
      }),
      success: exactObject({
        orderCreationAttemptId: identifier,
        orderId: identifier,
        status: enumField(["order_bound"]),
        idempotent: "boolean",
      }),
      fromArgs: oneObject,
      toArgs: (payload) => [payload],
    },
    [
      "PAID_ORDER_ATTEMPT_INVALID",
      "PAID_ORDER_ATTEMPT_NOT_FOUND",
      "PAID_ORDER_ID_INVALID",
      "PAID_ORDER_RESOLUTION_TOKEN_STALE",
      "PAID_ORDER_RESOLUTION_STATE_STALE",
      "PAID_ORDER_RESOLUTION_EVIDENCE_MISMATCH",
      "PAID_ORDER_RESOLUTION_OPPOSITE",
      "PAID_ORDER_EVIDENCE_CONFLICT",
      "PAID_ORDER_PHASE_INVALID",
      "OPERATIONAL_ORDER_CONFLICT",
      "PAID_ORDER_NEW_TARGET_CONFLICT",
    ],
  ),
  contract(
    {
      capability: "media.prepareConfirmPaidOrderAbsent",
      channel: "media:prepare-confirm-paid-order-absent",
      kind: "command",
      request: exactObject({ orderCreationAttemptId: identifier }),
      success: exactObject({
        orderCreationAttemptId: identifier,
        action: enumField(["confirm_no_order"]),
        confirmationToken: safeText(256, 1),
        expiresAt: safeText(64, 1),
      }),
      fromArgs: oneObject,
      toArgs: (payload) => [payload],
    },
    [
      "PAID_ORDER_ATTEMPT_INVALID",
      "PAID_ORDER_ATTEMPT_NOT_FOUND",
      "PAID_ORDER_RESOLUTION_EVIDENCE_INSUFFICIENT",
      "PAID_ORDER_RESOLUTION_NOT_AVAILABLE",
      "PAID_ORDER_RESOLUTION_ALREADY_COMPLETED",
      "PAID_ORDER_RESOLUTION_OPPOSITE",
    ],
  ),
  contract(
    {
      capability: "media.confirmPaidOrderAbsent",
      channel: "media:confirm-paid-order-absent",
      kind: "command",
      request: exactObject({
        orderCreationAttemptId: identifier,
        confirmationToken: safeText(256, 1),
      }),
      success: exactObject({
        orderCreationAttemptId: identifier,
        status: enumField(["no_order"]),
        idempotent: "boolean",
      }),
      fromArgs: oneObject,
      toArgs: (payload) => [payload],
    },
    [
      "PAID_ORDER_ATTEMPT_INVALID",
      "PAID_ORDER_ATTEMPT_NOT_FOUND",
      "PAID_ORDER_RESOLUTION_TOKEN_STALE",
      "PAID_ORDER_RESOLUTION_STATE_STALE",
      "PAID_ORDER_RESOLUTION_OPPOSITE",
      "PAID_ORDER_SUCCESS_WINS",
      "PAID_ORDER_PHASE_INVALID",
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

function finiteMediaPrice(value) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100000000
    ? value
    : undefined;
}

function projectMediaResource(value) {
  const resource = value || {};
  const type = MEDIA_RESOURCE_TYPES.includes(resource.type)
    ? resource.type
    : "image";
  const result = {
    resourceId: String(
      resource.resourceId || resource.id || resource.resource_id || "",
    ),
    name: String(
      resource.name || resource.title || resource.resourceName || "",
    ),
    price:
      finiteMediaPrice(resource.price) === undefined
        ? null
        : finiteMediaPrice(resource.price),
    type,
    createdAt: String(resource.createdAt || resource.updatedAt || ""),
  };
  for (const key of ["url", "duration", "resolution", "size"])
    if (typeof resource[key] === "string") result[key] = resource[key];
  return result;
}

function projectMediaDraft(filename, value) {
  const draft = value || {};
  const result = {
    filename: String(filename || draft.filename || ""),
    title: String(draft.title || ""),
    remark: String(draft.remark || ""),
    ignoreImages: draft.ignoreImages === true,
    selectedResources: Array.isArray(draft.selectedResources)
      ? draft.selectedResources.map(projectMediaResource)
      : [],
  };
  if (typeof draft.updatedAt === "string") result.updatedAt = draft.updatedAt;
  return result;
}

function projectMediaArticleSummary(value) {
  const article = value || {};
  return {
    filename: String(article.filename || ""),
    title: String(article.title || ""),
    autoTitle: String(article.autoTitle || article.title || ""),
    remark: String(article.remark || ""),
    hasImages: article.hasImages === true,
    imageCount:
      Number.isSafeInteger(article.imageCount) && article.imageCount >= 0
        ? article.imageCount
        : 0,
    ignoreImages: article.ignoreImages === true,
    selectedResources: Array.isArray(article.selectedResources)
      ? article.selectedResources.map(projectMediaResource)
      : [],
  };
}

function projectMediaArticlePreview(value) {
  const article = value || {};
  return {
    filename: String(article.filename || ""),
    title: String(article.title || ""),
    content: String(article.content || ""),
    selectedResources: Array.isArray(article.selectedResources)
      ? article.selectedResources.map(projectMediaResource)
      : [],
  };
}

function projectMediaResourcePage(value) {
  const page = value || {};
  return {
    items: Array.isArray(page.items)
      ? page.items.map(projectMediaResource)
      : [],
    total: Number.isSafeInteger(page.total) && page.total >= 0 ? page.total : 0,
    page: Number.isSafeInteger(page.page) && page.page > 0 ? page.page : 1,
    pageSize:
      Number.isSafeInteger(page.pageSize) && page.pageSize > 0
        ? page.pageSize
        : 50,
    totalPages:
      Number.isSafeInteger(page.totalPages) && page.totalPages >= 0
        ? page.totalPages
        : 0,
    hasPrev: page.hasPrev === true,
    hasNext: page.hasNext === true,
  };
}

function projectMediaPoolPage(value) {
  const page = projectMediaResourcePage(value);
  page.memberResourceIds = Array.isArray(value && value.memberResourceIds)
    ? value.memberResourceIds
        .filter((resourceId) => typeof resourceId === "string")
        .slice(0, 100)
    : [];
  return page;
}

function projectMediaRefreshResult(value) {
  const result = value || {};
  return {
    status: result.truncated === true ? "truncated" : "complete",
    complete: result.complete === true,
    truncated: result.truncated === true,
    truncationReason:
      typeof result.truncationReason === "string"
        ? result.truncationReason
        : null,
    pageCount:
      Number.isSafeInteger(result.pageCount) && result.pageCount >= 0
        ? result.pageCount
        : 0,
    resourceCount:
      Number.isSafeInteger(result.resourceCount) && result.resourceCount >= 0
        ? result.resourceCount
        : 0,
    diagnostics: (Array.isArray(result.diagnostics)
      ? result.diagnostics
      : []
    ).map((value) => {
      const diagnostic = {
        code: String((value && value.code) || "MEDIA_RESOURCE_DIAGNOSTIC"),
      };
      for (const key of ["page", "count", "loadedCount"])
        if (Number.isSafeInteger(value && value[key]) && value[key] >= 0)
          diagnostic[key] = value[key];
      return diagnostic;
    }),
    refreshedAt: String(result.refreshedAt || new Date().toISOString()),
  };
}

function projectMediaOrder(value) {
  const order = value || {};
  return {
    title: String(order.title || ""),
    orderNid: String(order.orderNid || ""),
    statusCode: String(order.statusCode || ""),
    submittedAt: String(order.submittedAt || ""),
    publishedAt: String(order.publishedAt || ""),
    resourceName: String(order.resourceName || ""),
    price: String(order.price || ""),
    hasPublishedUrl: order.hasPublishedUrl === true,
  };
}

module.exports = {
  mediaContracts,
  mediaLifecycleContracts,
  finiteMediaPrice,
  projectMediaResource,
  projectMediaDraft,
  projectMediaArticleSummary,
  projectMediaArticlePreview,
  projectMediaResourcePage,
  projectMediaPoolPage,
  projectMediaRefreshResult,
  projectMediaOrder,
};
