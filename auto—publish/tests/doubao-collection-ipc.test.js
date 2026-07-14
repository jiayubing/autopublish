const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { registerDoubaoCollectionIpc } = require("../desktop/ipc/doubao-collection-ipc");
const { createDoubaoCollectionDesktopService } = require("../desktop/services/doubao-collection-service");

const CHANNELS = [
  "content:list-questions",
  "content:create-question",
  "content:update-question",
  "content:delete-question",
  "content:get-doubao-login-state",
  "content:open-doubao-login",
  "content:collect-doubao-one",
  "content:preview-doubao-batch",
  "content:start-doubao-batch",
  "content:start-prepared-doubao-batch",
  "content:pause-doubao-batch",
  "content:resume-doubao-batch",
  "content:stop-doubao-batch",
  "content:retry-failed-doubao",
  "content:get-doubao-queue-state",
  "content:save-manual-research"
];

function fakeService() {
  return {
    listQuestions: function(input) { return input; },
    createQuestion: function(input) { return input; },
    updateQuestion: function(input) { return input; },
    deleteQuestion: function(input) { return input; },
    getLoginState: function() { return { status: "unknown" }; },
    openLogin: function() { return { status: "unknown" }; },
    collectOne: function(input) { return input; },
    previewBatch: function(input) { return input; },
    saveManual: function(input) { return input; },
    startBatch: function(input) { return input; },
    startPreparedBatch: function(input) { return input; },
    pauseBatch: function() { return { status: "paused" }; },
    resumeBatch: function() { return { status: "running" }; },
    stopBatch: function() { return { status: "stopped" }; },
    retryFailed: function() { return { status: "retrying" }; },
    getQueueState: function() { return { status: "idle" }; }
  };
}

function registered(service) {
  const handlers = new Map();
  registerDoubaoCollectionIpc({
    ipcMain: { handle: function(channel, handler) { handlers.set(channel, handler); } },
    doubaoCollectionService: service || fakeService()
  });
  return handlers;
}

