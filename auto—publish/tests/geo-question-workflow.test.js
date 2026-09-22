"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildGeoQuestionWorkflow } = require("../src/content/geo-question-workflow");
const { queryGeoArticleCounts } = require("../src/content/geo-article-links");

test("workflow matrix rejects stale links and stale answers while allowing current disabled research", () => {
  const document = {
    clientId: "client-1",
    revision: 7,
    geoQuestions: [
      { id: "g1", name: "未关联" },
      { id: "g2", name: "当前问题", questionId: "q2" },
      { id: "g3", name: "已改变问题", questionId: "q3" },
      { id: "g4", name: "无回答", questionId: "q4" },
    ],
  };
  const result = buildGeoQuestionWorkflow({
    document,
    questions: [
      { id: "q2", text: "当前问题", enabled: false },
      { id: "q3", text: "旧问题", enabled: true },
      { id: "q4", text: "无回答", enabled: true },
    ],
    research: [
      { id: "q2", question: "当前问题", isAnswerComplete: true, answerLength: 20, referenceCount: 1 },
      { id: "q3", question: "旧问题", isAnswerComplete: true, answerLength: 20, referenceCount: 1 },
    ],
    articleCounts: { g2: { total: 2, publishedCount: 1 } },
  });
  assert.deepEqual(
    result.items.map((item) => [item.linkStatus, item.generation.code]),
    [
      ["unlinked", "GEO_QUESTION_UNLINKED"],
      ["linked", "GEO_GENERATION_READY"],
      ["stale", "GEO_QUESTION_LINK_STALE"],
      ["linked", "GEO_RESEARCH_MISSING"],
    ],
  );
  assert.equal(result.items[1].collectionEnabled, false);
  assert.deepEqual(result.items[1].articles, { total: 2, publishedCount: 1 });
  assert.equal("answerText" in result.items[1].research, false);
});

test("article counts read summaries once and project zero, many and published counts", async () => {
  let summaryReads = 0;
  let factReads = 0;
  const counts = await queryGeoArticleCounts(
    {
      contentStore: {
        listArticleSummariesAsync: async () => {
          summaryReads++;
          return [
            { id: "a1", title: "A", geoQuestionIds: ["g1", "g2"] },
            { id: "a2", title: "B", geoQuestionIds: ["g2"] },
          ];
        },
      },
      operationalStore: {
        listArticleLifecycleFacts: ({ articleIds }) => {
          factReads++;
          return {
            publicationByArticle: { a1: { status: "published" } },
            submissionByArticle: {},
            trashArticleIds: [],
            articleIds,
          };
        },
      },
    },
    "client-1",
    ["g0", "g1", "g2"],
  );
  assert.equal(summaryReads, 1);
  assert.equal(factReads, 1);
  assert.deepEqual(counts.g0, { total: 0, publishedCount: 0 });
  assert.equal(counts.g1.total, 1);
  assert.equal(counts.g2.total, 2);
});
