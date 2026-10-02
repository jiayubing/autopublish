"use strict";
const { normalizeCandidate } = require("../../src/content/geo-knowledge-merge");
const knowledge = normalizeCandidate(
  { profile: { fields: { name: "合成客户" } } },
  [],
  "client-1",
);
knowledge.revision = 1;
knowledge.deliverable = {
  version: 1,
  knowledgeRevision: 1,
  status: "draft",
  markdown: "# 合成九板块知识稿",
  warnings: ["篇幅不足仍交付"],
};
const state = { phase: "idle", running: false };
const client = { clientId: "client-1" };
const status = {
  configured: false,
  model: "",
  webSearch: true,
  baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
  defaultGlobalPrompt: "默认研究要求",
  globalPrompt: "",
  defaultFinalKnowledgePrompt: "默认写稿要求",
  finalKnowledgePrompt: "",
};
const geoKnowledgeIpcContractFixtures = [
  [
    "questionWorkflow",
    client,
    { clientId: "client-1", knowledgeRevision: 1, items: [] },
  ],
  [
    "questionArticles",
    { ...client, id: "geo-question-1" },
    { articles: [], total: 0, publishedCount: 0 },
  ],
  [
    "linkQuestions",
    { ...client, revision: 1, ids: ["geo-question-1"] },
    { knowledge },
  ],
  [
    "questionDetails",
    { ...client, id: "geo-question-1" },
    {
      id: "geo-question-1",
      linkStatus: "unlinked",
      enabled: null,
      research: null,
      clientMentioned: null,
    },
  ],
  [
    "load",
    client,
    {
      knowledge,
      storageStatus: "current_v2",
      state,
      modelDraft: { status: "unverified", markdown: "# 未验证模型草稿" },
    },
  ],
  [
    "state",
    client,
    {
      state: {
        phase: "failed",
        running: false,
        failedPhase: "K",
        outcome: "uncertain",
        errorCode: "GEO_REQUEST_UNCERTAIN",
      },
    },
  ],
  ["generate", client, { knowledge }],
  ["editDeliverable", { ...client, revision: 1, markdown: "# 保存正文" }, { knowledge }],
  ["acceptDeliverable", { ...client, revision: 1, candidateId: "candidate-1" }, { knowledge }],
  ["cancel", client, { state }],
  [
    "edit",
    {
      ...client,
      revision: 1,
      section: "profile",
      id: knowledge.profile.id,
      changes: { fields: { name: "人工名称" } },
    },
    { knowledge },
  ],
  [
    "confirmSourceType",
    {
      ...client,
      revision: 1,
      sourceId: "source-1",
      targetType: "official_web",
    },
    { knowledge },
  ],
  [
    "resolveConflict",
    {
      ...client,
      revision: 1,
      conflictId: "restrictions-1",
      claimId: "claim-1",
    },
    { knowledge },
  ],
  [
    "promptSettings",
    client,
    { defaultGlobalPrompt: "默认研究要求", globalPrompt: "", clientPrompt: "" },
  ],
  [
    "saveGlobalPrompt",
    { researchPromptOverride: "自定义全局要求" },
    { defaultGlobalPrompt: "默认研究要求", globalPrompt: "自定义全局要求" },
  ],
  [
    "saveFinalKnowledgePrompt",
    { finalKnowledgePromptOverride: "自定义写稿要求" },
    {
      defaultFinalKnowledgePrompt: "默认写稿要求",
      finalKnowledgePrompt: "自定义写稿要求",
    },
  ],
  [
    "saveClientPrompt",
    { ...client, researchPrompt: "客户长期要求" },
    { researchPrompt: "客户长期要求" },
  ],
  [
    "exportMarkdown",
    { ...client, revision: 1 },
    { markdown: "# 合成客户\n九板块正文" },
  ],
  ["configStatus", {}, status],
  ["testConnection", { search: false }, { search: false, citationCount: 0 }],
  [
    "saveConfig",
    {
      model: "synthetic",
      apiKey: "synthetic-key",
      webSearch: true,
      baseUrl: status.baseUrl,
    },
    { ...status, configured: true, model: "synthetic" },
  ],
].map(([method, request, result]) => ({
  capability: "content.geo" + method[0].toUpperCase() + method.slice(1),
  channel: "geo-knowledge:" + method,
  owner: "content",
  request,
  result,
}));
module.exports = { geoKnowledgeIpcContractFixtures };
