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
