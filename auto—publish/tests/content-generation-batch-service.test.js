const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createContentGenerationBatchService } = require("../desktop/services/content-generation-batch-service");
const { createGenerationBatchRunner } = require("../src/content/generation-batch-runner");

function makeHarness(options) {
  const settings = options || {};
  const clients = {
    c1: { id: "c1", name: "Client 1" },
    c2: { id: "c2", name: "Client 2" }
  };
  const materials = {
    c1: [{ id: "brand.md", name: "brand.md", extension: ".md", status: "ready", content: "facts" }],
    c2: [{ id: "broken.docx", name: "broken.docx", extension: ".docx", status: "error", content: "", error: { code: "MATERIAL_DOCX_CONVERSION_FAILED", message: "bad" } }]
  };
  const research = {
    c1: [{ id: "q1", question: "Q1", answerText: "answer", references: [], collectedAt: "2026-07-15T00:00:00.000Z", collectionMethod: "manual" }],
    c2: []
  };
  const templates = {
    "ctrip:guide": { id: "guide", platform: "ctrip", name: "Guide", scenario: "travel", body: "write" }
  };
  const savedArticles = [];
  const calls = { generate: [], save: [], run: [], events: [] };
  let nextBatch = 1;
  const batches = new Map();
  let runnerOptions;
  let currentFingerprint = "fp-1";
  const runnerListeners = new Set();

  const batchStore = {
    createBatch: function(input) {
      const id = "batch-" + nextBatch++;
      const tasks = input.clientSources.flatMap(function(source) {
        return input.templates.map(function(template) {
          return { id: "task-" + source.clientId + "-" + template.templateId, clientId: source.clientId,
            platform: template.platform, templateId: template.templateId, materialIds: source.materialIds.slice(),
            researchQueryIds: source.researchQueryIds.slice(), status: "pending", attempts: 0, error: null, articleId: null };
        });
      });
      const batch = { id, status: "pending", aiConfigFingerprint: input.aiConfigFingerprint,
        clientSources: input.clientSources, templates: input.templates, tasks,
        counts: { total: tasks.length, succeeded: 0, failed: 0, pending: tasks.length, interrupted: 0 } };
      batches.set(id, batch);
      return batch;
    },
    getBatch: function(id) { return batches.get(id); },
    listBatches: function() { return Array.from(batches.values()); },
    updateBatchStatus: function(id, status) { batches.get(id).status = status; return batches.get(id); },
    markTaskRunning: function(id, taskId) { const task = batches.get(id).tasks.find(function(item) { return item.id === taskId; }); task.status = "running"; task.attempts += 1; return batches.get(id); },
    markTaskSucceeded: function(id, taskId, articleId) { const task = batches.get(id).tasks.find(function(item) { return item.id === taskId; }); task.status = "succeeded"; task.articleId = articleId; task.error = null; return batches.get(id); },
    markTaskFailed: function(id, taskId, error) { const task = batches.get(id).tasks.find(function(item) { return item.id === taskId; }); task.status = "failed"; task.error = error; return batches.get(id); },
    markTaskInterrupted: function(id, taskId) { const task = batches.get(id).tasks.find(function(item) { return item.id === taskId; }); task.status = "interrupted"; return batches.get(id); }
  };

  const runner = {
    run: async function(batchId, selection) {
      calls.run.push([batchId, selection]);
      const batch = batchStore.getBatch(batchId);
      const task = batch.tasks.find(function(item) {
        return item.status !== "succeeded" && (selection === "failed" ? item.status === "failed" : item.status === "pending");
      });
      if (task) {
        batchStore.markTaskRunning(batchId, task.id);
        const article = await runnerOptions.executeTask(task, { signal: new AbortController().signal });
        batchStore.markTaskSucceeded(batchId, task.id, article.id);
        batch.status = "completed";
        batch.counts = { total: batch.tasks.length, succeeded: batch.tasks.filter(function(item) { return item.status === "succeeded"; }).length, failed: 0, pending: 0, interrupted: 0 };
      }
      return batchStore.getBatch(batchId);
    },
    stop: async function() { return null; },
    getState: function() { return { status: "idle", batchId: null }; },
    subscribe: function(listener) { runnerListeners.add(listener); return function() { runnerListeners.delete(listener); }; },
    dispose: async function() {}
  };

  const articleStore = settings.articleStore || { saveArticle: function(article) { savedArticles.push(article); return article; }, findByGenerationTaskId: function() { return null; } };
  const service = createContentGenerationBatchService({
    clientKnowledge: { getClient: function(id) { if (!clients[id]) throw Object.assign(new Error("missing"), { code: "CLIENT_NOT_FOUND" }); return clients[id]; }, listClients: function() { return Object.values(clients); } },
    materialStore: { listMaterials: async function(id) { return materials[id] || []; }, getSelectedMaterials: async function(id, ids) { return (materials[id] || []).filter(function(item) { return ids.includes(item.id); }); } },
    researchStore: { listResearch: function(id) { return research[id] || []; }, getResearch: function(id, queryId) { return (research[id] || []).find(function(item) { return item.id === queryId; }); } },
    templateStore: { getTemplate: function(platform, id) { return templates[platform + ":" + id]; }, listTemplates: function() { return Object.values(templates); } },
    articleStore: articleStore,
    articleGeneratorFactory: function() { return { generateArticle: async function(input) { calls.generate.push(input); return { id: "article-1", clientId: input.clientId, title: "Title", content: "Body", status: "generated" }; } }; },
    aiProviderService: { getFingerprint: function() { return currentFingerprint; }, createClient: function() { return {}; } },
    batchStore: batchStore,
    runnerFactory: settings.runnerFactory || function(options) { runnerOptions = options; return runner; }
  });

  return { service, batchStore, calls, savedArticles, setFingerprint: function(value) { currentFingerprint = value; } };
}

