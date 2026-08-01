const {
  createContractRegistry,
  defineContract,
  exactObject,
  stringField,
  integerField,
} = require("./registry");
const { workspaceContracts } = require("./workspace-contracts");
const { settingsContracts } = require("./settings-contracts");
const { mediaContracts } = require("./media-contracts");
const { platformContracts } = require("./platform-contracts");
const { contentCoreContracts } = require("./content-core-contracts");
const { generationContracts } = require("./generation-contracts");
const { contentOperationsContracts } = require("./content-operations-contracts");
const { publicationContracts } = require("./publication-contracts");

const safeText = (max, min) =>
  stringField({ max, min, pattern: /^[^\x00-\x1f\x7f\\/]*$/u });
const emptyRequest = exactObject({});
const noArgs = () => ({});
const noLegacyInput = () => [undefined];

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
};

const GENERATION_EVENT_FIELDS = [
  "runtimeId", "sequence", "batchId", "taskId", "clientId", "platform",
  "templateId", "status", "counts", "error", "updatedAt", "batch", "capabilities",
];
const GENERATION_STATUSES = new Set([
  "idle", "pending", "running", "pausing", "paused", "paused_configuration",
  "stopping", "stopped", "completed", "failed", "interrupted", "cancelled", "succeeded",
]);

function generationEventError() {
  const error = new Error("Generation event is invalid");
  error.code = "IPC_EVENT_INVALID";
  throw error;
}

function exactKeys(value, allowed, required) {
  if (!value || typeof value !== "object" || Array.isArray(value)) generationEventError();
  if (Object.keys(value).some((key) => !allowed.includes(key))) generationEventError();
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) generationEventError();
  return value;
}

function generationText(value, max) {
  if (typeof value !== "string" || !value || value.length > max || /[\x00-\x1f\x7f\\/]/.test(value)) generationEventError();
  return value;
}

function generationOptionalText(value, max) {
  return value === undefined || value === null ? value : generationText(value, max);
}

function generationStringArray(value, maxItems) {
  if (!Array.isArray(value) || value.length > maxItems) generationEventError();
  return value.map((item) => generationText(item, 200));
}

function generationCounts(value) {
  if (value === null) return null;
  exactKeys(value, ["total", "succeeded", "failed", "pending", "interrupted", "cancelled"], ["total", "succeeded", "failed", "pending", "interrupted", "cancelled"]);
  const output = {};
  for (const key of ["total", "succeeded", "failed", "pending", "interrupted", "cancelled"]) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > 100000) generationEventError();
    output[key] = value[key];
  }
  return output;
}

function generationTask(value) {
  const allowed = ["id", "clientId", "platform", "templateId", "materialIds", "researchQueryIds", "status", "attempts", "error", "articleId"];
  exactKeys(value, allowed, ["id", "clientId", "platform", "templateId", "materialIds", "researchQueryIds", "status", "attempts"]);
  if (!GENERATION_STATUSES.has(value.status) || !Number.isSafeInteger(value.attempts) || value.attempts < 0 || value.attempts > 1000) generationEventError();
  const task = {
    id: generationText(value.id, 200),
    clientId: generationText(value.clientId, 200),
    platform: generationText(value.platform, 100),
    templateId: generationText(value.templateId, 200),
    materialIds: generationStringArray(value.materialIds, 1000),
    researchQueryIds: generationStringArray(value.researchQueryIds, 1000),
    status: value.status,
    attempts: value.attempts,
  };
  if (value.articleId !== undefined) task.articleId = generationOptionalText(value.articleId, 200);
  if (value.error !== undefined && value.error !== null) {
    exactKeys(value.error, ["code", "message"], []);
    task.error = {
      code: generationText(typeof value.error.code === "string" ? value.error.code : "GENERATION_TASK_FAILED", 128),
      message: "生成任务失败，请检查诊断信息。",
    };
  } else if (value.error === null) task.error = null;
  return task;
}

function generationBatch(value) {
  if (value === undefined || value === null) return value;
  const allowed = ["id", "status", "clientSources", "templates", "tasks", "counts", "excludedClients", "aiConfigFingerprint", "updatedAt"];
  exactKeys(value, allowed, ["id", "status", "clientSources", "templates", "tasks", "counts"]);
  if (!GENERATION_STATUSES.has(value.status) || !Array.isArray(value.clientSources) || value.clientSources.length > 1000 ||
      !Array.isArray(value.templates) || value.templates.length > 1000 || !Array.isArray(value.tasks) || value.tasks.length > 10000) generationEventError();
  const output = {
    id: generationText(value.id, 200),
    status: value.status,
    clientSources: value.clientSources.map((item) => {
      exactKeys(item, ["clientId", "materialIds", "researchQueryIds"], ["clientId", "materialIds", "researchQueryIds"]);
      return { clientId: generationText(item.clientId, 200), materialIds: generationStringArray(item.materialIds, 1000), researchQueryIds: generationStringArray(item.researchQueryIds, 1000) };
    }),
    templates: value.templates.map((item) => {
      exactKeys(item, ["platform", "templateId"], ["platform", "templateId"]);
      return { platform: generationText(item.platform, 100), templateId: generationText(item.templateId, 200) };
    }),
    tasks: value.tasks.map(generationTask),
    counts: generationCounts(value.counts),
  };
  if (value.excludedClients !== undefined) {
    if (!Array.isArray(value.excludedClients) || value.excludedClients.length > 1000) generationEventError();
    output.excludedClients = value.excludedClients.map((item) => {
    exactKeys(item, ["clientId", "codes"], ["clientId", "codes"]);
    return { clientId: generationText(item.clientId, 200), codes: generationStringArray(item.codes, 100) };
    });
  }
  if (value.updatedAt !== undefined) output.updatedAt = generationText(value.updatedAt, 64);
  return output;
}

