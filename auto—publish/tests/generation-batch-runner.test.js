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
      state.status = state.tasks.every(function(item) { return item.status === "succeeded"; }) ? "completed" : "running";
      return this.getBatch();
    },
    markTaskFailed: function(batchId, taskId, error) {
      assert.equal(batchId, state.id);
      const task = currentTask(taskId);
      task.status = "failed";
      task.error = { code: error.code, message: error.message };
      state.status = "running";
      return this.getBatch();
    },
    markTaskInterrupted: function(batchId, taskId) {
      assert.equal(batchId, state.id);
      const task = currentTask(taskId);
      task.status = "interrupted";
      state.status = "interrupted";
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

  it("aborts the active task and leaves later tasks pending when stopped", async function() {
    const batch = makeBatch([{}, {}]);
    const store = fakeStore(batch);
    let taskStarted;
    const started = new Promise(function(resolve) { taskStarted = resolve; });
    const runner = createGenerationBatchRunner({
      batchStore: store,
      executeTask: function(task, options) {
        taskStarted();
        return new Promise(function(resolve, reject) {
          options.signal.addEventListener("abort", function() {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          }, { once: true });
        });
      },
      concurrency: 1
    });

    const running = runner.run(batch.id);
    await started;
    await runner.stop();
    await running;

    assert.equal(store.getBatch(batch.id).tasks[0].status, "interrupted");
    assert.equal(store.getBatch(batch.id).tasks[1].status, "pending");
    assert.equal(store.getBatch(batch.id).status, "stopped");
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
      articleStore: {
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
    assert.equal(store.getBatch(batch.id).status, "stopped");
    assert.equal(runner.getState().status, "stopped");
  });
});
