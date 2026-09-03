const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createDoubaoCollectionQueue } = require("../src/content/doubao-collection-queue");

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.details = { secret: "must not escape" };
  return error;
}

function tick() {
  return new Promise(function(resolve) { setImmediate(resolve); });
}

describe("Doubao collection queue", { concurrency: false }, function() {
  it("runs tasks serially and caps client-switch delay at 12 seconds", async function() {
    const calls = [];
    const sleeps = [];
    const queue = createDoubaoCollectionQueue({
      collectOne: async function(task) {
        calls.push(task.questionId);
        return { answerText: "有效回答正文至少十个字符" };
      },
      sleep: async function(ms) { sleeps.push(ms); },
      randomDelayMs: function() { return 15000; }
    });

    const result = await queue.start([
      { clientId: "client-1", questionId: "q1" },
      { clientId: "client-2", questionId: "q2" }
    ]);

    assert.deepStrictEqual(calls, ["q1", "q2"]);
    assert.deepStrictEqual(sleeps, [12000]);
    assert.deepStrictEqual(result.tasks.map(function(task) { return task.status; }), ["succeeded", "succeeded"]);
  });

  it("rejects batches over 500 tasks and rejects a second active queue", async function() {
    const queue = createDoubaoCollectionQueue({
      collectOne: async function() { return { answerText: "有效回答正文至少十个字符" }; },
      sleep: async function() {}
    });

    await assert.rejects(queue.start(Array.from({ length: 501 }, function(_, index) {
      return { clientId: "client", questionId: "q-" + index };
    })), function(error) { return error.code === "DOUBAO_QUEUE_LIMIT"; });

    let release;
    const blocked = new Promise(function(resolve) { release = resolve; });
    const runningQueue = createDoubaoCollectionQueue({
      collectOne: async function() {
        await blocked;
        return { answerText: "有效回答正文至少十个字符" };
      },
      sleep: async function() {}
    });
    const first = runningQueue.start([{ clientId: "client", questionId: "q1" }]);
    await tick();
    await assert.rejects(runningQueue.start([{ clientId: "client", questionId: "q2" }]), function(error) {
      return error.code === "DOUBAO_QUEUE_ACTIVE";
    });
    release();
    await first;
  });

  it("starts a fresh run after a completed run", async function() {
    const calls = [];
    const queue = createDoubaoCollectionQueue({
      collectOne: async function(task) {
        calls.push(task.questionId);
        return { answerText: "鏈夋晥鍥炵瓟姝ｆ枃鑷冲皯鍗佷釜瀛楃" };
      },
      sleep: async function() {}
    });

    const first = await queue.start([{ clientId: "client", questionId: "q1" }]);
    const second = await queue.start([{ clientId: "client", questionId: "q2" }]);

    assert.equal(first.status, "completed");
    assert.equal(second.status, "completed");
    assert.equal(second.total, 1);
    assert.equal(second.completed, 1);
    assert.deepStrictEqual(second.tasks.map(function(task) { return task.questionId; }), ["q2"]);
    assert.deepStrictEqual(calls, ["q1", "q2"]);
  });

  it("rejects a new run while paused or stopping", async function() {
    let releasePaused;
    const pausedTask = new Promise(function(resolve) { releasePaused = resolve; });
    const pausedQueue = createDoubaoCollectionQueue({
      collectOne: async function() {
        await pausedTask;
        return { answerText: "鏈夋晥鍥炵瓟姝ｆ枃鑷冲皯鍗佷釜瀛楃" };
      },
      sleep: async function() {}
    });
    const pausedRun = pausedQueue.start([{ clientId: "client", questionId: "q1" }]);
    await tick();
    pausedQueue.pause();
    await assert.rejects(pausedQueue.start([{ clientId: "client", questionId: "q2" }]), function(error) {
      return error.code === "DOUBAO_QUEUE_ACTIVE";
    });
    releasePaused();
    await pausedRun;

    let releaseStopping;
    const stoppingTask = new Promise(function(resolve) { releaseStopping = resolve; });
    const stoppingQueue = createDoubaoCollectionQueue({
      collectOne: async function() {
        await stoppingTask;
        return { answerText: "鏈夋晥鍥炵瓟姝ｆ枃鑷冲皯鍗佷釜瀛楃" };
      },
      sleep: async function() {}
    });
    const running = stoppingQueue.start([{ clientId: "client", questionId: "q1" }]);
    await tick();
    const stopping = stoppingQueue.stop();
    await assert.rejects(stoppingQueue.start([{ clientId: "client", questionId: "q2" }]), function(error) {
      return error.code === "DOUBAO_QUEUE_ACTIVE";
    });
    releaseStopping();
    await stopping;
    await running;
  });

  it("emits the running lifecycle for a single task", async function() {
    const events = [];
    const queue = createDoubaoCollectionQueue({
      collectOne: async function() { return { answerText: "鏈夋晥鍥炵瓟姝ｆ枃鑷冲皯鍗佷釜瀛楃" }; },
      sleep: async function() {}
    });
    queue.subscribe(function(event) { events.push(event.type); });

    await queue.start([{ clientId: "client", questionId: "q1" }]);

    assert.deepStrictEqual(events.filter(function(type) {
      return ["running", "task_started", "task_succeeded", "completed"].includes(type);
    }), ["running", "task_started", "task_succeeded", "completed"]);
  });

  it("pauses on login and resumes the waiting task after login", async function() {
    let attempts = 0;
    const queue = createDoubaoCollectionQueue({
      collectOne: async function() {
        attempts += 1;
        if (attempts === 1) throw codedError("DOUBAO_LOGIN_REQUIRED", "请先登录 Doubao");
        return { answerText: "有效回答正文至少十个字符", references: [{ title: "来源", url: "https://example.com" }] };
      },
      sleep: async function() {}
    });

    const started = queue.start([{ clientId: "client", questionId: "q1" }]);
    await tick();
    assert.equal(queue.getState().status, "paused");
    assert.equal(queue.getState().tasks[0].status, "waiting_login");

    queue.resume();
    const result = await started;
    assert.equal(result.tasks[0].status, "succeeded");
    assert.equal(result.tasks[0].answerLength, "有效回答正文至少十个字符".length);
    assert.equal(result.tasks[0].referenceCount, 1);
  });

  it("pauses after the current task ends and resumes remaining tasks", async function() {
    let release;
    const currentTask = new Promise(function(resolve) { release = resolve; });
    const calls = [];
    const queue = createDoubaoCollectionQueue({
      collectOne: async function(task) {
        calls.push(task.questionId);
        if (task.questionId === "q1") await currentTask;
        return { answerText: "有效回答正文至少十个字符" };
      },
      sleep: async function() {}
    });

    const started = queue.start([
      { clientId: "client", questionId: "q1" },
      { clientId: "client", questionId: "q2" }
    ]);
    await tick();
    queue.pause();
    release();
    await tick();
    assert.equal(queue.getState().status, "paused");
    assert.deepStrictEqual(calls, ["q1"]);

    queue.resume();
    const result = await started;
    assert.deepStrictEqual(calls, ["q1", "q2"]);
    assert.deepStrictEqual(result.tasks.map(function(task) { return task.status; }), ["succeeded", "succeeded"]);
  });

  it("completes after the final task even when paused during that task", async function() {
    let release;
    const currentTask = new Promise(function(resolve) { release = resolve; });
    const queue = createDoubaoCollectionQueue({
      collectOne: async function() {
        await currentTask;
        return { answerText: "鏈夋晥鍥炵瓟姝ｆ枃鑷冲皯鍗佷釜瀛楃" };
      },
      sleep: async function() {}
    });

    const started = queue.start([{ clientId: "client", questionId: "q1" }]);
    await tick();
    queue.pause();
    release();

    const result = await Promise.race([
      started,
      new Promise(function(_, reject) {
        setTimeout(function() { reject(new Error("queue did not complete")); }, 50);
      })
    ]);
    assert.equal(result.status, "completed");
    assert.equal(result.tasks[0].status, "succeeded");
  });

  it("freezes the remaining inter-task wait while paused and resumes it before the next task", async function() {
    const calls = [];
    const sleepRequests = [];
    const pendingSleeps = [];
    const queue = createDoubaoCollectionQueue({
      collectOne: async function(task) {
        calls.push(task.questionId);
        return { answerText: "鏈夋晥鍥炵瓟姝ｆ枃鑷冲皯鍗佷釜瀛楃" };
      },
      sleep: function(ms) {
        sleepRequests.push(ms);
        return new Promise(function(resolve) { pendingSleeps.push(resolve); });
      },
      randomDelayMs: function() { return 15000; },
      countdownIntervalMs: 1
    });

    const started = queue.start([
      { clientId: "client", questionId: "q1" },
      { clientId: "client", questionId: "q2" }
    ]);
    for (let attempt = 0; attempt < 100 && sleepRequests.length === 0; attempt += 1) await tick();
    await new Promise(function(resolve) { setTimeout(resolve, 5); });

    queue.pause();
    await tick();
    const pausedState = queue.getState();
    assert.equal(pausedState.status, "paused");
    assert.deepStrictEqual(calls, ["q1"]);
    assert.ok(pausedState.waitRemainingMs > 0);
    assert.ok(pausedState.waitRemainingMs < 15000);

    queue.resume();
    await tick();
    assert.deepStrictEqual(calls, ["q1"]);
    assert.equal(sleepRequests.length, 2);
    assert.ok(sleepRequests[1] > 0);
    assert.ok(sleepRequests[1] <= pausedState.waitRemainingMs);

    pendingSleeps[1]();
    const result = await started;
    assert.deepStrictEqual(calls, ["q1", "q2"]);
    assert.deepStrictEqual(result.tasks.map(function(task) { return task.status; }), ["succeeded", "succeeded"]);
  });

  it("stops without starting queued tasks and marks them cancelled", async function() {
    let release;
    const currentTask = new Promise(function(resolve) { release = resolve; });
    const queue = createDoubaoCollectionQueue({
      collectOne: async function() {
        await currentTask;
        return { answerText: "有效回答正文至少十个字符" };
      },
      sleep: async function() {}
    });

    const started = queue.start([
      { clientId: "client", questionId: "q1" },
      { clientId: "client", questionId: "q2" },
      { clientId: "client", questionId: "q3" }
    ]);
    await tick();
    const stopping = queue.stop();
    assert.equal(queue.getState().status, "stopping");
    release();
    await stopping;
    const result = await started;
    assert.deepStrictEqual(result.tasks.map(function(task) { return task.status; }), ["succeeded", "cancelled", "cancelled"]);
  });

  it("retryFailed reruns failed tasks in place without growing history", async function() {
    let firstAttempt = true;
    const calls = [];
    const queue = createDoubaoCollectionQueue({
      collectOne: async function(task) {
        calls.push(task.questionId);
        if (task.questionId === "q1" && firstAttempt) {
          firstAttempt = false;
          throw codedError("DOUBAO_PAGE_ERROR", "页面错误");
        }
        return { answerText: "有效回答正文至少十个字符" };
      },
      sleep: async function() {}
    });

    const firstResult = await queue.start([
      { clientId: "client", questionId: "q1" },
      { clientId: "client", questionId: "q2" }
    ]);
    assert.deepStrictEqual(firstResult.tasks.map(function(task) { return task.status; }), ["failed", "succeeded"]);
    const originalIds = firstResult.tasks.map(function(task) { return task.id; });

    const retryResult = await queue.retryFailed();
    assert.deepStrictEqual(calls, ["q1", "q2", "q1"]);
    assert.deepStrictEqual(retryResult.tasks.map(function(task) { return task.status; }), ["succeeded", "succeeded"]);
    assert.deepStrictEqual(retryResult.tasks.map(function(task) { return task.id; }), originalIds);
    assert.equal(retryResult.total, 2);
    assert.equal(retryResult.completed, 2);
  });

  it("emits countdown state events and stops notifying an unsubscribed listener", async function() {
    const events = [];
    const queue = createDoubaoCollectionQueue({
      collectOne: async function() { return { answerText: "有效回答正文至少十个字符" }; },
      sleep: async function() {},
      randomDelayMs: function() { return 15000; },
      countdownIntervalMs: 1
    });
    const unsubscribe = queue.subscribe(function(event) { events.push(event); });
    unsubscribe();
    await queue.start([
      { clientId: "client", questionId: "q1" },
      { clientId: "client", questionId: "q2" }
    ]);
    assert.deepStrictEqual(events, []);

    const subscribedEvents = [];
    queue.subscribe(function(event) { subscribedEvents.push(event); });
    const secondQueue = createDoubaoCollectionQueue({
      collectOne: async function() { return { answerText: "有效回答正文至少十个字符" }; },
      sleep: function() { return new Promise(function(resolve) { setTimeout(resolve, 5); }); },
      randomDelayMs: function() { return 15000; },
      countdownIntervalMs: 1
    });
    const secondEvents = [];
    const remove = secondQueue.subscribe(function(event) { secondEvents.push(event); });
    await secondQueue.start([
      { clientId: "client", questionId: "q1" },
      { clientId: "client", questionId: "q2" }
    ]);
    assert.ok(secondEvents.some(function(event) { return event.type === "countdown" && event.waitRemainingMs > 0; }));
    const eventCount = secondEvents.length;
    remove();
    await secondQueue.retryFailed();
    assert.equal(secondEvents.length, eventCount);
    assert.deepStrictEqual(subscribedEvents, []);
  });

  it("stores only a safe code and message for collection errors", async function() {
    const queue = createDoubaoCollectionQueue({
      collectOne: async function() { throw codedError("DOUBAO_SECRET", "安全错误消息"); },
      sleep: async function() {}
    });

    const result = await queue.start([{ clientId: "client", questionId: "q1" }]);
    assert.deepStrictEqual(result.tasks[0].error, { code: "DOUBAO_SECRET", message: "安全错误消息" });
    assert.equal(Object.prototype.hasOwnProperty.call(result.tasks[0].error, "stack"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result.tasks[0].error, "details"), false);
  });
});
