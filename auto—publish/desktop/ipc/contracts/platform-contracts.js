const {
  defineContract,
  exactObject,
  stringField,
  integerField,
  optionalField,
  nullableField,
  literalField,
  enumField,
  arrayField,
} = require("./registry");
const {
  TYPED_PLATFORM_OUTCOMES,
  PLATFORM_RESULT_STATUSES,
  projectPlatformQueue,
  projectPlatformSnapshot,
} = require("../../application/read-models/platform-read-model");

const safeText = (max, min = 0) =>
  stringField({ max, min, pattern: /^[^\x00-\x1f\x7f]*$/u });
const identifier = stringField({
  max: 256,
  min: 1,
  pattern: /^[A-Za-z0-9._:-]+$/u,
});
const filename = stringField({
  max: 255,
  min: 1,
  pattern: /^[^\\/\x00-\x1f\x7f]+$/u,
});
const emptyRequest = exactObject({});
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
  PLATFORM_LOGIN_INPUT_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "平台登录请求无效。",
  },
  PLATFORM_LOGIN_UNAVAILABLE: {
    category: "transport",
    retryability: "manual-check",
    userMessage: "该平台当前不支持浏览器登录检查。",
  },
  SUBMISSION_INPUT_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "投稿输入无效，请重新选择稿件和平台。",
  },
  ACCOUNT_PROFILE_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "请先绑定明确的平台账号档案。",
  },
  ACCOUNT_PROFILE_CONFIRMATION_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "确认平台账号档案后才能继续。",
  },
  ACCOUNT_PROFILE_QUERY_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "平台账号档案查询无效。",
  },
  PUBLICATION_WORKFLOW_UNAVAILABLE: {
    category: "transport",
    retryability: "manual-check",
    userMessage: "投稿工作流当前不可用，请检查诊断信息。",
  },
  PLATFORM_RUN_ACTIVE: {
    category: "conflict",
    retryability: "safe",
    userMessage: "已有平台投稿任务正在运行。",
  },
  PLATFORM_RUN_MISMATCH: {
    category: "conflict",
    retryability: "safe",
    userMessage: "投稿任务已变化，请刷新任务状态。",
  },
  HEPAN_CONFIG_NOT_SET: {
    category: "validation",
    retryability: "never",
    userMessage: "请先配置蓝色河畔投稿服务。",
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
    errors: Object.fromEntries(errorCodes.map((code) => [code, COMMON_ERRORS[code]])),
  };
}

function contract(input, codes = []) {
  return defineContract({
    feature: "platform",
    ...input,
    ...errors(...codes),
  });
}

function noArgs() {
  return {};
}

function noLegacyInput() {
  return [undefined];
}

const task = exactObject({
  sourcePlatformId: safeText(128),
  filename,
  targetPlatformId: safeText(128),
});

const terminalResultItem = exactObject({
  task,
  status: enumField(PLATFORM_RESULT_STATUSES),
  publicationStatus: nullableField(enumField(TYPED_PLATFORM_OUTCOMES)),
  errorCode: nullableField(safeText(128)),
});

const terminalResult = exactObject({
  ok: integerField({ min: 0, max: 100000 }),
  fail: integerField({ min: 0, max: 100000 }),
  skipped: integerField({ min: 0, max: 100000 }),
  uncertain: integerField({ min: 0, max: 100000 }),
  results: arrayField(terminalResultItem, { max: 100000 }),
});

const snapshot = exactObject({
  workspaceRuntimeId: identifier,
  runId: nullableField(identifier),
  phase: enumField([
    "idle",
    "running",
    "waiting-interval",
    "stopping",
    "paused",
    "completed",
    "failed",
    "stopped",
    "interrupted",
  ]),
  total: integerField({ min: 0, max: 100000 }),
  processed: integerField({ min: 0, max: 100000 }),
  succeeded: integerField({ min: 0, max: 100000 }),
  failed: integerField({ min: 0, max: 100000 }),
  skipped: integerField({ min: 0, max: 100000 }),
  uncertain: integerField({ min: 0, max: 100000 }),
  currentTask: nullableField(task),
  nextTask: nullableField(task),
  waitRemainingMs: integerField({ min: 0, max: 86400000 }),
  startedAt: nullableField(safeText(64)),
  updatedAt: nullableField(safeText(64)),
  terminalResult: nullableField(terminalResult),
  isBatchRunning: "boolean",
  isStopPending: "boolean",
  isPlatformRunning: "boolean",
  queueRevision: nullableField(integerField({ min: 0 })),
});

