const { it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { createContentPathPolicy } = require("../src/content/content-path-policy");
const { createArticleStore } = require("../src/content/article-store");
const { createContentStore } = require("../src/content/content-store");
const { createGenerationBatchStore } = require("../src/content/generation-batch-store");
const { createGenerationBatchRunner } = require("../src/content/generation-batch-runner");
const { createContentGenerationBatchService } = require("../desktop/services/content-generation-batch-service");
const { registerContentGenerationBatchIpc } = require("../desktop/ipc/content-generation-batch-ipc");

const FIXED_TIME = "2026-09-06T00:00:00.000Z";
const json = JSON.stringify;
const turn = () => new Promise((resolve) => setImmediate(resolve));

function createFixture(taskCount, concurrency) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "generation-progress-cost-"));
  const counters = { eventBytes: 0 };
  let run;
  let lastEvent;
  let deliveryError = null;
  let service;
  let ipc;
  let contentStore;
  let batchStore;
  function count(key) { counters[key] = (counters[key] || 0) + 1; }
  function instrumentFs(kind) {
    return new Proxy(fs, {
      get(target, property) {
        const value = target[property];
        if (typeof value !== "function") return value;
        return function(...args) {
          // Separate article content files from locks/journals, and batch I/O.
          if (property === "readFileSync") {
            if (kind === "batch") count("batchFileReads");
            else if (typeof args[0] === "string" && /article-template-\d+\.(json|md)$/.test(args[0])) count("articleFileReads");
          }
          if (kind === "batch" && property === "writeFileSync") count("batchFileWrites");
          return value.apply(target, args);
        };
      },
    });
  }
  const articleFs = instrumentFs("article");
  const batchFs = instrumentFs("batch");
  // Create an empty, legal client content directory; there are no seed articles.
  createContentPathPolicy(root).articlePaths("client-1", "probe", true);

  function open() {
    contentStore = createContentStore({
      articleStore: createArticleStore(root, { fs: articleFs }),
      listClientIds: () => ["client-1"],
    });
    const titleStore = new Proxy(contentStore, {
      get(target, property) {
        if (property === "getArticle") return function(...args) {
          count("titleQueries");
          return target.getArticle(...args);
        };
        const value = target[property];
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    batchStore = createGenerationBatchStore({ workspaceRoot: root, fs: batchFs, now: () => FIXED_TIME, createId: () => "batch-progress" });
    service = createContentGenerationBatchService({
      workspaceRoot: root,
      batchStore,
      contentStore: titleStore,
      runtimeId: "runtime-progress",
      now: () => FIXED_TIME,
      clientKnowledge: { getClient: (id) => ({ id, name: "Synthetic client" }) },
      materialStore: { listMaterials: async () => [{ id: "brand.md", status: "ready", content: "Synthetic facts" }] },
      researchStore: { listResearch: () => [{ id: "q1", answerText: "Synthetic answer" }] },
      templateStore: { getCatalogTemplate: () => ({ body: "Synthetic template" }) },
      aiProviderService: { getFingerprint: () => "synthetic-fingerprint" },
      articleGeneratorFactory: () => ({
        async generateArticle(input) {
          count("aiCalls");
          return { id: "article-" + input.templateId, clientId: input.clientId,
            title: "Synthetic title " + input.templateId, content: "Synthetic body. ".repeat(64),
            status: "generated", createdAt: FIXED_TIME };
        },
      }),
      runnerFactory(options) {
        const runner = createGenerationBatchRunner({ ...options, now: () => FIXED_TIME });
        return { ...runner, run(...args) { run = runner.run(...args); return run; } };
      },
    });
    ipc = registerContentGenerationBatchIpc({
      ipcMain: { handle() {} },
      contentGenerationBatchService: service,
      sendToRenderer(channel, event) {
        if (channel !== "content:generation-batch-state") deliveryError = "wrong channel";
        count("events");
        counters.eventBytes += Buffer.byteLength(json(event), "utf8");
        if (lastEvent && event.sequence <= lastEvent.sequence) deliveryError = "non-monotonic sequence";
        if (event.runtimeId !== "runtime-progress") deliveryError = "wrong runtime";
        lastEvent = event;
      },
    });
    return service;
  }
  open();

  async function measure(action) {
    for (const key of ["titleQueries", "articleFileReads", "batchFileReads", "batchFileWrites", "events", "eventBytes", "batchSerializations", "aiCalls"]) counters[key] = 0;
    JSON.stringify = function(value, ...args) {
      if (value && (Array.isArray(value.tasks) || (value.batch && Array.isArray(value.batch.tasks)))) count("batchSerializations");
      return json(value, ...args);
    };
    const started = performance.now();
    try {
      const result = await action();
      return { ...counters, elapsedMs: Number((performance.now() - started).toFixed(2)),
        snapshotBytes: result ? Buffer.byteLength(json(result), "utf8") : 0 };
    } finally {
      JSON.stringify = json;
    }
  }
  return {
    get service() { return service; },
    get contentStore() { return contentStore; },
    get batchStore() { return batchStore; },
    get lastEvent() { return lastEvent; },
    measure,
    async create() {
      return service.createBatch({ clientIds: ["client-1"], concurrency,
        templates: Array.from({ length: taskCount }, (_, index) => ({ platform: "lieju", templateId: "template-" + String(index).padStart(3, "0") })) });
    },
    async start(batchId) {
      await service.startBatch({ batchId });
      await run;
      // Drain the service's terminal projection/finally without polling reads.
      await turn();
      assert.equal(deliveryError, null);
    },
    async reopen() {
      ipc.dispose();
      await service.dispose();
      lastEvent = null;
      open();
    },
    async dispose() {
      ipc.dispose();
      await service.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

for (const taskCount of [10, 100]) {
  for (const concurrency of [1, 2]) {
    it(`measures real generation progress for ${taskCount} tasks at concurrency ${concurrency}`, async () => {
      const samples = [];
      for (let repeat = 0; repeat < 3; repeat += 1) {
        const fixture = createFixture(taskCount, concurrency);
        try {
          const batch = await fixture.create();
          const firstLoad = await fixture.measure(() => fixture.service.getRuntimeSnapshot());
          const running = await fixture.measure(() => fixture.start(batch.id));
          assert.equal(running.aiCalls, taskCount);
          assert.equal(fixture.lastEvent.status, "completed");
          assert.equal(fixture.lastEvent.batch.counts.succeeded, taskCount);
          assert.equal(fixture.lastEvent.batch.tasks.length, taskCount);
          assert.ok(fixture.lastEvent.batch.tasks.every((task) => task.articleTitle && !("content" in task)));
          const completedRefresh = await fixture.measure(() => fixture.service.getRuntimeSnapshot());
          await fixture.reopen();
          const reopenedFirst = await fixture.measure(() => fixture.service.getRuntimeSnapshot());
          const reopenedRepeat = await fixture.measure(() => fixture.service.getRuntimeSnapshot());
          assert.equal(reopenedFirst.titleQueries, taskCount);
          assert.equal(reopenedRepeat.titleQueries, taskCount);
          samples.push({ firstLoad, running, completedRefresh, reopenedFirst, reopenedRepeat });
        } finally {
          await fixture.dispose();
        }
      }
      const phases = {};
      for (const phase of Object.keys(samples[0])) {
        const times = samples.map((sample) => sample[phase].elapsedMs).sort((a, b) => a - b);
        const { elapsedMs: ignored, ...counts } = samples[0][phase];
        void ignored;
        for (const sample of samples) {
          const { elapsedMs: otherIgnored, ...otherCounts } = sample[phase];
          void otherIgnored;
          assert.deepEqual(otherCounts, counts, "deterministic counts across repeats");
        }
        phases[phase] = { ...counts, medianMs: times[1], rangeMs: [times[0], times[2]] };
      }
      console.log("GENERATION_PROGRESS_COST " + json({ node: process.version, platform: process.platform, arch: process.arch, taskCount, concurrency, repeats: 3, phases }));
    });
  }
}
