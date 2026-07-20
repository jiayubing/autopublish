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

it("forwards only the preview action plan token for batch cancellation", async function() {
  const handlers = new Map();
  let received;
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    contentSubmissionService: {
      previewCancelBatch: () => ({ batchId: "batch-1", planId: "plan-1", allowedCount: 1, blockedCount: 0, items: [{ articleId: "article-1", fingerprint: "item-1", filePath: "C:\\secret.md" }] }),
      cancelBatch: (input) => { received = input; return { batchId: input.batchId, planId: input.planId, cancelledCount: 1, blockedItems: [] }; }
    }
  });
  const preview = await handlers.get("content:preview-cancel-submission-batch")(null, { batchId: "batch-1" });
  const result = await handlers.get("content:cancel-submission-batch")(null, { batchId: "batch-1", planId: "plan-1", confirmed: true });
  assert.deepEqual(preview, { ok: true, data: { batchId: "batch-1", planId: "plan-1", allowedCount: 1, blockedCount: 0, items: [{ articleId: "article-1", fingerprint: "item-1" }] } });
  assert.deepEqual(received, { batchId: "batch-1", planId: "plan-1", confirmed: true });
  assert.deepEqual(result, { ok: true, data: { batchId: "batch-1", planId: "plan-1", cancelledCount: 1, blockedItems: [] } });
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

it("keeps residue cleanup counts and reason codes while stripping filesystem fields", async function() {
  const handlers = new Map();
  registerContentSubmissionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    contentSubmissionService: {
      previewTrashedArticleQueueResidue: () => ({ cleanableCount: 1, reportedCount: 0, items: [{ publicationId: "pub-1", status: "failed", filePath: "C:\\secret.md", sidecarPath: "C:\\secret.md.submission.json", reasonCode: "PUBLICATION_ATTEMPT_MISMATCH" }] }),
      cleanupTrashedArticleQueueResidue: () => ({ status: "failed", cleanedCount: 0, failedCount: 1, remainingCount: 1, items: [{ publicationId: "pub-1", status: "failed", path: "C:\\secret.md", reasonCode: "PUBLICATION_ATTEMPT_MISMATCH" }] })
    }
  });
  const preview = await handlers.get("content:preview-trashed-article-queue-residue")();
  const result = await handlers.get("content:cleanup-trashed-article-queue-residue")(null, { confirmed: true });
  assert.deepEqual(preview, { ok: true, data: { cleanableCount: 1, reportedCount: 0, items: [{ publicationId: "pub-1", status: "failed", reasonCode: "PUBLICATION_ATTEMPT_MISMATCH" }] } });
  assert.deepEqual(result, { ok: true, data: { status: "failed", cleanedCount: 0, failedCount: 1, remainingCount: 1, items: [{ publicationId: "pub-1", status: "failed", reasonCode: "PUBLICATION_ATTEMPT_MISMATCH" }] } });
});
