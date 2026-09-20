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
const claim = exactObject({
  id,
  field: stringField({ min: 1, max: 200, pattern: /^[a-zA-Z][a-zA-Z0-9]*$/ }),
  value: text(2000, 1),
  status: enumField(["accepted", "candidate", "rejected"]),
  basis: enumField(["fact", "research", "derived", "candidate"]),
  origin: enumField(["ai", "manual"]),
  locked: "boolean",
  sourceIds: arrayField(id, { max: 100 }),
});
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
  platform: optionalField(text(100, 1)),
  url: optionalField(text(2000, 1)),
  dateText: optionalField(text(200, 1)),
  target: optionalField(exactObject({ section: literalField("profile"), field: text(200, 1) })),
  claimIds: optionalField(arrayField(id, { min: 2, max: 500 })),
  conflictStatus: optionalField(enumField(["open", "resolved"])),
  resolution: optionalField(nullableField(exactObject({ acceptedClaimId: id, resolvedAt: text(100, 1) }))),
});
const source = exactObject({
  id,
  type: enumField([
    "client_input",
    "client_file",
    "client_public",
    "official_web",
    "authority",
    "platform",
    "industry",
    "media",
    "third_party",
  ]),
  title: text(500, 1),
  materialId: optionalField(text(1000, 1)),
  fileName: optionalField(text(500, 1)),
  contentHash: optionalField(text(128, 1)),
  url: optionalField(text(2000, 1)),
  fetchedAt: optionalField(text(100, 1)),
  citationVerified: optionalField("boolean"),
});
const knowledge = exactObject({
  schemaVersion: literalField(2),
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
  profile: exactObject({ ...common, fields, claims: arrayField(claim, { max: 500 }) }),
  ...Object.fromEntries(
    [
      "onlinePresence",
      "history",
      "offerings",
      "capabilities",
      "cases",
      "scenarios",
      "recommendationAngles",
      "competitors",
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
  completed: optionalField(integerField({ min: 0, max: 10 })),
  total: optionalField(integerField({ min: 0, max: 10 })),
  errorCode: optionalField(text(128, 1)),
  failedPhase: optionalField(
    enumField([
      "materials",
      "extracting",
      "planning",
      "researching",
      "synthesizing",
      "saving",
    ]),
  ),
});
const status = exactObject({
  baseUrl: text(200, 1),
  configured: "boolean",
  model: text(200),
  webSearch: "boolean",
  defaultGlobalPrompt: text(8000, 1),
  globalPrompt: text(8000),
});
const messages = {
  GEO_AUTH_REJECTED: "鉴权失败（401）：请检查是否使用了当前接口对应的密钥。",
  GEO_PERMISSION_DENIED: "权限被拒绝（403）：请检查模型权限、套餐状态及接口是否匹配。",
  GEO_REQUEST_FAILED: "服务端返回失败，请检查服务状态或额度；系统未自动重试。",
  GEO_CAPABILITY_REJECTED: "当前地址或模型拒绝了 Responses/联网请求，请核对模型和工具支持。系统未切换接口或自动重试。",
  GEO_SEARCH_UNCONFIRMED: "本次联网请求未返回可核验的网页引用，无法确认联网结果。研究已停止，系统未切换到其他计费接口。",
  GEO_LINK_PARTIAL:
    "部分问题可能已加入采集，但关联未完整保存。请刷新后重新选择加入，已有问题不会重复创建。",
  GEO_CONFIG_REQUIRED: "请先在设置中的豆包 GEO 配置密钥与模型。",
  GEO_CONFIG_REJECTED: "豆包拒绝了配置，请检查密钥和模型权限。",
  GEO_SEARCH_DISABLED: "请在豆包 GEO 设置中启用联网搜索。",
  GEO_ALREADY_RUNNING: "知识研究或连接测试正在运行，请等待完成。",
  GEO_REVISION_CONFLICT: "知识库已被修改，请刷新后再操作。",
  GEO_REQUEST_UNCERTAIN:
    "远端请求结果无法确认，系统未自动重发。请检查配置或稍后手动研究。",
  GEO_CANCELLED: "知识研究已取消，原有知识保留。",
  GEO_SCHEMA_INVALID:
    "模型连续两次未返回符合知识库合同的 JSON，原有知识未修改。",
  GEO_RESPONSE_INVALID:
    "模型响应中没有可用文本，原有知识未修改。",
  GEO_RESPONSE_INCOMPLETE:
    "模型响应未完整结束，原有知识未修改。",
  GEO_REQUEST_BUDGET_EXHAUSTED:
    "本次研究已达到请求上限，且未能完成最终整理；原有知识未修改。",
  GEO_MATERIAL_TOO_LARGE:
    "客户资料超过单次知识提取上限，请减少或拆分资料后重试。",
  GEO_SAVE_FAILED: "知识库保存失败，原有知识保持不变。",
  GEO_GENERATION_FAILED:
    "知识研究发生未分类错误，原有知识未修改。",
};
const codes = [
  "GEO_AUTH_REJECTED",
  "GEO_PERMISSION_DENIED",
  "GEO_CAPABILITY_REJECTED",
  "GEO_SEARCH_UNCONFIRMED",
  "GEO_LINK_PARTIAL",
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
  "GEO_REQUEST_BUDGET_EXHAUSTED",
  "GEO_REQUEST_FAILED",
  "GEO_RESPONSE_INVALID",
  "GEO_RESPONSE_INCOMPLETE",
  "GEO_CANCELLED",
  "GEO_SCHEMA_INVALID",
  "GEO_SAVE_FAILED",
  "GEO_READ_FAILED",
  "GEO_NOT_FOUND",
  "GEO_ITEM_NOT_FOUND",
  "GEO_POLICY_INVALID",
  "GEO_POLICY_SAVE_FAILED",
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
    "questionArticles",
    "query",
    exactObject({ clientId: id, id }),
    exactObject({
      articles: arrayField(
        exactObject({
          id,
          title: text(10000),
          stage: enumField([
            "pending_submission",
            "needs_completion",
            "in_submission",
            "published",
            "trash",
          ]),
          label: text(100),
        }),
        { max: 100 },
      ),
      total: integerField({ min: 0, max: Number.MAX_SAFE_INTEGER }),
      publishedCount: integerField({ min: 0, max: Number.MAX_SAFE_INTEGER }),
    }),
  ),
  contract(
    "linkQuestions",
    "command",
    exactObject({
      clientId: id,
      revision: integerField({ min: 1, max: Number.MAX_SAFE_INTEGER }),
      ids: arrayField(id, { min: 1, max: 500 }),
    }),
    exactObject({ knowledge }),
  ),
  contract(
    "questionDetails",
    "query",
    exactObject({ clientId: id, id }),
    exactObject({
      id,
      linkStatus: enumField(["unlinked", "linked", "stale"]),
      enabled: nullableField("boolean"),
      clientMentioned: nullableField("boolean"),
      research: nullableField(
        exactObject({
          question: text(2000, 1),
          answerText: text(200000, 1),
          collectedAt: text(100),
          collectionMethod: enumField(["automatic", "manual", "legacy"]),
          references: arrayField(
            exactObject({ title: text(10000, 1), url: text(10000, 1) }),
            { max: 1000 },
          ),
        }),
      ),
    }),
  ),
  contract(
    "load",
    "query",
    clientRequest,
    exactObject({ knowledge: nullableField(knowledge), storageStatus: enumField(["missing", "legacy_v1", "current_v2", "invalid"]), state }),
  ),
  contract("state", "query", clientRequest, exactObject({ state })),
  contract("generate", "command", exactObject({ clientId: id, temporaryPrompt: optionalField(text(2000)) }), exactObject({ knowledge })),
  contract("cancel", "command", clientRequest, exactObject({ state })),
  contract(
    "edit",
    "command",
    exactObject({
      clientId: id,
      revision: integerField({ min: 1, max: Number.MAX_SAFE_INTEGER }),
      section: enumField([
        "profile",
        "onlinePresence",
        "history",
        "offerings",
        "capabilities",
        "cases",
        "scenarios",
        "recommendationAngles",
        "competitors",
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
    "confirmSourceType",
    "command",
    exactObject({
      clientId: id,
      revision: integerField({ min: 1, max: Number.MAX_SAFE_INTEGER }),
      sourceId: id,
      targetType: enumField(["official_web", "client_public"]),
    }),
    exactObject({ knowledge }),
  ),
  contract(
    "resolveConflict",
    "command",
    exactObject({
      clientId: id,
      revision: integerField({ min: 1, max: Number.MAX_SAFE_INTEGER }),
      conflictId: id,
      claimId: optionalField(id),
      value: optionalField(text(2000, 1)),
    }),
    exactObject({ knowledge }),
  ),
  contract(
    "promptSettings",
    "query",
    clientRequest,
    exactObject({ defaultGlobalPrompt: text(8000, 1), globalPrompt: text(8000), clientPrompt: text(4000) }),
  ),
  contract(
    "saveGlobalPrompt",
    "command",
    exactObject({ researchPromptOverride: text(8000) }),
    exactObject({ defaultGlobalPrompt: text(8000, 1), globalPrompt: text(8000) }),
  ),
  contract(
    "saveClientPrompt",
    "command",
    exactObject({ clientId: id, researchPrompt: text(4000) }),
    exactObject({ researchPrompt: text(4000) }),
  ),
  contract(
    "exportMarkdown",
    "query",
    clientRequest,
    exactObject({ markdown: text(4000000) }),
  ),
  contract("configStatus", "query", exactObject({}), status),
  contract("testConnection", "command", exactObject({ search: "boolean" }), exactObject({ search: "boolean", citationCount: integerField({ min: 0, max: 100000 }) })),
  contract(
    "saveConfig",
    "command",
    exactObject({
      baseUrl: text(200, 1),
      model: text(200, 1),
      apiKey: text(4000),
      webSearch: "boolean",
    }),
    status,
  ),
];
module.exports = { geoKnowledgeContracts };
