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
  status: safeText(64, 1),
  publicationStatus: nullableField(safeText(64)),
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

const submissionBinding = exactObject({
  platformId: identifier,
  accountProfileId: identifier,
});

const submission = exactObject({
  sourcePlatformId: identifier,
  filename,
  targetPlatformIds: arrayField(identifier, { min: 1, max: 32 }),
  accountProfiles: arrayField(submissionBinding, { min: 1, max: 32 }),
});

const submitResultItem = exactObject({
  task,
  status: safeText(64, 1),
  publicationStatus: nullableField(safeText(64)),
  errorCode: nullableField(safeText(128)),
  archiveErrorCode: nullableField(safeText(128)),
});

const trashSummary = exactObject({
  offeredCount: integerField({ min: 0, max: 100000 }),
  requestedCount: integerField({ min: 0, max: 100000 }),
  movedCount: integerField({ min: 0, max: 100000 }),
  recoveryCount: integerField({ min: 0, max: 100000 }),
  blockedCount: integerField({ min: 0, max: 100000 }),
  failedCount: integerField({ min: 0, max: 100000 }),
  reasonCodes: arrayField(safeText(128, 1), { max: 1000 }),
});

function submissionsFromArgs(args) {
  const input = args[0] || {};
  return {
    submissions: (Array.isArray(input) ? input : input.submissions || []).map(
      (value) => ({
        sourcePlatformId: value.sourcePlatformId,
        filename: value.filename,
        targetPlatformIds: value.targetPlatformIds,
        accountProfiles: Object.keys(value.accountProfiles || {}).map(
          (platformId) => ({
            platformId,
            accountProfileId: value.accountProfiles[platformId],
          }),
        ),
      }),
    ),
    autoTrash: input.autoTrash === true,
  };
}

function submissionsToArgs(payload) {
  return [
    {
      submissions: payload.submissions.map((value) => ({
        sourcePlatformId: value.sourcePlatformId,
        filename: value.filename,
        targetPlatformIds: value.targetPlatformIds,
        accountProfiles: Object.fromEntries(
          value.accountProfiles.map((binding) => [
            binding.platformId,
            binding.accountProfileId,
          ]),
        ),
      })),
      autoTrash: payload.autoTrash,
    },
  ];
}

function safeErrorCode(value, fallback) {
  const candidate =
    typeof value === "string"
      ? value
      : value && typeof value.code === "string"
        ? value.code
        : null;
  return candidate && /^[A-Z0-9_.:-]{1,128}$/.test(candidate)
    ? candidate
    : fallback;
}

function projectTask(value) {
  const taskValue = value || {};
  return {
    sourcePlatformId: String(taskValue.sourcePlatformId || ""),
    filename: String(taskValue.filename || ""),
    targetPlatformId: String(taskValue.targetPlatformId || ""),
  };
}

function projectTerminalResult(value) {
  if (!value || typeof value !== "object") return null;
  return {
    ok: Number.isSafeInteger(value.ok) && value.ok >= 0 ? value.ok : 0,
    fail: Number.isSafeInteger(value.fail) && value.fail >= 0 ? value.fail : 0,
    skipped:
      Number.isSafeInteger(value.skipped) && value.skipped >= 0
        ? value.skipped
        : 0,
    uncertain:
      Number.isSafeInteger(value.uncertain) && value.uncertain >= 0
        ? value.uncertain
        : 0,
    results: (Array.isArray(value.results) ? value.results : []).map((item) => ({
      task: projectTask(item && item.task),
      status: String((item && item.status) || "failed"),
      publicationStatus:
        item && typeof item.publicationStatus === "string"
          ? item.publicationStatus
          : null,
      errorCode: safeErrorCode(item && item.error, null),
    })),
  };
}

