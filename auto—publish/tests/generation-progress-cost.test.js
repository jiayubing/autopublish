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

function createFixture(taskCount, concurrency, beforeGenerate = null) {
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
        if (property === "getGenerationTaskArticleTitle") return function(...args) {
          count("titleQueries");
          return target.getGenerationTaskArticleTitle(...args);
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
          if (beforeGenerate) await beforeGenerate(input);
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
          assert.equal(running.titleQueries, taskCount, "one title lookup per successful article without explicit refresh");
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
        const counts = { ...samples[0][phase] };
        // Measure real payloads, including variable metadata; byte lengths and
        // elapsed time are observations, not deterministic operation counts.
        for (const key of ["elapsedMs", "eventBytes", "snapshotBytes"]) delete counts[key];
        for (const sample of samples) {
          for (const [key, value] of Object.entries(counts)) {
            assert.equal(sample[phase][key], value, phase + " " + key);
          }
        }
        phases[phase] = { ...counts };
        for (const key of ["elapsedMs", "eventBytes", "snapshotBytes"]) {
          const values = samples.map((sample) => sample[phase][key]).sort((a, b) => a - b);
          phases[phase][key] = { median: values[1], range: [values[0], values[2]] };
        }
      }
      console.log("GENERATION_PROGRESS_COST " + json({ node: process.version, platform: process.platform, arch: process.arch, taskCount, concurrency, repeats: 3, phases }));
    });
  }
}


it("refreshes a legally saved title during real generation and after service restart", async () => {
  let release;
  let entered;
  const gate = new Promise((resolve) => { release = resolve; });
  const waiting = new Promise((resolve) => { entered = resolve; });
  const fixture = createFixture(2, 1, async (input) => {
    if (input.templateId === "template-001") { entered(); await gate; }
  });
  let work;
  try {
    const batch = await fixture.create();
    work = fixture.start(batch.id);
    await Promise.race([waiting, work.then(() => { throw new Error("second task did not reach the barrier"); })]);
    const article = fixture.contentStore.getArticle("client-1", "article-template-000");
    // This is still an unsubmitted generated article; use the real save path,
    // not edits to metadata JSON or a second title source.
    fixture.contentStore.saveArticle({ ...article, title: "Edited generated title" });
    const refreshed = fixture.service.getRuntimeSnapshot();
    assert.equal(refreshed.batch.tasks[0].articleTitle, "Edited generated title");
    release();
    await work;
    assert.equal(fixture.lastEvent.status, "completed");
    assert.equal(fixture.lastEvent.batch.tasks[0].articleTitle, "Edited generated title");
    await fixture.reopen();
    assert.equal(fixture.service.getRuntimeSnapshot().batch.tasks[0].articleTitle, "Edited generated title");
  } finally {
    release();
    if (work) await work;
    await fixture.dispose();
  }
});
