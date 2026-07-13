const path = require("path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { isAllowedRendererNavigation } = require("./security/navigation");

let mainWindow = null;
let unsubscribeLogs = null;
let configureRuntimeEnvironment = null;
let subscribe = null;
let registerIpc = null;
let createDesktopTaskService = null;
let doubaoCollectionService = null;
let unsubscribeDoubaoQueue = null;
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

app.whenReady().then(function() {
  createMainWindow();

  // Lazy-load config-dependent modules AFTER runtime environment is configured.
  // This ensures scripts/config.js sees AUTO_PUBLISH_ROOT_DIR before resolving
  // its default project-root path.
  configureRuntimeEnvironment = require("./runtime-paths").configureRuntimeEnvironment;
  const runtime = configureRuntimeEnvironment();

  createDesktopTaskService = require("./services/desktop-task-service").createDesktopTaskService;
  const taskService = createDesktopTaskService({
    cwd: runtime.workspaceRoot,
    sendToRenderer: sendToRenderer
  });

  const createDoubaoCollection = require("./services/doubao-collection-service").createDoubaoCollectionDesktopService;
  doubaoCollectionService = createDoubaoCollection({ workspaceRoot: runtime.workspaceRoot });

  registerIpc = require("./ipc/register").registerIpc;
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

  subscribe = require("../src/core/logger").subscribe;
  unsubscribeLogs = subscribe(function(entry) { sendToRenderer("publish-log", entry); });
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
  if (unsubscribeDoubaoQueue) { unsubscribeDoubaoQueue(); unsubscribeDoubaoQueue = null; }
  if (unsubscribeLogs) { unsubscribeLogs(); unsubscribeLogs = null; }
  const service = doubaoCollectionService;
  doubaoCollectionService = null;
  try { if (service) await service.dispose(); } catch (_) {}
  app.quit();
});
