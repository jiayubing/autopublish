const path = require("path");
const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const { isAllowedRendererNavigation } = require("./security/navigation");

let mainWindow = null;
let unsubscribeLogs = null;
let unsubscribeDoubaoQueue = null;
let doubaoCollectionService = null;
let taskService = null;
let runtimeDisposePromise = null;
let isQuitting = false;
const EXTERNAL_LINK_HOSTS = new Set(["www.toutiao.com", "mp.weixin.qq.com", "www.lieju.com"]);

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

function createMainWindow() {
  var rendererEntryPath = path.join(__dirname, "..", "media-workbench", "dist", "index.html");
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#f6f7f4",
    title: "Auto Publish Desktop Console",
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
      if (taskService && typeof taskService.getState === "function") return taskService.getState();
      return { isBatchRunning: false, isStopPending: false, isPlatformRunning: false };
    }
  };
}

function createDeferredQueueService() {
  return {
    getQueueState: function() {
      if (doubaoCollectionService && typeof doubaoCollectionService.getQueueState === "function") {
        return doubaoCollectionService.getQueueState();
      }
      return { state: "idle" };
    }
  };
}

async function disposeRuntime() {
  if (runtimeDisposePromise) return runtimeDisposePromise;
  runtimeDisposePromise = (async function() {
    if (unsubscribeDoubaoQueue) {
      unsubscribeDoubaoQueue();
      unsubscribeDoubaoQueue = null;
    }
    if (unsubscribeLogs) {
      unsubscribeLogs();
      unsubscribeLogs = null;
    }
    const service = doubaoCollectionService;
    doubaoCollectionService = null;
    taskService = null;
    try {
      if (service && typeof service.dispose === "function") await service.dispose();
    } catch (_) {}
  })();
  return runtimeDisposePromise;
}

async function relaunchApplication() {
  await disposeRuntime();
  app.relaunch();
  isQuitting = true;
  app.quit();
}

function initializeRuntime(bootstrapState, appRoot) {
  // Lazy-load config-dependent modules only after workspace bootstrap is ready.
  // This ensures scripts/config.js sees AUTO_PUBLISH_ROOT_DIR before resolving
  // its default project-root path.
  const configureRuntimeEnvironment = require("./runtime-paths").configureRuntimeEnvironment;
  const runtime = configureRuntimeEnvironment({
    workspaceRoot: bootstrapState.workspacePath,
    appRoot: appRoot
  });

  const createDesktopTaskService = require("./services/desktop-task-service").createDesktopTaskService;
  taskService = createDesktopTaskService({
    cwd: runtime.workspaceRoot,
    sendToRenderer: sendToRenderer
  });

  const createDoubaoCollection = require("./services/doubao-collection-service").createDoubaoCollectionDesktopService;
  doubaoCollectionService = createDoubaoCollection({ workspaceRoot: runtime.workspaceRoot });

  const registerIpc = require("./ipc/register").registerIpc;
  registerIpc({
    ipcMain: ipcMain,
    taskService: taskService,
    sendToRenderer: sendToRenderer,
    rootDir: runtime.workspaceRoot,
    appRoot: runtime.appRoot,
    paths: runtime.paths,
    doubaoCollectionService: doubaoCollectionService
  });

  unsubscribeDoubaoQueue = doubaoCollectionService.subscribe(function(state) {
    sendToRenderer("content:doubao-queue-state", state);
  });

  const subscribe = require("../src/core/logger").subscribe;
  unsubscribeLogs = subscribe(function(entry) { sendToRenderer("publish-log", entry); });
}

function initializeWorkspaceBootstrap() {
  const userDataPath = app.getPath("userData");
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
    disposeRuntime: disposeRuntime,
    relaunch: relaunchApplication,
    openPath: function(value) { return shell.openPath(value); }
  });

  const registerWorkspaceBootstrapIpc = require("./ipc/workspace-bootstrap-ipc").registerWorkspaceBootstrapIpc;
  registerWorkspaceBootstrapIpc({
    ipcMain: ipcMain,
    dialog: dialog,
    workspaceBootstrapService: workspaceBootstrapService
  });
  return { service: workspaceBootstrapService, appRoot: appRoot };
}

app.whenReady().then(function() {
  const workspace = initializeWorkspaceBootstrap();
  const bootstrapState = workspace.service.bootstrap();
  if (bootstrapState && bootstrapState.state === "ready" &&
    typeof bootstrapState.workspacePath === "string" && bootstrapState.workspacePath.trim() !== "") {
    initializeRuntime(bootstrapState, workspace.appRoot);
  }
  createMainWindow();
});

app.on("activate", function() {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on("window-all-closed", function() {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async function(event) {
  if (isQuitting) return;
  isQuitting = true;
  event.preventDefault();
  await disposeRuntime();
  app.quit();
});