function projectPlatformSnapshot(value) {
  const input = value || {};
  const integer = (candidate) =>
    Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : 0;
  return {
    workspaceRuntimeId: typeof input.workspaceRuntimeId === "string" && /^[A-Za-z0-9._:-]{1,256}$/.test(input.workspaceRuntimeId)
      ? input.workspaceRuntimeId
      : "runtime-unavailable",
    runId: typeof input.runId === "string" && input.runId ? input.runId : null,
    phase: typeof input.phase === "string" && input.phase ? input.phase : "idle",
    total: integer(input.total),
    processed: integer(input.processed),
    succeeded: integer(input.succeeded),
    failed: integer(input.failed),
    skipped: integer(input.skipped),
    uncertain: integer(input.uncertain),
    currentTask: input.currentTask ? projectTask(input.currentTask) : null,
    nextTask: input.nextTask ? projectTask(input.nextTask) : null,
    waitRemainingMs: integer(input.waitRemainingMs),
    startedAt: typeof input.startedAt === "string" ? input.startedAt : null,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : null,
    terminalResult: projectTerminalResult(input.terminalResult),
    isBatchRunning: input.isBatchRunning === true,
    isStopPending: input.isStopPending === true,
    isPlatformRunning: input.isPlatformRunning === true,
    queueRevision:
      Number.isSafeInteger(input.queueRevision) && input.queueRevision >= 0
        ? input.queueRevision
        : null,
  };
}

function projectPlatformQueue(value) {
  const input = value || {};
  const result = {
    platforms: (Array.isArray(input.platforms) ? input.platforms : []).map(
      (platform) => ({
        id: String((platform && platform.id) || ""),
        loginAvailable: platform && platform.loginAvailable === true,
      }),
    ),
    queue: (Array.isArray(input.queue) ? input.queue : []).map((article) => ({
      filename: String((article && article.filename) || ""),
      title: String((article && article.title) || ""),
      platformId: String((article && article.platformId) || ""),
      sourcePlatformId: String((article && article.sourcePlatformId) || ""),
      sourceArticleState:
        article && typeof article.sourceArticleState === "string"
          ? article.sourceArticleState
          : null,
      reasonCode:
        article && typeof article.reasonCode === "string"
          ? article.reasonCode
          : null,
      accountProfileId: String((article && article.accountProfileId) || ""),
      archiveErrorCode: article && article.archiveError
        ? safeErrorCode(article.archiveError, "ARCHIVE_FAILED")
        : null,
      remoteStatus:
        article && typeof article.remoteStatus === "string"
          ? article.remoteStatus
          : null,
    })),
  };
  if (Number.isSafeInteger(input.revision) && input.revision >= 0)
    result.revision = input.revision;
  return result;
}

function projectPlatformSubmitResult(value) {
  const input = value || {};
  const integer = (candidate) =>
    Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : 0;
  const summary = input.trashSummary || {};
  return {
    ok: integer(input.ok),
    fail: integer(input.fail),
    uncertain: integer(input.uncertain),
    skipped: integer(input.skipped),
    results: (Array.isArray(input.results) ? input.results : []).map((item) => ({
      task: projectTask(item && item.task),
      status: String((item && item.status) || "failed"),
      publicationStatus:
        item && typeof item.publicationStatus === "string"
          ? item.publicationStatus
          : null,
      errorCode: item && item.error ? safeErrorCode(item.error, "PLATFORM_TASK_FAILED") : null,
      archiveErrorCode:
        item && item.archiveError
          ? safeErrorCode(item.archiveError, "ARCHIVE_FAILED")
          : null,
    })),
    archiveSummary: {
      attempted: integer(input.archiveSummary && input.archiveSummary.attempted),
      succeeded: integer(input.archiveSummary && input.archiveSummary.succeeded),
      failed: integer(input.archiveSummary && input.archiveSummary.failed),
    },
    trashDisposition: [
      "keep_local",
      "offer_trash",
      "auto_trash_requested",
      "auto_trash_blocked",
    ].includes(input.trashDisposition)
      ? input.trashDisposition
      : "keep_local",
    trashSummary: {
      offeredCount: integer(summary.offeredCount),
      requestedCount: integer(summary.requestedCount),
      movedCount: integer(summary.movedCount),
      recoveryCount: integer(summary.recoveryCount),
      blockedCount: integer(summary.blockedCount),
      failedCount: integer(summary.failedCount),
      reasonCodes: (Array.isArray(summary.reasonCodes) ? summary.reasonCodes : [])
        .map((code) => safeErrorCode(code, null))
        .filter(Boolean),
    },
  };
}

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
          remoteStatus: nullableField(safeText(64)),
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
  projectPlatformSubmitResult,
};
