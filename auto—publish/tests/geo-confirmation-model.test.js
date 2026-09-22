"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeCandidate } = require("../src/content/geo-knowledge-merge");
const {
  buildCustomerConfirmationModel,
  renderCustomerConfirmationMarkdown,
} = require("../src/content/geo-confirmation-model");

function fixture() {
  const sources = [
    { id: "client-file", type: "client_file", title: "客户资料", materialId: "brand.md", fileName: "brand.md", contentHash: "hash" },
    { id: "public-account", type: "client_public", title: "客户公开账号", url: "https://example.com/client", fetchedAt: "2026-09-20T00:00:00.000Z", citationVerified: true },
    { id: "industry", type: "industry", title: "行业资料", url: "https://example.com/industry", fetchedAt: "2026-09-20T00:00:00.000Z", citationVerified: true },
  ];
  const document = normalizeCandidate({
    profile: { basis: "fact", sourceIds: ["client-file"], fields: { name: "合成品牌", founder: "张女士", certification: "行业认证" } },
    offerings: [{ name: "核心服务", description: "提供定制服务。", basis: "fact", sourceIds: ["client-file"] }],
    capabilities: [{ name: "方案能力", description: "围绕核心服务提供方案。", basis: "research", sourceIds: ["public-account"], relatedOfferingNames: ["核心服务"] }],
    scenarios: [{ name: "典型场景", description: "适合需要定制方案的用户。", basis: "derived", relatedOfferingNames: ["核心服务"] }],
    recommendationAngles: [{ name: "推荐角度", description: "从定制能力展开。", relatedOfferingNames: ["核心服务"] }],
    competitors: [{ name: "同类品牌", description: "提供同类服务。", basis: "research", sourceIds: ["industry"] }],
    geoQuestions: [{ name: "如何选择定制服务？", description: "选择问题", intent: "selection", knowledgeCoverage: "partial", basis: "research", sourceIds: ["industry"] }],
    restrictions: [{ name: "禁止绝对化排名", description: "不能写行业第一。", type: "forbidden_claim", basis: "candidate", sourceIds: [] }],
  }, sources, "client-1");
  document.revision = 7;
  document.status = { outcome: "partial", warnings: ["案例研究尚未完成"] };
  return document;
}

test("confirmation model keeps 15 ordered sections and never promotes cautions into facts", () => {
  const model = buildCustomerConfirmationModel(fixture());
  assert.equal(model.version, 1);
  assert.equal(model.knowledgeRevision, 7);
  assert.equal(model.sections.length, 15);
  assert.deepEqual(model.sections.map((section) => section.title), [
    "客户 / 品牌概况", "主要产品与服务", "产品 / 服务特点", "品牌故事与发展历史", "线上公开身份",
    "用户需求与典型场景", "核心能力与差异化", "团队 / 负责人", "资质、授权与信任背书", "客户案例",
    "竞对与市场位置", "推荐定位 / GEO 推荐角度", "核心 GEO 问题", "禁止或谨慎使用的表述", "请客户确认 / 补充",
  ]);
  assert.equal(model.sections.find((section) => section.id === "scenarios").entries[0].kind, "derived");
  assert.equal(model.sections.find((section) => section.id === "recommendationAngles").entries[0].kind, "derived");
  assert.equal(model.sections.find((section) => section.id === "restrictions").entries[0].kind, "caution");
  assert.ok(model.confirmationRequests.some((item) => item.topic === "客户案例"));
  assert.ok(model.confirmationRequests.some((item) => item.topic === "禁止绝对化排名"));
  assert.equal(model.sections.find((section) => section.id === "history").entries[0].kind, "gap");
  assert.ok(model.confirmationRequests.length < 20, "candidate items should be grouped by section");
});

test("markdown renders the same model, hides empty headings and centralizes gaps", () => {
  const document = fixture();
  const model = buildCustomerConfirmationModel(document);
  const markdown = renderCustomerConfirmationMarkdown(model, { clientName: "合成品牌", sources: document.sources });
  assert.match(markdown, /^# 合成品牌客户确认稿/m);
  assert.match(markdown, /## 主要产品与服务/);
  assert.match(markdown, /性质：推荐角度\/场景分析/);
  assert.match(markdown, /来源：客户公开账号/);
  assert.match(markdown, /提示：对外使用时请保留来源或限定表述/);
  assert.doesNotMatch(markdown, /## 品牌故事与发展历史/);
  assert.match(markdown, /## 请客户确认 \/ 补充/);
  assert.match(markdown, /\*\*品牌故事与发展历史\*\*：当前资料不足，建议补充/);
});
