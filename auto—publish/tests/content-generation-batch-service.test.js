const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createContentGenerationBatchService } = require("../desktop/services/content-generation-batch-service");
const { createGenerationBatchRunner } = require("../src/content/generation-batch-runner");
const { createGenerationBatchStore } = require("../src/content/generation-batch-store");
const { getClient } = require("../src/content/client-knowledge");
const { createClientMaterialStore } = require("../src/content/client-material-store");

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
      const batch = { id, status: "pending", concurrency: input.concurrency, aiConfigFingerprint: input.aiConfigFingerprint,
        clientSources: input.clientSources, templates: input.templates, tasks,
        counts: { total: tasks.length, succeeded: 0, failed: 0, pending: tasks.length, interrupted: 0, cancelled: 0 } };
      batches.set(id, batch);
      return batch;
    },
    getBatch: function(id) { return batches.get(id); },
    listBatches: function() { return Array.from(batches.values()); },
    updateBatchStatus: function(id, status) { batches.get(id).status = status; return batches.get(id); },
    markTaskRunning: function(id, taskId) { const task = batches.get(id).tasks.find(function(item) { return item.id === taskId; }); task.status = "running"; task.attempts += 1; return batches.get(id); },
    markTaskSucceeded: function(id, taskId, articleId) { const task = batches.get(id).tasks.find(function(item) { return item.id === taskId; }); task.status = "succeeded"; task.articleId = articleId; task.error = null; return batches.get(id); },
    markTaskFailed: function(id, taskId, error) { const task = batches.get(id).tasks.find(function(item) { return item.id === taskId; }); task.status = "failed"; task.error = error; return batches.get(id); },
      markTaskInterrupted: function(id, taskId) { const task = batches.get(id).tasks.find(function(item) { return item.id === taskId; }); task.status = "interrupted"; return batches.get(id); },
      cancelPending: function(id) { const batch = batches.get(id); batch.tasks.forEach(function(task) { if (task.status === "pending") task.status = "cancelled"; }); batch.counts.pending = batch.tasks.filter(function(task) { return task.status === "pending"; }).length; batch.counts.cancelled = batch.tasks.filter(function(task) { return task.status === "cancelled"; }).length; if (!batch.tasks.some(function(task) { return ["pending", "running", "failed", "interrupted"].includes(task.status); })) batch.status = "completed"; return batch; },
      abandonBatch: function(id) { const batch = batches.get(id); batch.tasks.forEach(function(task) { if (task.status === "pending") task.status = "cancelled"; }); batch.status = "abandoned"; return batch; }
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
        batch.counts = { total: batch.tasks.length, succeeded: batch.tasks.filter(function(item) { return item.status === "succeeded"; }).length, failed: 0, pending: 0, interrupted: 0, cancelled: batch.tasks.filter(function(item) { return item.status === "cancelled"; }).length };
      }
      return batchStore.getBatch(batchId);
    },
    pause: async function() { return null; },
    getState: function() { return { status: "idle", batchId: null }; },
    subscribe: function(listener) { runnerListeners.add(listener); return function() { runnerListeners.delete(listener); }; },
    dispose: async function() {}
  };

  const articleStore = settings.contentStore || { saveArticle: function(article) { savedArticles.push(article); return article; }, findByGenerationTaskId: function() { return null; } };
  const clientKnowledge = settings.clientKnowledge || {
    getClient: function(id) { if (!clients[id]) throw Object.assign(new Error("missing"), { code: "CLIENT_NOT_FOUND" }); return clients[id]; },
    listClients: function() { return Object.values(clients); }
  };
  const materialStore = settings.materialStore || {
    listMaterials: async function(id) { return materials[id] || []; },
    getSelectedMaterials: async function(id, ids) { return (materials[id] || []).filter(function(item) { return ids.includes(item.id); }); }
  };
  const researchStore = settings.researchStore || {
    listResearch: function(id) { return research[id] || []; },
    getResearch: function(id, queryId) { return (research[id] || []).find(function(item) { return item.id === queryId; }); }
  };
  const service = createContentGenerationBatchService({
    clientKnowledge: clientKnowledge,
    materialStore: materialStore,
    researchStore: researchStore,
    templateStore: settings.templateStore || { getCatalogTemplate: function(input) { return templates[input.platformId + ":" + input.templateId]; }, listTemplates: function() { return Object.values(templates); } },
    contentStore: articleStore,
    articleGeneratorFactory: settings.articleGeneratorFactory || function() { return { generateArticle: async function(input) { calls.generate.push(input); return { id: "article-1", clientId: input.clientId, title: "Title", content: "Body", status: "generated" }; } }; },
    aiProviderService: { getFingerprint: function() { return currentFingerprint; }, createClient: function() { return {}; } },
    batchStore: batchStore,
    runnerFactory: settings.runnerFactory || function(options) { runnerOptions = options; return runner; }
  });

  return { service, batchStore, calls, savedArticles, setFingerprint: function(value) { currentFingerprint = value; } };
}

