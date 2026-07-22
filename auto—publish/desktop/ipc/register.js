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
    },
    removeHandler(channel) {
      if (ipcMain && typeof ipcMain.removeHandler === "function") return ipcMain.removeHandler(channel);
    }
  };
  return proxy;
}

function registerIpc(deps) {
  const values = deps || {};
  // `registerIpc` is the authenticated main-process composition boundary.
  // Individual IPC registrars retain their explicit factory fallbacks for
  // isolated tests, but a production runtime must supply its owned ledger so
  // no registrar can silently create a second in-memory module instance.
  if (!values.publicationLedger || typeof values.publicationLedger.listForArticles !== "function") {
    const error = new Error("Authenticated IPC requires a publication ledger");
    error.code = "PUBLICATION_LEDGER_REQUIRED";
    throw error;
  }
  const channels = [];
  const authenticated = createAuthenticatedIpcMain(values.ipcMain, values.requireAuthenticated || (values.authService && values.authService.requireAuthenticated));
  const guardedIpcMain = Object.assign({}, authenticated, {
    handle: function(channel, handler) { channels.push(channel); return authenticated.handle(channel, handler); }
  });
  const guarded = Object.assign({}, values, { ipcMain: guardedIpcMain });
  const modules = {};
  modules.batch = require("./batch-ipc").registerBatchIpc(guarded);
  modules.media = require("./media-ipc").registerMediaIpc(guarded);
  modules.platform = require("./platform-ipc").registerPlatformIpc(guarded);
  modules.aiProvider = require("./ai-provider-ipc").registerAiProviderIpc(guarded);
  modules.platformSettings = require("./platform-settings-ipc").registerPlatformSettingsIpc(guarded);
  modules.aiContent = require("./ai-content-ipc").registerAiContentIpc(guarded);
  modules.generation = require("./content-generation-batch-ipc").registerContentGenerationBatchIpc(guarded);
  modules.handoff = require("./generation-submission-handoff-ipc").registerGenerationSubmissionHandoffIpc(guarded);
  modules.submission = require("./content-submission-ipc").registerContentSubmissionIpc(guarded);
  // archiveService is assembled by WorkspaceRuntime, not leaked from a prior
  // registrar's return value. Registration order is no longer an interface.
  modules.attention = require("./article-attention-ipc").registerArticleAttentionIpc(Object.assign({}, guarded, {
    archiveActionPort: values.archiveActionPort,
    articleAttentionQuery: values.articleAttentionQuery,
    articleAttentionResolver: values.articleAttentionResolver
  }));
  modules.articleManagement = require("./article-management-ipc").registerArticleManagementIpc(Object.assign({}, guarded, { articleAttentionQuery: modules.attention.query }));
  modules.publication = require("./publication-ipc").registerPublicationIpc(guarded);
  modules.doubao = require("./doubao-collection-ipc").registerDoubaoCollectionIpc(guarded);
  modules.diagnostics = require("./runtime-diagnostics-ipc").registerRuntimeDiagnosticsIpc(guarded);
  let disposed = false;
  return {
    modules: modules,
    dispose: function() {
      if (disposed) return;
      disposed = true;
      [...new Set(channels)].forEach(function(channel) { guardedIpcMain.removeHandler(channel); });
    }
  };
}

module.exports = { registerIpc, createAuthenticatedIpcMain };