const accountProfile = exactObject({
  accountProfileId: identifier,
  platformId: identifier,
  displayName: safeText(256, 1),
  createdAt: optionalField(safeText(64)),
});

const platformContracts = [
  contract({
    capability: "platform.getQueue",
    channel: "platforms:get-queue",
    kind: "query",
    request: emptyRequest,
    success: exactObject({
      revision: optionalField(integerField({ min: 0 })),
      platforms: arrayField(
        exactObject({ id: identifier, loginAvailable: "boolean" }),
        { max: 32 },
      ),
      queue: arrayField(
        exactObject({
          filename,
          title: safeText(1000),
          platformId: identifier,
          sourcePlatformId: identifier,
          sourceArticleState: nullableField(safeText(64)),
          reasonCode: nullableField(safeText(128)),
          accountProfileId: safeText(256),
          archiveErrorCode: nullableField(safeText(128)),
          remoteStatus: nullableField(enumField(TYPED_PLATFORM_OUTCOMES)),
        }),
        { max: 100000 },
      ),
    }),
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  contract(
    {
      capability: "platform.listAccountProfiles",
      channel: "platforms:list-account-profiles",
      kind: "query",
      request: emptyRequest,
      success: exactObject({
        profiles: arrayField(accountProfile, { max: 1000 }),
      }),
      fromArgs: noArgs,
      toArgs: noLegacyInput,
    },
    ["ACCOUNT_PROFILE_QUERY_INVALID"],
  ),
  contract(
    {
      capability: "platform.confirmAccountProfile",
      channel: "platforms:confirm-account-profile",
      kind: "command",
      request: exactObject({
        platformId: identifier,
        displayName: safeText(256, 1),
        confirmed: literalField(true),
      }),
      success: exactObject({ profile: accountProfile }),
      fromArgs: (args) => args[0],
      toArgs: (payload) => [payload],
    },
    ["ACCOUNT_PROFILE_CONFIRMATION_REQUIRED"],
  ),
  contract(
    {
      capability: "platform.openLogin",
      channel: "platforms:open-login",
      kind: "command",
      request: exactObject({ platformId: identifier }),
      success: exactObject({
        platformId: identifier,
        status: enumField(["opened"]),
      }),
      fromArgs: (args) => ({ platformId: args[0] }),
      toArgs: (payload) => [payload],
    },
    ["PLATFORM_LOGIN_INPUT_INVALID", "PLATFORM_LOGIN_UNAVAILABLE"],
  ),
  contract(
    {
      capability: "platform.checkLogin",
      channel: "platforms:check-login",
      kind: "query",
      request: exactObject({ platformId: identifier }),
      success: exactObject({
        platformId: identifier,
        authenticated: "boolean",
      }),
      fromArgs: (args) => ({ platformId: args[0] }),
      toArgs: (payload) => [payload],
    },
    ["PLATFORM_LOGIN_INPUT_INVALID", "PLATFORM_LOGIN_UNAVAILABLE"],
  ),
  contract(
    {
      capability: "platform.pauseSubmit",
      channel: "platforms:pause-submit",
      kind: "command",
      request: exactObject({ runId: nullableField(identifier) }),
      success: exactObject({ accepted: "boolean", alreadyStopped: "boolean" }),
      fromArgs: (args) => ({ runId: args[0] || null }),
      toArgs: (payload) => [{ runId: payload.runId }],
    },
    ["PLATFORM_RUN_MISMATCH"],
  ),
  contract(
    {
      capability: "platform.stopSubmit",
      channel: "platforms:stop-submit",
      kind: "command",
      request: exactObject({ runId: nullableField(identifier) }),
      success: exactObject({ accepted: "boolean", alreadyStopped: "boolean" }),
      fromArgs: (args) => ({ runId: args[0] || null }),
      toArgs: (payload) => [{ runId: payload.runId }],
    },
    ["PLATFORM_RUN_MISMATCH"],
  ),
  contract({
    capability: "platform.getState",
    channel: "platforms:get-state",
    kind: "query",
    request: emptyRequest,
    success: snapshot,
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  defineContract({
    capability: "platform.stateChanged",
    channel: "platform-state",
    feature: "platform",
    kind: "event",
    event: snapshot,
    errorCodes: [],
  }),
];

module.exports = {
  platformContracts,
  projectPlatformQueue,
  projectPlatformSnapshot,
};
