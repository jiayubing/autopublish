const { it } = require("node:test"); const assert = require("node:assert/strict");
const { registerContentSubmissionIpc } = require("../desktop/ipc/content-submission-ipc");
it("requires confirmed true and never accepts renderer paths", async function() {
  const handlers = new Map();
  registerContentSubmissionIpc({ ipcMain: { handle: (c, h) => handlers.set(c, h) }, contentSubmissionService: { previewExport: () => ({}) } });
  const result = await handlers.get("content:preview-export")(null, { clientId: "c", generatedArticleId: "a", targetPlatform: "media", confirmed: false, filePath: "C:\\x" });
  assert.deepStrictEqual(result, { ok: false, error: { code: "CONTENT_EXPORT_CONFIRMATION_REQUIRED", message: "Manual confirmation is required" } });
});

it("exposes current-client submission batch history without renderer paths", async function() {
  const handlers = new Map();
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    contentSubmissionService: {
      listBatches: (clientId) => [{ id: "batch-1", clientId, items: [{ filePath: "C:\\secret.md", status: "queued" }] }]
    }
  });

  const result = await handlers.get("content:list-submission-batches")(null, { clientId: "client-1" });

  assert.deepEqual(result, { ok: true, data: [{ id: "batch-1", clientId: "client-1", items: [{ status: "queued" }] }] });
});

it("passes an optional media resource id but continues rejecting renderer paths", async function() {
  const handlers = new Map();
  let received;
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    contentSubmissionService: { previewExport: (input) => { received = input; return { status: "queueable" }; } }
  });
  const result = await handlers.get("content:preview-export")(null, {
    clientId: "client-1",
    generatedArticleId: "article-1",
    targetPlatform: "media",
    mediaResourceId: "1001",
    confirmed: true
  });
  assert.deepEqual(result, { ok: true, data: { status: "queueable" } });
  assert.equal(received.mediaResourceId, "1001");
});

it("exposes reconciliation cleanup previews and keeps queue paths out of the renderer response", async function() {
  const handlers = new Map();
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    contentSubmissionService: {
      previewCleanupFailedItems: () => ({ batchId: "batch-1", cleanableCount: 1, uncleanableCount: 0, items: [{ articleId: "article-1", status: "failed", filePath: "C:\\secret.md", sidecarPath: "C:\\secret.md.submission.json", cleanable: true }] }),
      cleanupFailedItems: () => ({ batchId: "batch-1", cleanedCount: 1, skippedCount: 0, items: [{ articleId: "article-1", status: "failed-cleaned", filePath: "C:\\secret.md" }] })
    }
  });

  const preview = await handlers.get("content:preview-cleanup-failed-submission-items")(null, { batchId: "batch-1" });
  const result = await handlers.get("content:cleanup-failed-submission-items")(null, { batchId: "batch-1", confirmed: true });
  assert.deepEqual(preview, { ok: true, data: { batchId: "batch-1", cleanableCount: 1, uncleanableCount: 0, items: [{ articleId: "article-1", status: "failed", cleanable: true }] } });
  assert.deepEqual(result, { ok: true, data: { batchId: "batch-1", cleanedCount: 1, skippedCount: 0, items: [{ articleId: "article-1", status: "failed-cleaned" }] } });
});
