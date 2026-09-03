const {
  arrayField,
  defineContract,
  enumField,
  exactObject,
  integerField,
  literalField,
  nullableField,
  optionalField,
  stringField,
} = require("./registry");

const text = (max, min = 0) =>
  stringField({ min, max, pattern: /^[^\x00-\x1f\x7f\\/]*$/u });
const displayText = (max, min = 1) =>
  stringField({ min, max, pattern: /^[^\x00-\x1f\x7f]*$/u });
const id = stringField({
  min: 1,
  max: 200,
  pattern: /^(?!\.{1,2}$)(?!.*[<>:"|?*\\/])(?=\S)[^\x00-\x1f\x7f]*[^\s.]$/u,
});
const code = stringField({ min: 1, max: 128, pattern: /^[A-Z][A-Z0-9_]*$/u });
const timestamp = text(64, 1);
const emptyRequest = exactObject({});
const noArgs = () => ({});
const noLegacyInput = () => [undefined];
const directArgs = (args) => args[0] || {};
const directInput = (payload) => [payload];

const template = exactObject({ platform: id, templateId: id });
const source = exactObject({
  clientId: id,
  materialIds: arrayField(id, { min: 1, max: 50 }),
  researchQueryIds: arrayField(id, { min: 1, max: 50 }),
});
const GENERATION_TASK_PAGE_SIZE = 256;
const excludedClient = exactObject({
  clientId: id,
  codes: arrayField(code, { min: 1, max: 64 }),
});
const counts = exactObject({
  total: integerField({ min: 0, max: 100000 }),
  succeeded: integerField({ min: 0, max: 100000 }),
  failed: integerField({ min: 0, max: 100000 }),
  pending: integerField({ min: 0, max: 100000 }),
  interrupted: integerField({ min: 0, max: 100000 }),
  cancelled: integerField({ min: 0, max: 100000 }),
});
const task = exactObject({
  id,
  clientId: id,
  platform: id,
  templateId: id,
  materialIds: arrayField(id, { max: 50 }),
  researchQueryIds: arrayField(id, { max: 50 }),
  status: enumField(["pending", "running", "succeeded", "failed", "interrupted", "cancelled"]),
  attempts: integerField({ min: 0, max: 1000 }),
  error: optionalField(nullableField(exactObject({
    code,
    message: literalField("生成任务失败，请检查诊断信息。"),
  }))),
  articleId: optionalField(nullableField(id)),
  articleTitle: optionalField(displayText(300)),
  createdAt: optionalField(timestamp),
  updatedAt: optionalField(timestamp),
});
const batch = exactObject({
  version: optionalField(literalField(1)),
  id,
  concurrency: optionalField(integerField({ min: 1, max: 4 })),
  status: enumField([
    "pending", "running", "pausing", "paused",
    "interrupted", "paused_configuration", "completed", "failed", "abandoned",
  ]),
  createdAt: optionalField(timestamp),
  updatedAt: optionalField(timestamp),
  aiConfigFingerprint: optionalField(text(256, 1)),
  clientSources: arrayField(source, { max: 1000 }),
  templates: arrayField(template, { max: 1000 }),
  tasks: arrayField(task, { max: GENERATION_TASK_PAGE_SIZE }),
  taskCount: optionalField(integerField({ min: 0, max: 10000 })),
  taskOffset: optionalField(integerField({ min: 0, max: 10000 })),
  tasksTruncated: optionalField("boolean"),
  counts,
  excludedClients: optionalField(arrayField(excludedClient, { max: 1000 })),
});

const planRequest = exactObject({
  clientIds: arrayField(id, { min: 1, max: 1000 }),
  templates: arrayField(template, { min: 1, max: 1000 }),
  concurrency: optionalField(integerField({ min: 1, max: 4 })),
  clientSources: optionalField(arrayField(source, { max: 1000 })),
  templateCatalogRevision: optionalField(text(256, 1)),
});
const startRequest = exactObject({
  batchId: optionalField(id),
  clientIds: optionalField(arrayField(id, { min: 1, max: 1000 })),
  templates: optionalField(arrayField(template, { min: 1, max: 1000 })),
  clientSources: optionalField(arrayField(source, { max: 1000 })),
  templateCatalogRevision: optionalField(text(256, 1)),
  confirmConfigChange: optionalField("boolean"),
});
const batchIdRequest = exactObject({ batchId: id });
const stopRequest = exactObject({ batchId: optionalField(id) });
const continuationRequest = exactObject({
  batchId: id,
  confirmConfigChange: optionalField("boolean"),
});
const cancelRequest = exactObject({ batchId: id, confirmed: literalField(true) });

const previewTask = exactObject({
  clientId: id,
  platform: id,
  templateId: id,
  materialIds: arrayField(id, { max: 1000 }),
  researchQueryIds: arrayField(id, { max: 1000 }),
});
const preview = exactObject({
  clientCount: integerField({ min: 0 }),
  executableClientCount: integerField({ min: 0 }),
  taskCount: integerField({ min: 0 }),
  executableTaskCount: integerField({ min: 0 }),
  excludedTaskCount: integerField({ min: 0 }),
  excludedClients: arrayField(excludedClient, { max: 1000 }),
  templates: arrayField(template, { max: 1000 }),
  clientSources: arrayField(source, { max: 1000 }),
  tasks: optionalField(arrayField(previewTask, { max: GENERATION_TASK_PAGE_SIZE })),
  taskOffset: optionalField(integerField({ min: 0, max: 10000 })),
  tasksTruncated: optionalField("boolean"),
});
const batchResult = exactObject({ batch });
const nullableBatchResult = exactObject({ batch: nullableField(batch) });
const batchListResult = exactObject({ batches: arrayField(batch, { max: 1000 }) });
const cancelPreview = exactObject({
  batchId: id,
  pendingCount: integerField({ min: 0 }),
  runningCount: integerField({ min: 0 }),
  cancelledCount: integerField({ min: 0 }),
  canCancel: "boolean",
});
const runtimeStatus = enumField([
  "idle", "pending", "starting", "running", "pausing", "paused",
  "interrupted", "paused_configuration", "failed", "completed", "abandoned",
]);
const state = exactObject({
  state: runtimeStatus,
  status: runtimeStatus,
  batchId: nullableField(id),
  counts: nullableField(counts),
  updatedAt: timestamp,
  runtimeId: id,
  sequence: integerField({ min: 0 }),
  isBatchRunning: "boolean",
  isStopPending: "boolean",
});
const capabilities = exactObject({
  canResume: "boolean",
  canContinue: "boolean",
  canRetry: "boolean",
  canCancel: "boolean",
});
const runtimeSnapshot = exactObject({
  runtimeId: id,
  sequence: integerField({ min: 0 }),
  runtime: state,
  batch: nullableField(batch),
  capabilities,
});

const GENERATION_EVENT_FIELDS = [
  "runtimeId", "sequence", "batchId", "taskId", "clientId", "platform",
  "templateId", "status", "counts", "error", "updatedAt", "batch", "capabilities",
];
const GENERATION_STATUSES = new Set([
  "idle", "pending", "running", "pausing", "paused", "paused_configuration",
  "completed", "failed", "interrupted", "cancelled", "succeeded", "abandoned",
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

function generationDisplayText(value, max) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > max ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    generationEventError();
  return value;
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
  const allowed = Object.keys(task.fields);
  exactKeys(value, allowed, ["id", "clientId", "platform", "templateId", "materialIds", "researchQueryIds", "status", "attempts"]);
  if (!GENERATION_STATUSES.has(value.status) || !Number.isSafeInteger(value.attempts) || value.attempts < 0 || value.attempts > 1000) generationEventError();
  const output = {
    id: generationText(value.id, 200),
    clientId: generationText(value.clientId, 200),
    platform: generationText(value.platform, 100),
    templateId: generationText(value.templateId, 200),
    materialIds: generationStringArray(value.materialIds, 1000),
    researchQueryIds: generationStringArray(value.researchQueryIds, 1000),
    status: value.status,
    attempts: value.attempts,
  };
  if (value.articleId !== undefined) output.articleId = generationOptionalText(value.articleId, 200);
  if (value.articleTitle !== undefined) output.articleTitle = generationDisplayText(value.articleTitle, 300);
  if (value.error !== undefined && value.error !== null) {
    exactKeys(value.error, ["code", "message"], []);
    output.error = {
      code: generationText(typeof value.error.code === "string" ? value.error.code : "GENERATION_TASK_FAILED", 128),
      message: "生成任务失败，请检查诊断信息。",
    };
  } else if (value.error === null) output.error = null;
  return output;
}

function generationBatch(value) {
  if (value === undefined || value === null) return value;
  const allowed = Object.keys(batch.fields);
  exactKeys(value, allowed, ["id", "status", "clientSources", "templates", "tasks", "counts"]);
  if (!GENERATION_STATUSES.has(value.status) || !Array.isArray(value.clientSources) || value.clientSources.length > 1000 ||
      !Array.isArray(value.templates) || value.templates.length > 1000 || !Array.isArray(value.tasks) || value.tasks.length > GENERATION_TASK_PAGE_SIZE) generationEventError();
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
  for (const key of ["taskCount", "taskOffset"]) {
    if (value[key] !== undefined) {
      if (!Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > 10000) generationEventError();
      output[key] = value[key];
    }
  }
  if (value.tasksTruncated !== undefined) {
    if (typeof value.tasksTruncated !== "boolean") generationEventError();
    output.tasksTruncated = value.tasksTruncated;
  }
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


const COMMON_ERRORS = {
  AUTH_REQUIRED: { category: "authentication", retryability: "never", userMessage: "请先完成登录后再继续。" },
  IPC_REQUEST_INVALID: { category: "validation", retryability: "never", userMessage: "生成请求无效，请刷新页面后重试。" },
  IPC_RESULT_INVALID: { category: "internal", retryability: "manual-check", userMessage: "生成结果未通过安全校验，请刷新后重试。" },
  IPC_INTERNAL: { category: "internal", retryability: "manual-check", userMessage: "生成操作未能安全完成，请检查诊断信息。" },
};
const GENERATION_CODES = [
  "GENERATION_INPUT_INVALID", "GENERATION_CLIENTS_REQUIRED", "GENERATION_TEMPLATES_REQUIRED",
  "GENERATION_SOURCE_LIMIT", "GENERATION_TASK_LIMIT",
  "GENERATION_CLIENT_NOT_FOUND", "CLIENT_MATERIAL_REQUIRED", "CLIENT_MATERIAL_INVALID",
  "GEO_RESEARCH_REQUIRED", "GEO_RESEARCH_INVALID", "GENERATION_TEMPLATE_NOT_FOUND",
  "GENERATION_TEMPLATE_INVALID", "GENERATION_TEMPLATE_STALE", "GENERATION_NO_EXECUTABLE_TASKS",
  "GENERATION_BATCH_BUSY", "GENERATION_BATCH_NOT_FOUND", "GENERATION_AI_CONFIG_CHANGED",
  "AI_CONFIG_NOT_SET", "AI_CONFIG_BUSY", "GENERATION_STOPPED", "GENERATION_RUNNER_DISPOSED",
  "GENERATION_WORKSPACE_REQUIRED", "GENERATION_INVALID_ID", "GENERATION_SOURCE_INVALID",
  "GENERATION_MATERIAL_IDS_REQUIRED", "GENERATION_RESEARCH_IDS_REQUIRED", "GENERATION_BATCH_INVALID",
  "GENERATION_TASK_NOT_FOUND", "GENERATION_TASK_CONFLICT", "GENERATION_TASK_ALREADY_SUCCEEDED",
  "GENERATION_TASK_BUSY", "GENERATION_CANCEL_CONFIRMATION_REQUIRED", "GENERATION_ARTICLE_INVALID",
  "AI_CONFIG_INVALID", "AI_UNAUTHORIZED", "AI_FORBIDDEN", "AI_MODEL_NOT_FOUND", "AI_RATE_LIMITED",
  "AI_TIMEOUT", "AI_NETWORK_ERROR", "AI_SERVER_ERROR", "AI_EMPTY_RESPONSE",
];
function errors(codes, userMessage) {
  return Object.freeze({
    ...COMMON_ERRORS,
    ...Object.fromEntries(codes.map((value) => [value, {
      category: value.startsWith("AI_") ? "remote" : "validation",
      retryability: value.includes("BUSY") || value.includes("TIMEOUT") || value.includes("NETWORK") ? "safe" : "never",
      userMessage,
    }])),
  });
}
const generationErrors = errors(GENERATION_CODES, "生成操作未完成，请检查选择与任务状态。供诊断使用的错误代码已保留。");
function contract(input, ownedErrors) {
  return defineContract({
    feature: "generation",
    ...input,
    errorCodes: Object.freeze(Object.keys(ownedErrors)),
    errors: ownedErrors,
  });
}

const generationContracts = Object.freeze([
  contract({ capability: "generation.previewBatch", channel: "content:preview-generation-batch", kind: "query", request: planRequest, success: preview, fromArgs: directArgs, toArgs: directInput }, generationErrors),
  contract({ capability: "generation.createAndStartBatch", channel: "content:create-and-start-generation-batch", kind: "command", request: planRequest, success: batchResult, fromArgs: directArgs, toArgs: directInput }, generationErrors),
  contract({ capability: "generation.pauseBatch", channel: "content:pause-generation-batch", kind: "command", request: stopRequest, success: nullableBatchResult, fromArgs: directArgs, toArgs: directInput }, generationErrors),
  contract({ capability: "generation.abandonBatch", channel: "content:abandon-generation-batch", kind: "command", request: exactObject({ batchId: id, confirmed: literalField(true) }), success: nullableBatchResult, fromArgs: directArgs, toArgs: directInput }, generationErrors),
  contract({ capability: "generation.resumeBatch", channel: "content:resume-generation-batch", kind: "command", request: continuationRequest, success: batchResult, fromArgs: directArgs, toArgs: directInput }, generationErrors),
  contract({ capability: "generation.retryFailed", channel: "content:retry-failed-generation-batch", kind: "command", request: batchIdRequest, success: batchResult, fromArgs: directArgs, toArgs: directInput }, generationErrors),
  contract({ capability: "generation.previewCancelPending", channel: "content:preview-cancel-pending-generation-batch", kind: "query", request: batchIdRequest, success: cancelPreview, fromArgs: directArgs, toArgs: directInput }, generationErrors),
  contract({ capability: "generation.cancelPending", channel: "content:cancel-pending-generation-batch", kind: "command", request: cancelRequest, success: batchResult, fromArgs: directArgs, toArgs: directInput }, generationErrors),
  contract({ capability: "generation.getRuntimeSnapshot", channel: "content:get-generation-runtime-snapshot", kind: "query", request: emptyRequest, success: runtimeSnapshot, fromArgs: noArgs, toArgs: noLegacyInput }, generationErrors),
]);

const generationEventContracts = Object.freeze([
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
]);

module.exports = {
  generationContracts,
  generationEventContracts,
};
