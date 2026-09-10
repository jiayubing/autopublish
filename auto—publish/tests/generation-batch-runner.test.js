const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createGenerationBatchRunner } = require("../src/content/generation-batch-runner");

function makeBatch(tasks) {
  return {
    id: "batch-1",
    status: "pending",
    tasks: tasks.map(function(task, index) {
      return Object.assign({
        id: "task-" + (index + 1),
        clientId: "client-1",
        platform: "ctrip",
        templateId: "template-1",
        materialIds: ["brand.md"],
        researchQueryIds: ["question-1"],
        status: "pending",
        attempts: 0,
        error: null,
        articleId: null
      }, task);
    })
  };
}

function fakeStore(batch) {
  const state = JSON.parse(JSON.stringify(batch));
  function syncCounts() {
    state.counts = { total: state.tasks.length, succeeded: 0, failed: 0, pending: 0, interrupted: 0, cancelled: 0 };
    state.tasks.forEach(function(task) { if (Object.prototype.hasOwnProperty.call(state.counts, task.status)) state.counts[task.status] += 1; });
  }
  syncCounts();
  function currentTask(taskId) {
    const task = state.tasks.find(function(item) { return item.id === taskId; });
    if (!task) throw new Error("missing task");
    return task;
  }
  return {
    getBatch: function() { return JSON.parse(JSON.stringify(state)); },
    markTaskRunning: function(batchId, taskId) {
      assert.equal(batchId, state.id);
      const task = currentTask(taskId);
      task.status = "running";
      task.attempts += 1;
      state.status = "running";
      return this.getBatch();
    },
    markTaskSucceeded: function(batchId, taskId, articleId) {
      assert.equal(batchId, state.id);
      const task = currentTask(taskId);
      task.status = "succeeded";
      task.articleId = articleId;
      syncCounts();
      state.status = state.tasks.every(function(item) { return item.status === "succeeded"; }) ? "completed" : "running";
      return this.getBatch();
    },
    markTaskFailed: function(batchId, taskId, error) {
      assert.equal(batchId, state.id);
      const task = currentTask(taskId);
      task.status = "failed";
      task.error = { code: error.code, message: error.message };
      syncCounts();
      state.status = "running";
      return this.getBatch();
    },
    markTaskInterrupted: function(batchId, taskId) {
      assert.equal(batchId, state.id);
      const task = currentTask(taskId);
      task.status = "interrupted";
      syncCounts();
      state.status = "interrupted";
      return this.getBatch();
    },
    cancelPending: function(batchId) {
      assert.equal(batchId, state.id);
      state.tasks.forEach(function(task) { if (task.status === "pending") task.status = "cancelled"; });
      syncCounts();
      if (!state.tasks.some(function(task) { return ["pending", "running", "failed", "interrupted"].includes(task.status); })) state.status = "completed";
      return this.getBatch();
    },
    updateBatchStatus: function(batchId, status) {
      assert.equal(batchId, state.id);
      state.status = status;
      return this.getBatch();
    }
  };
}

function taskError(code, status) {
  const error = new Error(code);
  error.code = code;
  if (status !== undefined) error.status = status;
  return error;
}

