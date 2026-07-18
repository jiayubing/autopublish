const { createContentSubmissionService } = require("../services/content-submission-service");
const { wrap } = require("../services/ipc-response");
function registerContentSubmissionIpc(deps) {
  const service = deps.contentSubmissionService || createContentSubmissionService({ workspaceRoot: deps.rootDir, paths: deps.paths, platforms: deps.platforms });
  function checked(input) { if (!input || input.confirmed !== true || Object.keys(input).some(function(key) { return ["clientId", "generatedArticleId", "targetPlatform", "mediaResourceId", "confirmed"].indexOf(key) === -1; })) { const e = new Error("Manual confirmation is required"); e.code = "CONTENT_EXPORT_CONFIRMATION_REQUIRED"; throw e; } return input; }
  deps.ipcMain.handle("content:preview-export", function(event, input) { return wrap(function() { return service.previewExport(checked(input)); }); });
  deps.ipcMain.handle("content:export-article", function(event, input) { return wrap(function() { return service.exportArticle(checked(input)); }); });
  function batchInput(input, confirmed) {
    if (!input || typeof input !== "object" || Object.keys(input).some(function(key) { return ["clientId", "articleIds", "targetPlatformIds", "confirmed", "batchId"].indexOf(key) === -1; })) {
      const e = new Error("Invalid content submission batch input"); e.code = "CONTENT_SUBMISSION_BATCH_INPUT_INVALID"; throw e;
    }
    if (confirmed && input.confirmed !== true) { const e = new Error("Batch confirmation is required"); e.code = "CONTENT_SUBMISSION_CONFIRMATION_REQUIRED"; throw e; }
    return input;
  }
  function safeBatchResult(value) {
    if (!value || typeof value !== "object") return value;
    const result = JSON.parse(JSON.stringify(value));
    const batches = Array.isArray(result) ? result : [result];
    batches.forEach(function(batch) {
      if (Array.isArray(batch.items)) batch.items.forEach(function(item) { delete item.filePath; delete item.sidecarPath; });
    });
    return result;
  }
  function safeResidueResult(value) {
    if (!value || typeof value !== "object") return value;
    const result = JSON.parse(JSON.stringify(value));
    [result.items, result.remainingItems, result.cleanableItems, result.reportedItems, result.failedItems].forEach(function(items) {
      if (!Array.isArray(items)) return;
      items.forEach(function(item) {
        if (!item || typeof item !== "object") return;
        ["filePath", "sidecarPath", "path", "sourceFile"].forEach(function(key) { delete item[key]; });
      });
    });
    return result;
  }
  deps.ipcMain.handle("content:preview-submission-batch", function(event, input) { return wrap(function() { return safeBatchResult(service.previewBatch(batchInput(input, false))); }); });
  deps.ipcMain.handle("content:list-submission-platforms", function() { return wrap(function() { return service.listPlatforms(); }); });
  deps.ipcMain.handle("content:list-submission-batches", function(event, input) { return wrap(function() {
    if (input !== undefined && (!input || typeof input !== "object" || Array.isArray(input) || typeof input.clientId !== "string" || !input.clientId.trim() || Object.keys(input).some(function(key) { return key !== "clientId"; }))) {
      const error = new Error("Invalid content submission batch input"); error.code = "CONTENT_SUBMISSION_BATCH_INPUT_INVALID"; throw error;
    }
    return safeBatchResult(service.listBatches(input && input.clientId));
  }); });
  deps.ipcMain.handle("content:create-submission-batch", function(event, input) { return wrap(function() { return safeBatchResult(service.createBatch(batchInput(input, true))); }); });
  deps.ipcMain.handle("content:preview-cancel-submission-batch", function(event, input) { return wrap(function() { return safeBatchResult(service.previewCancelBatch(batchInput(input, false))); }); });
  deps.ipcMain.handle("content:cancel-submission-batch", function(event, input) { return wrap(function() { return safeBatchResult(service.cancelBatch(batchInput(input, true))); }); });
  deps.ipcMain.handle("content:preview-cleanup-failed-submission-items", function(event, input) { return wrap(function() { return safeBatchResult(service.previewCleanupFailedItems(batchInput(input, false))); }); });
  deps.ipcMain.handle("content:cleanup-failed-submission-items", function(event, input) { return wrap(function() { return safeBatchResult(service.cleanupFailedItems(batchInput(input, true))); }); });
  deps.ipcMain.handle("content:preview-retry-failed-publication", function(event, input) { return wrap(function() {
    if (!input || typeof input !== "object" || typeof input.publicationId !== "string" || Object.keys(input).some(function(key) { return key !== "publicationId"; })) {
      const error = new Error("Invalid failed publication retry input"); error.code = "CONTENT_SUBMISSION_INPUT_INVALID"; throw error;
    }
    return safeBatchResult(service.previewRetryFailedPublication(input));
  }); });
  deps.ipcMain.handle("content:retry-failed-publication", function(event, input) { return wrap(function() {
    if (!input || typeof input !== "object" || typeof input.publicationId !== "string" || input.confirmed !== true || Object.keys(input).some(function(key) { return !["publicationId", "expectedRevision", "confirmed"].includes(key); })) {
      const error = new Error("Failed publication retry confirmation is required"); error.code = "CONTENT_SUBMISSION_CONFIRMATION_REQUIRED"; throw error;
    }
    return safeBatchResult(service.retryFailedPublication(input));
  }); });
  deps.ipcMain.handle("content:get-submission-batch", function(event, input) { return wrap(function() { return safeBatchResult(service.getBatch(batchInput(input, false).batchId)); }); });
  deps.ipcMain.handle("content:preview-trashed-article-queue-residue", function() { return wrap(function() { return safeResidueResult(service.previewTrashedArticleQueueResidue()); }); });
  deps.ipcMain.handle("content:cleanup-trashed-article-queue-residue", function(event, input) {
    return wrap(function() { return safeResidueResult(service.cleanupTrashedArticleQueueResidue(input)); });
  });
}
module.exports = { registerContentSubmissionIpc };
