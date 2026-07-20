const { fail } = require("../services/ipc-response");

function createAuthenticatedIpcMain(ipcMain, requireAuthenticated) {
  const proxy = {
    lastHandler: null,
    handle(channel, handler) {
      const wrapped = async function(event, ...args) {
        if (typeof requireAuthenticated === "function") {
          try { await requireAuthenticated(); }
          catch (error) { return fail(error); }
        }
        return handler(event, ...args);
      };
      proxy.lastHandler = wrapped;
      return ipcMain.handle(channel, wrapped);
    }
  };
  return proxy;
}

function registerIpc(deps) {
  const values = deps || {};
  const guarded = Object.assign({}, values, {
    ipcMain: createAuthenticatedIpcMain(values.ipcMain, values.requireAuthenticated || (values.authService && values.authService.requireAuthenticated))
  });
  require("./batch-ipc").registerBatchIpc(guarded);
  require("./media-ipc").registerMediaIpc(guarded);
  require("./platform-ipc").registerPlatformIpc(guarded);
  require("./ai-provider-ipc").registerAiProviderIpc(guarded);
  require("./platform-settings-ipc").registerPlatformSettingsIpc(guarded);
  require("./ai-content-ipc").registerAiContentIpc(guarded);
  require("./content-generation-batch-ipc").registerContentGenerationBatchIpc(guarded);
  require("./generation-submission-handoff-ipc").registerGenerationSubmissionHandoffIpc(guarded);
  require("./content-submission-ipc").registerContentSubmissionIpc(guarded);
  require("./article-attention-ipc").registerArticleAttentionIpc(guarded);
  require("./publication-ipc").registerPublicationIpc(guarded);
  require("./doubao-collection-ipc").registerDoubaoCollectionIpc(guarded);
  require("./runtime-diagnostics-ipc").registerRuntimeDiagnosticsIpc(guarded);
}

module.exports = { registerIpc, createAuthenticatedIpcMain };