describe("content generation batch service", function() {
  it("previews client by template tasks and excludes clients missing either source gate", async function() {
    const { service } = makeHarness();
    const preview = await service.preview({ clientIds: ["c1", "c2"], templates: [{ platform: "ctrip", templateId: "guide" }] });
    assert.equal(preview.executableClientCount, 1);
    assert.equal(preview.executableTaskCount, 1);
    assert.deepStrictEqual(preview.excludedClients, [{ clientId: "c2", codes: ["CLIENT_MATERIAL_REQUIRED", "GEO_RESEARCH_REQUIRED"] }]);
    assert.deepStrictEqual(preview.tasks.map(function(task) { return [task.clientId, task.platform, task.templateId]; }), [["c1", "ctrip", "guide"]]);
  });

  it("revalidates sources, reads them at task start, saves generated provenance, and marks the task succeeded", async function() {
    const { service, calls, savedArticles } = makeHarness();
    const batch = await service.startBatch({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }] });
    assert.equal(batch.status, "completed");
    assert.deepStrictEqual(calls.run, [[batch.id, "pending"]]);
    assert.equal(calls.generate.length, 1);
    assert.deepStrictEqual(calls.generate[0].materialIds, ["brand.md"]);
    assert.deepStrictEqual(calls.generate[0].researchQueryIds, ["q1"]);
    assert.equal(calls.generate[0].generationBatchId, batch.id);
    assert.equal(calls.generate[0].generationTaskId, batch.tasks[0].id);
    assert.equal(savedArticles.length, 1);
  });

  it("treats only article-not-found reads as missing and never generates after a corrupt read", async function() {
    for (const code of ["ARTICLE_NOT_FOUND", "GENERATION_ARTICLE_NOT_FOUND"]) {
      const missingArticleStore = {
        saveArticle: function() {},
        listArticles: async function() { throw Object.assign(new Error("Article was not found"), { code: code }); }
      };
      const missing = makeHarness({
        articleStore: missingArticleStore,
        runnerFactory: function(options) { return createGenerationBatchRunner(options); }
      });
      const generated = await missing.service.startBatch({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }] });

      assert.equal(generated.status, "completed");
      assert.equal(missing.calls.generate.length, 1);
    }

    const readError = Object.assign(new Error("Article JSON is invalid"), { code: "ARTICLE_INVALID" });
    const articleStore = {
      saveArticle: function() {},
      listArticles: async function() { throw readError; }
    };
    const { service, calls } = makeHarness({
      articleStore: articleStore,
      runnerFactory: function(options) {
        return {
          run: async function(batchId) {
            await options.findByGenerationTaskId({ id: "task-c1-guide", clientId: "c1" });
            return options.batchStore.getBatch(batchId);
          }
        };
      }
    });

    await assert.rejects(service.startBatch({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }] }), function(error) {
      return error === readError;
    });

    assert.deepStrictEqual(calls.generate, []);
  });

  it("does not auto-run persisted work after service construction and requires confirmation for config changes", async function() {
    const first = makeHarness();
    const batch = await first.service.createBatch({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }] });
    assert.deepStrictEqual(first.calls.run, []);
    first.setFingerprint("fp-2");
    await assert.rejects(first.service.continueBatch({ batchId: batch.id }), function(error) { return error.code === "GENERATION_AI_CONFIG_CHANGED"; });
    await assert.doesNotReject(first.service.continueBatch({ batchId: batch.id, confirmConfigChange: true }));
  });

  it("persists safe state events and exposes pause, resume, stop, retry, get, and list operations", async function() {
    const { service, calls } = makeHarness();
    const events = [];
    const unsubscribe = service.subscribe(function(event) { events.push(event); });
    const batch = await service.createBatch({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }] });
    assert.equal((await service.get(batch.id)).id, batch.id);
    assert.equal((await service.list()).length, 1);
    await service.resumeBatch({ batchId: batch.id });
    await service.retryFailed({ batchId: batch.id });
    await service.pauseBatch();
    await service.stopBatch();
    unsubscribe();
    assert.ok(events.every(function(event) { return event.batchId && !event.prompt && !event.materials && !event.apiKey; }));
    assert.ok(calls.run.length >= 2);
  });
});
