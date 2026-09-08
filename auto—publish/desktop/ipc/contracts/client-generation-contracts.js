"use strict";

const {
  arrayField,
  defineContract,
  enumField,
  exactObject,
  integerField,
  nullableField,
  optionalField,
  stringField,
} = require("./registry");

const id = stringField({
  min: 1,
  max: 200,
  pattern: /^(?!\.{1,2}$)(?!.*[<>:"|?*\\/])(?=\S)[^\x00-\x1f\x7f]*[^\s.]$/u,
});
const operationId = stringField({ min: 1, max: 200, pattern: /^[A-Za-z0-9][A-Za-z0-9_-]*$/u });
const timestamp = stringField({ min: 1, max: 64, pattern: /^[^\x00-\x1f\x7f]*$/u });
const displayText = stringField({ min: 1, max: 300, pattern: /^[^\x00-\x1f\x7f]*$/u });
const code = stringField({ min: 1, max: 128, pattern: /^[A-Z][A-Z0-9_]*$/u });
const directArgs = (args) => args[0] || {};
const directInput = (payload) => [payload];

const taskError = exactObject({
  code,
  message: stringField({ min: 1, max: 64, pattern: /^[^\x00-\x1f\x7f]*$/u }),
});
const task = exactObject({
  index: integerField({ min: 0, max: 99 }),
  status: enumField(["pending", "running", "succeeded", "failed"]),
  attempts: integerField({ min: 0, max: 1000 }),
  articleId: nullableField(id),
  articleTitle: nullableField(displayText),
  error: nullableField(taskError),
});
const counts = exactObject({
  total: integerField({ min: 0, max: 100 }),
  pending: integerField({ min: 0, max: 100 }),
  running: integerField({ min: 0, max: 100 }),
  succeeded: integerField({ min: 0, max: 100 }),
  failed: integerField({ min: 0, max: 100 }),
});
const operation = exactObject({
  operationId,
  clientId: id,
  articleCount: integerField({ min: 1, max: 100 }),
  concurrency: integerField({ min: 1, max: 4 }),
  status: enumField(["running", "completed", "partial", "failed"]),
  counts,
  tasks: arrayField(task, { min: 1, max: 100 }),
  createdAt: timestamp,
  updatedAt: timestamp,
});
const startRequest = exactObject({
  clientId: id,
  materialIds: arrayField(id, { min: 1, max: 50 }),
  researchQueryIds: arrayField(id, { min: 1, max: 50 }),
  platform: id,
  templateId: id,
  articleCount: optionalField(integerField({ min: 1, max: 100 })),
  concurrency: optionalField(integerField({ min: 1, max: 4 })),
  templateCatalogRevision: optionalField(stringField({ min: 1, max: 256, pattern: /^[^\x00-\x1f\x7f]*$/u })),
  generationOperationId: optionalField(operationId),
});
const clientRequest = exactObject({ clientId: id });
const retryRequest = exactObject({ operationId });
const operationResult = exactObject({ operation });
const nullableOperationResult = exactObject({ operation: nullableField(operation) });

const COMMON_ERRORS = {
  AUTH_REQUIRED: { category: "authentication", retryability: "never", userMessage: "请先完成登录后再继续。" },
  IPC_REQUEST_INVALID: { category: "validation", retryability: "never", userMessage: "生成请求无效，请刷新页面后重试。" },
  IPC_RESULT_INVALID: { category: "internal", retryability: "manual-check", userMessage: "生成结果未通过安全校验，请刷新后重试。" },
  IPC_INTERNAL: { category: "internal", retryability: "manual-check", userMessage: "生成操作未能安全完成，请检查诊断信息。" },
};
const CLIENT_GENERATION_CODES = [
  "CONTENT_INPUT_INVALID", "CONTENT_RUNTIME_DISPOSED", "CONTENT_STORE_REQUIRED",
  "CONTENT_GENERATION_CLIENT_BUSY", "CONTENT_GENERATION_OPERATION_NOT_FOUND",
  "CONTENT_GENERATION_ID_CONFLICT", "CONTENT_GENERATION_INVALID",
  "CLIENT_MATERIAL_REQUIRED", "CLIENT_MATERIAL_INVALID", "GEO_RESEARCH_REQUIRED",
  "RESEARCH_QUERY_IDS_INVALID", "RESEARCH_EMPTY_ANSWER", "TEMPLATE_CATALOG_STALE",
  "GENERATION_CONCURRENCY_INVALID", "ARTICLE_GENERATOR_INVALID", "ARTICLE_ID_INVALID",
  "ARTICLE_ID_DUPLICATE", "PROMPT_TEMPLATE_REQUIRED", "AI_CONFIG_NOT_SET", "AI_CONFIG_INVALID",
  "AI_UNAUTHORIZED", "AI_FORBIDDEN", "AI_MODEL_NOT_FOUND", "AI_RATE_LIMITED", "AI_TIMEOUT",
  "AI_NETWORK_ERROR", "AI_SERVER_ERROR", "AI_EMPTY_RESPONSE", "AI_REQUEST_FAILED", "AI_ABORTED",
];
const clientGenerationErrors = Object.freeze({
  ...COMMON_ERRORS,
  ...Object.fromEntries(CLIENT_GENERATION_CODES.map((value) => [value, {
    category: value.startsWith("AI_") ? "remote" : "validation",
    retryability: value.includes("BUSY") || value.includes("TIMEOUT") || value.includes("NETWORK") || value.includes("RATE_LIMITED") ? "safe" : "never",
    userMessage: value === "CONTENT_GENERATION_CLIENT_BUSY"
      ? "当前客户已有生成任务正在运行。"
      : "客户生成未完成，请检查资料、回答和任务状态。",
  }])),
});

function contract(input) {
  return defineContract({
    feature: "generation",
    ...input,
    errorCodes: Object.freeze(Object.keys(clientGenerationErrors)),
    errors: clientGenerationErrors,
  });
}

const clientGenerationContracts = Object.freeze([
  contract({ capability: "generation.startClient", channel: "content:start-client-generation", kind: "command", request: startRequest, success: operationResult, fromArgs: directArgs, toArgs: directInput }),
  contract({ capability: "generation.getClientState", channel: "content:get-client-generation-state", kind: "query", request: clientRequest, success: nullableOperationResult, fromArgs: directArgs, toArgs: directInput }),
  contract({ capability: "generation.retryClientFailed", channel: "content:retry-client-generation", kind: "command", request: retryRequest, success: operationResult, fromArgs: directArgs, toArgs: directInput }),
]);

const clientGenerationEventContracts = Object.freeze([
  defineContract({
    capability: "generation.clientOperationChanged",
    channel: "content:client-generation-state",
    feature: "generation",
    kind: "event",
    event: operation,
    errorCodes: [],
  }),
]);

module.exports = {
  clientGenerationContracts,
  clientGenerationEventContracts,
};
