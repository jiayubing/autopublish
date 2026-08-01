const path = require("path");
const {
  captureEnvironmentValue,
  environmentFromCapturedValue,
  restoreEnvironmentValue,
} = require("./relaunch-environment");
const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  dialog,
  safeStorage,
} = require("electron");
const { isAllowedRendererNavigation } = require("./security/navigation");
const {
  configureApplicationIdentity,
  DISPLAY_NAME_ZH,
} = require("./application-identity");
const {
  createAuthenticatedRuntime,
} = require("./services/authenticated-runtime");
const { createWorkspaceRuntime } = require("./workspace-runtime");

const startupWorkspaceEnvironment = captureEnvironmentValue(
  process.env,
  "AUTO_PUBLISH_WORKSPACE",
);
const workspaceBootstrapEnvironment = environmentFromCapturedValue(
  "AUTO_PUBLISH_WORKSPACE",
  startupWorkspaceEnvironment,
);

configureApplicationIdentity(app);

/** @type {import("electron").BrowserWindow | null} */
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
const EXTERNAL_LINK_HOSTS = new Set([
  "www.toutiao.com",
  "mp.weixin.qq.com",
  "www.lieju.com",
]);
const WORKSPACE_OPEN_FAILED_MESSAGE = "Could not open the current workspace";

