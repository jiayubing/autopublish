function registerIpc(deps) {
  require("./batch-ipc").registerBatchIpc(deps);
  require("./media-ipc").registerMediaIpc(deps);
  require("./platform-ipc").registerPlatformIpc(deps);
  require("./ai-provider-ipc").registerAiProviderIpc(deps);
  require("./platform-settings-ipc").registerPlatformSettingsIpc(deps);
  require("./ai-content-ipc").registerAiContentIpc(deps);
  require("./content-generation-batch-ipc").registerContentGenerationBatchIpc(deps);
  require("./content-submission-ipc").registerContentSubmissionIpc(deps);
  require("./doubao-collection-ipc").registerDoubaoCollectionIpc(deps);
  require("./runtime-diagnostics-ipc").registerRuntimeDiagnosticsIpc(deps);
}

module.exports = { registerIpc };
