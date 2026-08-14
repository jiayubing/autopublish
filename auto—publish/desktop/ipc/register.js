const { productionIpcRegistry } = require("./contracts/production-registry");
const { reportDiagnostic } = require("../../src/diagnostics/diagnostic-producer");

function reportCleanupFailure(action) {
  reportDiagnostic({
    code: "IPC_CLEANUP_FAILED",
    module: "ipc-register",
    category: "transport",
    operationId: "ipc-registration-cleanup",
    metadata: { action, transport: "ipc", outcome: "failed" },
  });
}

function createTypedIpcMain(ipcMain, requireAuthenticated) {
  function contractFor(channel) {
    const contract = productionIpcRegistry.byChannel(channel);
    if (!contract) {
      const error = new Error("Non-Auth IPC channel must have a production contract");
      error.code = "IPC_CONTRACT_REQUIRED";
      throw error;
    }
    return contract;
  }

  async function begin(channel, input) {
    const contract = contractFor(channel);
    if (typeof requireAuthenticated === "function") {
      try {
        await requireAuthenticated();
      } catch (_) {
        const error = new Error("Authentication required");
        error.code = "AUTH_REQUIRED";
        throw error;
      }
    }
    let payload;
    try {
      payload = productionIpcRegistry.parseRequest(contract, input);
    } catch (_) {
      const error = new Error("Invalid IPC request");
      error.code = "IPC_REQUEST_INVALID";
      throw error;
    }
    return {
      contract,
      args: contract.toArgs ? contract.toArgs(payload) : [payload],
    };
  }

  function complete(context, result) {
    if (result && result.ok === false) {
      return productionIpcRegistry.failure(
        context.contract,
        result.error || { code: "IPC_INTERNAL" },
      );
    }
    const data = result && result.ok === true &&
      Object.prototype.hasOwnProperty.call(result, "data")
      ? result.data
      : result;
    try {
      return productionIpcRegistry.success(context.contract, data);
    } catch (_) {
      return productionIpcRegistry.failure(context.contract, { code: "IPC_RESULT_INVALID" });
    }
  }

  function fail(channelOrContext, error) {
    const context = channelOrContext && channelOrContext.contract
      ? channelOrContext
      : { contract: contractFor(channelOrContext) };
    return productionIpcRegistry.failure(
      context.contract,
      error || { code: "IPC_INTERNAL" },
    );
  }

  const proxy = {
    lastHandler: null,
    begin,
    complete,
    fail,
    handle(channel, handler) {
      contractFor(channel);
      const wrapped = async function(event, ...args) {
        let context;
        try {
          if (args.length !== 1) throw Object.assign(new Error("Invalid IPC request"), { code: "IPC_REQUEST_INVALID" });
          context = await begin(channel, args[0]);
          return complete(context, await handler(event, ...context.args));
        } catch (error) {
          return fail(context || channel, error || { code: "IPC_INTERNAL" });
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

// Kept as the explicit authenticated composition name for existing callers;
// the implementation is the single typed transport adapter.
function createAuthenticatedIpcMain(ipcMain, requireAuthenticated) {
  return createTypedIpcMain(ipcMain, requireAuthenticated);
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
  const removedChannels = new Set();
  const authenticated = createTypedIpcMain(values.ipcMain, values.requireAuthenticated || (values.authService && values.authService.requireAuthenticated));
  const guardedIpcMain = Object.assign({}, authenticated, {
    handle: function(channel, handler) {
      const result = authenticated.handle(channel, handler);
      channels.push(channel);
      return result;
    },
    removeHandler: function(channel) {
      if (removedChannels.has(channel)) return;
      removedChannels.add(channel);
      return authenticated.removeHandler(channel);
    }
  });
  const guarded = Object.assign({}, values, { ipcMain: guardedIpcMain });
  const modules = {};
  async function disposeModules() {
    const moduleList = Object.keys(modules).map(function(name) { return modules[name]; }).reverse();
    let firstError = null;
    for (const module of moduleList) {
      if (!module || typeof module.dispose !== "function") continue;
      try {
        await module.dispose();
      } catch (error) {
        reportCleanupFailure("dispose-module");
        if (!firstError) firstError = error;
      }
    }
    if (firstError) throw firstError;
  }
  function removeHandlers() {
    let firstError = null;
    [...new Set(channels)].reverse().forEach(function(channel) {
      try {
        guardedIpcMain.removeHandler(channel);
      } catch (error) {
        reportCleanupFailure("remove-handler");
        if (!firstError) firstError = error;
      }
    });
    if (firstError) throw firstError;
  }
  try {
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
    modules.generation = require("./content-generation-batch-ipc").registerContentGenerationBatchIpc(Object.assign({}, guarded, {
      publishEvents: values.publishGenerationEvents !== false,
    }));
    modules.submission = require("./content-submission-ipc").registerContentSubmissionIpc(guarded);
    // archiveService is assembled by WorkspaceRuntime, not leaked from a prior
    // registrar's return value. Registration order is no longer an interface.
    modules.attention = require("./article-attention-ipc").registerArticleAttentionIpc(Object.assign({}, guarded, {
      archiveActionPort: values.archiveActionPort,
      articleAttentionQuery: values.articleAttentionQuery,
      articleAttentionResolver: values.articleAttentionResolver
    }));
    modules.articleManagement = require("./article-management-ipc").registerArticleManagementIpc(Object.assign({}, guarded, {
      articleAttentionQuery: modules.attention.query,
      publishedArchiveQueries: values.publishedArchiveQueries,
    }));
    modules.publication = require("./publication-ipc").registerPublicationIpc(guarded);
    modules.doubao = require("./doubao-collection-ipc").registerDoubaoCollectionIpc(guarded);
    modules.diagnostics = require("./runtime-diagnostics-ipc").registerRuntimeDiagnosticsIpc(guarded);
    if (values.storageMaintenanceService) {
      modules.storageMaintenance = require("./storage-maintenance-ipc").registerStorageMaintenanceIpc({
        ipcMain: guardedIpcMain,
        storageMaintenanceService: values.storageMaintenanceService,
      });
    }
    let disposed = false;
    return {
      modules: modules,
      dispose: async function() {
        if (disposed) return;
        disposed = true;
        let firstError = null;
        try {
          await disposeModules();
        } catch (error) {
          firstError = error;
        } finally {
          try {
            removeHandlers();
          } catch (error) {
            if (!firstError) firstError = error;
          }
        }
        if (firstError) throw firstError;
      }
    };
  } catch (error) {
    disposeModules().catch(function() {
      reportCleanupFailure("registration-rollback");
    });
    try {
      removeHandlers();
    } catch (_) {
      reportCleanupFailure("registration-rollback-handlers");
    }
    throw error;
  }
}

module.exports = {
  registerIpc,
  createTypedIpcMain,
  createAuthenticatedIpcMain,
};
