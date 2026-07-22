const path = require("path");
const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } = require("electron");
const { isAllowedRendererNavigation } = require("./security/navigation");
const { configureApplicationIdentity, DISPLAY_NAME_ZH } = require("./application-identity");
const { createAuthenticatedRuntime } = require("./services/authenticated-runtime");
const { createWorkspaceRuntime } = require("./services/workspace-runtime");

configureApplicationIdentity(app);

let mainWindow = null;
let authService = null;
let workspaceBootstrap = null;
let runtimeContext = null;
let authenticatedRuntime = null;
let workspaceRuntime = null;
let quitPromise = null;
let quitReady = false;
let startupStatus = "starting";
let isQuitting = false;
const EXTERNAL_LINK_HOSTS = new Set(["www.toutiao.com", "mp.weixin.qq.com", "www.lieju.com"]);
const WORKSPACE_OPEN_FAILED_MESSAGE = "Could not open the current workspace";

function isAllowedExternalUrl(value) {
  try {
    var url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && EXTERNAL_LINK_HOSTS.has(url.hostname);
  } catch (_) { return false; }
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function activeWorkspaceServices() {
  return workspaceRuntime && typeof workspaceRuntime.getServices === "function" ? workspaceRuntime.getServices() : null;
}

function createMainWindow() {
  var rendererEntryPath = path.join(__dirname, "..", "media-workbench", "dist", "index.html");
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#f6f7f4",
    title: DISPLAY_NAME_ZH,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(function(details) {
    if (isAllowedExternalUrl(details.url)) shell.openExternal(details.url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", function(event, url) {
    if (!isAllowedRendererNavigation(url, rendererEntryPath)) event.preventDefault();
  });
  mainWindow.webContents.session.setPermissionRequestHandler(function(webContents, permission, callback) {
    callback(false);
  });
  mainWindow.loadFile(rendererEntryPath);
  mainWindow.on("closed", function() { mainWindow = null; });
}

function createDeferredTaskService() {
  return {
    getState: function() {
      const services = activeWorkspaceServices();
      if (services && services.taskService && typeof services.taskService.getState === "function") return services.taskService.getState();
      return { isBatchRunning: false, isStopPending: false, isPlatformRunning: false };
    }
  };
}

function createDeferredQueueService() {
  return {
    getQueueState: function() {
      const services = activeWorkspaceServices();
      if (services && services.doubaoCollectionService && typeof services.doubaoCollectionService.getQueueState === "function") {
        return services.doubaoCollectionService.getQueueState();
      }
      return { state: "idle" };
    }
  };
}

function createDeferredGenerationBatchService() {
  return {
    getState: function() {
      const services = activeWorkspaceServices();
      if (services && services.contentGenerationBatchService && typeof services.contentGenerationBatchService.getState === "function") return services.contentGenerationBatchService.getState();
      return { status: "idle", isBatchRunning: false, isStopPending: false };
    }
  };
}

async function disposeRuntime() {
  if (!authenticatedRuntime || authenticatedRuntime.getState().phase === "idle") return undefined;
  return authenticatedRuntime.dispose();
}

async function relaunchApplication() {
  await disposeRuntime();
  app.relaunch();
  isQuitting = true;
  quitReady = true;
  app.quit();
}

function workspaceOpenError() {
  const error = new Error(WORKSPACE_OPEN_FAILED_MESSAGE);
  error.code = "WORKSPACE_OPEN_FAILED";
  return error;
}

function openWorkspacePath(value) {
  let result;
  try {
    result = shell.openPath(value);
  } catch (_) {
    return Promise.reject(workspaceOpenError());
  }
  return Promise.resolve(result).then(function(errorMessage) {
    if (typeof errorMessage === "string" && errorMessage !== "") throw workspaceOpenError();
    return errorMessage;
  }, function() {
    throw workspaceOpenError();
  });
}

function createRuntimeServices(bootstrapState, appRoot, userDataPath, sessionDataPath, controls) {
  let unsubscribeLogs = null;
  let unsubscribeDoubaoQueue = null;
  let doubaoCollectionService = null;
  let aiProviderService = null;
  let platformSettingsService = null;
  let contentGenerationBatchService = null;
  let taskService = null;
  let storageMaintenanceService = null;
  const invalidateWorkspaceData = function(scopes, reasonCode) { return controls.invalidate(reasonCode, scopes); };
  const getWorkspaceDataRevision = function() { return controls.getRevision(); };
  // Lazy-load config-dependent modules only after workspace bootstrap is ready.
  // This ensures scripts/config.js sees AUTO_PUBLISH_ROOT_DIR before resolving
  // its default project-root path.
  const configureRuntimeEnvironment = require("./runtime-paths").configureRuntimeEnvironment;
  const runtime = configureRuntimeEnvironment({
    workspaceRoot: bootstrapState.workspacePath,
    appRoot: appRoot,
    roamingConfigRoot: userDataPath,
    localStateRoot: sessionDataPath
  });
  const injectedPaths = runtime.paths && runtime.paths.installation ? runtime.paths : undefined;

  if (runtime.paths && runtime.paths.localState) {
    const createStorageMaintenanceService = require("./services/storage-maintenance-service").createStorageMaintenanceService;
    storageMaintenanceService = createStorageMaintenanceService({
      paths: runtime.paths,
      getActivityState: function() {
        return {
          task: taskService && typeof taskService.getState === "function" ? taskService.getState() : null,
          collection: doubaoCollectionService && typeof doubaoCollectionService.getQueueState === "function" ? doubaoCollectionService.getQueueState() : null,
          generation: contentGenerationBatchService && typeof contentGenerationBatchService.getState === "function" ? contentGenerationBatchService.getState() : null
        };
      }
    });
  }

  const createPlatformSettingsService = require("./services/platform-settings-service").createPlatformSettingsService;
  const { createMediaSettingsAdapter } = require("./services/platform-settings/media-settings-adapter");
  const { createHepanSettingsAdapter } = require("./services/platform-settings/hepan-settings-adapter");
  platformSettingsService = createPlatformSettingsService({
    userDataPath: userDataPath,
    safeStorage: safeStorage,
    env: process.env,
    localStateRoot: runtime.paths && runtime.paths.localState,
    adapters: [createMediaSettingsAdapter(), createHepanSettingsAdapter({ localStateRoot: runtime.paths && runtime.paths.localState })],
    getTaskState: function() { return taskService && typeof taskService.getState === "function" ? taskService.getState() : {}; }
  });
  if (runtime.diagnosticsService && typeof runtime.diagnosticsService.setPlatformSettingsService === "function") runtime.diagnosticsService.setPlatformSettingsService(platformSettingsService);
  const createLegacyProviderSettingsMigration = require("./runtime-config").createLegacyProviderSettingsMigration;
  const legacyProviderSettings = createLegacyProviderSettingsMigration({
    configRoot: userDataPath,
    workspaceRoot: runtime.workspaceRoot,
    runtimeConfigStore: runtime.runtimeConfigStore,
    platformSettingsService: platformSettingsService
  });

  const createDesktopTaskService = require("./services/desktop-task-service").createDesktopTaskService;
  taskService = createDesktopTaskService({
    cwd: runtime.workspaceRoot,
    paths: injectedPaths,
    sendToRenderer: sendToRenderer,
    invalidateData: invalidateWorkspaceData,
    platformSettingsService: platformSettingsService
  });

  const createDoubaoCollection = require("./services/doubao-collection-service").createDoubaoCollectionDesktopService;
  doubaoCollectionService = createDoubaoCollection({ workspaceRoot: runtime.workspaceRoot, paths: injectedPaths, onDataInvalidated: invalidateWorkspaceData });

  const createAiProviderService = require("./services/ai-provider-service").createAiProviderService;
  aiProviderService = createAiProviderService({
    userDataPath: userDataPath,
    paths: injectedPaths,
    safeStorage: safeStorage,
    getBatchState: function() {
      if (contentGenerationBatchService && typeof contentGenerationBatchService.getState === "function") return contentGenerationBatchService.getState();
      return taskService && typeof taskService.getState === "function" ? taskService.getState() : {};
    }
  });
  const createAiContentService = require("./services/ai-content-service").createAiContentService;
  const createContentSubmissionService = require("./services/content-submission-service").createContentSubmissionService;
  // The authenticated main process owns one ledger instance for this
  // workspace.  Every IPC-facing service receives this same instance.
  const createPublicationLedger = require("../src/publication/publication-ledger").createPublicationLedger;
  const publicationLedger = createPublicationLedger({ workspaceRoot: runtime.workspaceRoot, paths: injectedPaths });
  const contentSubmissionService = createContentSubmissionService({
    workspaceRoot: runtime.workspaceRoot,
    paths: injectedPaths,
    publicationLedger: publicationLedger,
    onDataInvalidated: invalidateWorkspaceData,
    getDataRevision: getWorkspaceDataRevision
  });
  const aiContentService = createAiContentService({
    workspaceRoot: runtime.workspaceRoot,
    paths: injectedPaths,
    contentSubmissionService: contentSubmissionService,
    publicationLedger: publicationLedger,
    onArticleRemovalTransaction: function(transaction) {
      sendToRenderer("content:article-removal-transaction", transaction);
      invalidateWorkspaceData(["articleManagement", "articleAttention", "platformQueue", "navigationSummary"], "ARTICLE_REMOVAL_TRANSACTION_CHANGED");
    },
    onDataInvalidated: invalidateWorkspaceData,
    aiClientFactory: function() { return aiProviderService.createClient(); }
  });
  if (aiContentService && typeof aiContentService.recoverPendingArticleRemovals === "function") {
    try { aiContentService.recoverPendingArticleRemovals(); } catch (_) {}
  }
  const createContentGenerationBatchService = require("./services/content-generation-batch-service").createContentGenerationBatchService;
  contentGenerationBatchService = createContentGenerationBatchService({
    workspaceRoot: runtime.workspaceRoot,
    paths: injectedPaths,
    aiProviderService: aiProviderService,
    onDataInvalidated: invalidateWorkspaceData
  });

  return {
    taskService: taskService,
    doubaoCollectionService: doubaoCollectionService,
    contentGenerationBatchService: contentGenerationBatchService,
    registerIpc: function() {
      require("./ipc/register").registerIpc({
        ipcMain: ipcMain, taskService: taskService, sendToRenderer: sendToRenderer,
        rootDir: runtime.workspaceRoot, appRoot: runtime.appRoot, paths: runtime.paths,
        doubaoCollectionService: doubaoCollectionService, aiProviderService: aiProviderService,
        platformSettingsService: platformSettingsService, legacyProviderSettings: legacyProviderSettings,
        aiContentService: aiContentService, contentSubmissionService: contentSubmissionService,
        publicationLedger: publicationLedger, contentGenerationBatchService: contentGenerationBatchService,
        runtimeDiagnosticsService: runtime.diagnosticsService, invalidateData: invalidateWorkspaceData,
        getWorkspaceDataRevision: getWorkspaceDataRevision, authService: authService
      });
      if (storageMaintenanceService) require("./ipc/storage-maintenance-ipc").registerStorageMaintenanceIpc({
        ipcMain: createAuthenticatedIpcMain(), storageMaintenanceService: storageMaintenanceService
      });
    },
    subscribe: function() {
      unsubscribeDoubaoQueue = doubaoCollectionService.subscribe(function(state) { sendToRenderer("content:doubao-queue-state", state); });
      unsubscribeLogs = require("../src/core/logger").subscribe(function(entry) { sendToRenderer("publish-log", entry); });
      return [function() { if (unsubscribeDoubaoQueue) unsubscribeDoubaoQueue(); }, function() { if (unsubscribeLogs) unsubscribeLogs(); }];
    },
    dispose: async function() {
      if (unsubscribeDoubaoQueue) { try { unsubscribeDoubaoQueue(); } catch (_) {} unsubscribeDoubaoQueue = null; }
      if (unsubscribeLogs) { try { unsubscribeLogs(); } catch (_) {} unsubscribeLogs = null; }
      try { if (taskService && typeof taskService.dispose === "function") taskService.dispose(); } catch (_) {}
      try { if (doubaoCollectionService && typeof doubaoCollectionService.dispose === "function") await doubaoCollectionService.dispose(); } catch (_) {}
      try { if (contentGenerationBatchService && typeof contentGenerationBatchService.dispose === "function") await contentGenerationBatchService.dispose(); } catch (_) {}
    }
  };
}

workspaceRuntime = createWorkspaceRuntime({
  sendToRenderer: sendToRenderer,
  createServices: function(bootstrapState, controls) {
    if (!runtimeContext) throw new Error("Authenticated runtime context is unavailable");
    return createRuntimeServices(bootstrapState, runtimeContext.appRoot, runtimeContext.userDataPath, runtimeContext.sessionDataPath, controls);
  },
  registerIpc: function(runtime) { runtime.services.registerIpc(); },
  subscribe: function(runtime) { return runtime.services.subscribe(); },
  disposeServices: function(services) {
    return services && typeof services.dispose === "function" ? services.dispose() : undefined;
  }
});

authenticatedRuntime = createAuthenticatedRuntime({
  start: function(bootstrapState) {
    return workspaceRuntime.start(bootstrapState);
  },
  dispose: function() { return workspaceRuntime.dispose(); }
});

function initializeWorkspaceBootstrap() {
  const userDataPath = app.getPath("userData");
  const localAppData = process.env.LOCALAPPDATA;
  const sessionDataPath = typeof localAppData === "string" && localAppData.trim() !== ""
    ? path.join(localAppData, "AutoPublish")
    : app.getPath("sessionData");
  const appRoot = app.getAppPath();
  const createWorkspaceBootstrapService = require("./workspace-bootstrap-service").createWorkspaceBootstrapService;
  const workspaceBootstrapService = createWorkspaceBootstrapService({
    userDataPath: userDataPath,
    env: process.env,
    validatorOptions: {
      appPath: appRoot,
      resourcesPath: process.resourcesPath,
      userDataPath: userDataPath
    },
    taskService: createDeferredTaskService(),
    doubaoCollectionService: createDeferredQueueService(),
    generationBatchService: createDeferredGenerationBatchService(),
    disposeRuntime: disposeRuntime,
    relaunch: relaunchApplication,
    openPath: openWorkspacePath
  });

  const registerWorkspaceBootstrapIpc = require("./ipc/workspace-bootstrap-ipc").registerWorkspaceBootstrapIpc;
  registerWorkspaceBootstrapIpc({
    ipcMain: createAuthenticatedIpcMain(),
    dialog: dialog,
    workspaceBootstrapService: workspaceBootstrapService
  });
  return { service: workspaceBootstrapService, appRoot: appRoot, userDataPath: userDataPath, sessionDataPath: sessionDataPath };
}

function createAuthenticatedIpcMain() {
  const registration = require("./ipc/register");
  return typeof registration.createAuthenticatedIpcMain === "function"
    ? registration.createAuthenticatedIpcMain(ipcMain, authService && authService.requireAuthenticated)
    : ipcMain;
}

async function activateAuthenticatedRuntime() {
  const runtimeState = authenticatedRuntime.getState();
  if (runtimeState.phase === "running" || runtimeState.phase === "starting") return;
  const workspace = initializeWorkspaceBootstrap();
  workspaceBootstrap = workspace;
  runtimeContext = workspace;
  const bootstrapState = workspace.service.bootstrap();
  if (bootstrapState && bootstrapState.state === "ready" &&
    typeof bootstrapState.workspacePath === "string" && bootstrapState.workspacePath.trim() !== "") {
    await authenticatedRuntime.start(bootstrapState);
  }
}

function initializeAuth() {
  const createAuthService = require("./services/auth-service").createAuthService;
  const createDeviceIdentityStore = require("./device-identity-store").createDeviceIdentityStore;
  const registerAuthIpc = require("./ipc/auth-ipc").registerAuthIpc;
  const userDataPath = app.getPath("userData");
  const deviceIdentity = createDeviceIdentityStore({ userDataPath: userDataPath });
  authService = createAuthService({
    safeStorage: safeStorage,
    userDataPath: userDataPath,
    deviceIdentity: deviceIdentity,
    deviceName: process.platform === "win32" ? "Windows device" : `${process.platform} device`,
    appVersion: typeof app.getVersion === "function" ? app.getVersion() : "unknown"
  });
  registerAuthIpc({
    ipcMain: ipcMain,
    authService: authService,
    sendToRenderer: sendToRenderer,
    onAuthenticated: activateAuthenticatedRuntime
  });
  void authService.initialize().then(function(state) {
    if (state && state.authenticated) return activateAuthenticatedRuntime();
    return undefined;
  }).catch(function() {});
}

function failStartup() {
  startupStatus = "failed";
  return disposeRuntime().catch(function() {}).then(function() {
    app.quit();
  });
}

async function startApplication() {
  try {
    process.env.AUTO_PUBLISH_PACKAGED = app.isPackaged ? "1" : "0";
    initializeAuth();
    startupStatus = "ready";
    createMainWindow();
  } catch (error) {
    if (error && error.code === "AUTH_DEVICE_ID_CORRUPTED" && dialog && typeof dialog.showErrorBox === "function") {
      dialog.showErrorBox("设备身份异常", "本机设备身份文件损坏。请先备份并确认后重新启动应用。");
    }
    await failStartup();
  }
}

app.whenReady().then(startApplication, failStartup);

app.on("activate", function() {
  if (startupStatus !== "ready") return;
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on("window-all-closed", function() {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", function(event) {
  if (quitReady) return;
  event.preventDefault();
  if (quitPromise) return quitPromise;
  isQuitting = true;
  quitPromise = disposeRuntime().then(function() {
    quitReady = true;
    app.quit();
  });
  return quitPromise;
});
