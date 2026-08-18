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
  ACCOUNT_PROFILE_BIND_CONFIRMATION_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "确认后才能绑定当前平台账号。",
  },
  ACCOUNT_PROFILE_DELETE_CONFIRMATION_REQUIRED: {
    category: "validation",
    retryability: "never",
    userMessage: "确认删除平台账号档案后才能继续。",
  },
  ACCOUNT_PROFILE_NOT_FOUND: {
    category: "conflict",
    retryability: "safe",
    userMessage: "平台账号档案已不存在，请刷新后重试。",
  },
  ACCOUNT_PROFILE_IN_USE: {
    category: "conflict",
    retryability: "never",
    userMessage: "该账号档案仍有投稿队列或活动发布目标，不能删除。",
  },
  ACCOUNT_PROFILE_REMOTE_MISMATCH: {
    category: "authentication",
    retryability: "never",
    userMessage: "当前登录账号与该档案已绑定账号不一致，请切换回原账号或新建档案。",
  },
  PLATFORM_ACCOUNT_IDENTITY_UNAVAILABLE: {
    category: "authentication",
    retryability: "manual-check",
    userMessage: "无法读取当前平台登录身份，请先检查登录并保存会话。",
  },
  PLATFORM_ACCOUNT_IDENTITY_UNVERIFIED: {
    category: "authentication",
    retryability: "manual-check",
    userMessage: "当前平台登录身份未通过验证，请重新登录后检查。",
  },
  PLATFORM_ACCOUNT_BINDING_STORAGE_UNAVAILABLE: {
    category: "storage",
    retryability: "manual-check",
    userMessage: "账号绑定存储当前不可用，请检查本机数据目录。",
  },
  PLATFORM_ACCOUNT_BINDING_STORAGE_INVALID: {
    category: "storage",
    retryability: "manual-check",
    userMessage: "账号绑定数据异常，请先检查诊断信息。",
  },
  ACCOUNT_PROFILE_CREATE_NEEDS_REPAIR: {
    category: "storage",
    retryability: "manual-check",
    userMessage: "账号档案创建未能完整回滚，请刷新并检查诊断信息。",
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

const accountProfile = exactObject({
  accountProfileId: identifier,
  platformId: identifier,
  displayName: safeText(256, 1),
  createdAt: optionalField(safeText(64)),
  bindingStatus: enumField(["bound", "unbound"]),
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
        exactObject({
          id: identifier,
          displayName: safeText(160, 1),
          loginAvailable: "boolean",
        }),
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
    [
      "ACCOUNT_PROFILE_CONFIRMATION_REQUIRED",
      "PLATFORM_ACCOUNT_IDENTITY_UNAVAILABLE",
      "PLATFORM_ACCOUNT_IDENTITY_UNVERIFIED",
      "PLATFORM_ACCOUNT_BINDING_STORAGE_UNAVAILABLE",
      "PLATFORM_ACCOUNT_BINDING_STORAGE_INVALID",
      "ACCOUNT_PROFILE_CREATE_NEEDS_REPAIR",
    ],
  ),
  contract(
    {
      capability: "platform.bindAccountProfile",
      channel: "platforms:bind-account-profile",
      kind: "command",
      request: exactObject({
        accountProfileId: identifier,
        confirmed: literalField(true),
      }),
      success: exactObject({ profile: accountProfile }),
      fromArgs: (args) => args[0],
      toArgs: (payload) => [payload],
    },
    [
      "ACCOUNT_PROFILE_BIND_CONFIRMATION_REQUIRED",
      "ACCOUNT_PROFILE_NOT_FOUND",
      "ACCOUNT_PROFILE_REMOTE_MISMATCH",
      "PLATFORM_ACCOUNT_IDENTITY_UNAVAILABLE",
      "PLATFORM_ACCOUNT_IDENTITY_UNVERIFIED",
      "PLATFORM_ACCOUNT_BINDING_STORAGE_UNAVAILABLE",
      "PLATFORM_ACCOUNT_BINDING_STORAGE_INVALID",
    ],
  ),
  contract(
    {
      capability: "platform.deleteAccountProfile",
      channel: "platforms:delete-account-profile",
      kind: "command",
      request: exactObject({
        accountProfileId: identifier,
        confirmed: literalField(true),
      }),
      success: exactObject({ accountProfileId: identifier }),
      fromArgs: (args) => args[0],
      toArgs: (payload) => [payload],
    },
    [
      "ACCOUNT_PROFILE_DELETE_CONFIRMATION_REQUIRED",
      "ACCOUNT_PROFILE_NOT_FOUND",
      "ACCOUNT_PROFILE_IN_USE",
    ],
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
];

module.exports = {
  platformContracts,
  projectPlatformQueue,
};
