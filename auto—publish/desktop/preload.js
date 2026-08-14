const { contextBridge, ipcRenderer: electronIpcRenderer } = require("electron");
const {
  productionIpcRegistry,
} = require("./ipc/contracts/production-registry");

// Phase 07 owns Auth IPC. These six capabilities are the only temporary raw
// transport exemptions; every business capability must exist in the registry.
const AUTH_INVOKE_EXEMPTIONS = new Set([
  "auth:get-state",
  "auth:login",
  "auth:change-password",
  "auth:refresh",
  "auth:logout",
]);
const AUTH_EVENT_EXEMPTIONS = new Set(["auth-state-changed"]);
const UNREGISTERED_FAILURE = Object.freeze({
  schemaVersion: 1,
  ok: false,
  error: Object.freeze({
    code: "IPC_INTERNAL",
    category: "internal",
    retryability: "manual-check",
    userMessage: "操作未能安全完成，请刷新后重试。",
  }),
});

const eventListeners = new Map();
const eventDiagnosticListeners = new Map();
function onEventDiagnostic(channel, listener) {
  let listeners = eventDiagnosticListeners.get(channel);
  if (!listeners) {
    listeners = new Set();
    eventDiagnosticListeners.set(channel, listeners);
  }
  listeners.add(listener);
  return function () {
    listeners.delete(listener);
    if (listeners.size === 0) eventDiagnosticListeners.delete(channel);
  };
}
const ipcRenderer = {
  invoke: async function (channel, ...args) {
    const contract = productionIpcRegistry.byChannel(channel);
    if (!contract) {
      if (AUTH_INVOKE_EXEMPTIONS.has(channel))
        return electronIpcRenderer.invoke(channel, ...args);
      return UNREGISTERED_FAILURE;
    }
    if (contract.kind === "event") return UNREGISTERED_FAILURE;
    let request;
    try {
      const payload = contract.fromArgs ? contract.fromArgs(args) : args[0];
      request = productionIpcRegistry.encodeRequest(contract, payload);
    } catch (_) {
      return productionIpcRegistry.failure(contract, {
        code: "IPC_REQUEST_INVALID",
      });
    }
    try {
      const result = await electronIpcRenderer.invoke(channel, request);
      productionIpcRegistry.parseResult(contract, result);
      return result;
    } catch (_) {
      return productionIpcRegistry.failure(contract, {
        code: "IPC_RESULT_INVALID",
      });
    }
  },
  on: function (channel, listener) {
    const contract = productionIpcRegistry.byChannel(channel);
    if (!contract) {
      if (AUTH_EVENT_EXEMPTIONS.has(channel))
        return electronIpcRenderer.on(channel, listener);
      return undefined;
    }
    if (contract.kind !== "event") return undefined;
    const wrapped = function (event, payload) {
      let parsed;
      try {
        parsed = productionIpcRegistry.parseEvent(contract, payload);
      } catch (_) {
        for (const report of eventDiagnosticListeners.get(channel) || [])
          report();
        return;
      }
      listener(event, parsed);
    };
    eventListeners.set(listener, wrapped);
    return electronIpcRenderer.on(channel, wrapped);
  },
  removeListener: function (channel, listener) {
    const contract = productionIpcRegistry.byChannel(channel);
    if (!contract && !AUTH_EVENT_EXEMPTIONS.has(channel)) return undefined;
    const wrapped = eventListeners.get(listener) || listener;
    eventListeners.delete(listener);
    return electronIpcRenderer.removeListener(channel, wrapped);
  },
};

function confirmWorkspaceSelection(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).length !== 1 ||
    typeof input.token !== "string" ||
    input.token.trim() === ""
  ) {
    return Promise.reject(new TypeError("Confirmation token is invalid"));
  }
  return ipcRenderer.invoke("workspace:confirm-selection", {
    token: input.token,
  });
}