async function waitForBatch(service, batchId, predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const batch = await service.get(batchId);
    if (predicate(batch) && !["running", "pausing", "stopping"].includes(service.getState().status)) return batch;
    await new Promise(function(resolve) { setTimeout(resolve, 5); });
  }
  throw new Error("Timed out waiting for generation batch " + batchId);
}

describe("content generation batch service", function() {
  it("passes the requested batch concurrency to the runner and defaults to two", async function() {
    const observed = [];
    const harness = makeHarness({
      runnerFactory: function(options) {
        observed.push(options.concurrency);
        return {
          run: async function(batchId) { const batch = options.batchStore.getBatch(batchId); batch.status = "completed"; return batch; },
          getState: function() { return { status: "idle", batchId: null, concurrency: options.concurrency }; },
          subscribe: function() { return function() {}; },
          dispose: async function() {},
        };
      },
    });
    const first = await harness.service.createBatch({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }] });
    await harness.service.startBatch({ batchId: first.id });
    await waitForBatch(harness.service, first.id, function(value) { return value.status === "completed"; });
    const second = await harness.service.createBatch({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }], concurrency: 4 });
    await harness.service.startBatch({ batchId: second.id });
    assert.deepEqual(observed, [2, 4]);
  });

  it("reuses selected source reads across templates within one batch run", async function() {
    let selectedMaterialReads = 0;
    const harness = makeHarness({
      templateStore: {
        getCatalogTemplate: function(input) { return { id: input.templateId, platform: input.platformId, name: input.templateId, scenario: input.templateId, body: "write" }; },
        listTemplates: function() { return []; },
      },
      materialStore: {
        listMaterials: async function() { return [{ id: "brand.md", name: "brand.md", extension: ".md", status: "ready", content: "facts" }]; },
        getSelectedMaterials: async function() { selectedMaterialReads += 1; return [{ id: "brand.md", name: "brand.md", extension: ".md", status: "ready", content: "facts" }]; },
      },
      runnerFactory: function(options) {
        return createGenerationBatchRunner(Object.assign({}, options, { concurrency: 1 }));
      },
      articleGeneratorFactory: function(deps) {
        return { generateArticle: async function(input) { await deps.materialStore.getSelectedMaterials(input.clientId, input.materialIds); return { id: "article-" + input.templateId, clientId: input.clientId, title: "Title", content: "Body", status: "generated" }; } };
      },
    });
    const batch = await harness.service.startBatch({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "one" }, { platform: "ctrip", templateId: "two" }] });
    await waitForBatch(harness.service, batch.id, function(value) { return value.status === "completed"; });
    assert.equal(selectedMaterialReads, 1);
  });
  it("keeps generation owner dependencies free of submission admission paths", function() {
    for (const relative of [
      "desktop/services/content-generation-batch-service.js",
      "src/content/generation-batch-runner.js",
      "src/content/article-generator.js",
    ]) {
      const source = fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
      assert.doesNotMatch(
        source,
        /generation-submission-handoff|regularQueueApplication|previewRegularQueueAdmission|admitRegularQueueItems|paidSubmission|orderCreation/i,
        relative,
      );
    }
  });

  it("removes the retired generation-to-submission capability from production", function() {
    const productionFiles = [
      "desktop/composition/workspace-runtime-composition.js",
      "desktop/ipc/register.js",
      "desktop/ipc/content-submission-ipc.js",
      "desktop/ipc/contracts/generation-contracts.js",
      "desktop/preload.js",
      "media-workbench/src/bridge/generation.ts",
      "media-workbench/src/bridge/content.ts",
      "media-workbench/src/features/generation/generation-feature.js",
      "media-workbench/src/features/generation/use-generation-feature.ts",
      "media-workbench/src/components/content/GenerationBatchDetail.tsx",
      "media-workbench/src/components/content/BatchGenerationView.tsx",
      "media-workbench/src/components/content/ArticleGenerationView.tsx",
      "media-workbench/src/components/content/GeneratedArticlesView.tsx",
      "media-workbench/src/components/ContentWorkbench.tsx",
    ];
    const retiredCapability =
      /generation-submission-handoff|GenerationSubmissionHandoff|previewGenerationSubmissionHandoff|commitGenerationSubmissionHandoff|content:list-submission-platforms|listSubmissionPlatforms/i;
    for (const relative of productionFiles) {
      assert.doesNotMatch(
        fs.readFileSync(path.join(__dirname, "..", relative), "utf8"),
        retiredCapability,
        relative,
      );
    }
    for (const relative of [
      "desktop/services/generation-submission-handoff-service.js",
      "desktop/ipc/generation-submission-handoff-ipc.js",
      "desktop/ipc/contracts/submission-platform-contracts.js",
      "media-workbench/src/components/content/GenerationSubmissionHandoffDrawer.tsx",
    ]) {
      assert.equal(fs.existsSync(path.join(__dirname, "..", relative)), false, relative);
    }
  });

  it("continues a real persisted pending batch when article lookup requires the task client id", async function() {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "generation-batch-pending-regression-"));
    const aiCalls = [];
    const articleStore = {
      listArticles: function(clientId) {
        assert.equal(clientId, "c1");
        return [];
      },
      saveArticle: function(article) { return article; },
      findByGenerationTaskId: function() { return null; }
    };
    const service = createContentGenerationBatchService({
      workspaceRoot: workspaceRoot,
      batchStore: createGenerationBatchStore({ workspaceRoot: workspaceRoot, createId: function() { return "batch-1"; } }),
      clientKnowledge: { getClient: function(clientId) { return { id: clientId, name: "Client 1" }; } },
      materialStore: { listMaterials: async function() { return [{ id: "brand.md", status: "ready", content: "facts" }]; } },
      researchStore: { listResearch: function() { return [{ id: "q1", answerText: "answer" }]; } },
      templateStore: { getCatalogTemplate: function() { return { id: "guide", body: "write" }; } },
      contentStore: articleStore,
      articleGeneratorFactory: function() {
        return { generateArticle: async function() {
          aiCalls.push("generate");
          return { id: "article-1", title: "Title", content: "Body" };
        } };
      },
      aiProviderService: { getFingerprint: function() { return "fp-1"; } }
    });

    try {
      const pending = await service.createBatch({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }] });
      assert.equal(pending.status, "pending");
      assert.equal(pending.tasks[0].attempts, 0);

      const accepted = await service.continueBatch({ batchId: pending.id });
      assert.equal(accepted.status, "running");
      const batch = await waitForBatch(service, pending.id, function(value) { return value.status === "completed"; });
      assert.equal(batch.status, "completed");
      assert.equal(batch.tasks[0].status, "succeeded");
      assert.equal(batch.tasks[0].attempts, 1);
      assert.equal(aiCalls.length, 1);
    } finally {
      await service.dispose();
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("marks a real batch failed when article lookup fails before task claim", async function() {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "generation-batch-lookup-error-"));
    const lookupError = Object.assign(new Error("article store unavailable"), { code: "ARTICLE_STORE_READ_FAILED" });
    const articleStore = {
      listArticles: function(clientId) {
        assert.equal(clientId, "c1");
        throw lookupError;
      },
      saveArticle: function(article) { return article; },
      findByGenerationTaskId: function() { throw lookupError; }
    };
    const service = createContentGenerationBatchService({
      workspaceRoot: workspaceRoot,
      batchStore: createGenerationBatchStore({ workspaceRoot: workspaceRoot, createId: function() { return "batch-1"; } }),
      clientKnowledge: { getClient: function(clientId) { return { id: clientId, name: "Client 1" }; } },
      materialStore: { listMaterials: async function() { return [{ id: "brand.md", status: "ready", content: "facts" }]; } },
      researchStore: { listResearch: function() { return [{ id: "q1", answerText: "answer" }]; } },
      templateStore: { getCatalogTemplate: function() { return { id: "guide", body: "write" }; } },
      contentStore: articleStore,
      articleGeneratorFactory: function() {
        return { generateArticle: async function() { throw new Error("must not generate"); } };
      },
      aiProviderService: { getFingerprint: function() { return "fp-1"; } }
    });

    try {
      const pending = await service.createBatch({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }] });
      const accepted = await service.continueBatch({ batchId: pending.id });
      assert.equal(accepted.status, "running");
      const result = await waitForBatch(service, pending.id, function(value) { return value.status === "failed"; });
      assert.equal(result.status, "failed");
      assert.equal(result.tasks[0].status, "failed");
      assert.equal(result.tasks[0].attempts, 0);
      assert.equal(result.tasks[0].error.code, "ARTICLE_STORE_READ_FAILED");
    } finally {
      await service.dispose();
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("reads batch-generation materials through a logical client id", async function() {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "batch-logical-client-"));
    const physicalDirectory = path.join(workspaceRoot, "clients", "physical-client");
    try {
      fs.mkdirSync(physicalDirectory, { recursive: true });
      fs.writeFileSync(path.join(physicalDirectory, "client.json"), JSON.stringify({ id: "logical-client", name: "Logical Client" }), "utf8");
      fs.writeFileSync(path.join(physicalDirectory, "brand.md"), "batch generation facts", "utf8");
      const service = createContentGenerationBatchService({
        workspaceRoot: workspaceRoot,
        clientKnowledge: { getClient: function(id) { return getClient(workspaceRoot, id); } },
        materialStore: createClientMaterialStore({ workspaceRoot: workspaceRoot }),
        researchStore: { listResearch: function() { return [{ id: "q1", answerText: "answer" }]; } },
        templateStore: { getCatalogTemplate: function() { return { id: "guide", body: "body" }; } },
        contentStore: { saveArticle: function(article) { return article; }, findByGenerationTaskId: function() { return { kind: "none" }; } },
        aiProviderService: { getFingerprint: function() { return "test"; } }
      });

      const preview = await service.preview({ clientIds: ["logical-client"], templates: [{ platform: "ctrip", templateId: "guide" }] });
      assert.deepEqual(preview.clientSources[0].materialIds, ["YnJhbmQubWQ"]);
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("previews client by template tasks and excludes clients missing either source gate", async function() {
    const { service } = makeHarness();
    const preview = await service.preview({ clientIds: ["c1", "c2"], templates: [{ platform: "ctrip", templateId: "guide" }] });
    assert.equal(preview.executableClientCount, 1);
    assert.equal(preview.executableTaskCount, 1);
    assert.deepStrictEqual(preview.excludedClients, [{ clientId: "c2", codes: ["CLIENT_MATERIAL_REQUIRED", "GEO_RESEARCH_REQUIRED"] }]);
    assert.deepStrictEqual(preview.tasks.map(function(task) { return [task.clientId, task.platform, task.templateId]; }), [["c1", "ctrip", "guide"]]);
  });

  it("does not turn source or client read failures into empty or missing inputs", async function() {
    const materialFailure = Object.assign(new Error("materials unavailable"), { code: "MATERIAL_READ_FAILED" });
    const materialHarness = makeHarness({ materialStore: { listMaterials: async function() { throw materialFailure; } } });
    await assert.rejects(
      materialHarness.service.preview({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }] }),
      { code: "MATERIAL_READ_FAILED" },
    );

    const researchFailure = Object.assign(new Error("research unavailable"), { code: "RESEARCH_READ_FAILED" });
    const researchHarness = makeHarness({ researchStore: { listResearch: function() { throw researchFailure; } } });
    await assert.rejects(
      researchHarness.service.preview({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }] }),
      { code: "RESEARCH_READ_FAILED" },
    );

    const clientFailure = Object.assign(new Error("clients unavailable"), { code: "CLIENT_READ_FAILED" });
    const clientHarness = makeHarness({ clientKnowledge: { getClient: function() { throw clientFailure; } } });
    await assert.rejects(
      clientHarness.service.preview({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }] }),
      { code: "CLIENT_READ_FAILED" },
    );
  });

  it("returns an interrupted outcome when failure-state persistence cannot be confirmed", async function() {
    let service;
    const events = [];
    const harness = makeHarness({
      runnerFactory: function(options) {
        return {
          run: async function() {
            options.batchStore.getBatch = function() {
              throw Object.assign(new Error("batch state unavailable"), { code: "EIO" });
            };
            throw Object.assign(new Error("runner failed"), { code: "RUNNER_FAILED" });
          },
          getState: function() { return { status: "running", batchId: null }; },
          subscribe: function() { return function() {}; },
          dispose: async function() {},
        };
      },
    });
    service = harness.service;
    service.subscribe(function(event) { events.push(event); });
    const batch = await service.startBatch({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }] });
    assert.equal(batch.status, "running");
    for (let attempt = 0; attempt < 20 && !events.some((event) => event.status === "interrupted"); attempt += 1)
      await new Promise((resolve) => setTimeout(resolve, 5));
    const interrupted = events.find((event) => event.status === "interrupted");
    assert.ok(interrupted);
    assert.equal(interrupted.error.code, "GENERATION_BATCH_STATE_UNAVAILABLE");
    await service.dispose();
  });

  it("returns an accepted running snapshot before a delayed run completes and rejects a second active run", async function() {
    const harness = makeHarness({
      runnerFactory: function(options) {
        return createGenerationBatchRunner(Object.assign({}, options, {
          executeTask: async function(task, context) {
            await new Promise(function(resolve) { setTimeout(resolve, 50); });
            return { id: "article-" + task.id };
          }
        }));
      }
    });
    const batch = await harness.service.createBatch({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }] });
    const startedAt = Date.now();
    const accepted = await harness.service.startBatch({ batchId: batch.id });
    assert.equal(accepted.status, "running");
    assert.ok(Date.now() - startedAt < 40);
    assert.equal(harness.service.getState().status, "running");
    await assert.rejects(harness.service.continueBatch({ batchId: batch.id }), function(error) { return error.code === "GENERATION_BATCH_BUSY"; });
    await waitForBatch(harness.service, batch.id, function(value) { return value.status === "completed"; });
    await harness.service.dispose();
  });

  it("revalidates sources, reads them at task start, saves generated provenance, and marks the task succeeded", async function() {
    const { service, calls, savedArticles } = makeHarness();
    const batch = await service.startBatch({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }] });
    assert.equal(batch.status, "running");
    const completed = await waitForBatch(service, batch.id, function(value) { return value.status === "completed"; });
    assert.deepStrictEqual(calls.run, [[batch.id, "pending"]]);
    assert.equal(calls.generate.length, 1);
    assert.deepStrictEqual(calls.generate[0].materialIds, ["brand.md"]);
    assert.deepStrictEqual(calls.generate[0].researchQueryIds, ["q1"]);
    assert.equal(calls.generate[0].generationBatchId, batch.id);
    assert.equal(calls.generate[0].generationTaskId, batch.tasks[0].id);
    assert.equal(savedArticles.length, 1);
    assert.equal(savedArticles[0].generationBatchId, batch.id);
    assert.equal(savedArticles[0].generationTaskId, batch.tasks[0].id);
    assert.equal(savedArticles[0].status, "generated");
  });

  it("treats only article-not-found reads as missing and never generates after a corrupt read", async function() {
    for (const code of ["ARTICLE_NOT_FOUND", "GENERATION_ARTICLE_NOT_FOUND"]) {
      const missingArticleStore = {
        saveArticle: function() {},
        listArticles: async function() { throw Object.assign(new Error("Article was not found"), { code: code }); },
        findByGenerationTaskId: async function() { throw Object.assign(new Error("Article was not found"), { code: code }); }
      };
      const missing = makeHarness({
        contentStore: missingArticleStore,
        runnerFactory: function(options) { return createGenerationBatchRunner(options); }
      });
      const generated = await missing.service.startBatch({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }] });

      assert.equal(generated.status, "running");
      await waitForBatch(missing.service, generated.id, function(value) { return value.status === "completed"; });
      assert.equal(missing.calls.generate.length, 1);
    }

    const readError = Object.assign(new Error("Article JSON is invalid"), { code: "ARTICLE_INVALID" });
    const articleStore = {
      saveArticle: function() {},
      listArticles: async function() { throw readError; },
      findByGenerationTaskId: async function() { throw readError; }
    };
    const { service, calls } = makeHarness({
      contentStore: articleStore,
      runnerFactory: function(options) {
        return {
          run: async function(batchId) {
            await options.contentStore.findByGenerationTaskId("task-c1-guide");
            return options.batchStore.getBatch(batchId);
          }
        };
      }
    });

    const accepted = await service.startBatch({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }] });
    assert.equal(accepted.status, "running");
    const failed = await waitForBatch(service, accepted.id, function(value) { return value.status === "failed"; });
    assert.equal(failed.status, "failed");

    assert.deepStrictEqual(calls.generate, []);
  });

  it("does not auto-run persisted work after service construction and requires confirmation for config changes", async function() {
    const first = makeHarness();
    const batch = await first.service.createBatch({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }] });
    assert.deepStrictEqual(first.calls.run, []);
    first.setFingerprint("fp-2");
    await assert.rejects(first.service.continueBatch({ batchId: batch.id }), function(error) { return error.code === "GENERATION_AI_CONFIG_CHANGED"; });
    const accepted = await first.service.continueBatch({ batchId: batch.id, confirmConfigChange: true });
    assert.equal(accepted.status, "running");
    await waitForBatch(first.service, batch.id, function(value) { return value.status === "completed"; });
  });

  it("persists safe state events and exposes pause, resume, end, retry, get, and list operations", async function() {
    const { service, calls } = makeHarness();
    const events = [];
    const unsubscribe = service.subscribe(function(event) { events.push(event); });
    const batch = await service.createBatch({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }] });
    assert.equal((await service.get(batch.id)).id, batch.id);
    assert.equal((await service.list()).length, 1);
    const resumed = await service.resumeBatch({ batchId: batch.id });
    assert.equal(resumed.status, "running");
    await waitForBatch(service, batch.id, function(value) { return value.status === "completed"; });
    const retried = await service.retryFailed({ batchId: batch.id });
    assert.equal(retried.status, "running");
    await waitForBatch(service, batch.id, function(value) { return value.status === "completed"; });
    await service.pauseBatch();
    const pending = await service.createBatch({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }] });
    const ended = await service.abandonBatch({ batchId: pending.id, confirmed: true });
    assert.equal(ended.status, "abandoned");
    unsubscribe();
    assert.ok(events.every(function(event) { return event.batchId && !event.prompt && !event.materials && !event.apiKey; }));
    assert.ok(events.every(function(event) { return event.status && event.updatedAt && event.counts !== undefined; }));
    assert.ok(events.every(function(event) { return typeof event.runtimeId === "string" && Number.isInteger(event.sequence) && event.batch && event.batch.id === event.batchId; }));
    assert.ok(events.every(function(event, index) { return index === 0 || event.sequence > events[index - 1].sequence; }));
    assert.ok(calls.run.length >= 2);
  });

  it("returns one ordered runtime snapshot with the selected persisted batch", async function() {
    const { service } = makeHarness();
    const batch = await service.createBatch({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }] });
    const snapshot = service.getRuntimeSnapshot();
    assert.equal(typeof snapshot.runtimeId, "string");
    assert.equal(snapshot.sequence, 1);
    assert.equal(snapshot.batch.id, batch.id);
    assert.equal(snapshot.runtime.runtimeId, snapshot.runtimeId);
    assert.equal(snapshot.runtime.sequence, snapshot.sequence);
    assert.equal(snapshot.capabilities.canCancel, true);
    await service.dispose();
  });

  it("previews and confirms permanent cancellation of pending tasks", async function() {
    const { service } = makeHarness();
    const batch = await service.createBatch({ clientIds: ["c1"], templates: [{ platform: "ctrip", templateId: "guide" }] });
    const preview = await service.previewCancelPending({ batchId: batch.id });
    assert.deepStrictEqual(preview, { batchId: batch.id, pendingCount: 1, runningCount: 0, cancelledCount: 0, canCancel: true });
    await assert.rejects(service.cancelPending({ batchId: batch.id }), function(error) { return error.code === "GENERATION_CANCEL_CONFIRMATION_REQUIRED"; });
    const cancelled = await service.cancelPending({ batchId: batch.id, confirmed: true });
    assert.equal(cancelled.status, "completed");
    assert.equal(cancelled.tasks[0].status, "cancelled");
    assert.equal(cancelled.counts.cancelled, 1);
    await service.dispose();
  });
});
