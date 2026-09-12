const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createContentGenerationBatchService } = require("../desktop/services/content-generation-batch-service");

function createService(articleTitle, counters) {
  const batch = {
    id: "batch-1",
    status: "completed",
    concurrency: 2,
    counts: { total: 1, succeeded: 1, failed: 0, pending: 0, interrupted: 0, cancelled: 0 },
    tasks: [{
      id: "task-1",
      clientId: "client-1",
      platform: "ctrip",
      templateId: "guide",
      status: "succeeded",
      articleId: "article-1",
    }],
  };

  return createContentGenerationBatchService({
    batchStore: {
      getBatch: function(id) { return id === batch.id ? batch : null; },
      listBatches: function() { return [batch]; },
    },
    contentStore: {
      saveArticle: function(article) { return article; },
      findByGenerationTaskId: function(taskId) {
        counters.identityLookups += 1;
        assert.equal(taskId, "task-1");
        return {
          kind: "one",
          article: {
            id: "article-1",
            clientId: "client-1",
            generationTaskId: "task-1",
            title: articleTitle.value,
          },
        };
      },
      getArticle: function() {
        counters.fullArticleReads += 1;
        throw new Error("generation title projection must not read the full article");
      },
    },
    clientKnowledge: {
      listClients: function() { return []; },
      getClient: function() { return null; },
    },
    materialStore: {
      listMaterials: async function() { return []; },
      getSelectedMaterials: async function() { return []; },
    },
    researchStore: {
      listResearch: function() { return []; },
      getResearch: function() { return null; },
    },
    templateStore: {
      listTemplates: function() { return []; },
      getCatalogTemplate: function() { return null; },
    },
    aiProviderService: {
      getFingerprint: function() { return "test-fingerprint"; },
    },
  });
}

describe("generation title projection", function() {
  it("uses the content identity read model instead of reopening complete article files", function() {
    const articleTitle = { value: "Generated title" };
    const counters = { identityLookups: 0, fullArticleReads: 0 };
    const service = createService(articleTitle, counters);

    const first = service.getBatch("batch-1");
    assert.equal(first.tasks[0].articleTitle, "Generated title");

    articleTitle.value = "Edited title";
    const second = service.getBatch("batch-1");
    assert.equal(second.tasks[0].articleTitle, "Edited title");

    assert.equal(counters.identityLookups, 2);
    assert.equal(counters.fullArticleReads, 0);
  });

  it("keeps identity conflicts out of optional title display data", function() {
    const batch = {
      id: "batch-1",
      status: "completed",
      counts: { total: 1, succeeded: 1, failed: 0, pending: 0, interrupted: 0, cancelled: 0 },
      tasks: [{ id: "task-1", clientId: "client-1", status: "succeeded", articleId: "article-1" }],
    };
    const service = createContentGenerationBatchService({
      batchStore: { getBatch: function() { return batch; }, listBatches: function() { return [batch]; } },
      contentStore: {
        saveArticle: function(article) { return article; },
        findByGenerationTaskId: function() { return { kind: "many", matches: [] }; },
      },
      clientKnowledge: { listClients: function() { return []; }, getClient: function() { return null; } },
      materialStore: { listMaterials: async function() { return []; }, getSelectedMaterials: async function() { return []; } },
      researchStore: { listResearch: function() { return []; }, getResearch: function() { return null; } },
      templateStore: { listTemplates: function() { return []; }, getCatalogTemplate: function() { return null; } },
    });

    assert.equal(Object.hasOwn(service.getBatch("batch-1").tasks[0], "articleTitle"), false);
  });
});
