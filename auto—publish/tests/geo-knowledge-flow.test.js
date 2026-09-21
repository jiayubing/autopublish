"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createGeoKnowledgeService,
} = require("../desktop/services/geo-knowledge-service");
const {
  createDoubaoCollectionDesktopService,
} = require("../desktop/services/doubao-collection-service");
const { createResearchStore } = require("../src/content/research-store");
const { createArticleStore } = require("../src/content/article-store");
const { createArticleGenerator } = require("../src/content/article-generator");
const { buildPrompt } = require("../src/content/prompt-builder");
const { stableId } = require("../src/content/geo-knowledge-schema");

test("local material-to-knowledge-to-collection-to-article flow survives service restart without network", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "geo-flow-"));
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(workspaceRoot, "clients", "client-1"), {
    recursive: true,
  });
  const material = {
    id: "fixture.md",
    name: "fixture.md",
    extension: ".md",
    status: "ready",
    content: "合成客户提供本地保养服务。",
    contentHash: "fixture-hash",
  };
  const materialStore = {
    listMaterials: async () => [material],
    getSelectedMaterials: async () => [material],
  };
  const sourceIds = [
    stableId("source", material.id + ":" + material.contentHash),
  ];
  const extracted = {
    profile: { fields: { name: "合成客户" }, basis: "fact", sourceIds },
    offerings: [
      { name: "保养服务", description: "本地服务", basis: "fact", sourceIds },
    ],
  };
  const synthesized = {
    ...extracted,
    geoQuestions: [
      {
        name: "如何选择保养服务？",
        intent: "selection",
        basis: "derived",
        relatedOfferingNames: ["保养服务"],
        sourceIds,
      },
    ],
  };
  const replies = [
    extracted,
    { tasks: [{ type: "customer_entity", topic: "客户实体", queries: ["合成客户"] }] },
    { findings: [], discoveries: [], unresolved: [] },
    { tasks: [] },
    synthesized,
  ];
  const client = {
    request: async () => {
      assert.ok(replies.length, "unexpected extra model request");
      return { text: JSON.stringify(replies.shift()), citations: [] };
    },
  };
  const researchStore = createResearchStore(workspaceRoot);
  const contentStore = createArticleStore(workspaceRoot);
  const questionService = createDoubaoCollectionDesktopService({
    workspaceRoot,
    researchStore,
    browserAdapter: {
      collect: () => assert.fail("no real collection authorized"),
    },
  });
  let published = false;
  const operationalStore = {
    listArticleLifecycleFacts: () => ({
      publications: published
        ? [{ articleId: "article-1", platformId: "ctrip", status: "published" }]
        : [],
    }),
  };
  const invalidations = [];
  const options = {
    workspaceRoot,
    materialStore,
    researchStore,
    contentStore,
    questionService,
    operationalStore,
    client,
    getClient: () => ({ name: "合成客户" }),
    onDataInvalidated: (reasonCode, affected) =>
      invalidations.push({ reasonCode, affected }),
  };
  const service = createGeoKnowledgeService(options);
  const generated = (await service.generate({ clientId: "client-1" }))
    .knowledge;
  assert.equal(replies.length, 0);
  assert.equal(generated.offerings[0].basis, "fact");
  const id = generated.geoQuestions[0].id;
  const linked = service.linkQuestions({
    clientId: "client-1",
    revision: generated.revision,
    ids: [id],
  }).knowledge;
  const questionId = linked.geoQuestions[0].questionId;
  assert.deepEqual(invalidations, [
    {
      reasonCode: "GEO_QUESTIONS_LINKED",
      affected: { clientId: "client-1" },
    },
  ]);
  researchStore.saveResearch("client-1", {
    id: questionId,
    question: linked.geoQuestions[0].name,
    answerText: "合成客户提供本地服务，请核对具体项目。",
    references: [],
    collectionMethod: "manual",
    collectedAt: "2026-09-19T00:00:00.000Z",
  });
  assert.equal(
    service.questionDetails({ clientId: "client-1", id }).clientMentioned,
    true,
  );
  const generator = createArticleGenerator({
    getClient: options.getClient,
    materialStore,
    researchStore,
    templateStore: {
      getCatalogTemplate: () => ({
        id: "template-1",
        body: "根据资料写文章",
        name: "合成模板",
      }),
    },
    buildPrompt,
    getGeoKnowledgeContext: service.getGenerationContext,
    createId: () => "article-1",
    aiClient: {
      complete: async (messages) => {
        assert.match(messages[1].content, /本次相关 GEO 知识及限制/);
        assert.match(messages[1].content, /保养服务/);
        return "合成标题\n合成正文";
      },
    },
  });
  contentStore.createArticle(
    await generator.generateArticle({
      clientId: "client-1",
      materialIds: [material.id],
      researchQueryIds: [questionId],
      platform: "ctrip",
      templateId: "template-1",
    }),
  );
  service.dispose();
  const restarted = createGeoKnowledgeService({
    ...options,
    contentStore: createArticleStore(workspaceRoot),
  });
  t.after(() => restarted.dispose());
  assert.equal(
    restarted.load({ clientId: "client-1" }).knowledge.geoQuestions[0]
      .questionId,
    questionId,
  );
  assert.match(
    restarted.exportMarkdown({ clientId: "client-1" }).markdown,
    /保养服务/,
  );
  assert.equal(
    (await restarted.questionArticles({ clientId: "client-1", id }))
      .publishedCount,
    0,
  );
  published = true;
  const associated = await restarted.questionArticles({
    clientId: "client-1",
    id,
  });
  assert.equal(associated.total, 1);
  assert.equal(associated.publishedCount, 1);
  assert.equal(associated.articles[0].label, "已发布");
  assert.equal(
    contentStore.getArticle("client-1", "article-1").knowledgeSnapshot.revision,
    linked.revision,
  );
});
