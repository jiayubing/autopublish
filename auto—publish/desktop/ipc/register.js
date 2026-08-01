const { productionIpcRegistry } = require("./contracts/production-registry");

function createAuthenticatedIpcMain(ipcMain, requireAuthenticated) {
  const proxy = {
    lastHandler: null,
    handle(channel, handler) {
      const contract = productionIpcRegistry.byChannel(channel);
      if (!contract) {
        const error = new Error("Non-Auth IPC channel must have a production contract");
        error.code = "IPC_CONTRACT_REQUIRED";
        throw error;
      }
      const wrapped = async function(event, ...args) {
        if (typeof requireAuthenticated === "function") {
          try { await requireAuthenticated(); }
          catch (error) {
            return productionIpcRegistry.failure(contract, { code: "AUTH_REQUIRED" });
          }
        }
        let payload;
        try {
          if (args.length !== 1) throw Object.assign(new Error("Invalid IPC request"), { code: "IPC_REQUEST_INVALID" });
          payload = productionIpcRegistry.parseRequest(contract, args[0]);
        } catch (_) {
          return productionIpcRegistry.failure(contract, { code: "IPC_REQUEST_INVALID" });
        }
        try {
          const legacyArgs = contract.toArgs ? contract.toArgs(payload) : [payload];
          const result = await handler(event, ...legacyArgs);
          if (!result || result.ok !== true) {
            const legacyError = result && result.error ? result.error : { code: "IPC_INTERNAL" };
            return productionIpcRegistry.failure(contract, legacyError);
          }
          try {
            return productionIpcRegistry.success(contract, result.data);
          } catch (_) {
            return productionIpcRegistry.failure(contract, { code: "IPC_RESULT_INVALID" });
          }
        } catch (_) {
          return productionIpcRegistry.failure(contract, { code: "IPC_INTERNAL" });
        }
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
  // Production must supply the OperationalStore owned by the workspace
  // composition root. Registrars may retain isolated-test fallbacks, but the
  // assembled application cannot create a legacy JSON publication writer.
  if (!values.operationalStore || typeof values.operationalStore.listPublicationRecords !== "function") {
    const error = new Error("Authenticated IPC requires an OperationalStore");
    error.code = "OPERATIONAL_STORE_REQUIRED";
    throw error;
  }
  const channels = [];
  const authenticated = createAuthenticatedIpcMain(values.ipcMain, values.requireAuthenticated || (values.authService && values.authService.requireAuthenticated));
  const guardedIpcMain = Object.assign({}, authenticated, {
    handle: function(channel, handler) { channels.push(channel); return authenticated.handle(channel, handler); }
  });
  const guarded = Object.assign({}, values, { ipcMain: guardedIpcMain });
  const modules = {};
  modules.workspace = require("./workspace-runtime-ipc").registerWorkspaceRuntimeIpc(guarded);
  // Isolated legacy registrar tests intentionally do not construct a
  // workspace OperationalStore. A production WorkspaceRuntime always does,
  // and therefore always exposes the explicit confirmation command.
  if (values.operationalStore) modules.accountProfiles = require("./account-profile-ipc").registerAccountProfileIpc(guarded);
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
