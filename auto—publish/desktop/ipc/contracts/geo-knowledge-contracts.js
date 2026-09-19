"use strict";
const {
  defineContract,
  exactObject,
  stringField,
  multilineStringField,
  integerField,
  enumField,
  arrayField,
  optionalField,
  nullableField,
  customField,
  literalField,
} = require("./registry");
const text = (max = 12000, min = 0) => multilineStringField({ min, max });
const id = stringField({
  min: 1,
  max: 200,
  pattern: /^[^<>:"|?*\\/\x00-\x1f]+$/u,
});
const fields = customField((value) => {
  if (
    !value ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length > 30
  )
    throw new Error("fields");
  const entries = Object.entries(Object.getOwnPropertyDescriptors(value));
  if (
    entries.some(
      ([key, d]) =>
        !/^[a-zA-Z][a-zA-Z0-9]*$/.test(key) ||
        ["constructor", "prototype", "__proto__"].includes(key) ||
        !("value" in d) ||
        typeof d.value !== "string" ||
        d.value.length > 2000,
    )
  )
    throw new Error("fields");
  return Object.fromEntries(entries.map(([key, d]) => [key, d.value]));
});
const common = {
  id,
  identity: text(2000, 1),
  basis: enumField(["fact", "research", "derived", "candidate"]),
  origin: enumField(["ai", "manual"]),
  locked: "boolean",
  sourceIds: arrayField(id, { max: 100 }),
  relatedOfferingIds: arrayField(id, { max: 500 }),
  relatedScenarioIds: arrayField(id, { max: 500 }),
};
const item = exactObject({
  ...common,
  name: text(2000, 1),
  description: text(),
  intent: optionalField(
    enumField([
      "brand",
      "category",
      "selection",
      "scenario",
      "local",
      "comparison",
    ]),
  ),
  knowledgeCoverage: optionalField(
    enumField(["enough", "partial", "insufficient"]),
  ),
  questionId: optionalField(nullableField(id)),
  type: optionalField(
    enumField([
      "unknown",
      "conflict",
      "forbidden_claim",
      "internal_only",
      "volatile",
    ]),
  ),
});
const source = exactObject({
  id,
  type: enumField([
    "client_input",
    "client_file",
    "official_web",
    "authority",
    "industry",
    "media",
    "third_party",
  ]),
  title: text(500, 1),
  materialId: optionalField(text(1000, 1)),
  fileName: optionalField(text(500, 1)),
  contentHash: optionalField(text(128, 1)),
  url: optionalField(text(4000, 1)),
  fetchedAt: optionalField(text(100, 1)),
  citationVerified: optionalField("boolean"),
});
const knowledge = exactObject({
  schemaVersion: literalField(1),
  clientId: id,
  revision: integerField({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  businessType: enumField([
    "restaurant",
    "manufacturer",
    "service",
    "retail",
    "other",
  ]),
  generatedAt: text(100, 1),
  updatedAt: text(100, 1),
  status: exactObject({
    outcome: enumField(["complete", "partial"]),
    warnings: arrayField(text(2000), { max: 100 }),
  }),
  profile: exactObject({ ...common, fields }),
  ...Object.fromEntries(
    [
      "offerings",
      "capabilities",
      "scenarios",
      "geoQuestions",
      "externalResearch",
      "restrictions",
    ].map((key) => [key, arrayField(item, { max: 500 })]),
  ),
  sources: arrayField(source, { max: 500 }),
});
const state = exactObject({
  phase: enumField([
    "idle",
    "materials",
    "extracting",
    "planning",
    "researching",
    "synthesizing",
    "saving",
    "complete",
    "failed",
  ]),
  running: "boolean",
  completed: optionalField(integerField({ min: 0, max: 8 })),
  total: optionalField(integerField({ min: 0, max: 8 })),
  errorCode: optionalField(text(128, 1)),
});
const status = exactObject({
  configured: "boolean",
  model: text(200),
  webSearch: "boolean",
});
const messages = {
  GEO_CONFIG_REQUIRED: "请先在设置中的豆包 GEO 配置密钥与模型。",
  GEO_CONFIG_REJECTED: "豆包拒绝了配置，请检查密钥和模型权限。",
  GEO_SEARCH_DISABLED: "请在豆包 GEO 设置中启用联网搜索。",
  GEO_ALREADY_RUNNING: "知识研究正在运行，请等待完成。",
  GEO_REVISION_CONFLICT: "知识库已被修改，请刷新后再操作。",
  GEO_REQUEST_UNCERTAIN:
    "远端请求结果无法确认，系统未自动重发。请检查配置或稍后手动研究。",
  GEO_CANCELLED: "知识研究已取消，原有知识保留。",
};
const codes = [
  "AUTH_REQUIRED",
  "IPC_REQUEST_INVALID",
  "IPC_RESULT_INVALID",
  "IPC_INTERNAL",
  "CLIENT_NOT_FOUND",
  "CLIENT_PATH_OUT_OF_BOUNDS",
  "GEO_PATH_UNSAFE",
  "GEO_KNOWLEDGE_INVALID",
  "GEO_SOURCE_INVALID",
  "GEO_CONFIG_REQUIRED",
  "GEO_CONFIG_REJECTED",
  "GEO_CONFIG_INVALID",
  "GEO_CONFIG_STORAGE_INVALID",
  "GEO_CONFIG_SAVE_FAILED",
  "GEO_ENCRYPTION_UNAVAILABLE",
  "GEO_SEARCH_DISABLED",
  "GEO_ALREADY_RUNNING",
  "GEO_REVISION_CONFLICT",
  "GEO_REQUEST_UNCERTAIN",
  "GEO_REQUEST_FAILED",
  "GEO_RESPONSE_INVALID",
  "GEO_RESPONSE_INCOMPLETE",
  "GEO_CANCELLED",
  "GEO_SCHEMA_INVALID",
  "GEO_SAVE_FAILED",
  "GEO_READ_FAILED",
  "GEO_NOT_FOUND",
  "GEO_ITEM_NOT_FOUND",
  "GEO_MATERIAL_TOO_LARGE",
  "GEO_GENERATION_FAILED",
];
const errors = Object.fromEntries(
  codes.map((code) => [
    code,
    {
      category: code === "AUTH_REQUIRED" ? "authentication" : "validation",
      retryability: "manual-check",
      userMessage:
        messages[code] || "知识库操作未完成，请检查配置与资料，刷新后重试。",
    },
  ]),
);
const clientRequest = exactObject({ clientId: id });
function contract(method, kind, request, success) {
  return defineContract({
    capability: "content.geo" + method[0].toUpperCase() + method.slice(1),
    channel: "geo-knowledge:" + method,
    feature: "content",
    kind,
    request,
    success,
    fromArgs: (args) => args[0] || {},
    toArgs: (input) => [input],
    errorCodes: codes,
    errors,
  });
}
const geoKnowledgeContracts = [
  contract(
    "load",
    "query",
    clientRequest,
    exactObject({ knowledge: nullableField(knowledge), state }),
  ),
  contract("state", "query", clientRequest, exactObject({ state })),
  contract("generate", "command", clientRequest, exactObject({ knowledge })),
  contract("cancel", "command", clientRequest, exactObject({ state })),
  contract(
    "edit",
    "command",
    exactObject({
      clientId: id,
      revision: integerField({ min: 1, max: Number.MAX_SAFE_INTEGER }),
      section: enumField([
        "profile",
        "offerings",
        "capabilities",
        "scenarios",
        "geoQuestions",
        "externalResearch",
        "restrictions",
      ]),
      id,
      changes: exactObject({
        name: optionalField(text(2000, 1)),
        description: optionalField(text()),
        fields: optionalField(fields),
      }),
    }),
    exactObject({ knowledge }),
  ),
  contract(
    "exportMarkdown",
    "query",
    clientRequest,
    exactObject({ markdown: text(4000000) }),
  ),
  contract("configStatus", "query", exactObject({}), status),
  contract(
    "saveConfig",
    "command",
    exactObject({
      model: text(200, 1),
      apiKey: text(4000),
      webSearch: "boolean",
    }),
    status,
  ),
];
module.exports = { geoKnowledgeContracts };
