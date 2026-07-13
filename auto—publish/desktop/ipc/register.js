function registerIpc(deps) {
  require("./batch-ipc").registerBatchIpc(deps);
  require("./media-ipc").registerMediaIpc(deps);
  require("./platform-ipc").registerPlatformIpc(deps);
  require("./ai-content-ipc").registerAiContentIpc(deps);
  require("./content-submission-ipc").registerContentSubmissionIpc(deps);
  require("./doubao-collection-ipc").registerDoubaoCollectionIpc(deps);
}

module.exports = { registerIpc };