function isAllowedExternalUrl(value) {
  try {
    var url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      EXTERNAL_LINK_HOSTS.has(url.hostname)
    );
  } catch (_) {
    return false;
  }
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function createMainWindow() {
  var rendererEntryPath = path.join(
    __dirname,
    "..",
    "media-workbench",
    "dist",
    "index.html",
  );
  var preloadBundlePath = path.join(
    __dirname,
    "..",
    "build",
    "preload",
    "preload.cjs",
  );
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#f6f7f4",
    title: DISPLAY_NAME_ZH,
    webPreferences: {
      preload: preloadBundlePath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(function (details) {
    if (isAllowedExternalUrl(details.url)) shell.openExternal(details.url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", function (event, url) {
    if (!isAllowedRendererNavigation(url, rendererEntryPath))
      event.preventDefault();
  });
  mainWindow.webContents.session.setPermissionRequestHandler(
    function (webContents, permission, callback) {
      callback(false);
    },
  );
  mainWindow.loadFile(rendererEntryPath);
  mainWindow.on("closed", function () {
    mainWindow = null;
  });
}

function createDeferredTaskService() {
  return {
    getState: function () {
      if (workspaceRuntime && workspaceRuntime.getState().task)
        return workspaceRuntime.getState().task;
      return {
        isBatchRunning: false,
        isStopPending: false,
        isPlatformRunning: false,
      };
    },
  };
}

function createDeferredQueueService() {
  return {
    getQueueState: function () {
      if (workspaceRuntime && workspaceRuntime.getState().collection)
        return workspaceRuntime.getState().collection;
      return { state: "idle" };
    },
  };
}

function createDeferredGenerationBatchService() {
  return {
    getState: function () {
      if (workspaceRuntime && workspaceRuntime.getState().generation)
        return workspaceRuntime.getState().generation;
      return { status: "idle", isBatchRunning: false, isStopPending: false };
    },
  };
}

async function disposeRuntime() {
  if (authenticatedRuntime) return authenticatedRuntime.dispose();
}

async function relaunchApplication() {
  await disposeRuntime();
  restoreEnvironmentValue(
    process.env,
    "AUTO_PUBLISH_WORKSPACE",
    startupWorkspaceEnvironment,
  );
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
  return Promise.resolve(result).then(
    function (errorMessage) {
      if (typeof errorMessage === "string" && errorMessage !== "")
        throw workspaceOpenError();
      return errorMessage;
    },
    function () {
      throw workspaceOpenError();
    },
  );
}

authenticatedRuntime = createAuthenticatedRuntime({
  start: async function (bootstrapState) {
    if (!runtimeContext)
      throw new Error("Authenticated runtime context is unavailable");
    const nextRuntime = createWorkspaceRuntime({
      ipcMain: ipcMain,
      safeStorage: safeStorage,
      sendToRenderer: sendToRenderer,
      appRoot: runtimeContext.appRoot,
      resourcesPath: runtimeContext.resourcesPath,
      userDataPath: runtimeContext.userDataPath,
      sessionDataPath: runtimeContext.sessionDataPath,
      authService: authService,
      openExternal: function (url) {
        return shell.openExternal(url);
      },
    });
    workspaceRuntime = nextRuntime;
    await nextRuntime.start(bootstrapState);
    // A quit or workspace switch may have disposed this instance while start
    // was awaiting service setup.  Never register IPC for a stale runtime.
    if (workspaceRuntime === nextRuntime) nextRuntime.registerIpc();
  },
  dispose: async function () {
    const runtime = workspaceRuntime;
    workspaceRuntime = null;
    if (runtime) await runtime.dispose();
  },
});

function initializeWorkspaceBootstrap() {
  const userDataPath = app.getPath("userData");
  const localAppData = process.env.LOCALAPPDATA;
  const sessionDataPath =
    typeof localAppData === "string" && localAppData.trim() !== ""
      ? path.join(localAppData, "AutoPublish")
      : app.getPath("sessionData");
  const appRoot = app.getAppPath();
  const createWorkspaceBootstrapService =
    require("./workspace-bootstrap-service").createWorkspaceBootstrapService;
  const workspaceBootstrapService = createWorkspaceBootstrapService({
    userDataPath: userDataPath,
    env: workspaceBootstrapEnvironment,
    validatorOptions: {
      appPath: appRoot,
      resourcesPath: process.resourcesPath,
      userDataPath: userDataPath,
    },
    taskService: createDeferredTaskService(),
    doubaoCollectionService: createDeferredQueueService(),
    generationBatchService: createDeferredGenerationBatchService(),
    disposeRuntime: disposeRuntime,
    relaunch: relaunchApplication,
    openPath: openWorkspacePath,
  });

  const registerWorkspaceBootstrapIpc =
    require("./ipc/workspace-bootstrap-ipc").registerWorkspaceBootstrapIpc;
  registerWorkspaceBootstrapIpc({
    ipcMain: ipcMain,
    requireAuthenticated: authService && authService.requireAuthenticated,
    dialog: dialog,
    workspaceBootstrapService: workspaceBootstrapService,
  });
  return {
    service: workspaceBootstrapService,
    appRoot: appRoot,
    resourcesPath: process.resourcesPath,
    userDataPath: userDataPath,
    sessionDataPath: sessionDataPath,
  };
}

function createAuthenticatedIpcMain() {
  const registration = require("./ipc/register");
  return typeof registration.createAuthenticatedIpcMain === "function"
    ? registration.createAuthenticatedIpcMain(
        ipcMain,
        authService && authService.requireAuthenticated,
      )
    : ipcMain;
}

async function activateAuthenticatedRuntime() {
  const runtimeState = authenticatedRuntime.getState();
  if (runtimeState.phase === "running" || runtimeState.phase === "starting")
    return;
  const workspace = initializeWorkspaceBootstrap();
  workspaceBootstrap = workspace;
  runtimeContext = workspace;
  const bootstrapState = workspace.service.bootstrap();
  if (
    bootstrapState &&
    bootstrapState.state === "ready" &&
    typeof bootstrapState.workspacePath === "string" &&
    bootstrapState.workspacePath.trim() !== ""
  ) {
    await authenticatedRuntime.start(bootstrapState);
  }
}

function initializeAuth() {
  const createAuthService =
    require("./services/auth-service").createAuthService;
  const createDeviceIdentityStore =
    require("./device-identity-store").createDeviceIdentityStore;
  const registerAuthIpc = require("./ipc/auth-ipc").registerAuthIpc;
  const userDataPath = app.getPath("userData");
  const deviceIdentity = createDeviceIdentityStore({
    userDataPath: userDataPath,
  });
  authService = createAuthService({
    safeStorage: safeStorage,
    userDataPath: userDataPath,
    deviceIdentity: deviceIdentity,
    deviceName:
      process.platform === "win32"
        ? "Windows device"
        : `${process.platform} device`,
    appVersion:
      typeof app.getVersion === "function" ? app.getVersion() : "unknown",
  });
  registerAuthIpc({
    ipcMain: ipcMain,
    authService: authService,
    sendToRenderer: sendToRenderer,
    onAuthenticated: activateAuthenticatedRuntime,
  });
  void authService
    .initialize()
    .then(function (state) {
      if (state && state.authenticated) return activateAuthenticatedRuntime();
      return undefined;
    })
    .catch(function () {});
}

function failStartup() {
  startupStatus = "failed";
  return disposeRuntime()
    .catch(function () {})
    .then(function () {
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
    if (
      error &&
      error.code === "AUTH_DEVICE_ID_CORRUPTED" &&
      dialog &&
      typeof dialog.showErrorBox === "function"
    ) {
      dialog.showErrorBox(
        "设备身份异常",
        "本机设备身份文件损坏。请先备份并确认后重新启动应用。",
      );
    }
    await failStartup();
  }
}

app.whenReady().then(startApplication, failStartup);

app.on("activate", function () {
  if (startupStatus !== "ready") return;
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", function (event) {
  if (quitReady) return;
  event.preventDefault();
  if (quitPromise) return quitPromise;
  isQuitting = true;
  quitPromise = disposeRuntime().then(function () {
    quitReady = true;
    app.quit();
  });
  return quitPromise;
});
