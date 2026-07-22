"use strict";

const { createWorkspaceDataInvalidation } = require("./workspace-data-invalidation");

function required(value, name) {
  if (!value) throw new Error("Workspace runtime requires " + name);
  return value;
}

// The authenticated workspace is the composition root for business modules.
// It intentionally has a small lifecycle surface: Electron/auth own when it
// exists; this module owns everything that exists because of that workspace.
function createWorkspaceRuntime(deps) {
  const options = deps || {};
  required(options.ipcMain, "ipcMain");
  required(options.sendToRenderer, "sendToRenderer");
  required(options.safeStorage, "safeStorage");
  let state = "idle";
  let bootstrap = null;
  let runtime = null;
  let modules = null;
  let ipc = null;
  let ipcDeps = null;
  let disposers = [];
  let startPromise = null;
  let disposePromise = null;
  const invalidation = createWorkspaceDataInvalidation({ sendToRenderer: options.sendToRenderer });

  function current(name) { return modules && modules[name] || null; }
  function taskState() { const service = current("taskService"); return service && service.getState ? service.getState() : null; }
  function collectionState() { const service = current("doubaoCollectionService"); return service && service.getQueueState ? service.getQueueState() : null; }
  function generationState() { const service = current("contentGenerationBatchService"); return service && service.getState ? service.getState() : null; }

  async function start(bootstrapState) {
    if (state === "running") return getState();
    if (startPromise) return startPromise;
    startPromise = (async function() {
      state = "starting";
      try {
        const configureRuntimeEnvironment = require("./runtime-paths").configureRuntimeEnvironment;
        runtime = configureRuntimeEnvironment({
          workspaceRoot: bootstrapState.workspacePath, appRoot: options.appRoot,
          roamingConfigRoot: options.userDataPath, localStateRoot: options.sessionDataPath
        });
        const paths = runtime.paths;
        const injectedPaths = paths && paths.installation ? paths : undefined;
        const workspaceRoot = runtime.workspaceRoot;
        const createPublicationLedger = require("../src/publication/publication-ledger").createPublicationLedger;
        const publicationLedger = createPublicationLedger({ workspaceRoot, paths: injectedPaths });
        const createPlatformSettingsService = require("./services/platform-settings-service").createPlatformSettingsService;
        const { createMediaSettingsAdapter } = require("./services/platform-settings/media-settings-adapter");
        const { createHepanSettingsAdapter } = require("./services/platform-settings/hepan-settings-adapter");
        const platformSettingsService = createPlatformSettingsService({ userDataPath: options.userDataPath, safeStorage: options.safeStorage, env: process.env, localStateRoot: paths && paths.localState, adapters: [createMediaSettingsAdapter(), createHepanSettingsAdapter({ localStateRoot: paths && paths.localState })], getTaskState: taskState });
        const createDesktopTaskService = require("./services/desktop-task-service").createDesktopTaskService;
        const taskService = createDesktopTaskService({ cwd: workspaceRoot, paths: injectedPaths, sendToRenderer: options.sendToRenderer, invalidateData: invalidation.invalidate, platformSettingsService });
        if (runtime.diagnosticsService && runtime.diagnosticsService.setPlatformSettingsService) runtime.diagnosticsService.setPlatformSettingsService(platformSettingsService);
        const legacyProviderSettings = require("./runtime-config").createLegacyProviderSettingsMigration({ configRoot: options.userDataPath, workspaceRoot, runtimeConfigStore: runtime.runtimeConfigStore, platformSettingsService });
        const doubaoCollectionService = require("./services/doubao-collection-service").createDoubaoCollectionDesktopService({ workspaceRoot, paths: injectedPaths, onDataInvalidated: invalidation.invalidate });
        const aiProviderService = require("./services/ai-provider-service").createAiProviderService({ userDataPath: options.userDataPath, paths: injectedPaths, safeStorage: options.safeStorage, getBatchState: function() { return generationState() || taskState() || {}; } });
        const contentSubmissionService = require("./services/content-submission-service").createContentSubmissionService({ workspaceRoot, paths: injectedPaths, publicationLedger, onDataInvalidated: invalidation.invalidate, getDataRevision: invalidation.getRevision });
        const aiContentService = require("./services/ai-content-service").createAiContentService({ workspaceRoot, paths: injectedPaths, contentSubmissionService, publicationLedger, onArticleRemovalTransaction: function(transaction) { options.sendToRenderer("content:article-removal-transaction", transaction); invalidation.invalidate("ARTICLE_REMOVAL_TRANSACTION_CHANGED"); }, onDataInvalidated: invalidation.invalidate, aiClientFactory: function() { return aiProviderService.createClient(); } });
        if (aiContentService.recoverPendingArticleRemovals) { try { aiContentService.recoverPendingArticleRemovals(); } catch (_) {} }
        const contentGenerationBatchService = require("./services/content-generation-batch-service").createContentGenerationBatchService({ workspaceRoot, paths: injectedPaths, aiProviderService, onDataInvalidated: invalidation.invalidate });
        const { loadPlatforms } = require("../src/core/platforms");
        const loadedPlatforms = loadPlatforms();
        const adapters = {};
        loadedPlatforms.forEach(function(platform) { adapters[platform.id] = platform; });
        const platformWorkbenchService = require("./services/platform-workbench-service").createPlatformWorkbenchService({ rootDir: workspaceRoot, paths: injectedPaths, publicationLedger, platforms: loadedPlatforms.map(function(platform) { return { id: platform.id, scanDir: platform.scanDir }; }), adapters });
        modules = { publicationLedger, taskService, platformSettingsService, doubaoCollectionService, aiProviderService, contentSubmissionService, aiContentService, contentGenerationBatchService, platformWorkbenchService };
        ipcDeps = { ipcMain: options.ipcMain, taskService, sendToRenderer: options.sendToRenderer, rootDir: workspaceRoot, appRoot: runtime.appRoot, paths, doubaoCollectionService, aiProviderService, platformSettingsService, legacyProviderSettings, aiContentService, contentSubmissionService, publicationLedger, contentGenerationBatchService, platformWorkbenchService, archiveService: platformWorkbenchService, runtimeDiagnosticsService: runtime.diagnosticsService, invalidateData: invalidation.invalidate, getWorkspaceDataRevision: invalidation.getRevision, authService: options.authService };
        if (paths && paths.localState) {
          const storageMaintenanceService = require("./services/storage-maintenance-service").createStorageMaintenanceService({ paths, getActivityState: function() { return { task: taskState(), collection: collectionState(), generation: generationState() }; } });
          modules.storageMaintenanceService = storageMaintenanceService;
        }
        const unsubscribeCollection = doubaoCollectionService.subscribe(function(value) { options.sendToRenderer("content:doubao-queue-state", value); });
        const unsubscribeLogs = require("../src/core/logger").subscribe(function(entry) { options.sendToRenderer("publish-log", entry); });
        if (typeof unsubscribeCollection === "function") disposers.push(unsubscribeCollection);
        if (typeof unsubscribeLogs === "function") disposers.push(unsubscribeLogs);
        bootstrap = bootstrapState || null;
        state = "running";
        return getState();
      } catch (error) {
        state = "failed";
        await dispose();
        throw error;
      } finally { startPromise = null; }
    })();
    return startPromise;
  }

  async function dispose() {
    if (disposePromise) return disposePromise;
    if (state === "idle" || state === "stopped") return getState();
    disposePromise = (async function() {
      state = "disposing";
      const pending = disposers.splice(0).reverse();
      for (const dispose of pending) {
        try { await dispose(); } catch (_) {}
      }
      const values = modules || {};
      for (const serviceName of [
        "platformWorkbenchService",
        "storageMaintenanceService",
        "contentGenerationBatchService",
        "aiContentService",
        "contentSubmissionService",
        "aiProviderService",
        "doubaoCollectionService",
        "taskService",
        "platformSettingsService"
      ]) {
        const service = values[serviceName];
        try { if (service && typeof service.dispose === "function") await service.dispose(); } catch (_) {}
      }
      modules = null; ipc = null; ipcDeps = null; runtime = null; bootstrap = null;
      state = "stopped";
      disposePromise = null;
      return getState();
    })();
    return disposePromise;
  }
  function registerIpc() {
    if (state !== "running" || !ipcDeps) throw new Error("Workspace runtime is not started");
    if (ipc) return ipc;
    ipc = require("./ipc/register").registerIpc(ipcDeps);
    if (ipc && typeof ipc.dispose === "function") disposers.push(function() { return ipc.dispose(); });
    if (modules && modules.storageMaintenanceService) {
      const storageIpc = require("./ipc/storage-maintenance-ipc").registerStorageMaintenanceIpc({
        ipcMain: require("./ipc/register").createAuthenticatedIpcMain(options.ipcMain, options.authService && options.authService.requireAuthenticated),
        storageMaintenanceService: modules.storageMaintenanceService
      });
      if (storageIpc && typeof storageIpc.dispose === "function") disposers.push(function() { return storageIpc.dispose(); });
    }
    return ipc;
  }
  function getState() {
    return { phase: state, workspacePath: bootstrap && bootstrap.workspacePath || null,
      revision: invalidation.getRevision(), task: taskState(), collection: collectionState(), generation: generationState() };
  }
  return { start, registerIpc, getState, dispose };
}

module.exports = { createWorkspaceRuntime };
