const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { registerContentGenerationBatchIpc } = require("../desktop/ipc/content-generation-batch-ipc");

function fakeIpc() {
  const handlers = new Map();
  return { handlers, ipcMain: { handle: function(channel, handler) { handlers.set(channel, handler); } } };
}

describe("content generation batch IPC", function() {
  it("registers the complete safe batch surface and wraps successful calls", async function() {
    const { ipcMain, handlers } = fakeIpc();
    const service = {
      preview: async function(input) { return { taskCount: input.templates.length }; },
      createBatch: async function() { return { id: "batch-1" }; },
      list: function() { return []; }, get: function() { return { id: "batch-1" }; }, startBatch: async function() { return { status: "completed" }; },
      stopBatch: async function() { return null; }, continueBatch: async function() { return null; }, retryFailed: async function() { return null; }, getState: function() { return { status: "idle" }; },
      subscribe: function() { return function() {}; }
    };
    registerContentGenerationBatchIpc({ ipcMain, contentGenerationBatchService: service });
    for (const channel of ["content:preview-generation-batch", "content:create-generation-batch", "content:list-generation-batches", "content:get-generation-batch", "content:start-generation-batch", "content:pause-generation-batch", "content:stop-generation-batch", "content:continue-generation-batch", "content:resume-generation-batch", "content:retry-failed-generation-batch", "content:get-generation-batch-state"]) assert.ok(handlers.has(channel), channel);
    assert.deepStrictEqual(await handlers.get("content:preview-generation-batch")({}, { templates: ["guide"] }), { ok: true, data: { taskCount: 1 } });
  });

  it("returns only allowlisted error code and message without provider details", async function() {
    const { ipcMain, handlers } = fakeIpc();
    const secret = "sk-secret-provider-body";
    registerContentGenerationBatchIpc({ ipcMain, contentGenerationBatchService: { preview: function() { throw Object.assign(new Error(secret), { code: "CLIENT_MATERIAL_REQUIRED" }); } } });
    const result = await handlers.get("content:preview-generation-batch")({}, {});
    assert.deepStrictEqual(result, { ok: false, error: { code: "CLIENT_MATERIAL_REQUIRED", message: "At least one valid client material is required" } });
    assert.equal(JSON.stringify(result).includes(secret), false);
  });

  it("subscribes and unsubscribes renderer state listeners", function() {
    const { ipcMain } = fakeIpc();
    const sent = [];
    let listener;
    registerContentGenerationBatchIpc({ ipcMain, sendToRenderer: function(channel, payload) { sent.push([channel, payload]); }, contentGenerationBatchService: { getState: function() { return { status: "idle" }; }, subscribe: function(value) { listener = value; return function() { listener = null; }; } } });
    assert.equal(typeof listener, "function");
    listener({ batchId: "batch-1", status: "running", taskId: "task-1" });
    assert.deepStrictEqual(sent, [["content:generation-batch-state", { batchId: "batch-1", status: "running", taskId: "task-1" }]]);
  });

  it("forwards the batch id and configuration confirmation for continuation commands", async function() {
    const { ipcMain, handlers } = fakeIpc();
    const calls = [];
    const service = {
      continueBatch: async function(input) { calls.push(["continue", input]); return { id: input.batchId, status: "running" }; },
      resumeBatch: async function(input) { calls.push(["resume", input]); return { id: input.batchId, status: "running" }; },
      get: function(batchId) { calls.push(["get", batchId]); return { id: batchId, status: "refreshed" }; },
    };
    registerContentGenerationBatchIpc({ ipcMain, contentGenerationBatchService: service });

    assert.deepStrictEqual(
      await handlers.get("content:continue-generation-batch")({}, { batchId: "batch-7", confirmConfigChange: true }),
      { ok: true, data: { id: "batch-7", status: "refreshed" } },
    );
    assert.deepStrictEqual(
      await handlers.get("content:resume-generation-batch")({}, { batchId: "batch-7", confirmConfigChange: false }),
      { ok: true, data: { id: "batch-7", status: "refreshed" } },
    );
    assert.deepStrictEqual(calls, [
      ["continue", { batchId: "batch-7", confirmConfigChange: true }],
      ["get", "batch-7"],
      ["resume", { batchId: "batch-7", confirmConfigChange: false }],
      ["get", "batch-7"],
    ]);
  });
});
