const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const { subscribe } = require("../src/core/logger");
const { configureRuntimeEnvironment } = require("./runtime-paths");
const { registerIpc } = require("./ipc/register");
const { createDesktopTaskService } = require("./services/desktop-task-service");

let mainWindow = null;
let unsubscribeLogs = null;

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
  const runtimeRoot = configureRuntimeEnvironment();
  const taskService = createDesktopTaskService({
    cwd: runtimeRoot,
    sendToRenderer: sendToRenderer
  });
  registerIpc({
    ipcMain: ipcMain,
    taskService: taskService,
    sendToRenderer: sendToRenderer,
    rootDir: runtimeRoot
  });
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