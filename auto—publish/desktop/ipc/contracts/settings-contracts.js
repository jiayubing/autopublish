const {
  arrayField,
  defineContract,
  enumField,
  exactObject,
  integerField,
  literalField,
  nullableField,
  oneOf,
  optionalField,
  stringField,
} = require("./registry");

const text = (max, min = 0) =>
  stringField({ min, max, pattern: /^[^\x00-\x1f\x7f]*$/u });
const token = (max = 128) =>
  stringField({ min: 1, max, pattern: /^[A-Za-z0-9._:-]+$/u });
const emptyRequest = exactObject({});
const noArgs = () => ({});
const noLegacyInput = () => [undefined];
const directArgs = (args) => args[0];
const directInput = (payload) => [payload];

const COMMON_ERRORS = Object.freeze({
  AUTH_REQUIRED: {
    category: "authentication",
    retryability: "never",
    userMessage: "请先完成登录后再继续。",
  },
  IPC_REQUEST_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "设置请求无效，请刷新页面后重试。",
  },
  IPC_RESULT_INVALID: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "设置结果未通过安全校验，请刷新后重试。",
  },
  IPC_INTERNAL: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "设置操作未能安全完成，请稍后重试。",
  },
});

const testResult = exactObject({
  testedAt: text(64, 1),
  ok: "boolean",
  code: token(),
});
const aiStatus = exactObject({
  source: enumField(["application", "environment"]),
  configured: "boolean",
  baseUrl: text(2048),
  model: text(256),
  timeoutMs: integerField({ min: 1000, max: 300000 }),
  hasApiKey: "boolean",
  apiKeyMask: text(128),
  lastTest: nullableField(testResult),
});
const aiSaveRequest = exactObject({
  baseUrl: text(2048, 1),
  apiKey: text(4096),
  model: text(256, 1),
  timeoutMs: integerField({ min: 1000, max: 300000 }),
});
const aiTestRequest = exactObject({
  baseUrl: optionalField(text(2048, 1)),
  apiKey: optionalField(text(4096)),
  model: optionalField(text(256, 1)),
  timeoutMs: optionalField(integerField({ min: 1000, max: 300000 })),
});

const platformId = enumField(["media", "hepan"]);
const mediaDraft = exactObject({
  apiKey: optionalField(text(4096)),
  baseUrl: optionalField(text(2048, 1)),
  timeoutMs: optionalField(integerField({ min: 1000, max: 300000 })),
  allowInsecure: optionalField("boolean"),
  thirdPartyId: optionalField(text(128)),
});
const hepanDraft = exactObject({
  uid: optionalField(integerField({ min: 1, max: Number.MAX_SAFE_INTEGER })),
  password: optionalField(text(1024, 1)),
});
const platformDraft = oneOf([mediaDraft, hepanDraft]);
const platformQueryRequest = exactObject({ platformId });
const platformMutationRequest = exactObject({ platformId, draft: platformDraft });
const platformTestRequest = exactObject({
  platformId,
  draft: optionalField(platformDraft),
});
const platformArgs = (args) => {
  const input = args[0] || {};
  const result = { platformId: input.platformId };
  if (input.draft !== undefined) result.draft = input.draft;
  return result;
};

