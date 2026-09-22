"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { normalizeCandidate } = require("../src/content/geo-knowledge-merge");
const {
  profileProjection,
  stableId,
} = require("../src/content/geo-knowledge-schema");
const {
  selectGeoKnowledge,
  buildArticleBriefV2,
  validateArticleBriefV2,
} = require("../src/content/geo-generation-context");
const { projectArticleSummary } = require("../src/content/article-summary");
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

function addV2BriefKnowledge(doc) {
  doc.sources.push(
    {
      id: "source-public",
      type: "client_public",
      title: "客户公开账号",
      url: "https://example.com/client",
      fetchedAt: "2026-09-19T00:00:00.000Z",
      citationVerified: true,
    },
    {
      id: "source-web",
      type: "official_web",
      title: "客户官网",
      url: "https://example.com/official",
      fetchedAt: "2026-09-19T00:00:00.000Z",
      citationVerified: true,
    },
  );
  doc.profile.claims.push(
    {
      id: stableId("claim", "slogan:公开口号"),
      field: "slogan",
      value: "公开口号",
      status: "accepted",
      basis: "research",
      origin: "ai",
      locked: false,
      sourceIds: ["source-public"],
    },
    {
      id: stableId("claim", "address:候选地址"),
      field: "address",
      value: "候选地址",
      status: "candidate",
      basis: "candidate",
      origin: "ai",
      locked: false,
      sourceIds: ["source-public"],
    },
  );
  doc.profile = profileProjection(doc.profile.claims);
  const relatedOfferingIds = [doc.offerings[0].id];
  const unrelatedOfferingIds = [doc.offerings[1].id];
  const common = (section, name, options = {}) => ({
    id: stableId(section, name),
    identity: name,
    basis: options.basis || "research",
    origin: "ai",
    locked: false,
    sourceIds: options.sourceIds || ["source-web"],
    relatedOfferingIds: options.relatedOfferingIds || [],
    relatedScenarioIds: options.relatedScenarioIds || [],
    name,
    description: name + "说明",
    ...(options.extra || {}),
  });
  doc.onlinePresence.push(
    common("onlinePresence", "相关公开账号", {
      sourceIds: ["source-public"],
      relatedOfferingIds,
      extra: { platform: "微信公众号", url: "https://example.com/account" },
    }),
    ...Array.from({ length: 4 }, (_, index) =>
      common("onlinePresence", "全局账号" + (index + 1), {
        extra: {
          platform: "平台" + (index + 1),
          url: "https://example.com/account-" + (index + 1),
        },
      }),
    ),
  );
  doc.history.push(
    common("history", "相关历史", { relatedOfferingIds }),
    ...Array.from({ length: 3 }, (_, index) =>
      common("history", "全局历史" + (index + 1)),
    ),
  );
  doc.cases.push(
    common("cases", "相关案例", { relatedOfferingIds }),
    common("cases", "候选案例", {
      basis: "candidate",
      relatedOfferingIds,
    }),
    common("cases", "无关案例", { relatedOfferingIds: unrelatedOfferingIds }),
  );
  doc.recommendationAngles.push(
    ...Array.from({ length: 4 }, (_, index) =>
      common("recommendationAngles", "推荐角度" + (index + 1), {
        basis: "derived",
        sourceIds: [],
        relatedOfferingIds,
      }),
    ),
    common("recommendationAngles", "无关推荐角度", {
      basis: "derived",
      sourceIds: [],
      relatedOfferingIds: unrelatedOfferingIds,
    }),
  );
  doc.competitors.push(
    common("competitors", "关联竞对", { relatedOfferingIds }),
    ...Array.from({ length: 5 }, (_, index) =>
      common("competitors", "文字竞对" + (index + 1)),
    ),
    common("competitors", "未提及竞对"),
  );
  return doc;
}
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
test("V2 brief selects accepted claims and bounded related knowledge with deterministic attribution", () => {
  const doc = addV2BriefKnowledge(library());
  const selected = selectGeoKnowledge(
    doc,
    [
      {
        ...research,
        answerText: "可比较文字竞对1、文字竞对2、文字竞对3、文字竞对4和文字竞对5。",
        references: [{ title: "文字竞对5资料", url: "https://example.com/ref" }],
      },
    ],
    ["query-1"],
  );
  const context = JSON.parse(selected.context);
  assert.deepEqual(
    context.profile.claims.map((claim) => [
      claim.field,
      claim.evidenceClass,
      claim.attributionRequired,
    ]),
    [
      ["name", "fact", false],
      ["slogan", "research", true],
    ],
  );
  assert.equal(context.profile.fields.address, undefined);
  assert.deepEqual(context.cases.map((item) => item.name), ["相关案例"]);
  assert.deepEqual(
    context.recommendationAngles.map((item) => item.name),
    ["推荐角度1", "推荐角度2", "推荐角度3"],
  );
  assert.deepEqual(
    context.competitors.map((item) => item.name),
    ["关联竞对", "文字竞对1", "文字竞对2", "文字竞对3", "文字竞对4"],
  );
  assert.equal(context.onlinePresence[0].attributionRequired, true);
  assert.equal(
    context.sources.some((source) => source.id === "source-public"),
    true,
  );
});
test("brand questions add only the stable client-wide history and presence allowances", () => {
  const doc = addV2BriefKnowledge(library());
  doc.geoQuestions[0].intent = "brand";
  const context = JSON.parse(
    selectGeoKnowledge(doc, [research], ["query-1"]).context,
  );
  assert.deepEqual(
    context.history.map((item) => item.name),
    ["相关历史", "全局历史1", "全局历史2"],
  );
  assert.deepEqual(
    context.onlinePresence.map((item) => item.name),
    ["相关公开账号", "全局账号1", "全局账号2", "全局账号3"],
  );
  assert.deepEqual(context.recommendationAngles, []);
  assert.deepEqual(context.competitors, []);
});
test("Article Brief v2 binds one GEO question to collection research and persists as a v2 article snapshot", (t) => {
  const doc = addV2BriefKnowledge(library());
  const currentResearch = {
    id: "query-1",
    clientId: "client-1",
    question: "如何选择服务？",
    answerText: "合成客户可参考关联竞对。\n1. 服务范围：核对实际范围",
    references: [{ title: "未在正文出现的参考标题", url: "https://example.com/ref" }],
    collectedAt: "2026-09-19T00:00:00.000Z",
    collectionMethod: "manual",
  };
  const input = {
    document: doc,
    knowledgeRevision: doc.revision,
    geoQuestionId: doc.geoQuestions[0].id,
    collectionQuestion: { id: "query-1", clientId: "client-1", text: " 如何选择服务？ " },
    research: currentResearch,
  };
  const brief = buildArticleBriefV2(input);
  assert.equal(brief.targetQuestion.geoQuestionId, doc.geoQuestions[0].id);
  assert.equal(brief.targetQuestion.collectionQuestionId, currentResearch.id);
  assert.equal(brief.currentResearch.clientMentioned, true);
  assert.deepEqual(brief.currentResearch.decisionDimensions, ["服务范围"]);
  assert.equal(brief.currentResearch.mentionedEntities.includes("关联竞对"), true);
  assert.equal(brief.currentResearch.mentionedEntities.includes("未在正文出现的参考标题"), false);
  assert.deepEqual(validateArticleBriefV2(brief, "client-1", ["query-1"]), brief);
  assert.deepEqual(
    projectArticleSummary({ id: "a", clientId: "client-1", title: "A", content: "B", knowledgeSnapshot: brief }).geoQuestionIds,
    [doc.geoQuestions[0].id],
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "geo-brief-v2-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = createArticleStore(root);
  store.createArticle({
    id: "article-v2",
    clientId: "client-1",
    researchQueryIds: ["query-1"],
    researchSnapshots: [{
      questionId: "query-1",
      question: currentResearch.question,
      answerText: currentResearch.answerText,
      references: currentResearch.references,
      collectedAt: currentResearch.collectedAt,
      collectionMethod: currentResearch.collectionMethod,
    }],
    title: "V2 article",
    content: "V2 body",
    status: "generated",
    createdAt: "2026-09-22T00:00:00.000Z",
    knowledgeSnapshot: brief,
  });
  assert.equal(store.getArticle("client-1", "article-v2").knowledgeSnapshot.version, 2);
  assert.deepEqual(store.getArticleSummary("client-1", "article-v2").geoQuestionIds, [doc.geoQuestions[0].id]);
  assert.throws(() => store.createArticle({
    ...store.getArticle("client-1", "article-v2"),
    id: "article-v2-mismatch",
    researchSnapshots: [{
      ...store.getArticle("client-1", "article-v2").researchSnapshots[0],
      answerText: "不同回答",
    }],
  }), { code: "ARTICLE_INVALID" });
  for (const changed of [
    { knowledgeRevision: doc.revision + 1 },
    { collectionQuestion: { id: "query-2", clientId: "client-1", text: "如何选择服务？" } },
    { research: { ...currentResearch, id: "query-2" } },
    { research: { ...currentResearch, clientId: "other" } },
    { research: { ...currentResearch, question: "已变化的问题" } },
  ])
    assert.throws(() => buildArticleBriefV2({ ...input, ...changed }), {
      code: "GENERATION_SOURCE_STALE",
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
  assert.match(messages[0].content, /attributionRequired=true/);
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