describe("Doubao desktop IPC", function() {
  it("registers the complete public channel surface", function() {
    const handlers = registered();
    assert.deepEqual(Array.from(handlers.keys()), CHANNELS);
  });

  it("routes batch preview and prepared start through validated public inputs", async function() {
    const handlers = registered();
    const preview = await handlers.get("content:preview-doubao-batch")(null, {
      clientIds: ["client-a", "client-b"],
      mode: "missing"
    });
    assert.deepEqual(preview, { ok: true, data: { clientIds: ["client-a", "client-b"], mode: "missing" } });

    const prepared = await handlers.get("content:start-prepared-doubao-batch")(null, {
      tasks: [{ clientId: "client-a", questionId: "question-a", force: true }]
    });
    assert.deepEqual(prepared, { ok: true, data: { tasks: [{ clientId: "client-a", questionId: "question-a", force: true }] } });
  });

  it("wraps service results and does not expose error internals", async function() {
    const handlers = registered({
      ...fakeService(),
      collectOne: function() {
        const error = new Error("failed with Cookie=secret and C:\\private\\profile");
        error.code = "DOUBAO_FAILED";
        throw error;
      }
    });
    const result = await handlers.get("content:collect-doubao-one")(null, {
      clientId: "client-a",
      questionId: "question-a"
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "DOUBAO_FAILED");
    assert.doesNotMatch(result.error.message, /Cookie|C:\\private\\profile/i);
    assert.equal("stack" in result.error, false);
  });

  it("routes public single collection through the queue and returns the current research record", async function() {
    const calls = [];
    const record = { id: "question-a", clientId: "client-a", answerText: "current answer" };
    const desktopService = createDoubaoCollectionDesktopService({
      workspaceRoot: "F:\\doubao-workspace",
      researchStore: {
        getResearch: function(clientId, questionId) {
          calls.push(["getResearch", clientId, questionId]);
          return record;
        }
      },
      collectionService: {
        getLoginState: function() { return { status: "authenticated" }; },
        openLogin: function() { return { status: "authenticated" }; },
        saveManual: function(input) { return input; },
        deleteQuestionAndResearch: function(input) { return input; },
        close: function() {}
      },
      queue: {
        start: async function(tasks) {
          calls.push(["start", tasks]);
          return { status: "completed", tasks: [{ clientId: "client-a", questionId: "question-a", status: "succeeded", error: null }] };
        },
        getState: function() { return { status: "completed" }; },
        subscribe: function() { return function() {}; },
        dispose: async function() {}
      }
    });

    const result = await desktopService.collectOne({ clientId: "client-a", questionId: "question-a", force: true });

    assert.equal(result, record);
    assert.deepEqual(calls, [["start", [{ clientId: "client-a", questionId: "question-a", force: true }]], ["getResearch", "client-a", "question-a"]]);
  });

  it("closes the collection session after single, completed batch, and failed batch runs", async function() {
    const calls = { close: 0 };
    const record = { id: "q1", clientId: "client-1", answerText: "current answer" };
    const desktopService = createDoubaoCollectionDesktopService({
      workspaceRoot: "F:\\doubao-workspace",
      researchStore: {
        getResearch: function() { return record; }
      },
      collectionService: {
        getLoginState: function() { return { status: "authenticated" }; },
        openLogin: function() { return { status: "authenticated" }; },
        saveManual: function(input) { return input; },
        deleteQuestionAndResearch: function(input) { return input; },
        close: async function() { calls.close += 1; }
      },
      queue: {
        start: async function(tasks) {
          const task = tasks[0];
          return {
            status: "completed",
            tasks: [{ clientId: task.clientId, questionId: task.questionId, status: task.questionId === "q-fail" ? "failed" : "succeeded", error: task.questionId === "q-fail" ? { code: "DOUBAO_FAILED", message: "failed" } : null }]
          };
        },
        getState: function() { return { status: "completed", tasks: [] }; },
        subscribe: function() { return function() {}; },
        dispose: async function() {}
      }
    });

    await desktopService.collectOne({ clientId: "client-1", questionId: "q1", force: false });
    assert.equal(calls.close, 1);
    await desktopService.startBatch({ tasks: [{ clientId: "client-1", questionId: "q2", force: false }] });
    assert.equal(calls.close, 2);
    await desktopService.startBatch({ tasks: [{ clientId: "client-1", questionId: "q-fail", force: false }] });
    assert.equal(calls.close, 3);
  });

  it("runs retryFailed through the session lifecycle and closes after it finishes", async function() {
    const calls = [];
    const desktopService = createDoubaoCollectionDesktopService({
      workspaceRoot: "F:\\doubao-workspace",
      collectionService: {
        close: async function() { calls.push("close"); }
      },
      queue: {
        retryFailed: async function() {
          calls.push("retryFailed");
          return { status: "completed", tasks: [{ status: "succeeded" }] };
        },
        getState: function() {
          calls.push("getState");
          return { status: "completed", tasks: [] };
        },
        subscribe: function() { return function() {}; },
        dispose: async function() {}
      }
    });

    const result = await desktopService.retryFailed();

    assert.deepEqual(result, { status: "completed", tasks: [{ status: "succeeded" }] });
    assert.deepEqual(calls, ["retryFailed", "getState", "close"]);
  });

  it("keeps the browser open while paused with pending tasks and does not close login sessions", async function() {
    let release;
    const running = new Promise(function(resolve) { release = resolve; });
    let state = { status: "running", tasks: [{ status: "running" }, { status: "pending" }] };
    let close = 0;
    const desktopService = createDoubaoCollectionDesktopService({
      workspaceRoot: "F:\\doubao-workspace",
      collectionService: {
        getLoginState: async function() { return { status: "authenticated" }; },
        openLogin: async function() { return { status: "authenticated" }; },
        close: async function() { close += 1; }
      },
      queue: {
        start: function() { return running.then(function() { state = { status: "completed", tasks: [] }; return state; }); },
        getState: function() { return state; },
        pause: function() { state = { status: "paused", tasks: [{ status: "running" }, { status: "pending" }] }; return state; },
        stop: function() { release(); return running.then(function() { state = { status: "completed", tasks: [] }; return state; }); },
        subscribe: function() { return function() {}; },
        dispose: async function() {}
      }
    });

    await desktopService.openLogin();
    assert.equal(close, 0);
    const started = desktopService.startBatch({ tasks: [{ clientId: "client-1", questionId: "q1", force: false }] });
    await new Promise(function(resolve) { setImmediate(resolve); });
    desktopService.pauseBatch();
    assert.equal(close, 0);
    await desktopService.stopBatch();
    await started;
    assert.equal(close, 1);
  });

  it("copies only a safe code and message when queued single collection fails", async function() {
    const failure = new Error("failed with Cookie=secret and C:\\private\\profile");
    failure.code = "DOUBAO_FAILED";
    failure.details = { secret: "must not escape" };
    const desktopService = createDoubaoCollectionDesktopService({
      workspaceRoot: "F:\\doubao-workspace",
      researchStore: { getResearch: function() { throw new Error("should not read after failure"); } },
      collectionService: {
        getLoginState: function() { return { status: "authenticated" }; },
        openLogin: function() { return { status: "authenticated" }; },
        saveManual: function(input) { return input; },
        deleteQuestionAndResearch: function(input) { return input; },
        close: function() {}
      },
      queue: {
        start: async function() { throw failure; },
        getState: function() { return { status: "completed" }; },
        subscribe: function() { return function() {}; },
        dispose: async function() {}
      }
    });

    await assert.rejects(desktopService.collectOne({ clientId: "client-a", questionId: "question-a" }), function(error) {
      return error.code === "DOUBAO_FAILED" && error.message === "failed with Cookie=secret and C:\\private\\profile" && !("details" in error);
    });
  });

  it("returns a stable collection failure for empty or malformed queue state without reading research", async function() {
    let researchReads = 0;
    for (const state of [undefined, {}, { status: "completed", tasks: [] }, { status: "running", tasks: [{ status: "succeeded" }] }, { status: "completed", tasks: [{ clientId: "other-client", questionId: "question-a", status: "failed", error: { code: "OTHER_ERROR", message: "other" } }] }]) {
      const desktopService = createDoubaoCollectionDesktopService({
        workspaceRoot: "F:\\doubao-workspace",
        researchStore: { getResearch: function() { researchReads += 1; return { id: "old-record" }; } },
        collectionService: {
          getLoginState: function() { return { status: "authenticated" }; },
          openLogin: function() { return { status: "authenticated" }; },
          saveManual: function(input) { return input; },
          deleteQuestionAndResearch: function(input) { return input; },
          close: function() {}
        },
        queue: {
          start: async function() { return state; },
          getState: function() { return { status: "completed" }; },
          subscribe: function() { return function() {}; },
          dispose: async function() {}
        }
      });

      await assert.rejects(desktopService.collectOne({ clientId: "client-a", questionId: "question-a" }), function(error) {
        return error.code === "DOUBAO_COLLECTION_FAILED" && typeof error.message === "string" && error.message.length > 0;
      });
    }
    assert.equal(researchReads, 0);
  });

  it("redacts nested queue errors without removing state or answer/reference content", async function() {
    let queueListener;
    let emittedPayload;
    const queueState = {
      status: "completed",
      currentTaskId: null,
      completed: 1,
      total: 1,
      waitRemainingMs: 0,
      tasks: [{
        id: "task-1",
        clientId: "client-a",
        questionId: "question-a",
        status: "failed",
        answerLength: 0,
        referenceCount: 1,
        error: {
          code: "DOUBAO_FAILED",
          message: "failed with Cookie=secret and C:\\private\\profile"
        }
      }]
    };
    const service = {
      ...fakeService(),
      getQueueState: function() { return queueState; },
      subscribe: function(listener) {
        queueListener = listener;
        return function() {};
      }
    };
    const handlers = registered(service);

    const result = await handlers.get("content:get-doubao-queue-state")(null);
    assert.deepEqual(Object.keys(result.data), Object.keys(queueState));
    assert.equal(result.data.completed, 1);
    assert.equal(result.data.tasks[0].error.code, "DOUBAO_FAILED");
    assert.doesNotMatch(result.data.tasks[0].error.message, /Cookie|C:\\private\\profile/i);
    assert.equal(result.data.tasks[0].error.message, "failed with [redacted] and [redacted path]");

    service.subscribe(function(payload) { emittedPayload = payload; });
    queueListener({
      state: queueState,
      tasks: queueState.tasks,
      answerText: "answer keeps Cookie=answer-content",
      references: [{ title: "reference keeps C:\\reference\\content", url: "https://example.com" }]
    });
    assert.doesNotMatch(emittedPayload.state.tasks[0].error.message, /Cookie|C:\\private\\profile/i);
    assert.equal(emittedPayload.state.tasks[0].error.code, "DOUBAO_FAILED");
    assert.equal(emittedPayload.answerText, "answer keeps Cookie=answer-content");
    assert.deepEqual(emittedPayload.references, [{ title: "reference keeps C:\\reference\\content", url: "https://example.com" }]);
  });

  it("rejects unsafe ids, paths, renderer scripts and profile paths at the boundary", async function() {
    const handlers = registered();
    const invalidRequests = [
      ["content:list-questions", { clientId: "../x" }],
      ["content:create-question", { clientId: "C:\\absolute", text: "question" }],
      ["content:open-doubao-login", { profilePath: "C:\\private\\profile" }],
      ["content:collect-doubao-one", { clientId: "client-a", questionId: "question-a", url: "https://evil.test" }],
      ["content:save-manual-research", { clientId: "client-a", questionId: "question-a", script: "alert(1)" }]
    ];

    for (const [channel, input] of invalidRequests) {
      const result = await handlers.get(channel)(null, input);
      assert.equal(result.ok, false, channel + " should reject unsafe input");
      assert.match(result.error.code, /INVALID|UNSUPPORTED/);
    }
  });

  it("rejects batches larger than 500 tasks and batch task fields outside the API", async function() {
    const handlers = registered();
    const tasks = Array.from({ length: 501 }, function(_, index) {
      return { clientId: "client-a", questionId: "question-" + index };
    });
    const tooMany = await handlers.get("content:start-doubao-batch")(null, { tasks: tasks });
    assert.equal(tooMany.ok, false);
    assert.match(tooMany.error.code, /INVALID|LIMIT/);

    const extraField = await handlers.get("content:start-doubao-batch")(null, {
      tasks: [{ clientId: "client-a", questionId: "question-a", force: false, path: "C:\\private" }]
    });
    assert.equal(extraField.ok, false);
    assert.match(extraField.error.code, /INVALID/);
  });
});
