function bind(service, name) {
  if (!service || typeof service[name] !== "function")
    return function () {
      const error = new Error(
        "Submission workflow operation is unavailable: " + name,
      );
      error.code = "SUBMISSION_WORKFLOW_OPERATION_UNAVAILABLE";
      throw error;
    };
  return service[name].bind(service);
}

function createSubmissionWorkflow(service) {
  if (!service) throw new Error("Submission service is required");
  const preparation = {
    previewExport: bind(service, "previewExport"),
    exportArticle: bind(service, "exportArticle"),
    previewBatch: bind(service, "previewBatch"),
    createBatch: bind(service, "createBatch"),
    listPlatforms: bind(service, "listPlatforms"),
  };
  const batch = {
    buildActionPlan: bind(service, "buildSubmissionActionPlan"),
    previewCancel: bind(service, "previewCancelBatch"),
    cancel: bind(service, "cancelBatch"),
    get: bind(service, "getBatch"),
    list: bind(service, "listBatches"),
    reconcile: bind(service, "reconcileBatch"),
  };
  const cleanup = {
    previewFailed: bind(service, "previewCleanupFailedItems"),
    cleanupFailed: bind(service, "cleanupFailedItems"),
    previewResidue: bind(service, "previewTrashedArticleQueueResidue"),
    cleanupResidue: bind(service, "cleanupTrashedArticleQueueResidue"),
  };
  const retry = {
    previewFailedPublication: bind(service, "previewRetryFailedPublication"),
    failedPublication: bind(service, "retryFailedPublication"),
  };
  return Object.freeze({ preparation, batch, cleanup, retry });
}

module.exports = { createSubmissionWorkflow };
