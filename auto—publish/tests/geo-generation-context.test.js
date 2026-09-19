"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { normalizeCandidate } = require("../src/content/geo-knowledge-merge");
const { selectGeoKnowledge } = require("../src/content/geo-generation-context");
const { createArticleGenerator } = require("../src/content/article-generator");
const { buildPrompt } = require("../src/content/prompt-builder");
const { createArticleStore } = require("../src/content/article-store");
const { queryGeoArticles } = require("../src/content/geo-article-links");
const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");
const {
  productionIpcContractFixtures,
} = require("./fixtures/phase-06-production-ipc-contract-fixtures");

function library() {
  const fact = { basis: "fact", sourceIds: ["source-1"] };
  const doc = normalizeCandidate(
    {
      profile: { ...fact, fields: { name: "合成客户" } },
      offerings: [
        { ...fact, name: "相关服务" },
        { ...fact, name: "无关服务" },
        { name: "候选宣传", basis: "candidate" },
      ],
      scenarios: [{ name: "相关场景", basis: "derived" }],
      capabilities: [
        { ...fact, name: "相关能力", relatedOfferingNames: ["相关服务"] },
        { ...fact, name: "无关能力", relatedOfferingNames: ["无关服务"] },
      ],
      geoQuestions: [
        {
          name: "如何选择服务？",
          intent: "selection",
          relatedOfferingNames: ["相关服务", "候选宣传"],
          relatedScenarioNames: ["相关场景"],
        },
        { name: "其他问题", intent: "category" },
      ],
      restrictions: [
        {
          name: "禁止效果承诺",
          description: "不得承诺百分之百效果",
          type: "forbidden_claim",
        },
        {
          name: "内部信息",
          description: "内部折扣不可公开",
          type: "internal_only",
        },
      ],
    },
    [{ id: "source-1", type: "client_input", title: "合成输入" }],
    "client-1",
  );
  doc.revision = 3;
  doc.geoQuestions[0].questionId = "query-1";
  doc.geoQuestions[1].questionId = "query-2";
  return doc;
}
const research = {
  question: "如何选择服务？",
  answerText: "按需求核对服务范围与证据。",
  references: [],
  collectedAt: "2026-09-19T00:00:00.000Z",
  collectionMethod: "manual",
};
test("selection excludes unrelated and candidate claims, includes all restrictions, and rejects obsolete question text", () => {
  const doc = library();
  const selected = selectGeoKnowledge(doc, [research], ["query-1"]);
  assert.match(selected.context, /相关服务/);
  assert.match(selected.context, /相关能力/);
  assert.match(selected.context, /相关场景/);
  assert.match(selected.context, /不得承诺百分之百效果/);
  assert.match(selected.context, /内部折扣不可公开/);
  assert.doesNotMatch(selected.context, /无关服务|无关能力|候选宣传|其他问题/);
  assert.deepEqual(
    selected.questions.map((q) => q.id),
    [doc.geoQuestions[0].id],
  );
  assert.equal(
    selectGeoKnowledge(
      doc,
      [{ ...research, question: "变更后的问题" }],
      ["query-1"],
    ),
    null,
  );
  assert.equal(selectGeoKnowledge(null, [research], ["query-1"]), null);
  doc.restrictions = Array.from({ length: 12 }, (_, i) => ({
    ...doc.restrictions[0],
    id: "restriction-" + i,
    description: "限".repeat(12000),
  }));
  assert.throws(() => selectGeoKnowledge(doc, [research], ["query-1"]), {
    code: "GEO_CONTEXT_TOO_LARGE",
  });
});
test("generation records the actual bounded knowledge input and persistence survives later knowledge changes", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "geo-article-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let doc = library();
  let messages;
  const generator = createArticleGenerator({
    getClient: () => ({ name: "合成客户" }),
    researchStore: { getResearch: () => research },
    materialStore: {
      getSelectedMaterials: async () => [
        {
          id: "material-1",
          name: "合成资料",
          extension: ".md",
          content: "合成客户提供本地服务。",
          status: "ready",
        },
      ],
    },
    templateStore: {
      getCatalogTemplate: () => ({
        id: "template-1",
        name: "合成模板",
        body: "根据事实写文章",
      }),
    },
    buildPrompt,
    getGeoKnowledgeContext: (_clientId, records, ids) =>
      selectGeoKnowledge(doc, records, ids),
    aiClient: {
      complete: async (value) => {
        messages = value;
        return "合成文章\n合成正文";
      },
    },
    createId: () => "article-1",
  });
  const article = await generator.generateArticle({
    clientId: "client-1",
    materialIds: ["material-1"],
    researchQueryIds: ["query-1"],
    platform: "ctrip",
    templateId: "template-1",
  });
  assert.match(messages[0].content, /restrictions 优先/);
  assert.ok(messages[1].content.endsWith(article.knowledgeSnapshot.context));
  const store = createArticleStore(root);
  store.createArticle(article);
  const original = structuredClone(article.knowledgeSnapshot);
  doc = library();
  doc.revision++;
  doc.offerings[0].name = "新的服务";
  assert.deepEqual(
    store.getArticle("client-1", article.id).knowledgeSnapshot,
    original,
  );
  const fresh = createArticleStore(root);
  const summary = fresh.getArticleSummary("client-1", article.id);
  assert.deepEqual(
    summary.geoQuestionIds,
    original.questions.map((q) => q.id),
  );
  assert.equal(summary.knowledgeSnapshot, undefined);
  assert.equal(summary.content, undefined);
  assert.throws(
    () =>
      fresh.createArticle({
        ...article,
        id: "article-2",
        knowledgeSnapshot: { ...original, clientId: "other-client" },
      }),
    { code: "ARTICLE_INVALID" },
  );
  // The real transport remains closed while allowing the derived association IDs.
  const contract = productionIpcRegistry.byChannel(
    "content:get-article-management-snapshot",
  );
  const payload = structuredClone(
    productionIpcContractFixtures.find((f) => f.channel === contract.channel)
      .result,
  );
  payload.articles = [summary];
  assert.equal(productionIpcRegistry.success(contract, payload).ok, true);
});
test("associated article counts use summaries and the existing lifecycle projection, never load article bodies", async () => {
  const id = library().geoQuestions[0].id;
  const articles = [
    {
      id: "a1",
      clientId: "client-1",
      title: "未投稿",
      summaryVersion: 1,
      hasContent: true,
      geoQuestionIds: [id],
    },
    {
      id: "a2",
      clientId: "client-1",
      title: "已发布",
      summaryVersion: 1,
      hasContent: true,
      geoQuestionIds: [id],
    },
    {
      id: "a3",
      clientId: "client-1",
      title: "无关",
      summaryVersion: 1,
      hasContent: true,
    },
  ];
  const result = await queryGeoArticles(
    {
      contentStore: {
        listArticleSummariesAsync: async (clientId) => {
          assert.equal(clientId, "client-1");
          return articles;
        },
        getArticle: () => assert.fail("must not load bodies"),
      },
      operationalStore: {
        listArticleLifecycleFacts: ({ articleIds }) => {
          assert.deepEqual(articleIds, ["a1", "a2"]);
          return {
            publications: [
              { articleId: "a2", status: "published", platformId: "ctrip" },
            ],
          };
        },
      },
    },
    "client-1",
    id,
  );
  assert.equal(result.total, 2);
  assert.equal(result.publishedCount, 1);
  assert.deepEqual(
    result.articles.map((a) => a.stage),
    ["pending_submission", "published"],
  );
});
