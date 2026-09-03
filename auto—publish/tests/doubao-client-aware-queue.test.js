const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createDoubaoCollectionQueue } = require("../src/content/doubao-collection-queue");

describe("doubao client-aware queue policy", function() {
  it("groups tasks by client and uses shorter same-client delays", async function() {
    const order = [];
    const sleeps = [];
    const queue = createDoubaoCollectionQueue({
      collectOne: async function(input) {
        order.push(input.clientId + ":" + input.questionId);
        return { answerText: "完整回答内容", references: [] };
      },
      sameClientDelayMs: function() { return 4000; },
      clientSwitchDelayMs: function() { return 7000; },
      sleep: async function(ms) { sleeps.push(ms); },
      countdownIntervalMs: 1,
    });

    const result = await queue.start([
      { clientId: "client-a", questionId: "q1" },
      { clientId: "client-b", questionId: "q3" },
      { clientId: "client-a", questionId: "q2" },
    ]);

    assert.deepEqual(order, [
      "client-a:q1",
      "client-a:q2",
      "client-b:q3",
    ]);
    assert.deepEqual(sleeps, [4000, 7000]);
    assert.equal(result.status, "completed");
    assert.equal(result.completed, 3);
  });

  it("pauses on a Doubao challenge and retries the same task after resume", async function() {
    let attempts = 0;
    const queue = createDoubaoCollectionQueue({
      collectOne: async function() {
        attempts += 1;
        if (attempts === 1) {
          const error = new Error("human action required");
          error.code = "DOUBAO_CHALLENGE";
          throw error;
        }
        return { answerText: "恢复后的完整回答", references: [] };
      },
      sleep: async function() {},
    });

    const running = queue.start([{ clientId: "client-a", questionId: "q1" }]);
    await new Promise((resolve) => setImmediate(resolve));

    const paused = queue.getState();
    assert.equal(paused.status, "paused");
    assert.equal(paused.tasks[0].status, "waiting_human");
    assert.equal(paused.completed, 0);

    queue.resume();
    const result = await running;
    assert.equal(result.status, "completed");
    assert.equal(result.tasks[0].status, "succeeded");
    assert.equal(result.completed, 1);
    assert.equal(attempts, 2);
  });

  it("retries failed tasks in place without growing the queue", async function() {
    let allowSuccess = false;
    const queue = createDoubaoCollectionQueue({
      collectOne: async function(input) {
        if (input.questionId === "q1" && !allowSuccess) {
          const error = new Error("temporary failure");
          error.code = "DOUBAO_PAGE_ERROR";
          throw error;
        }
        return { answerText: "完整回答内容", references: [] };
      },
      randomDelayMs: function() { return 15000; },
      sleep: async function() {},
    });

    const first = await queue.start([
      { clientId: "client-a", questionId: "q1" },
      { clientId: "client-a", questionId: "q2" },
    ]);
    assert.equal(first.total, 2);
    assert.equal(first.tasks.length, 2);
    assert.equal(first.tasks.filter((task) => task.status === "failed").length, 1);

    allowSuccess = true;
    const retried = await queue.retryFailed();
    assert.equal(retried.total, 2);
    assert.equal(retried.tasks.length, 2);
    assert.equal(retried.completed, 2);
    assert.equal(retried.tasks.every((task) => task.status === "succeeded"), true);
  });
});