const mediaStatus = exactObject({
  source: enumField(["application", "environment"]),
  configured: "boolean",
  baseUrl: text(2048),
  timeoutMs: integerField({ min: 1000, max: 300000 }),
  allowInsecure: "boolean",
  transport: text(128),
  apiKeyMask: text(128),
  thirdPartyId: optionalField(text(128)),
  lastTest: nullableField(testResult),
});
const hepanTestResult = exactObject({
  testedAt: text(64, 1),
  ok: "boolean",
  code: token(),
  authenticated: optionalField("boolean"),
  publishAccess: optionalField("boolean"),
  stage: optionalField(enumField(["publish_access"])),
  account: optionalField(exactObject({
    displayName: text(160, 1),
    uid: stringField({ min: 1, max: 20, pattern: /^\d{1,20}$/u }),
  })),
  planName: optionalField(text(160, 1)),
  postLimit: optionalField(integerField({ min: 0 })),
  usedCount: optionalField(integerField({ min: 0 })),
  remainingCount: optionalField(integerField({ min: 0 })),
});
const hepanStatus = exactObject({
  source: enumField(["application", "environment"]),
  configured: "boolean",
  uid: integerField({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  uidConfigured: "boolean",
  passwordConfigured: "boolean",
  apiUrl: text(2048, 1),
  lastTest: nullableField(hepanTestResult),
});
const platformStatusResult = exactObject({
  platformId,
  status: oneOf([mediaStatus, hepanStatus]),
});
const platformTestResult = exactObject({
  platformId,
  result: oneOf([testResult, hepanTestResult]),
});
const platformClearResult = exactObject({ platformId, cleared: "boolean" });

const stringList = arrayField(text(256, 1), { max: 32 });
const legacyDiscovery = exactObject({
  media: exactObject({ available: "boolean", sources: stringList }),
  hepan: exactObject({
    available: "boolean",
    sources: stringList,
    cookiePathAvailable: "boolean",
  }),
  sources: stringList,
  importable: "boolean",
});
const legacyEntry = exactObject({
  platform: token(64),
  source: text(256, 1),
  status: token(128),
  code: nullableField(token()),
});
const legacyRecord = exactObject({
  version: literalField(1),
  updatedAt: nullableField(text(64, 1)),
  entries: arrayField(legacyEntry, { max: 32 }),
});
const legacyStatus = exactObject({
  discover: legacyDiscovery,
  record: nullableField(legacyRecord),
});
const legacyImportResult = exactObject({
  imported: arrayField(enumField(["media", "hepan"]), { max: 2 }),
  entries: arrayField(legacyEntry, { max: 32 }),
  record: legacyRecord,
  legacyCookieFilesRemain: "boolean",
});

const usageCategory = exactObject({
  bytes: integerField({ min: 0 }),
  files: integerField({ min: 0 }),
  followedSymlinks: integerField({ min: 0 }),
  skippedSymlinks: integerField({ min: 0 }),
});
const storageUsage = exactObject({
  logs: usageCategory,
  temporary: usageCategory,
  docxCache: usageCategory,
  profiles: usageCategory,
  tmp: usageCategory,
  totalBytes: integerField({ min: 0 }),
  removableBytes: integerField({ min: 0 }),
  active: "boolean",
});
const storageCleanup = exactObject({
  blocked: "boolean",
  reason: nullableField(token()),
  deletedCount: integerField({ min: 0 }),
  failedCount: integerField({ min: 0 }),
  usage: storageUsage,
});

const capabilityState = enumField([
  "ready",
  "not_checked",
  "optional_unconfigured",
  "unavailable",
]);
const capability = exactObject({
  state: capabilityState,
  source: nullableField(text(128, 1)),
  errorCode: nullableField(token()),
  lastCheckedAt: nullableField(text(64, 1)),
  available: optionalField("boolean"),
});
const browserCapability = exactObject({
  state: capabilityState,
  source: nullableField(text(128, 1)),
  errorCode: nullableField(token()),
  lastCheckedAt: nullableField(text(64, 1)),
  available: optionalField("boolean"),
  channel: nullableField(token(64)),
  configured: "boolean",
  probed: "boolean",
});
const diagnosticItem = exactObject({ code: token(), message: text(512, 1) });
const diagnosticSummary = exactObject({
  code: token(),
  category: enumField([
    "validation",
    "authentication",
    "transport",
    "remote",
    "storage",
    "conflict",
    "internal",
  ]),
});
const runtimeEvent = exactObject({
  diagnosticId: token(),
  userMessage: text(256, 1),
  summary: diagnosticSummary,
});
const runtimeEventsObservation = exactObject({
  status: enumField(["complete", "partial"]),
  droppedCount: integerField({ min: 0, max: 100 }),
});
const diagnosticSink = exactObject({
  status: enumField(["ready", "degraded", "not_configured", "unavailable"]),
  startupStatus: token(),
  memoryFailureCount: integerField({ min: 0, max: 1000000 }),
  fileFailureCount: integerField({ min: 0, max: 1000000 }),
  lastFailureCode: nullableField(token()),
});
const runtimeDiagnostics = exactObject({
  ok: "boolean",
  buildInfo: exactObject({
    version: text(128, 1),
    commit: text(128, 1),
    dirty: "boolean",
    source: optionalField(token()),
    observation: optionalField(enumField(["complete", "partial", "fallback", "unavailable"])),
  }),
  browserChannel: browserCapability,
  capabilities: exactObject({
    playwrightNode: capability,
    playwrightCli: capability,
    browserChannel: browserCapability,
    docx: capability,
    hepan: capability,
  }),
  tools: optionalField(exactObject({
    playwrightNode: capability,
    playwrightCli: capability,
    hepanPython: capability,
  })),
  errors: arrayField(diagnosticItem, { max: 100 }),
  warnings: arrayField(diagnosticItem, { max: 100 }),
  runtimeEvents: optionalField(arrayField(runtimeEvent, { max: 100 })),
  runtimeEventsObservation: optionalField(runtimeEventsObservation),
  diagnosticSink: optionalField(diagnosticSink),
});
const browserSmoke = exactObject({
  ok: literalField(true),
  browserChannel: token(64),
  session: literalField("runtime-self-check"),
  capability: optionalField(browserCapability),
});

function errors(domainErrors) {
  return Object.freeze({ ...COMMON_ERRORS, ...domainErrors });
}
function codes(domainErrors) {
  return Object.freeze([...Object.keys(COMMON_ERRORS), ...Object.keys(domainErrors)]);
}
function contract(input, domainErrors) {
  const ownedErrors = errors(domainErrors);
  return defineContract({
    feature: "settings",
    ...input,
    errorCodes: codes(domainErrors),
    errors: ownedErrors,
  });
}

const AI_ERRORS = {
  AI_CONFIG_INVALID: { category: "validation", retryability: "never", userMessage: "AI 配置无效，请检查输入项。" },
  AI_CONFIG_NOT_SET: { category: "validation", retryability: "never", userMessage: "尚未配置 AI 提供方。" },
  AI_CONFIG_BUSY: { category: "conflict", retryability: "safe", userMessage: "生成任务运行期间不能修改 AI 配置。" },
  AI_CONFIG_ENV_OVERRIDE: { category: "conflict", retryability: "never", userMessage: "AI 配置由环境变量管理，当前为只读。" },
  AI_CONFIG_ENCRYPTION_UNAVAILABLE: { category: "storage", retryability: "manual-check", userMessage: "系统加密能力不可用，无法保存 AI 配置。" },
  AI_CONFIG_STORAGE_INVALID: { category: "storage", retryability: "manual-check", userMessage: "AI 配置存储无效，请检查诊断信息。" },
  AI_CONFIG_STORAGE_WRITE_FAILED: { category: "storage", retryability: "safe", userMessage: "AI 配置保存失败，请重试。" },
  AI_CONNECTION_FAILED: { category: "remote", retryability: "safe", userMessage: "AI 连接测试失败，请检查配置。" },
};
const PLATFORM_ERRORS = Object.fromEntries([
  "PLATFORM_CONFIG_INVALID", "PLATFORM_CONFIG_NOT_SET", "PLATFORM_CONFIG_ENV_OVERRIDE",
  "PLATFORM_CONFIG_ENCRYPTION_UNAVAILABLE", "PLATFORM_CONFIG_STORAGE_INVALID",
  "PLATFORM_CONFIG_STORAGE_WRITE_FAILED", "PLATFORM_CONFIG_BUSY",
  "PLATFORM_CONFIG_PLATFORM_NOT_FOUND", "PLATFORM_CONNECTION_FAILED",
  "MEDIA_CONNECTION_FAILED", "MEDIA_HTTP_CONFIRMATION_REQUIRED",
  "HEPAN_REQUEST_INVALID", "HEPAN_CREDENTIALS_INVALID", "HEPAN_PLAN_UNAVAILABLE",
  "HEPAN_QUOTA_EXHAUSTED", "HEPAN_CONTENT_REJECTED", "HEPAN_PUBLISH_DISABLED",
  "HEPAN_RATE_LIMITED", "HEPAN_REMOTE_SERVER_ERROR", "HEPAN_GEO_API_TIMEOUT",
  "HEPAN_GEO_API_UNAVAILABLE", "HEPAN_GEO_API_PROTOCOL_ERROR",
  "PLATFORM_CONFIG_MIGRATION_CONFIRMATION_REQUIRED", "PLATFORM_CONFIG_MIGRATION_UNAVAILABLE",
  "PLATFORM_CONFIG_MIGRATION_FAILED", "HEPAN_COOKIE_IMPORT_INVALID",
].map((code) => [code, {
  category:
    code.includes("GEO_API") || code.includes("REMOTE") || code.includes("RATE")
      ? "remote"
      : code.includes("CONFIG_STORAGE") || code.includes("ENCRYPTION")
        ? "storage"
        : code.includes("BUSY")
          ? "conflict"
          : "validation",
  retryability:
    code.includes("BUSY") ||
    code.includes("TIMEOUT") ||
    code.includes("UNAVAILABLE") ||
    code.includes("REMOTE_SERVER") ||
    code.includes("RATE_LIMITED") ||
    code.includes("WRITE_FAILED")
      ? "safe"
      : "never",
  userMessage: "平台设置操作未完成，请检查配置后重试。",
}]));
Object.assign(PLATFORM_ERRORS, {
  MEDIA_ENDPOINT_REQUIRED: { category: "validation", retryability: "never", userMessage: "尚未配置媒体服务 endpoint。" },
  MEDIA_CONFIG_INVALID: { category: "validation", retryability: "never", userMessage: "媒体服务配置无效，请检查输入项。" },
  MEDIA_HTTP_CONFIRMATION_REQUIRED: { category: "validation", retryability: "never", userMessage: "HTTP 媒体 endpoint 需要显式风险确认。" },
  MEDIA_REDIRECT_REJECTED: { category: "transport", retryability: "never", userMessage: "媒体服务重定向已拒绝。" },
  MEDIA_TLS_CERTIFICATE_ERROR: { category: "transport", retryability: "manual-check", userMessage: "媒体服务 TLS 证书校验失败。" },
  MEDIA_TLS_HOSTNAME_MISMATCH: { category: "transport", retryability: "manual-check", userMessage: "媒体服务 TLS 主机名校验失败。" },
  MEDIA_CONNECT_TIMEOUT: { category: "transport", retryability: "safe", userMessage: "媒体服务连接超时。" },
  MEDIA_READ_TIMEOUT: { category: "transport", retryability: "manual-check", userMessage: "媒体服务读取超时。" },
  MEDIA_NETWORK_ERROR: { category: "transport", retryability: "manual-check", userMessage: "媒体服务网络请求失败。" },
  MEDIA_SERVER_ERROR: { category: "remote", retryability: "safe", userMessage: "媒体服务暂时异常。" },
  MEDIA_REMOTE_REJECTED: { category: "remote", retryability: "never", userMessage: "媒体服务拒绝了请求。" },
  MEDIA_PROTOCOL_ERROR: { category: "transport", retryability: "manual-check", userMessage: "媒体服务响应格式无效。" },
  MEDIA_TRANSPORT_UNAVAILABLE: { category: "internal", retryability: "manual-check", userMessage: "媒体传输能力不可用。" },
});
const STORAGE_ERRORS = {
  STORAGE_MAINTENANCE_BUSY: { category: "conflict", retryability: "safe", userMessage: "任务运行期间不能清理缓存。" },
  STORAGE_MAINTENANCE_INPUT_INVALID: { category: "validation", retryability: "never", userMessage: "存储维护请求无效。" },
  STORAGE_MAINTENANCE_PATH_INVALID: { category: "storage", retryability: "manual-check", userMessage: "存储维护目录无效，请检查诊断信息。" },
  STORAGE_DELETE_FAILED: { category: "storage", retryability: "safe", userMessage: "部分缓存清理失败，请重试。" },
};
const RUNTIME_ERRORS = Object.fromEntries([
  "PLAYWRIGHT_NODE_UNAVAILABLE", "PLAYWRIGHT_CLI_UNAVAILABLE", "BROWSER_CHANNEL_UNAVAILABLE",
  "BROWSER_CHANNEL_INVALID", "PLAYWRIGHT_EXEC_FAILED", "RUNTIME_DIAGNOSTICS_FAILED",
].map((code) => [code, {
  category: "internal",
  retryability: "manual-check",
  userMessage: "运行环境自检未通过，请检查诊断代码。",
}]));

const settingsContracts = Object.freeze([
  contract({ capability: "settings.ai.getStatus", channel: "ai-provider:get-status", kind: "query", request: emptyRequest, success: aiStatus, fromArgs: noArgs, toArgs: noLegacyInput }, AI_ERRORS),
  contract({ capability: "settings.ai.save", channel: "ai-provider:save", kind: "command", request: aiSaveRequest, success: aiStatus, fromArgs: directArgs, toArgs: directInput }, AI_ERRORS),
  contract({ capability: "settings.ai.test", channel: "ai-provider:test", kind: "command", request: aiTestRequest, success: testResult, fromArgs: directArgs, toArgs: directInput }, AI_ERRORS),
  contract({ capability: "settings.ai.clear", channel: "ai-provider:clear", kind: "command", request: emptyRequest, success: exactObject({ cleared: "boolean" }), fromArgs: noArgs, toArgs: noLegacyInput }, AI_ERRORS),
  contract({ capability: "settings.platform.getStatus", channel: "platform-settings:get-status", kind: "query", request: platformQueryRequest, success: platformStatusResult, fromArgs: platformArgs, toArgs: directInput }, PLATFORM_ERRORS),
  contract({ capability: "settings.platform.save", channel: "platform-settings:save", kind: "command", request: platformMutationRequest, success: platformStatusResult, fromArgs: platformArgs, toArgs: directInput }, PLATFORM_ERRORS),
  contract({ capability: "settings.platform.test", channel: "platform-settings:test", kind: "command", request: platformTestRequest, success: platformTestResult, fromArgs: platformArgs, toArgs: directInput }, PLATFORM_ERRORS),
  contract({ capability: "settings.platform.clear", channel: "platform-settings:clear", kind: "command", request: platformQueryRequest, success: platformClearResult, fromArgs: platformArgs, toArgs: directInput }, PLATFORM_ERRORS),
  contract({ capability: "settings.platform.getLegacyStatus", channel: "platform-settings:get-legacy-status", kind: "query", request: emptyRequest, success: legacyStatus, fromArgs: noArgs, toArgs: noLegacyInput }, PLATFORM_ERRORS),
  contract({ capability: "settings.platform.importLegacy", channel: "platform-settings:import-legacy", kind: "command", request: exactObject({ confirmed: literalField(true) }), success: legacyImportResult, fromArgs: directArgs, toArgs: directInput }, PLATFORM_ERRORS),
  contract({ capability: "settings.storage.getUsage", channel: "storage-maintenance:get-usage", kind: "query", request: emptyRequest, success: storageUsage, fromArgs: noArgs, toArgs: noLegacyInput }, STORAGE_ERRORS),
  contract({ capability: "settings.storage.cleanCaches", channel: "storage-maintenance:clean-caches", kind: "command", request: emptyRequest, success: storageCleanup, fromArgs: noArgs, toArgs: noLegacyInput }, STORAGE_ERRORS),
  contract({ capability: "settings.runtime.getDiagnostics", channel: "runtime-diagnostics:get", kind: "query", request: emptyRequest, success: runtimeDiagnostics, fromArgs: noArgs, toArgs: noLegacyInput }, RUNTIME_ERRORS),
  contract({ capability: "settings.runtime.browserSmoke", channel: "runtime-diagnostics:browser-smoke", kind: "command", request: emptyRequest, success: browserSmoke, fromArgs: noArgs, toArgs: noLegacyInput }, RUNTIME_ERRORS),
]);

module.exports = {
  settingsContracts,
  storageUsage,
};