describe("generation batch runner", function() {
  for (const cancelled of [false, true]) {
    it("completes when pause drains the last active task, cancelled=" + cancelled, async function() {
      const batch = makeBatch(cancelled ? [{}, { status: "cancelled" }] : [{}, {}]);
      const store = fakeStore(batch);
      const releases = [];
      const runner = createGenerationBatchRunner({
        batchStore: store,
        concurrency: 2,
        executeTask: function(task) {
          return new Promise(function(resolve) { releases.push(function() { resolve({ id: "article-" + task.id }); }); });
        }
      });
      const events = [];
      runner.subscribe(function(event) { events.push(event); });
      const work = runner.run(batch.id);
      while (releases.length < (cancelled ? 1 : 2)) await new Promise(setImmediate);
      const paused = runner.pause();
      releases.forEach(function(release) { release(); });
      assert.equal((await work).status, "completed");
      assert.equal((await paused).status, "completed");
      assert.equal(store.getBatch().status, "completed");
      assert.equal(runner.getState().status, "completed");
      assert.equal(events.at(-1).status, "completed");
      await runner.dispose();
    });
  }
  it("passes the complete task to article lookup before generating a pending task", async function() {
    const batch = makeBatch([{}]);
    const store = fakeStore(batch);
    const lookedUp = [];
    const generated = [];
    const runner = createGenerationBatchRunner({
      batchStore: store,
      contentStore: { findByGenerationTaskId: function(taskId) {
        lookedUp.push(taskId);
        assert.equal(taskId, "task-1");
        return null;
      } },
      executeTask: async function(task) {
        generated.push(task.id);
        return { id: "article-1" };
      }
    });

    const result = await runner.run(batch.id);

    assert.equal(result.status, "completed");
    assert.equal(result.tasks[0].status, "succeeded");
    assert.deepStrictEqual(lookedUp, ["task-1"]);
    assert.deepStrictEqual(generated, ["task-1"]);
  });

  it("does not leave a task pending when article lookup fails before claim", async function() {
    const batch = makeBatch([{}]);
    const store = fakeStore(batch);
    const lookupError = taskError("ARTICLE_STORE_READ_FAILED");
    const runner = createGenerationBatchRunner({
      batchStore: store,
      contentStore: { findByGenerationTaskId: function(taskId) {
        assert.equal(taskId, "task-1");
        throw lookupError;
      } },
      executeTask: async function() { throw new Error("must not generate"); }
    });

    const result = await runner.run(batch.id);

    assert.equal(result.status, "failed");
    assert.equal(result.tasks[0].status, "failed");
    assert.equal(result.tasks[0].attempts, 0);
    assert.deepStrictEqual(result.tasks[0].error, { code: "ARTICLE_STORE_READ_FAILED", message: "ARTICLE_STORE_READ_FAILED" });
  });

  it("runs tasks serially, skips succeeded work, and completes the batch", async function() {
    const batch = makeBatch([{ status: "succeeded", articleId: "article-1" }, {}]);
    const store = fakeStore(batch);
    const executedTaskIds = [];
    let activeCalls = 0;
    let maxActiveCalls = 0;
    const runner = createGenerationBatchRunner({
      batchStore: store,
      executeTask: async function(task, options) {
        executedTaskIds.push(task.id);
        activeCalls += 1;
        maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
        assert.ok(options.signal);
        await Promise.resolve();
        activeCalls -= 1;
        return { id: "article-2" };
      },
      concurrency: 1
    });

    const result = await runner.run(batch.id);

    assert.equal(maxActiveCalls, 1);
    assert.deepStrictEqual(executedTaskIds, ["task-2"]);
    assert.equal(result.status, "completed");
    assert.equal(store.getBatch(batch.id).tasks[1].status, "succeeded");
  });

  it("validates the reserved concurrency range", function() {
    assert.throws(function() {
      createGenerationBatchRunner({ batchStore: fakeStore(makeBatch([{}])), executeTask: async function() {}, concurrency: 0 });
    }, function(error) { return error.code === "GENERATION_CONCURRENCY_INVALID"; });
    assert.throws(function() {
      createGenerationBatchRunner({ batchStore: fakeStore(makeBatch([{}])), executeTask: async function() {}, concurrency: 5 });
    }, function(error) { return error.code === "GENERATION_CONCURRENCY_INVALID"; });
    assert.doesNotThrow(function() {
      createGenerationBatchRunner({ batchStore: fakeStore(makeBatch([{}])), executeTask: async function() {}, concurrency: 2 });
    });
  });

  it("finishes the active task and leaves later tasks pending when paused", async function() {
    const batch = makeBatch([{}, {}]);
    const store = fakeStore(batch);
    let taskStarted;
    const started = new Promise(function(resolve) { taskStarted = resolve; });
    let resolveTask;
    const runner = createGenerationBatchRunner({
      batchStore: store,
      executeTask: function(task) {
        taskStarted();
        return new Promise(function(resolve) { resolveTask = resolve; });
      },
      concurrency: 1
    });

    const running = runner.run(batch.id);
    await started;
    const paused = runner.pause();
    resolveTask({ id: "article-1" });
    await paused;
    await running;

    assert.equal(store.getBatch(batch.id).tasks[0].status, "succeeded");
    assert.equal(store.getBatch(batch.id).tasks[1].status, "pending");
    assert.equal(store.getBatch(batch.id).status, "paused");
  });

  it("retries rate limits, network failures, timeouts, and server failures with injected waits", async function() {
    const batch = makeBatch([{}]);
    const store = fakeStore(batch);
    const failures = [taskError("AI_RATE_LIMITED", 429), taskError("AI_TIMEOUT"), taskError("AI_REQUEST_FAILED", 503)];
    const waits = [];
    const runner = createGenerationBatchRunner({
      batchStore: store,
      executeTask: async function() { throw failures.shift(); },
      sleep: async function(milliseconds) { waits.push(milliseconds); },
      concurrency: 1
    });

    const result = await runner.run(batch.id);

    assert.deepStrictEqual(waits, [5000, 15000]);
    assert.equal(result.status, "failed");
    assert.equal(result.tasks[0].attempts, 1);
    assert.equal(result.tasks[0].status, "failed");
  });

  it("pauses the batch for configuration errors and continues after non-retryable task errors", async function() {
    const configurationBatch = makeBatch([{}, {}]);
    const configurationStore = fakeStore(configurationBatch);
    const configurationCalls = [];
    const configurationRunner = createGenerationBatchRunner({
      batchStore: configurationStore,
      executeTask: async function(task) {
        configurationCalls.push(task.id);
        throw taskError("AI_UNAUTHORIZED", 401);
      }
    });
    const paused = await configurationRunner.run(configurationBatch.id);
    assert.equal(paused.status, "paused_configuration");
    assert.deepStrictEqual(configurationCalls, ["task-1"]);
    assert.equal(paused.tasks[1].status, "pending");

    const taskBatch = makeBatch([{}, {}]);
    const taskStore = fakeStore(taskBatch);
    const taskCalls = [];
    const taskRunner = createGenerationBatchRunner({
      batchStore: taskStore,
      executeTask: async function(task) {
        taskCalls.push(task.id);
        if (task.id === "task-1") throw taskError("AI_EMPTY_RESPONSE");
        return { id: "article-2" };
      }
    });
    const continued = await taskRunner.run(taskBatch.id);
    assert.equal(continued.status, "failed");
    assert.deepStrictEqual(taskCalls, ["task-1", "task-2"]);
    assert.deepStrictEqual(continued.tasks.map(function(task) { return task.status; }), ["failed", "succeeded"]);
  });

  it("pauses the whole batch for missing configuration and invalid models", async function() {
    for (const failure of [
      taskError("AI_CONFIG_NOT_SET"),
      taskError("AI_MODEL_NOT_FOUND"),
      taskError("AI_REQUEST_FAILED", 404)
    ]) {
      const batch = makeBatch([{}, {}]);
      const store = fakeStore(batch);
      const calls = [];
      const runner = createGenerationBatchRunner({
        batchStore: store,
        executeTask: async function(task) {
          calls.push(task.id);
          throw failure;
        }
      });

      const result = await runner.run(batch.id);

      assert.equal(result.status, "paused_configuration");
      assert.deepStrictEqual(calls, ["task-1"]);
      assert.deepStrictEqual(result.tasks.map(function(task) { return task.status; }), ["failed", "pending"]);
    }
  });

  it("repairs a saved article without another AI call and retries failed tasks only", async function() {
    const batch = makeBatch([
      { status: "succeeded", articleId: "article-1" },
      { status: "failed" },
      { status: "pending" }
    ]);
    const store = fakeStore(batch);
    const calls = [];
    const runner = createGenerationBatchRunner({
      batchStore: store,
      contentStore: {
        findByGenerationTaskId: function(taskId) {
          if (taskId === "task-2") return { id: "article-recovered" };
          return null;
        }
      },
      executeTask: async function(task) {
        calls.push(task.id);
        return { id: "article-new" };
      }
    });

    const result = await runner.run(batch.id, "failed");

    assert.deepStrictEqual(calls, []);
    assert.equal(result.tasks[1].status, "succeeded");
    assert.equal(result.tasks[1].articleId, "article-recovered");
    assert.equal(result.tasks[2].status, "pending");
  });

  it("runs each task once with a validated future concurrency greater than one", async function() {
    const batch = makeBatch([{}, {}, {}, {}]);
    const store = fakeStore(batch);
    const calls = [];
    let active = 0;
    let maxActive = 0;
    const runner = createGenerationBatchRunner({
      batchStore: store,
      concurrency: 2,
      executeTask: async function(task) {
        calls.push(task.id);
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise(function(resolve) { setImmediate(resolve); });
        active -= 1;
        return { id: "article-" + task.id };
      }
    });

    const result = await runner.run(batch.id);

    assert.equal(maxActive, 2);
    assert.deepStrictEqual(calls.sort(), ["task-1", "task-2", "task-3", "task-4"]);
    assert.equal(result.status, "completed");
  });

  it("keeps one active run per runner and disposes the active request", async function() {
    const batch = makeBatch([{}]);
    const store = fakeStore(batch);
    let started;
    const taskStarted = new Promise(function(resolve) { started = resolve; });
    const runner = createGenerationBatchRunner({
      batchStore: store,
      executeTask: function(task, options) {
        started();
        return new Promise(function(_, reject) {
          options.signal.addEventListener("abort", function() {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          }, { once: true });
        });
      }
    });

    const running = runner.run(batch.id);
    await taskStarted;
    await assert.rejects(runner.run(batch.id), function(error) { return error.code === "GENERATION_BATCH_BUSY"; });
    await runner.dispose();
    await running;
    await runner.dispose();
    assert.equal(store.getBatch(batch.id).status, "interrupted");
    assert.equal(runner.getState().status, "interrupted");
  });

  it("keeps the running task alive while cancelling later pending tasks", async function() {
    const batch = makeBatch([{}, {}, {}]);
    const store = fakeStore(batch);
    let resolveTask;
    let started;
    const startedPromise = new Promise(function(resolve) { started = resolve; });
    const calls = [];
    const runner = createGenerationBatchRunner({
      batchStore: store,
      executeTask: function(task) {
        calls.push(task.id);
        started();
        return new Promise(function(resolve) { resolveTask = resolve; });
      }
    });

    const running = runner.run(batch.id);
    await startedPromise;
    store.cancelPending(batch.id);
    resolveTask({ id: "article-1" });
    const result = await running;

    assert.deepStrictEqual(calls, ["task-1"]);
    assert.deepStrictEqual(result.tasks.map(function(task) { return task.status; }), ["succeeded", "cancelled", "cancelled"]);
    assert.equal(result.counts.cancelled, 2);
    assert.equal(result.status, "completed");
  });

  it("publishes live status separately from persisted batch status in every snapshot", async function() {
    const batch = makeBatch([{}]);
    const store = fakeStore(batch);
    const events = [];
    const runner = createGenerationBatchRunner({
      batchStore: store,
      executeTask: async function() { return { id: "article-1" }; },
      now: function() { return "2026-07-20T00:00:00.000Z"; }
    });
    runner.subscribe(function(event) { events.push(event); });

    await runner.run(batch.id);

    assert.ok(events.length >= 2);
    assert.ok(events.every(function(event) {
      return event.batchId === batch.id && event.status && event.updatedAt && event.counts;
    }));
    assert.equal(events[0].status, "running");
  });

  it("handles a controllable fifty-task run without duplicate execution after pause and continue", async function() {
    const batch = makeBatch(Array.from({ length: 50 }, function() { return {}; }));
    const store = fakeStore(batch);
    const calls = [];
    let firstStarted;
    const firstStartedPromise = new Promise(function(resolve) { firstStarted = resolve; });
    const runner = createGenerationBatchRunner({
      batchStore: store,
      executeTask: function(task, options) {
        calls.push(task.id);
        if (calls.length === 1) {
          firstStarted();
            return new Promise(function(resolve) {
              const timer = setTimeout(function() { resolve({ id: "article-1" }); }, 20);
            });
        }
        return Promise.resolve({ id: "article-" + task.id });
      }
    });

    const running = runner.run(batch.id);
    await firstStartedPromise;
    await runner.pause();
    await running;
    assert.equal(store.getBatch(batch.id).status, "paused");
    assert.equal(store.getBatch(batch.id).tasks.filter(function(task) { return task.status === "succeeded"; }).length, 1);

    await runner.run(batch.id, "unfinished");
    assert.equal(calls.length, 50);
    assert.equal(new Set(calls).size, 50);
    assert.equal(store.getBatch(batch.id).tasks.filter(function(task) { return task.status === "succeeded"; }).length, 50);
  });
});

