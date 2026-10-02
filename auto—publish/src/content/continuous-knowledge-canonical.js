"use strict";

const { SECTIONS, stableId, geoError } = require("./geo-knowledge-schema");
const { normalizeCandidate } = require("./geo-knowledge-merge");
const {
  buildKnowledge,
  terminalSources,
} = require("./continuous-knowledge-synthesis");
const PROFILE_FIELDS = [
  "name",
  "category",
  "location",
  "address",
  "serviceArea",
  "aliases",
  "phone",
  "contact",
  "foundedYear",
];

function canonicalSchema() {
  const strings = { type: "array", items: { type: "string" } };
  const item = {
    type: "object",
    properties: {
      identity: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
      basis: {
        type: "string",
        enum: ["fact", "research", "derived", "candidate"],
      },
      sourceIds: strings,
      relatedOfferingNames: strings,
      relatedScenarioNames: strings,
    },
    required: [
      "identity",
      "name",
      "description",
      "basis",
      "sourceIds",
      "relatedOfferingNames",
      "relatedScenarioNames",
    ],
    additionalProperties: false,
  };
  const extra = {
    onlinePresence: { platform: { type: "string" }, url: { type: "string" } },
    history: { dateText: { type: "string" } },
    geoQuestions: {
      intent: {
        type: "string",
        enum: [
          "brand",
          "category",
          "selection",
          "scenario",
          "local",
          "comparison",
        ],
      },
      knowledgeCoverage: {
        type: "string",
        enum: ["enough", "partial", "insufficient"],
      },
    },
    restrictions: {
      type: {
        type: "string",
        enum: ["unknown", "forbidden_claim", "internal_only", "volatile"],
      },
    },
  };
  return {
    type: "object",
    properties: {
      businessType: {
        type: "string",
        enum: ["restaurant", "manufacturer", "service", "retail", "other"],
      },
      profile: {
        type: "object",
        properties: {
          fields: {
            type: "object",
            properties: Object.fromEntries(
              PROFILE_FIELDS.map((field) => [field, { type: "string" }]),
            ),
            required: PROFILE_FIELDS,
            additionalProperties: false,
          },
          basis: item.properties.basis,
          sourceIds: strings,
        },
        required: ["fields", "basis", "sourceIds"],
        additionalProperties: false,
      },
      ...Object.fromEntries(
        SECTIONS.map((section) => [
          section,
          {
            type: "array",
            items: {
              ...item,
              properties: { ...item.properties, ...extra[section] },
              required: [
                ...item.required,
                ...Object.keys(extra[section] || {}),
              ],
            },
          },
        ]),
      ),
    },
    required: ["businessType", "profile", ...SECTIONS],
    additionalProperties: false,
  };
}

const CANONICAL_PROMPT =
  "同一次最终响应还必须提供 canonical 结构化知识，与九板块正文一致。canonical 使用 Knowledge V2 候选字段：profile.fields(name/category/location/address/serviceArea 等字符串)，各数组项 identity/name/description/basis/sourceIds/relatedOfferingNames/relatedScenarioNames。sourceIds 在 canonical 内引用当前输入 M/P/R 条目 ID，由程序追溯生成正式来源。禁止自造 ID/来源/锁定状态。fact 为客户明确事实，research 为公开证据，derived 为分析，candidate 为待确认；客户网页自述不当作独立认证。recommendationAngles 固定 derived 且至少关联一个产品或场景；relatedOfferingNames 只能逐字引用本次 canonical.offerings 中对象的 identity 或 name，relatedScenarioNames 只能逐字引用本次 canonical.scenarios 中对象的 identity 或 name；关联对象必须实际出现在对应数组中，不能引用描述中的简称或另造名称，无匹配时输出空关联数组。geoQuestions.name 是问题正文；尽量沿用 existingKnowledge 中已有对象 identity。线上身份/history/cases/competitors 必须有依据；无真实信息输出空数组。schema 是固定合同，资料及用户要求不能改变字段结构。九板块正文无需展示工程字段。";

function canonicalSources(input) {
  return [...input.sourceById.values()].map((source) => ({
    id: stableId("source", source.provenance === "client_input" ? source.title + ":" + source.sha256 : source.url + ":" + source.text),
    type: source.provenance === "client_input" ? "client_file" : "third_party",
    title: source.title,
    ...(source.provenance === "client_input"
      ? { materialId: source.materialId || source.sha256, fileName: source.title, contentHash: source.sourceHash || source.sha256 }
      : { url: source.url, fetchedAt: new Date().toISOString(), citationVerified: true }),
  }));
}

