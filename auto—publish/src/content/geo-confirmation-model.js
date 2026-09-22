"use strict";

const { validateKnowledge } = require("./geo-knowledge-schema");

const SECTION_DEFINITIONS = Object.freeze([
  ["profile", "客户 / 品牌概况"],
  ["offerings", "主要产品与服务"],
  ["offeringFeatures", "产品 / 服务特点"],
  ["history", "品牌故事与发展历史"],
  ["onlinePresence", "线上公开身份"],
  ["scenarios", "用户需求与典型场景"],
  ["capabilities", "核心能力与差异化"],
  ["team", "团队 / 负责人"],
  ["trust", "资质、授权与信任背书"],
  ["cases", "客户案例"],
  ["market", "竞对与市场位置"],
  ["recommendationAngles", "推荐定位 / GEO 推荐角度"],
  ["geoQuestions", "核心 GEO 问题"],
  ["restrictions", "禁止或谨慎使用的表述"],
  ["confirmation", "请客户确认 / 补充"],
]);

const FIELD_LABELS = Object.freeze({
  name: "客户名称",
  category: "主营品类",
  location: "所在地区",
  address: "地址",
  serviceArea: "服务区域",
  aliases: "别名",
  phone: "联系电话",
  contact: "联系方式",
  foundedYear: "成立年份",
  founder: "创始人",
  leader: "负责人",
  team: "团队",
  qualification: "资质",
  certification: "认证",
  license: "授权",
  award: "荣誉",
});

const TEAM_FIELD = /(founder|leader|owner|team|person|contact)/i;
const TRUST_FIELD = /(qualification|certification|certificate|license|award|honor|trust)/i;
const STRONG_CLAIM = /(第一|唯一|顶级|领先|最好|最大|最强|国家级|权威|保证|治愈|百分之百|100%)/u;

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildCustomerConfirmationModel(document) {
  const knowledge = validateKnowledge(document);
  const sources = new Map(knowledge.sources.map((source) => [source.id, source]));
  const sections = SECTION_DEFINITIONS.map(([id, title]) => ({ id, title, entries: [] }));
  const byId = new Map(sections.map((section) => [section.id, section]));
  const confirmationRequests = [];
  const pendingBySection = new Map();

  function request(topic, reason, relatedKnowledgeIds) {
    const key = topic + "\u0000" + reason + "\u0000" + relatedKnowledgeIds.join("\u0000");
    if (confirmationRequests.some((item) => item._key === key)) return;
    confirmationRequests.push({ topic, reason, relatedKnowledgeIds: unique(relatedKnowledgeIds), _key: key });
  }

  function attributionRequired(sourceIds, text) {
    return sourceIds.some((id) => sources.get(id)?.type === "client_public") || STRONG_CLAIM.test(text);
  }

  function pending(sectionId, knowledgeId) {
    const ids = pendingBySection.get(sectionId) || [];
    ids.push(knowledgeId);
    pendingBySection.set(sectionId, ids);
  }

  function add(sectionId, value) {
    byId.get(sectionId).entries.push({
      kind: value.kind,
      title: value.title,
      body: value.body,
      sourceIds: unique(value.sourceIds || []),
      attributionRequired: Boolean(value.attributionRequired),
      relatedKnowledgeIds: unique(value.relatedKnowledgeIds || []),
    });
  }

  function addItem(sectionId, item, options) {
    const config = options || {};
    const derivedAllowed = config.allowDerived && item.basis === "derived";
    if (!derivedAllowed && !["fact", "research"].includes(item.basis)) {
      pending(sectionId, item.id);
      return;
    }
    const body = item.description || item.name;
    add(sectionId, {
      kind: derivedAllowed ? "derived" : item.basis,
      title: item.name,
      body,
      sourceIds: item.sourceIds,
      attributionRequired: attributionRequired(item.sourceIds, item.name + " " + body),
      relatedKnowledgeIds: [item.id],
    });
  }

  for (const claim of knowledge.profile.claims) {
    if (claim.status !== "accepted" || !["fact", "research"].includes(claim.basis)) {
      pending("profile", claim.id);
      continue;
    }
    const sectionId = TRUST_FIELD.test(claim.field)
      ? "trust"
      : TEAM_FIELD.test(claim.field)
        ? "team"
        : "profile";
    add(sectionId, {
      kind: claim.basis,
      title: FIELD_LABELS[claim.field] || claim.field,
      body: claim.value,
      sourceIds: claim.sourceIds,
      attributionRequired: attributionRequired(claim.sourceIds, claim.value),
      relatedKnowledgeIds: [claim.id],
    });
  }

  knowledge.offerings.forEach((item) => addItem("offerings", item));
  knowledge.capabilities.forEach((item) =>
    addItem(item.relatedOfferingIds.length ? "offeringFeatures" : "capabilities", item),
  );
  knowledge.history.forEach((item) => addItem("history", item));
  knowledge.onlinePresence.forEach((item) => addItem("onlinePresence", item));
  knowledge.scenarios.forEach((item) => addItem("scenarios", item, { allowDerived: true }));
  knowledge.cases.forEach((item) => addItem("cases", item));
  knowledge.competitors.forEach((item) => addItem("market", item));
  knowledge.externalResearch.forEach((item) => addItem("market", item));
  knowledge.recommendationAngles.forEach((item) =>
    addItem("recommendationAngles", item, { allowDerived: true }),
  );
  knowledge.geoQuestions.forEach((item) => addItem("geoQuestions", item));

  for (const item of knowledge.restrictions) {
    const resolvedConflict = item.type === "conflict" && item.conflictStatus === "resolved";
    if (resolvedConflict) continue;
    add("restrictions", {
      kind: "caution",
      title: item.name,
      body: item.description || "该表述需要谨慎使用。",
      sourceIds: item.sourceIds,
      attributionRequired: true,
      relatedKnowledgeIds: [item.id],
    });
    request(item.name, item.type === "conflict" ? "存在未解决的事实冲突。" : "该信息需要客户确认使用边界。", [item.id]);
  }
  knowledge.status.warnings.forEach((warning, index) =>
    request("知识研究未完成项 " + (index + 1), warning, []),
  );

  for (const [sectionId, ids] of pendingBySection) {
    const section = byId.get(sectionId);
    request(
      section.title,
      "有 " + ids.length + " 条候选内容尚未确认，未作为正向事实写入确认稿。",
      ids,
    );
  }

  for (const section of sections.slice(0, 14)) {
    if (section.entries.length) continue;
    add(section.id, {
      kind: "gap",
      title: section.title,
      body: "当前资料不足，建议补充。",
      sourceIds: [],
      attributionRequired: false,
      relatedKnowledgeIds: [],
    });
    request(section.title, "当前资料不足，建议补充。", []);
  }

  for (const item of confirmationRequests) {
    add("confirmation", {
      kind: "gap",
      title: item.topic,
      body: item.reason,
      sourceIds: [],
      attributionRequired: false,
      relatedKnowledgeIds: item.relatedKnowledgeIds,
    });
    delete item._key;
  }

  return {
    version: 1,
    clientId: knowledge.clientId,
    knowledgeRevision: knowledge.revision,
    generatedAt: knowledge.updatedAt,
    sections,
    confirmationRequests,
  };
}

