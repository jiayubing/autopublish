const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  GENERATION_TASK_PAGE_SIZE,
  registerContentGenerationBatchIpc,
  safeBatch,
  safePreview,
} = require("../desktop/ipc/content-generation-batch-ipc");
const {
  setDiagnosticReporter,
} = require("../src/diagnostics/diagnostic-producer");

function fakeIpc() {
  const handlers = new Map();
  return { handlers, ipcMain: { handle: function(channel, handler) { handlers.set(channel, handler); } } };
}

describe("content generation batch IPC", function() {
  it("bounds large task projections while preserving total-count evidence", function() {
    const tasks = Array.from({ length: 5000 }, (_, index) => ({
      id: `task-${index}`,
      clientId: "client-1",
      platform: "media",
      templateId: "guide",
      materialIds: ["material-1"],
      researchQueryIds: ["research-1"],
      status: "pending",
      attempts: 0,
    }));
    const batch = safeBatch({
      id: "batch-large",
      status: "pending",
      clientSources: [],
      templates: [],
      tasks,
      counts: { total: 5000, succeeded: 0, failed: 0, pending: 5000, interrupted: 0, cancelled: 0 },
    });
    const preview = safePreview({
      clientCount: 1,
      executableClientCount: 1,
      taskCount: 5000,
      executableTaskCount: 5000,
      excludedTaskCount: 0,
      excludedClients: [],
      templates: [],
      clientSources: [],
      tasks,
    });
    assert.equal(GENERATION_TASK_PAGE_SIZE, 256);
    assert.equal(batch.tasks.length, GENERATION_TASK_PAGE_SIZE);
    assert.equal(batch.taskCount, 5000);
    assert.equal(batch.taskOffset, 0);
    assert.equal(batch.tasksTruncated, true);
    assert.equal(preview.tasks.length, GENERATION_TASK_PAGE_SIZE);
    assert.equal(preview.taskCount, 5000);
    assert.equal(preview.tasksTruncated, true);
  });

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
       pauseBatch: async function() { return null; }, abandonBatch: async function() { return { id: "batch-1", status: "abandoned" }; }, resumeBatch: async function() { return null; }, retryFailed: async function() { return null; }, previewCancelPending: async function() { return { pendingCount: 1, canCancel: true }; }, cancelPending: async function() { return { id: "batch-1", status: "completed" }; }, getState: function() { return { status: "idle" }; },
      subscribe: function() { return function() {}; }
    };
    registerContentGenerationBatchIpc({ ipcMain, contentGenerationBatchService: service });
     for (const channel of ["content:preview-generation-batch", "content:create-and-start-generation-batch", "content:pause-generation-batch", "content:abandon-generation-batch", "content:resume-generation-batch", "content:retry-failed-generation-batch", "content:preview-cancel-pending-generation-batch", "content:cancel-pending-generation-batch", "content:get-generation-runtime-snapshot"]) assert.ok(handlers.has(channel), channel);
    assert.equal(handlers.has("content:stop-generation-batch"), false);
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

  it("isolates renderer event delivery failure and records a sanitized diagnostic", function() {
    const { ipcMain } = fakeIpc();
    const reports = [];
    let listener;
    const restore = setDiagnosticReporter((record) => {
      reports.push(record);
      return true;
    });
    try {
      registerContentGenerationBatchIpc({
        ipcMain,
        sendToRenderer() {
          throw new Error("private renderer transport detail");
        },
        contentGenerationBatchService: {
          getState() { return { status: "idle" }; },
          subscribe(value) { listener = value; return () => {}; },
        },
      });
      assert.doesNotThrow(() => listener({
        runtimeId: "runner-1",
        sequence: 2,
        batchId: "batch-1",
        status: "running",
      }));
      assert.equal(reports.length, 1);
      assert.equal(reports[0].code, "GENERATION_RUNTIME_EVENT_DELIVERY_FAILED");
      assert.equal(reports[0].metadata.transport, "ipc");
      assert.doesNotMatch(JSON.stringify(reports), /private|renderer transport detail/i);
    } finally {
      restore();
    }
  });

  it("forwards the batch id and configuration confirmation through the single resume command", async function() {
    const { ipcMain, handlers } = fakeIpc();
    const calls = [];
    const service = {
      resumeBatch: async function(input) { calls.push(input); return { id: input.batchId, status: "running" }; },
    };
    registerContentGenerationBatchIpc({ ipcMain, contentGenerationBatchService: service });

    assert.equal(handlers.has("content:continue-generation-batch"), false);
    assert.deepStrictEqual(
      await handlers.get("content:resume-generation-batch")({}, { batchId: "batch-7", confirmConfigChange: true }),
      { ok: true, data: { batch: { id: "batch-7", status: "running", clientSources: [], templates: [], tasks: [], counts: undefined } } },
    );
    assert.deepStrictEqual(calls, [{ batchId: "batch-7", confirmConfigChange: true }]);
  });
});
