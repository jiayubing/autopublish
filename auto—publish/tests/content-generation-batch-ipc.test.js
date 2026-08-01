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
      preview: async function(input) { return {
        clientCount: 1,
        executableClientCount: 1,
        taskCount: input.templates.length,
        executableTaskCount: 1,
        excludedTaskCount: 0,
        excludedClients: [],
        templates: [{ ...input.templates[0], source: "builtin", readOnly: true }],
        clientSources: [{ clientId: "client-1", materialIds: ["material-1"], researchQueryIds: ["research-1"] }],
        tasks: [{ clientId: "client-1", platform: "media", templateId: "guide", materialIds: ["material-1"], researchQueryIds: ["research-1"] }],
      }; },
      createAndStartBatch: async function() { return { id: "batch-1" }; },
       stopBatch: async function() { return null; }, continueBatch: async function() { return null; }, retryFailed: async function() { return null; }, previewCancelPending: async function() { return { pendingCount: 1, canCancel: true }; }, cancelPending: async function() { return { id: "batch-1", status: "completed" }; }, getState: function() { return { status: "idle" }; },
      subscribe: function() { return function() {}; }
    };
    registerContentGenerationBatchIpc({ ipcMain, contentGenerationBatchService: service });
     for (const channel of ["content:preview-generation-batch", "content:create-and-start-generation-batch", "content:pause-generation-batch", "content:stop-generation-batch", "content:continue-generation-batch", "content:resume-generation-batch", "content:retry-failed-generation-batch", "content:preview-cancel-pending-generation-batch", "content:cancel-pending-generation-batch", "content:get-generation-runtime-snapshot"]) assert.ok(handlers.has(channel), channel);
    assert.deepStrictEqual(await handlers.get("content:preview-generation-batch")({}, { templates: [{ platform: "media", templateId: "guide" }] }), { ok: true, data: {
      clientCount: 1,
      executableClientCount: 1,
      taskCount: 1,
      executableTaskCount: 1,
      excludedTaskCount: 0,
      excludedClients: [],
      templates: [{ platform: "media", templateId: "guide" }],
      clientSources: [{ clientId: "client-1", materialIds: ["material-1"], researchQueryIds: ["research-1"] }],
      tasks: [{ clientId: "client-1", platform: "media", templateId: "guide", materialIds: ["material-1"], researchQueryIds: ["research-1"] }],
    } });
    assert.deepStrictEqual(await handlers.get("content:preview-cancel-pending-generation-batch")({}, { batchId: "batch-1" }), { ok: true, data: { pendingCount: 1, canCancel: true } });
    assert.deepStrictEqual(await handlers.get("content:cancel-pending-generation-batch")({}, { batchId: "batch-1", confirmed: true }), {
      ok: true,
      data: {
        batch: {
          id: "batch-1",
          status: "completed",
          clientSources: [],
          templates: [],
          tasks: [],
          counts: undefined,
        },
      },
    });
  });

  it("returns only allowlisted error code and message without provider details", async function() {
    const { ipcMain, handlers } = fakeIpc();
    const secret = "sk-secret-provider-body";
    registerContentGenerationBatchIpc({ ipcMain, contentGenerationBatchService: { preview: function() { throw Object.assign(new Error(secret), { code: "CLIENT_MATERIAL_REQUIRED" }); } } });
    const result = await handlers.get("content:preview-generation-batch")({}, {});
    assert.deepStrictEqual(result, { ok: false, error: { code: "CLIENT_MATERIAL_REQUIRED", message: "At least one valid client material is required" } });
    assert.equal(JSON.stringify(result).includes(secret), false);
  });

  it("returns safe template identity details for invalid batch templates", async function() {
    const { ipcMain, handlers } = fakeIpc();
    registerContentGenerationBatchIpc({ ipcMain, contentGenerationBatchService: {
      preview: function() {
        throw Object.assign(new Error("internal template path and body"), {
          code: "GENERATION_TEMPLATE_INVALID",
          platformId: "xiaohongshu",
          templateId: "body-only",
          diagnosticCode: "TEMPLATE_FRONT_MATTER_INVALID",
          sourcePath: "C:\\private\\template.md",
          body: "private body",
        });
      },
    } });
    const result = await handlers.get("content:preview-generation-batch")({}, {});
    assert.deepStrictEqual(result, {
      ok: false,
      error: {
        code: "GENERATION_TEMPLATE_INVALID",
        message: "写作模板格式无效，请检查具体模板诊断",
        platformId: "xiaohongshu",
        templateId: "body-only",
        diagnosticCode: "TEMPLATE_FRONT_MATTER_INVALID",
      },
    });
    assert.equal(JSON.stringify(result).includes("private"), false);
  });

  it("subscribes and unsubscribes renderer state listeners", function() {
    const { ipcMain } = fakeIpc();
    const sent = [];
    let listener;
    registerContentGenerationBatchIpc({ ipcMain, sendToRenderer: function(channel, payload) { sent.push([channel, payload]); }, contentGenerationBatchService: { getState: function() { return { status: "idle" }; }, subscribe: function(value) { listener = value; return function() { listener = null; }; } } });
    assert.equal(typeof listener, "function");
    listener({ runtimeId: "runner-1", sequence: 1, batchId: "batch-1", status: "running", taskId: "task-1", counts: null, updatedAt: "2026-07-26T00:00:00.000Z" });
    assert.deepStrictEqual(sent, [["content:generation-batch-state", { schemaVersion: 1, runtimeId: "runner-1", sequence: 1, batchId: "batch-1", status: "running", taskId: "task-1", counts: null, updatedAt: "2026-07-26T00:00:00.000Z" }]]);
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
      { ok: true, data: { batch: { id: "batch-7", status: "running", clientSources: [], templates: [], tasks: [], counts: undefined } } },
    );
    assert.deepStrictEqual(
      await handlers.get("content:resume-generation-batch")({}, { batchId: "batch-7", confirmConfigChange: false }),
      { ok: true, data: { batch: { id: "batch-7", status: "running", clientSources: [], templates: [], tasks: [], counts: undefined } } },
    );
    assert.deepStrictEqual(calls, [
      ["continue", { batchId: "batch-7", confirmConfigChange: true }],
      ["resume", { batchId: "batch-7", confirmConfigChange: false }],
    ]);
  });
});