// Exercise the real persisted owners together; the unit fixture above deliberately
// keeps its task and batch transitions independent of the production store.
describe("persisted generation configuration recovery", function() {
  function deferred() {
    let resolve;
    const promise = new Promise(function(done) { resolve = done; });
    return { promise, resolve };
  }

  function fixture(t, templateIds) {
    const fs = require("node:fs");
    const os = require("node:os");
    const path = require("node:path");
    const { createGenerationBatchStore } = require("../src/content/generation-batch-store");
    const { createArticleStore } = require("../src/content/article-store");
    const { createContentStore } = require("../src/content/content-store");
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "generation-configuration-recovery-"));
    const runtimes = [];
    t.after(async function() {
      try {
        for (const runtime of runtimes.reverse()) await runtime.dispose();
      } finally {
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
      }
    });
    function openStore() { return createGenerationBatchStore({ workspaceRoot }); }
    function openContentStore() {
      return createContentStore({
        articleStore: createArticleStore(workspaceRoot),
        listClientIds: function() { return ["c1"]; }
      });
    }
    const store = openStore();
    const contentStore = openContentStore();
    const batch = store.createBatch({
      clientSources: [{ clientId: "c1", materialIds: ["brand.md"], researchQueryIds: ["q1"] }],
      templates: templateIds.map(function(templateId) { return { platform: "ctrip", templateId }; }),
      aiConfigFingerprint: "fp-original",
      concurrency: 2
    });
    function article(task) {
      return {
        id: "article-" + task.templateId, clientId: task.clientId,
        title: "Synthetic " + task.templateId, content: "Synthetic body",
        status: "generated", createdAt: "2026-09-06T00:00:00.000Z",
        generationBatchId: batch.id, generationTaskId: task.id,
        platform: task.platform, templateId: task.templateId
      };
    }
    return { store, contentStore, batch, article, openStore, openContentStore,
      track: function(runtime) { runtimes.push(runtime); return runtime; } };
  }

  function waitForAbort(signal) {
    return new Promise(function(_, reject) {
      function abort() { reject(taskError("AI_ABORTED")); }
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    });
  }

  it("retains configuration pause after a concurrent abort and leaves the third task unclaimed", async function(t) {
    const h = fixture(t, ["configuration", "interrupted", "pending"]);
    const siblingStarted = deferred();
    const calls = [];
    const events = [];
    const runner = h.track(createGenerationBatchRunner({
      batchStore: h.store, contentStore: h.contentStore, concurrency: 2,
      executeTask: async function(task, options) {
        calls.push(task.templateId);
        if (task.templateId === "configuration") {
          await siblingStarted.promise;
          throw taskError("AI_UNAUTHORIZED", 401);
        }
        if (task.templateId === "interrupted") {
          const stopped = waitForAbort(options.signal);
          siblingStarted.resolve();
          return stopped;
        }
        throw new Error("An unclaimed task must not call AI after configuration pause");
      }
    }));
    runner.subscribe(function(event) { events.push(event); });

    const result = await runner.run(h.batch.id);

    assert.equal(result.status, "paused_configuration");
    assert.equal(runner.getState().status, "paused_configuration");
    assert.deepEqual(result.tasks.map(function(task) { return task.status; }), ["failed", "interrupted", "pending"]);
    assert.deepEqual(result.tasks.map(function(task) { return task.attempts; }), [1, 1, 0]);
    assert.equal(result.tasks[0].error.code, "AI_UNAUTHORIZED");
    assert.deepEqual(calls, ["configuration", "interrupted"]);
    assert.equal(events.at(-1).status, "paused_configuration");
    assert.equal(events.at(-1).batch.status, "paused_configuration");
    assert.deepEqual(h.openStore().getBatch(h.batch.id), result);
  });

  it("resumes through the service with config confirmation without regenerating saved or successful articles", async function(t) {
    const { createContentGenerationBatchService } = require("../desktop/services/content-generation-batch-service");
    const h = fixture(t, ["saved", "configuration", "pending", "success"]);
    const completedTask = h.batch.tasks[3];
    h.contentStore.createArticle(h.article(completedTask));
    h.store.markTaskRunning(h.batch.id, completedTask.id);
    h.store.markTaskSucceeded(h.batch.id, completedTask.id, h.article(completedTask).id);
    const saved = deferred();
    const initialCalls = [];
    const runner = h.track(createGenerationBatchRunner({
      batchStore: h.store, contentStore: h.contentStore, concurrency: 2,
      executeTask: async function(task, options) {
        initialCalls.push(task.templateId);
        if (task.templateId === "saved") {
          // The article commit has succeeded, but the runner has not registered
          // its result when the other worker stops this run.
          h.contentStore.createArticle(h.article(task));
          const stopped = waitForAbort(options.signal);
          saved.resolve();
          return stopped;
        }
        if (task.templateId === "configuration") {
          await saved.promise;
          throw taskError("AI_FORBIDDEN", 403);
        }
        throw new Error("Only the two active tasks may execute");
      }
    }));
    const paused = await runner.run(h.batch.id);
    assert.equal(paused.status, "paused_configuration");
    assert.deepEqual(paused.tasks.map(function(task) { return task.status; }), ["interrupted", "failed", "pending", "succeeded"]);
    assert.deepEqual(initialCalls, ["saved", "configuration"]);
    const articlesBeforeResume = h.contentStore.listArticles("c1");
    assert.equal(articlesBeforeResume.length, 2);
    await runner.dispose();

    const store = h.openStore();
    const contentStore = h.openContentStore();
    const resumedCalls = [];
    const events = [];
    let fingerprint = "fp-original";
    const service = h.track(createContentGenerationBatchService({
      batchStore: store, contentStore,
      clientKnowledge: {}, materialStore: {}, researchStore: {}, templateStore: {},
      aiProviderService: { getFingerprint: function() { return fingerprint; } },
      aiClient: { complete: async function(messages) { resumedCalls.push(messages[0].content); return "Synthetic body"; } },
      articleGeneratorFactory: function(deps) {
        return { generateArticle: async function(input) {
          await deps.aiClient.complete([{ role: "user", content: input.templateId }]);
          return h.article(Object.assign({}, input, { id: input.generationTaskId }));
        } };
      }
    }));
    const terminal = deferred();
    service.subscribe(function(event) {
      events.push(event);
      if (["completed", "failed", "paused_configuration", "interrupted"].includes(event.status)) terminal.resolve();
    });
    const pausedSnapshot = service.getRuntimeSnapshot();
    assert.equal(pausedSnapshot.batch.status, "paused_configuration");
    assert.equal(pausedSnapshot.capabilities.canContinue, true);
    assert.equal(pausedSnapshot.capabilities.canRetry, false);
    fingerprint = "fp-fixed";
    await assert.rejects(service.resumeBatch({ batchId: h.batch.id }), { code: "GENERATION_AI_CONFIG_CHANGED" });
    assert.deepEqual(resumedCalls, []);
    assert.equal(store.getBatch(h.batch.id).status, "paused_configuration");

    await service.resumeBatch({ batchId: h.batch.id, confirmConfigChange: true });
    await terminal.promise;
    // Let the service's existing promise finalizer release its run reservation.
    await new Promise(function(resolve) { setImmediate(resolve); });

    const snapshot = service.getRuntimeSnapshot();
    assert.equal(snapshot.batch.status, "completed");
    assert.equal(snapshot.runtime.status, "completed");
    assert.equal(snapshot.capabilities.canContinue, false);
    assert.equal(snapshot.capabilities.canRetry, false);
    assert.deepEqual(resumedCalls.sort(), ["configuration", "pending"]);
    assert.deepEqual(snapshot.batch.tasks.map(function(task) { return task.attempts; }), [1, 2, 1, 1]);
    assert.ok(snapshot.batch.tasks.every(function(task) { return task.status === "succeeded"; }));
    assert.equal(contentStore.listArticles("c1").length, 4);
    for (const article of articlesBeforeResume) assert.deepEqual(contentStore.getArticle("c1", article.id), article);
    assert.equal(contentStore.findByGenerationTaskId(h.batch.tasks[0].id).kind, "one");
    assert.equal(events.some(function(event) { return event.status === "failed"; }), false);
  });

  it("preserves the configuration stop reason across late results and restart recovery", function(t) {
    const h = fixture(t, ["configuration", "late-success", "late-failure", "in-flight"]);
    for (const task of h.batch.tasks) h.store.markTaskRunning(h.batch.id, task.id);
    h.store.markTaskFailed(h.batch.id, h.batch.tasks[0].id, taskError("AI_MODEL_NOT_FOUND"));
    h.store.updateBatchStatus(h.batch.id, "paused_configuration");
    h.contentStore.createArticle(h.article(h.batch.tasks[1]));
    h.store.markTaskSucceeded(h.batch.id, h.batch.tasks[1].id, h.article(h.batch.tasks[1]).id);
    assert.equal(h.store.getBatch(h.batch.id).status, "paused_configuration");
    h.store.markTaskFailed(h.batch.id, h.batch.tasks[2].id, taskError("AI_EMPTY_RESPONSE"));
    assert.equal(h.store.getBatch(h.batch.id).status, "paused_configuration");

    const recovered = h.openStore().getBatch(h.batch.id);
    assert.equal(recovered.status, "paused_configuration");
    assert.deepEqual(recovered.tasks.map(function(task) { return task.status; }), ["failed", "succeeded", "failed", "interrupted"]);
    assert.equal(recovered.tasks[0].error.code, "AI_MODEL_NOT_FOUND");
    assert.equal(recovered.tasks[1].articleId, h.article(h.batch.tasks[1]).id);
    assert.equal(recovered.tasks[2].error.code, "AI_EMPTY_RESPONSE");
  });
});