function generationCapabilities(value) {
  if (value === undefined) return undefined;
  exactKeys(value, ["canResume", "canContinue", "canRetry", "canCancel"], []);
  const output = {};
  for (const key of ["canResume", "canContinue", "canRetry", "canCancel"]) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== "boolean") generationEventError();
      output[key] = value[key];
    }
  }
  return output;
}

function validateGenerationRuntimeEvent(value) {
  exactKeys(value, GENERATION_EVENT_FIELDS, ["runtimeId", "sequence", "batchId", "status", "counts", "updatedAt"]);
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 0 || !GENERATION_STATUSES.has(value.status)) generationEventError();
  const output = {
    runtimeId: generationText(value.runtimeId, 128),
    sequence: value.sequence,
    batchId: generationOptionalText(value.batchId, 200),
    status: value.status,
    counts: generationCounts(value.counts),
    updatedAt: generationText(value.updatedAt, 64),
  };
  for (const key of ["taskId", "clientId", "platform", "templateId"]) {
    if (value[key] !== undefined) output[key] = generationOptionalText(value[key], 200);
  }
  if (value.error !== undefined) {
    if (value.error === null) output.error = null;
    else {
      exactKeys(value.error, ["code", "message"], []);
      output.error = { code: generationText(value.error.code || "GENERATION_TASK_FAILED", 128), message: "生成任务失败，请检查诊断信息。" };
    }
  }
  if (value.batch !== undefined) output.batch = generationBatch(value.batch);
  if (output.batch && output.batch.id !== output.batchId) generationEventError();
  if (value.capabilities !== undefined) output.capabilities = generationCapabilities(value.capabilities);
  return output;
}

const contracts = [
  ...workspaceContracts,
  ...settingsContracts,
  ...mediaContracts,
  ...platformContracts,
  ...contentCoreContracts,
  ...generationContracts,
  ...contentOperationsContracts,
  ...publicationContracts,
  defineContract({
    capability: "workspace.getRuntimeIdentity",
    channel: "workspace:get-runtime-identity",
    feature: "workspace",
    kind: "query",
    request: emptyRequest,
    success: exactObject({
      workspaceRuntimeId: stringField({ max: 128, pattern: /^[A-Za-z0-9._:-]+$/ }),
      revision: integerField({ min: 0 }),
    }),
    fromArgs: noArgs,
    toArgs: noLegacyInput,
    errorCodes: [
      "AUTH_REQUIRED",
      "IPC_REQUEST_INVALID",
      "IPC_RESULT_INVALID",
      "IPC_INTERNAL",
    ],
    errors: {
      ...COMMON_ERRORS,
      IPC_INTERNAL: {
        category: "internal",
        retryability: "manual-check",
        userMessage: "无法读取当前工作区运行身份，请刷新后重试。",
      },
    },
  }),
  defineContract({
    capability: "media.getBalance",
    channel: "media:get-balance",
    feature: "media",
    kind: "query",
    request: emptyRequest,
    success: exactObject({ balance: safeText(128, 0) }),
    fromArgs: noArgs,
    toArgs: noLegacyInput,
    errorCodes: [
      "AUTH_REQUIRED",
      "MEDIA_CONFIG_NOT_SET",
      "IPC_REQUEST_INVALID",
      "IPC_RESULT_INVALID",
      "IPC_INTERNAL",
    ],
    errors: {
      ...COMMON_ERRORS,
      MEDIA_CONFIG_NOT_SET: {
        category: "validation",
        retryability: "never",
        userMessage: "请先配置付费媒体服务。",
      },
      IPC_INTERNAL: {
        category: "internal",
        retryability: "manual-check",
        userMessage: "操作未能安全完成，请稍后重试或检查诊断信息。",
      },
    },
  }),
  defineContract({
    capability: "generation.runtimeChanged",
    channel: "content:generation-batch-state",
    feature: "generation",
    kind: "event",
    event: exactObject({}),
    eventFields: GENERATION_EVENT_FIELDS,
    validateEvent: validateGenerationRuntimeEvent,
    errorCodes: [],
  }),
  defineContract({
    capability: "workspace.invalidated",
    channel: "workspace:data-invalidated",
    feature: "workspace",
    kind: "event",
    event: exactObject({
      workspaceRuntimeId: stringField({ max: 128 }),
      revision: integerField({ min: 1 }),
      scopes: { arrayOf: stringField({ max: 64 }), max: 32 },
      reasonCode: stringField({ max: 128 }),
    }),
    errorCodes: [],
  }),
];

const productionIpcRegistry = createContractRegistry(contracts);

module.exports = { productionIpcRegistry, COMMON_ERRORS };