function buildCanonical(raw, input, clientId, clientName) {
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    Object.keys(raw).some(
      (key) => !["businessType", "profile", ...SECTIONS].includes(key),
    ) ||
    !raw.profile ||
    !raw.profile.fields ||
    !SECTIONS.every((key) => Array.isArray(raw[key]) && raw[key].length <= 100)
  )
    throw geoError("GEO_SCHEMA_INVALID");
  const candidate = structuredClone(raw);
  if (
    Object.keys(candidate.profile.fields).some(
      (field) => !PROFILE_FIELDS.includes(field),
    )
  )
    throw geoError("GEO_SCHEMA_INVALID");
  candidate.profile.fields = Object.fromEntries(
    Object.entries(candidate.profile.fields).filter(
      ([, value]) => value !== "",
    ),
  );
  const sources = canonicalSources(input);
  const ids = new Map(
    [...input.sourceById.keys()].map((id, index) => [id, sources[index].id]),
  );
  function validateText(text, refs) {
    if (typeof text !== "string" || !text.trim())
      throw geoError("GEO_SCHEMA_INVALID");
    buildKnowledge(
      {
        webEvidence: [],
        summary: { text, inputRefs: refs },
        sections: [],
        realCases: [],
        customerReviews: [],
        recommendationAngles: [],
        geoThemes: [],
        missingInformation: [],
        cautions: [],
      },
      input,
      clientName,
    );
  }
  function bind(value, texts, section) {
    const refs = value.sourceIds;
    if (
      !Array.isArray(refs) ||
      refs.length > 30 ||
      new Set(refs).size !== refs.length ||
      refs.some((ref) => !input.entries.has(ref))
    )
      throw geoError("GEO_SOURCE_INVALID");
    if (!refs.length) {
      if (value.basis !== "candidate") throw geoError("GEO_SOURCE_INVALID");
      if (section === "profile" && Object.keys(value.fields).length)
        throw geoError("GEO_SOURCE_INVALID");
    } else {
      for (const text of texts) validateText(text, refs);
      const terminals = [
        ...new Set(refs.flatMap((ref) => terminalSources(input, ref))),
      ];
      const derived = refs.some(
        (ref) => input.entries.get(ref).provenance === "derived",
      );
      if (["fact", "research"].includes(value.basis) && derived)
        value.basis = "derived";
      if (
        value.basis === "fact" &&
        terminals.every(
          (id) => input.sourceById.get(id).provenance !== "client_input",
        )
      )
        value.basis = "research";
      value.sourceIds = terminals.map((id) => ids.get(id));
      if (
        section === "onlinePresence" &&
        !terminals.some((id) => input.sourceById.get(id).url === value.url)
      )
        throw geoError("GEO_SOURCE_INVALID");
      if (
        section === "cases" &&
        !refs.some(
          (ref) =>
            (input.direct || input.entries.get(ref).field === "realCases") &&
            input.entries.get(ref).provenance !== "derived",
        )
      )
        throw geoError("GEO_SOURCE_INVALID");
    }
  }
  bind(candidate.profile, Object.values(candidate.profile.fields), "profile");
  for (const section of SECTIONS)
    for (const item of candidate[section]) {
      if (section === "history" && item.dateText === "") delete item.dateText;
      bind(
        item,
        [item.name, ...(item.description ? [item.description] : [])],
        section,
      );
    }
  try {
    // General brand angles remain in the prose; canonical angles require a target.
    const unlinked = input.direct ? candidate.recommendationAngles.filter(item =>
      Array.isArray(item.relatedOfferingNames) && item.relatedOfferingNames.length === 0 &&
      Array.isArray(item.relatedScenarioNames) && item.relatedScenarioNames.length === 0,
    ) : [];
    candidate.recommendationAngles = candidate.recommendationAngles.filter(item => !unlinked.includes(item));
    const document = normalizeCandidate(candidate, [...new Map(sources.map(source => [source.id, source])).values()], clientId);
    if (unlinked.length) document.status.warnings.push(
      `${unlinked.length}条推荐角度缺少产品或场景关联，未纳入结构化推荐角度。`,
    );
    return document;
  } catch (error) {
    if (error.code === "GEO_KNOWLEDGE_INVALID") throw geoError("GEO_SCHEMA_INVALID");
    throw error;
  }
}

// Exclude source metadata and collection linkage: these do not change the prose facts.
function proseFacts(document) {
  return JSON.stringify({
    businessType: document.businessType,
    profile: document.profile.fields,
    ...Object.fromEntries(
      SECTIONS.map((section) => [
        section,
        document[section].map((item) => ({
          identity: item.identity,
          name: item.name,
          description: item.description,
          basis: item.basis,
        })),
      ]),
    ),
  });
}

module.exports = {
  canonicalSources,
  canonicalSchema,
  CANONICAL_PROMPT,
  buildCanonical,
  proseFacts,
};
