const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  createContentGenerationBatchService,
} = require("../desktop/services/content-generation-batch-service");

describe("generation batch article title projection", function () {
  it("projects article titles from the article truth without copying article bodies into batch tasks", async function () {
    const persistedBatch = {
      id: "batch-title-1",
      status: "completed",
      concurrency: 2,
      aiConfigFingerprint: "fp",
      clientSources: [
        { clientId: "client-a", materialIds: ["brand"], researchQueryIds: ["q1"] },
      ],
      templates: [{ platform: "lieju", templateId: "guide" }],
      tasks: [
        {
          id: "task-title-1",
          clientId: "client-a",
          platform: "lieju",
          templateId: "guide",
          materialIds: ["brand"],
          researchQueryIds: ["q1"],
          status: "succeeded",
          attempts: 1,
          error: null,
          articleId: "article-title-1",
        },
      ],
      counts: {
        total: 1,
        succeeded: 1,
        failed: 0,
        pending: 0,
        interrupted: 0,
        cancelled: 0,
      },
    };
    const article = {
      id: "article-title-1",
      clientId: "client-a",
      generationTaskId: "task-title-1",
      title: "这是从文章真源投影出的标题\n第二行",
      content: "正文不应该被复制进 generation batch task。",
    };
    const service = createContentGenerationBatchService({
      batchStore: {
        getBatch: () => persistedBatch,
        listBatches: () => [persistedBatch],
      },
      clientKnowledge: {
        listClients: () => [],
        getClient: () => null,
      },
      materialStore: {},
      researchStore: {},
      templateStore: {},
      contentStore: {
        saveArticle: (value) => value,
        findByGenerationTaskId: () => ({ kind: "one", article }),
        resolveIdentities: ({ generationTaskIds }) => ({
          generationTaskIds: generationTaskIds.map((id) => ({
            id,
            result: { kind: "one", article },
          })),
        }),
      },
      aiProviderService: {
        getFingerprint: () => "fp",
      },
    });

    try {
      const projected = service.getBatch("batch-title-1");
      assert.equal(
        projected.tasks[0].articleTitle,
        "这是从文章真源投影出的标题 第二行",
      );
      assert.equal("content" in projected.tasks[0], false);
      assert.equal("article" in projected.tasks[0], false);
      assert.equal("articleTitle" in persistedBatch.tasks[0], false);

      const listed = service.listBatches();
      assert.equal(
        listed[0].tasks[0].articleTitle,
        "这是从文章真源投影出的标题 第二行",
      );
    } finally {
      await service.dispose();
    }
  });

  it("keeps batch reads available when optional title lookup fails", async function () {
    const persistedBatch = {
      id: "batch-title-fallback",
      status: "completed",
      concurrency: 1,
      aiConfigFingerprint: "fp",
      clientSources: [],
      templates: [],
      tasks: [
        {
          id: "task-title-fallback",
          clientId: "client-a",
          platform: "lieju",
          templateId: "guide",
          materialIds: [],
          researchQueryIds: [],
          status: "succeeded",
          attempts: 1,
          error: null,
          articleId: "article-fallback",
        },
      ],
      counts: {
        total: 1,
        succeeded: 1,
        failed: 0,
        pending: 0,
        interrupted: 0,
        cancelled: 0,
      },
    };
    const service = createContentGenerationBatchService({
      batchStore: {
        getBatch: () => persistedBatch,
        listBatches: () => [persistedBatch],
      },
      clientKnowledge: {
        listClients: () => [],
        getClient: () => null,
      },
      materialStore: {},
      researchStore: {},
      templateStore: {},
      contentStore: {
        saveArticle: (value) => value,
        findByGenerationTaskId: () => {
          throw Object.assign(new Error("article read failed"), {
            code: "ARTICLE_STORE_READ_FAILED",
          });
        },
        resolveIdentities: () => {
          throw Object.assign(new Error("article read failed"), {
            code: "ARTICLE_STORE_READ_FAILED",
          });
        },
      },
      aiProviderService: {
        getFingerprint: () => "fp",
      },
    });

    try {
      const projected = service.getBatch("batch-title-fallback");
      assert.equal(projected.tasks[0].articleId, "article-fallback");
      assert.equal(projected.tasks[0].articleTitle, undefined);
    } finally {
      await service.dispose();
    }
  });
});
