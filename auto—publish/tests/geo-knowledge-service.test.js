"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createGeoKnowledgeService,
} = require("../desktop/services/geo-knowledge-service");
const { normalizeCandidate } = require("../src/content/geo-knowledge-merge");
const {
  DEFAULT_FINAL_KNOWLEDGE_PROMPT,
} = require("../src/content/final-knowledge-prompt");
const {
  createContentPathPolicy,
} = require("../src/content/content-path-policy");
test("final knowledge prompt setting persists independently of research prompt", (t) => {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "geo-final-prompt-"),
  );
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  const options = {
    workspaceRoot,
    userDataPath: path.join(workspaceRoot, "config"),
    configStore: {
      status: () => ({
        configured: false,
        model: "",
        webSearch: true,
        baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
      }),
    },
  };
  const service = createGeoKnowledgeService(options);
  assert.equal(
    service.configStatus().defaultFinalKnowledgePrompt,
    DEFAULT_FINAL_KNOWLEDGE_PROMPT,
  );
  assert.equal(service.configStatus().finalKnowledgePrompt, "");
  service.saveGlobalPrompt({ researchPromptOverride: "独立研究要求" });
  service.saveFinalKnowledgePrompt({
    finalKnowledgePromptOverride: "独立写稿要求",
  });
  const restarted = createGeoKnowledgeService(options);
  assert.equal(restarted.configStatus().globalPrompt, "独立研究要求");
  assert.equal(restarted.configStatus().finalKnowledgePrompt, "独立写稿要求");
  restarted.saveFinalKnowledgePrompt({ finalKnowledgePromptOverride: "" });
  assert.equal(service.configStatus().finalKnowledgePrompt, "");
  assert.equal(service.configStatus().globalPrompt, "独立研究要求");
  service.dispose();
  restarted.dispose();
});
test("missing knowledge keeps client generation context optional and batch workflow empty", async (t) => {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "geo-no-knowledge-"),
  );
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  const service = createGeoKnowledgeService({
    workspaceRoot,
    getClient: () => ({ name: "合成客户" }),
  });
  assert.deepEqual(await service.questionWorkflow({ clientId: "client-1" }), {
    clientId: "client-1",
    knowledgeRevision: 0,
    items: [],
  });
  assert.equal(service.getGenerationContext("client-1", [], []), null);
  const directory =
    createContentPathPolicy(workspaceRoot).workspace.geoKnowledge;
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "client-1.json"), "not JSON");
  await assert.rejects(service.questionWorkflow({ clientId: "client-1" }), {
    code: "GEO_KNOWLEDGE_INVALID",
  });
  assert.throws(() => service.getGenerationContext("client-1", [], []), {
    code: "GEO_KNOWLEDGE_INVALID",
  });
  service.dispose();
});
test("desktop knowledge use cases persist generated facts, manual edits and export", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "geo-service-"));
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  const service = createGeoKnowledgeService({
    workspaceRoot,
    getClient: () => ({ name: "合成客户" }),
    materialStore: { listMaterials: async () => [] },
    research: {
      run: async () => ({
        markdown: "# 九板块正文\n\n## 产品或服务描述\n\n合成客户服务。",
        knowledge: { quality: { status: "complete", shortSections: [], overlongSections: [] } },
        document: normalizeCandidate(
          { profile: { fields: { name: "合成客户" } } },
          [],
          "client-1",
        ),
      }),
    },
  });
  assert.equal(service.load({ clientId: "client-1" }).knowledge, null);
  const { knowledge } = await service.generate({ clientId: "client-1" });
  assert.equal(knowledge.revision, 1);
  service.edit({
    clientId: "client-1",
    revision: 1,
    section: "profile",
    id: knowledge.profile.id,
    changes: { fields: { name: "人工名称" } },
  });
  const markdown = service.exportMarkdown({
    clientId: "client-1",
    revision: 2,
  }).markdown;
  assert.match(markdown, /合成客户服务/);
  assert.throws(() => service.exportMarkdown({ clientId: "client-1", revision: 1 }), { code: "GEO_REVISION_CONFLICT" });
  assert.equal(
    service.load({ clientId: "client-1" }).knowledge.profile.locked,
    true,
  );
  service.dispose();
  await assert.rejects(service.generate({ clientId: "client-1" }), {
    code: "GEO_CANCELLED",
  });
});
