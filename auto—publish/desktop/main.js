const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");

let mainWindow = null;
let unsubscribeLogs = null;
let configureRuntimeEnvironment = null;
let subscribe = null;
let registerIpc = null;
let createDesktopTaskService = null;

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function createMainWindow() {
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
      nodeIntegration: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "..", "media-workbench", "dist", "index.html"));
  mainWindow.on("closed", function() { mainWindow = null; });
}

app.whenReady().then(function() {
  createMainWindow();

  // Lazy-load config-dependent modules AFTER runtime environment is configured.
  // This ensures scripts/config.js sees AUTO_PUBLISH_ROOT_DIR before resolving
  // its default project-root path.
  configureRuntimeEnvironment = require("./runtime-paths").configureRuntimeEnvironment;
  const runtimeRoot = configureRuntimeEnvironment();

  createDesktopTaskService = require("./services/desktop-task-service").createDesktopTaskService;
  const taskService = createDesktopTaskService({
    cwd: runtimeRoot,
    sendToRenderer: sendToRenderer
  });

  registerIpc = require("./ipc/register").registerIpc;
  registerIpc({
    ipcMain: ipcMain,
    taskService: taskService,
    sendToRenderer: sendToRenderer,
    rootDir: runtimeRoot
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

app.on("before-quit", function() {
  if (unsubscribeLogs) { unsubscribeLogs(); unsubscribeLogs = null; }
});