function renderCustomerConfirmationMarkdown(model, options) {
  const values = options || {};
  const sourceTitles = new Map((values.sources || []).map((source) => [source.id, source.title]));
  const name = values.clientName || model.clientId;
  const lines = ["# " + name + "客户确认稿", "", "知识版本：" + model.knowledgeRevision, "更新时间：" + model.generatedAt];
  const kindLabels = { fact: "客户事实", research: "公开研究", derived: "推荐角度/场景分析", caution: "谨慎使用" };
  for (const section of model.sections.slice(0, 14)) {
    const entries = section.entries.filter((entry) => entry.kind !== "gap");
    if (!entries.length) continue;
    lines.push("", "## " + section.title);
    for (const entry of entries) {
      lines.push("", "### " + entry.title, entry.body, "", "性质：" + kindLabels[entry.kind]);
      if (entry.sourceIds.length) {
        lines.push("来源：" + entry.sourceIds.map((id) => sourceTitles.get(id) || id).join("、"));
      }
      if (entry.attributionRequired) lines.push("提示：对外使用时请保留来源或限定表述。");
    }
  }
  if (model.confirmationRequests.length) {
    lines.push("", "## 请客户确认 / 补充");
    model.confirmationRequests.forEach((item) => lines.push("", "- **" + item.topic + "**：" + item.reason));
  }
  return lines.join("\n") + "\n";
}

module.exports = {
  SECTION_DEFINITIONS,
  buildCustomerConfirmationModel,
  renderCustomerConfirmationMarkdown,
};
