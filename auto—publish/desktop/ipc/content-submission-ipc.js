const { wrap } = require("../services/ipc-response");

function bind(service, name) {
  if (!service || typeof service[name] !== "function") {
    const error = new Error("Submission operation is unavailable: " + name);
    error.code = "CONTENT_SUBMISSION_OPERATION_UNAVAILABLE";
    return function() { throw error; };
  }
  return service[name].bind(service);
}

function createSubmissionInterface(service) {
  return Object.freeze({
    preparation: {
      previewExport: bind(service, "previewExport"), exportArticle: bind(service, "exportArticle"), previewBatch: bind(service, "previewBatch"), createBatch: bind(service, "createBatch"), listPlatforms: bind(service, "listPlatforms")
    },
    batch: {
      buildActionPlan: bind(service, "buildSubmissionActionPlan"), previewCancel: bind(service, "previewCancelBatch"), cancel: bind(service, "cancelBatch"), get: bind(service, "getBatch"), list: bind(service, "listBatches"), reconcile: bind(service, "reconcileBatch")
    },
    cleanup: {
      previewFailed: bind(service, "previewCleanupFailedItems"), cleanupFailed: bind(service, "cleanupFailedItems"), previewResidue: bind(service, "previewTrashedArticleQueueResidue"), cleanupResidue: bind(service, "cleanupTrashedArticleQueueResidue")
    },
    retry: { previewFailedPublication: bind(service, "previewRetryFailedPublication"), failedPublication: bind(service, "retryFailedPublication") }
  });
}

function registerContentSubmissionIpc(deps) {
  const service = deps.contentSubmissionService;
  if (!service) {
    const error = new Error("Content submission service is required");
    error.code = "CONTENT_SUBMISSION_SERVICE_REQUIRED";
    throw error;
  }
  const workflow = deps.submissionWorkflow || createSubmissionInterface(service);
  function checked(input) { if (!input || input.confirmed !== true || Object.keys(input).some(function(key) { return ["clientId", "generatedArticleId", "targetPlatform", "mediaResourceId", "confirmed"].indexOf(key) === -1; })) { const e = new Error("Manual confirmation is required"); e.code = "CONTENT_EXPORT_CONFIRMATION_REQUIRED"; throw e; } return input; }
  deps.ipcMain.handle("content:preview-export", function(event, input) { return wrap(function() { return workflow.preparation.previewExport(checked(input)); }); });
  deps.ipcMain.handle("content:export-article", function(event, input) { return wrap(function() { return workflow.preparation.exportArticle(checked(input)); }); });
  function batchInput(input, confirmed) {
    if (!input || typeof input !== "object" || Object.keys(input).some(function(key) { return ["clientId", "articleIds", "targetPlatformIds", "accountProfiles", "confirmed", "batchId", "planId"].indexOf(key) === -1; })) {
      const e = new Error("Invalid content submission batch input"); e.code = "CONTENT_SUBMISSION_BATCH_INPUT_INVALID"; throw e;
    }
    if (confirmed && input.confirmed !== true) { const e = new Error("Batch confirmation is required"); e.code = "CONTENT_SUBMISSION_CONFIRMATION_REQUIRED"; throw e; }
    if (Array.isArray(input.targetPlatformIds) && input.targetPlatformIds.length) {
      if (!input.accountProfiles || typeof input.accountProfiles !== "object" || Array.isArray(input.accountProfiles) ||
          Object.keys(input.accountProfiles).length !== input.targetPlatformIds.length ||
          input.targetPlatformIds.some(function(platformId) { return typeof input.accountProfiles[platformId] !== "string" || !input.accountProfiles[platformId].trim(); })) {
        const e = new Error("A platform account profile is required"); e.code = "ACCOUNT_PROFILE_REQUIRED"; throw e;
      }
    }
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
  deps.ipcMain.handle("content:preview-submission-batch", function(event, input) { return wrap(function() { return safeBatchResult(workflow.preparation.previewBatch(batchInput(input, false))); }); });
  deps.ipcMain.handle("content:list-submission-platforms", function() { return wrap(function() { return workflow.preparation.listPlatforms(); }); });
  deps.ipcMain.handle("content:list-submission-batches", function(event, input) { return wrap(function() {
    if (input !== undefined && (!input || typeof input !== "object" || Array.isArray(input) || typeof input.clientId !== "string" || !input.clientId.trim() || Object.keys(input).some(function(key) { return key !== "clientId"; }))) {
      const error = new Error("Invalid content submission batch input"); error.code = "CONTENT_SUBMISSION_BATCH_INPUT_INVALID"; throw error;
    }
    return safeBatchResult(workflow.batch.list(input && input.clientId));
  }); });
  deps.ipcMain.handle("content:create-submission-batch", function(event, input) { return wrap(function() { return safeBatchResult(workflow.preparation.createBatch(batchInput(input, true))); }); });
  deps.ipcMain.handle("content:preview-cancel-submission-batch", function(event, input) { return wrap(function() { return safeBatchResult(workflow.batch.previewCancel(batchInput(input, false))); }); });
  deps.ipcMain.handle("content:cancel-submission-batch", function(event, input) { return wrap(function() { return safeBatchResult(workflow.batch.cancel(batchInput(input, true))); }); });
  deps.ipcMain.handle("content:preview-cleanup-failed-submission-items", function(event, input) { return wrap(function() { return safeBatchResult(workflow.cleanup.previewFailed(batchInput(input, false))); }); });
  deps.ipcMain.handle("content:cleanup-failed-submission-items", function(event, input) { return wrap(function() { return safeBatchResult(workflow.cleanup.cleanupFailed(batchInput(input, true))); }); });
  deps.ipcMain.handle("content:preview-retry-failed-publication", function(event, input) { return wrap(function() {
    if (!input || typeof input !== "object" || typeof input.publicationId !== "string" || Object.keys(input).some(function(key) { return key !== "publicationId"; })) {
      const error = new Error("Invalid failed publication retry input"); error.code = "CONTENT_SUBMISSION_INPUT_INVALID"; throw error;
    }
    return safeBatchResult(workflow.retry.previewFailedPublication(input));
  }); });
  deps.ipcMain.handle("content:retry-failed-publication", function(event, input) { return wrap(function() {
    if (!input || typeof input !== "object" || typeof input.publicationId !== "string" || input.confirmed !== true || Object.keys(input).some(function(key) { return !["publicationId", "expectedRevision", "confirmed"].includes(key); })) {
      const error = new Error("Failed publication retry confirmation is required"); error.code = "CONTENT_SUBMISSION_CONFIRMATION_REQUIRED"; throw error;
    }
    return safeBatchResult(workflow.retry.failedPublication(input));
  }); });
  deps.ipcMain.handle("content:get-submission-batch", function(event, input) { return wrap(function() { return safeBatchResult(workflow.batch.get(batchInput(input, false).batchId)); }); });
  deps.ipcMain.handle("content:preview-trashed-article-queue-residue", function() { return wrap(function() { return safeResidueResult(workflow.cleanup.previewResidue()); }); });
  deps.ipcMain.handle("content:cleanup-trashed-article-queue-residue", function(event, input) {
    return wrap(function() { return safeResidueResult(workflow.cleanup.cleanupResidue(input)); });
  });
}
module.exports = { registerContentSubmissionIpc };