const api = {
  auth: {
    getState: function () {
      return ipcRenderer.invoke("auth:get-state");
    },
    login: function (loginName, password) {
      return ipcRenderer.invoke("auth:login", {
        loginName: loginName,
        password: password,
      });
    },
    changePassword: function (loginName, currentPassword, newPassword) {
      return ipcRenderer.invoke("auth:change-password", {
        loginName: loginName,
        currentPassword: currentPassword,
        newPassword: newPassword,
      });
    },
    refresh: function () {
      return ipcRenderer.invoke("auth:refresh");
    },
    logout: function () {
      return ipcRenderer.invoke("auth:logout");
    },
    onStateChanged: function (listener) {
      var handler = function (event, payload) {
        listener(payload);
      };
      ipcRenderer.on("auth-state-changed", handler);
      return function () {
        ipcRenderer.removeListener("auth-state-changed", handler);
      };
    },
  },
  workspace: {
    getBootstrapState: function () {
      return ipcRenderer.invoke("workspace:get-bootstrap-state");
    },
    chooseDirectory: function () {
      return ipcRenderer.invoke("workspace:choose-directory");
    },
    confirmSelection: confirmWorkspaceSelection,
    cancelSelection: function () {
      return ipcRenderer.invoke("workspace:cancel-selection");
    },
    getCurrent: function () {
      return ipcRenderer.invoke("workspace:get-current");
    },
    openCurrent: function () {
      return ipcRenderer.invoke("workspace:open-current");
    },
    requestSwitch: function () {
      return ipcRenderer.invoke("workspace:request-switch");
    },
  },
  workspaceData: {
    getRuntimeIdentity: function () {
      return ipcRenderer.invoke("workspace:get-runtime-identity");
    },
    onInvalidated: function (listener) {
      var handler = function (event, payload) {
        listener(payload);
      };
      ipcRenderer.on("workspace:data-invalidated", handler);
      return function () {
        ipcRenderer.removeListener("workspace:data-invalidated", handler);
      };
    },
    onInvalidationDiagnostic: function (listener) {
      return onEventDiagnostic("workspace:data-invalidated", listener);
    },
  },
  aiProvider: {
    getStatus: function () {
      return ipcRenderer.invoke("ai-provider:get-status");
    },
    save: function (input) {
      return ipcRenderer.invoke("ai-provider:save", input || {});
    },
    testConnection: function (input) {
      return ipcRenderer.invoke("ai-provider:test", input || {});
    },
    clear: function () {
      return ipcRenderer.invoke("ai-provider:clear");
    },
  },
  platformSettings: {
    getStatus: function (platformId) {
      return ipcRenderer.invoke("platform-settings:get-status", {
        platformId: platformId,
      });
    },
    save: function (platformId, draft) {
      return ipcRenderer.invoke("platform-settings:save", {
        platformId: platformId,
        draft: draft,
      });
    },
    test: function (platformId, draft) {
      return ipcRenderer.invoke("platform-settings:test", {
        platformId: platformId,
        draft: draft,
      });
    },
    clear: function (platformId) {
      return ipcRenderer.invoke("platform-settings:clear", {
        platformId: platformId,
      });
    },
    getLegacyStatus: function () {
      return ipcRenderer.invoke("platform-settings:get-legacy-status");
    },
    importLegacy: function (input) {
      return ipcRenderer.invoke("platform-settings:import-legacy", input || {});
    },
  },
  storageMaintenance: {
    getUsage: function () {
      return ipcRenderer.invoke("storage-maintenance:get-usage");
    },
    cleanCaches: function () {
      return ipcRenderer.invoke("storage-maintenance:clean-caches");
    },
  },
  runtimeDiagnostics: {
    get: function () {
      return ipcRenderer.invoke("runtime-diagnostics:get");
    },
    browserSmoke: function () {
      return ipcRenderer.invoke("runtime-diagnostics:browser-smoke");
    },
  },
  media: {
    scanArticles: function () {
      return ipcRenderer.invoke("media:scan-articles");
    },
    getDrafts: function () {
      return ipcRenderer.invoke("media:get-drafts");
    },
    refreshResources: function (opts) {
      return ipcRenderer.invoke("media:refresh-resources", opts || {});
    },
    getResourcePage: function (opts) {
      return ipcRenderer.invoke("media:get-resource-page", opts || {});
    },
    searchResourcePage: function (opts) {
      return ipcRenderer.invoke("media:search-resource-page", opts || {});
    },
    getPool: function (opts) {
      return ipcRenderer.invoke("media:get-pool", opts);
    },
    addToPool: function (resource) {
      return ipcRenderer.invoke("media:add-to-pool", resource);
    },
    removeFromPool: function (resourceId) {
      return ipcRenderer.invoke("media:remove-from-pool", resourceId);
    },
    getBalance: function () {
      return ipcRenderer.invoke("media:get-balance");
    },
  },
  platforms: {
    getQueue: function () {
      return ipcRenderer.invoke("platforms:get-queue");
    },
    listAccountProfiles: function () {
      return ipcRenderer.invoke("platforms:list-account-profiles");
    },
    confirmAccountProfile: function (input) {
      return ipcRenderer.invoke("platforms:confirm-account-profile", input);
    },
    openLogin: function (platformId) {
      return ipcRenderer.invoke("platforms:open-login", platformId);
    },
    checkLogin: function (platformId) {
      return ipcRenderer.invoke("platforms:check-login", platformId);
    },
    pauseSubmit: function (runId) {
      return ipcRenderer.invoke(
        "platforms:pause-submit",
        runId ? { runId: runId } : undefined,
      );
    },
    stopSubmit: function (runId) {
      return ipcRenderer.invoke(
        "platforms:stop-submit",
        runId ? { runId: runId } : undefined,
      );
    },
    getState: function () {
      return ipcRenderer.invoke("platforms:get-state");
    },
    onState: function (listener) {
      var handler = function (event, payload) {
        listener(payload);
      };
      ipcRenderer.on("platform-state", handler);
      return function () {
        ipcRenderer.removeListener("platform-state", handler);
      };
    },
    onStateDiagnostic: function (listener) {
      return onEventDiagnostic("platform-state", listener);
    },
  },
  content: {
    listClients: function () {
      return ipcRenderer.invoke("content:list-clients");
    },
    saveClientLiejuPublicationProfile: function (input) {
      return ipcRenderer.invoke("content:save-client-lieju-publication-profile", input);
    },
    listResearch: function (clientId) {
      return ipcRenderer.invoke("content:list-research", clientId);
    },
    listTemplateCatalog: function () {
      return ipcRenderer.invoke("content:list-template-catalog");
    },
    retryMaterial: function (input) {
      return ipcRenderer.invoke("content:retry-material", input);
    },
    generateArticle: function (input) {
      return ipcRenderer.invoke("content:generate-article", input);
    },
    saveArticle: function (input) {
      return ipcRenderer.invoke("content:save-article", input);
    },
    getArticleEditor: function (input) {
      return ipcRenderer.invoke("content:get-article-editor", input);
    },
    getArticleManagementSnapshot: function (input) {
      return ipcRenderer.invoke(
        "content:get-article-management-snapshot",
        input,
      );
    },
    previewArticleRemovalImpact: function (input) {
      return ipcRenderer.invoke(
        "content:preview-article-removal-impact",
        input || {},
      );
    },
    applyArticleRemovalImpact: function (input) {
      return ipcRenderer.invoke("content:trash-articles", input || {});
    },
    restoreArticle: function (input) {
      return ipcRenderer.invoke("content:restore-article", input);
    },
    preparePermanentDeleteArticle: function (input) {
      return ipcRenderer.invoke(
        "content:prepare-permanent-delete-article",
        input,
      );
    },
    permanentlyDeleteArticle: function (input) {
      return ipcRenderer.invoke("content:permanently-delete-article", input);
    },
    listSubmissionPlatforms: function () {
      return ipcRenderer.invoke("content:list-submission-platforms");
    },
    addPaidSubmissionStaging: function (input) {
      return ipcRenderer.invoke("content:add-paid-submission-staging", input);
    },
    removePaidSubmissionStaging: function (input) {
      return ipcRenderer.invoke(
        "content:remove-paid-submission-staging",
        input,
      );
    },
    setPaidSubmissionStagingMedia: function (input) {
      return ipcRenderer.invoke(
        "content:set-paid-submission-staging-media",
        input,
      );
    },
    getPaidSubmissionStaging: function (input) {
      return ipcRenderer.invoke("content:get-paid-submission-staging", input);
    },
    previewRegularQueueAdmission: function (input) {
      return ipcRenderer.invoke(
        "content:preview-regular-queue-admission",
        input,
      );
    },
    admitRegularQueueItems: function (input) {
      return ipcRenderer.invoke("content:admit-regular-queue-items", input);
    },
    removePendingQueueItems: function (input) {
      return ipcRenderer.invoke("content:remove-pending-queue-items", input);
    },
    listRegularQueueGroups: function () {
      return ipcRenderer.invoke("content:list-regular-queue-groups");
    },
    startRegularQueueGroup: function (input) {
      return ipcRenderer.invoke("content:start-regular-queue-group", input);
    },
    pauseRegularQueueGroup: function (input) {
      return ipcRenderer.invoke("content:pause-regular-queue-group", input);
    },
    startAllRegularQueueGroups: function () {
      return ipcRenderer.invoke("content:start-all-regular-queue-groups");
    },
    pauseAllRegularQueueGroups: function () {
      return ipcRenderer.invoke("content:pause-all-regular-queue-groups");
    },
    previewPaidMediaPreflight: function (input) {
      return ipcRenderer.invoke("content:preview-paid-media-preflight", input);
    },
    confirmPaidMediaBatch: function (input) {
      return ipcRenderer.invoke("content:confirm-paid-media-batch", input);
    },
    listPaidMediaBatches: function () {
      return ipcRenderer.invoke("content:list-paid-media-batches");
    },
    startPaidMediaBatch: function (input) {
      return ipcRenderer.invoke("content:start-paid-media-batch", input);
    },
    pausePaidMediaBatch: function (input) {
      return ipcRenderer.invoke("content:pause-paid-media-batch", input);
    },
    cancelSubmissionBatch: function (input) {
      return ipcRenderer.invoke("content:cancel-submission-batch", input);
    },
    previewTrashedArticleQueueResidue: function () {
      return ipcRenderer.invoke(
        "content:preview-trashed-article-queue-residue",
      );
    },
    cleanupTrashedArticleQueueResidue: function (input) {
      return ipcRenderer.invoke(
        "content:cleanup-trashed-article-queue-residue",
        input || {},
      );
    },
    getArticleRemovalTransaction: function (transactionId) {
      return ipcRenderer.invoke("content:get-article-removal-transaction", {
        transactionId: transactionId,
      });
    },
    retryArticleRemovalTransaction: function (input) {
      return ipcRenderer.invoke(
        "content:retry-article-removal-transaction",
        input || {},
      );
    },
    listArticleAttention: function (input) {
      return ipcRenderer.invoke("content:list-article-attention", input || {});
    },
    previewArticleAttention: function (input) {
      return ipcRenderer.invoke(
        "content:preview-article-attention",
        input || {},
      );
    },
    resolveArticleAttention: function (input) {
      return ipcRenderer.invoke(
        "content:resolve-article-attention",
        input || {},
      );
    },
    onArticleRemovalTransaction: function (listener) {
      var handler = function (event, payload) {
        listener(payload);
      };
      ipcRenderer.on("content:article-removal-transaction", handler);
      return function () {
        ipcRenderer.removeListener(
          "content:article-removal-transaction",
          handler,
        );
      };
    },
    listQuestions: function (clientId) {
      return ipcRenderer.invoke("content:list-questions", {
        clientId: clientId,
      });
    },
    createQuestion: function (input) {
      return ipcRenderer.invoke("content:create-question", input);
    },
    updateQuestion: function (input) {
      return ipcRenderer.invoke("content:update-question", input);
    },
    deleteQuestion: function (input) {
      return ipcRenderer.invoke("content:delete-question", input);
    },
    getDoubaoLoginState: function () {
      return ipcRenderer.invoke("content:get-doubao-login-state");
    },
    openDoubaoLogin: function () {
      return ipcRenderer.invoke("content:open-doubao-login");
    },
    collectDoubaoOne: function (input) {
      return ipcRenderer.invoke("content:collect-doubao-one", input);
    },
    previewDoubaoBatch: function (input) {
      return ipcRenderer.invoke("content:preview-doubao-batch", input);
    },
    startPreparedDoubaoBatch: function (input) {
      return ipcRenderer.invoke("content:start-prepared-doubao-batch", input);
    },
    pauseDoubaoBatch: function () {
      return ipcRenderer.invoke("content:pause-doubao-batch");
    },
    resumeDoubaoBatch: function () {
      return ipcRenderer.invoke("content:resume-doubao-batch");
    },
    stopDoubaoBatch: function () {
      return ipcRenderer.invoke("content:stop-doubao-batch");
    },
    retryFailedDoubao: function () {
      return ipcRenderer.invoke("content:retry-failed-doubao");
    },
    getDoubaoQueueState: function () {
      return ipcRenderer.invoke("content:get-doubao-queue-state");
    },
    previewGenerationBatch: function (input) {
      return ipcRenderer.invoke(
        "content:preview-generation-batch",
        input || {},
      );
    },
    createAndStartGenerationBatch: function (input) {
      return ipcRenderer.invoke(
        "content:create-and-start-generation-batch",
        input || {},
      );
    },
    pauseGenerationBatch: function (input) {
      return ipcRenderer.invoke("content:pause-generation-batch", input || {});
    },
    continueGenerationBatch: function (input) {
      return ipcRenderer.invoke(
        "content:continue-generation-batch",
        input || {},
      );
    },
    resumeGenerationBatch: function (input) {
      return ipcRenderer.invoke("content:resume-generation-batch", input || {});
    },
    stopGenerationBatch: function (input) {
      return ipcRenderer.invoke("content:stop-generation-batch", input || {});
    },
    retryFailedGenerationBatch: function (input) {
      return ipcRenderer.invoke(
        "content:retry-failed-generation-batch",
        input || {},
      );
    },
    previewCancelPendingGenerationBatch: function (input) {
      return ipcRenderer.invoke(
        "content:preview-cancel-pending-generation-batch",
        input || {},
      );
    },
    cancelPendingGenerationBatch: function (input) {
      return ipcRenderer.invoke(
        "content:cancel-pending-generation-batch",
        input || {},
      );
    },
    getGenerationRuntimeSnapshot: function () {
      return ipcRenderer.invoke("content:get-generation-runtime-snapshot");
    },
    onGenerationBatchState: function (listener) {
      const handler = function (event, payload) {
        listener(payload);
      };
      ipcRenderer.on("content:generation-batch-state", handler);
      return function () {
        ipcRenderer.removeListener("content:generation-batch-state", handler);
      };
    },
    previewGenerationSubmissionHandoff: function (input) {
      return ipcRenderer.invoke(
        "content:preview-generation-submission-handoff",
        input || {},
      );
    },
    commitGenerationSubmissionHandoff: function (input) {
      return ipcRenderer.invoke(
        "content:commit-generation-submission-handoff",
        input || {},
      );
    },
    saveManualResearch: function (input) {
      return ipcRenderer.invoke("content:save-manual-research", input);
    },
    onDoubaoQueueState: function (listener) {
      const handler = function (event, payload) {
        listener(payload);
      };
      ipcRenderer.on("content:doubao-queue-state", handler);
      return function () {
        ipcRenderer.removeListener("content:doubao-queue-state", handler);
      };
    },
  },
  publication: {
    prepareRegularUncertainResolution: function (input) {
      return ipcRenderer.invoke(
        "publication:prepare-regular-uncertain-resolution",
        input,
      );
    },
    confirmRegularAccepted: function (input) {
      return ipcRenderer.invoke("publication:confirm-regular-accepted", input);
    },
    confirmRegularNotAccepted: function (input) {
      return ipcRenderer.invoke(
        "publication:confirm-regular-not-accepted",
        input,
      );
    },
  },
  orders: {
    getOrders: function () {
      return ipcRenderer.invoke("media:get-orders");
    },
    syncOrder: function (orderNid) {
      return ipcRenderer.invoke("media:sync-order", orderNid);
    },
    syncAllOrders: function () {
      return ipcRenderer.invoke("media:sync-all-orders");
    },
    prepareOrderCancellation: function (input) {
      return ipcRenderer.invoke("media:prepare-order-cancellation", input);
    },
    cancelOrder: function (input) {
      return ipcRenderer.invoke("media:cancel-order", input);
    },
    prepareCancellationResolution: function (input) {
      return ipcRenderer.invoke("media:prepare-cancellation-resolution", input);
    },
    confirmCancellationSucceeded: function (input) {
      return ipcRenderer.invoke("media:confirm-cancellation-succeeded", input);
    },
    confirmCancellationNotApplied: function (input) {
      return ipcRenderer.invoke(
        "media:confirm-cancellation-not-applied",
        input,
      );
    },
    prepareOrderStatusAnomalyResolution: function (input) {
      return ipcRenderer.invoke(
        "media:prepare-order-status-anomaly-resolution",
        input,
      );
    },
    resumeOrderTracking: function (input) {
      return ipcRenderer.invoke("media:resume-order-tracking", input);
    },
    confirmOrderPublished: function (input) {
      return ipcRenderer.invoke("media:confirm-order-published", input);
    },
    confirmOrderNotPublished: function (input) {
      return ipcRenderer.invoke("media:confirm-order-not-published", input);
    },
    openPublishedUrl: function (orderNid) {
      return ipcRenderer.invoke("media:open-published-url", orderNid);
    },
    prepareBindPaidOrderNumber: function (input) {
      return ipcRenderer.invoke("media:prepare-bind-paid-order-number", input);
    },
    bindPaidOrderNumber: function (input) {
      return ipcRenderer.invoke("media:bind-paid-order-number", input);
    },
    prepareConfirmPaidOrderAbsent: function (input) {
      return ipcRenderer.invoke(
        "media:prepare-confirm-paid-order-absent",
        input,
      );
    },
    confirmPaidOrderAbsent: function (input) {
      return ipcRenderer.invoke("media:confirm-paid-order-absent", input);
    },
  },
};

contextBridge.exposeInMainWorld("desktopConsole", api);
