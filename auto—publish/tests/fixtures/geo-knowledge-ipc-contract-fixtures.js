"use strict";
const { normalizeCandidate } = require("../../src/content/geo-knowledge-merge");
const knowledge = normalizeCandidate(
  { profile: { fields: { name: "合成客户" } } },
  [],
  "client-1",
);
knowledge.revision = 1;
const state = { phase: "idle", running: false };
const client = { clientId: "client-1" };
const status = {
  configured: false,
  model: "",
  webSearch: true,
  baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
};
const geoKnowledgeIpcContractFixtures = [
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
  ["load", client, { knowledge, state }],
  ["state", client, { state }],
  ["generate", client, { knowledge }],
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
  ["exportMarkdown", client, { markdown: "# 合成客户\n知识库" }],
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
