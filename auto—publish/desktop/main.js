const path = require("path");
const { fork } = require("child_process");
const { app, BrowserWindow, ipcMain } = require("electron");

const { subscribe } = require("../src/core/logger");
const { requestStopSignal, clearStopSignal } = require("../src/core/stop-signal");

var mainWindow = null;
var unsubscribeLogs = null;
var isBatchRunning = false;
var isStopPending = false;
var snapshotTask = null;
var batchTask = null;
var batchChild = null;

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(channel, payload);
}

function emitBatchState() {
  sendToRenderer("batch-state", {
    isBatchRunning: isBatchRunning,
    isStopPending: isStopPending
  });
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
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("closed", function() {
    mainWindow = null;
  });
}

function spawnDesktopTask(taskName, payload, hooks) {
  var child = fork(path.join(__dirname, "worker", "run-task.js"), [taskName, JSON.stringify(payload || {})], {
    cwd: path.resolve(__dirname, ".."),
    env: Object.assign({}, process.env, {
      AUTO_PUBLISH_DESKTOP: "1",
      AUTO_PUBLISH_NODE_EXEC_PATH: process.env.AUTO_PUBLISH_NODE_EXEC_PATH || process.execPath
    }),
    stdio: ["ignore", "ignore", "ignore", "ipc"]
  });

  var promise = new Promise(function(resolve) {
    var settled = false;

    child.on("message", function(message) {
      if (!message) {
        return;
      }

      if (message.type === "log" && hooks && typeof hooks.onLog === "function") {
        hooks.onLog(message.payload);
        return;
      }

      if (message.type === "result") {
        settled = true;
        resolve(message.payload);
      }
    });

    child.on("exit", function(code) {
      if (!settled) {
        resolve({ ok: false, error: "Desktop task exited unexpectedly (code " + code + ")." });
      }
    });

    child.on("error", function(error) {
      if (!settled) {
        resolve({ ok: false, error: error.message });
      }
    });
  });

  return { child: child, promise: promise };
}

function refreshQueueSnapshot() {
  if (!snapshotTask) {
    snapshotTask = spawnDesktopTask("snapshot", {}).promise.finally(function() {
      snapshotTask = null;
    });
  }
  return snapshotTask;
}

app.whenReady().then(function() {
  createMainWindow();

  unsubscribeLogs = subscribe(function(entry) {
    sendToRenderer("publish-log", entry);
  });

  ipcMain.handle("desktop:get-state", async function() {
    return {
      isBatchRunning: isBatchRunning,
      isStopPending: isStopPending,
      snapshot: await refreshQueueSnapshot()
    };
  });

  ipcMain.handle("desktop:refresh-queue", function() {
    return refreshQueueSnapshot();
  });

  ipcMain.handle("desktop:start-batch", async function(event, options) {
    if (isBatchRunning) {
      return { ok: false, error: "当前已有发文批次正在运行。" };
    }

    clearStopSignal();
    isBatchRunning = true;
    isStopPending = false;
    emitBatchState();

    try {
      var task = spawnDesktopTask("batch", options || {}, {
        onLog: function(entry) {
          sendToRenderer("publish-log", entry);
        }
      });
      batchChild = task.child;
      batchTask = task.promise;
      var result = await batchTask;
      return result;
    } finally {
      batchChild = null;
      batchTask = null;
      isBatchRunning = false;
      isStopPending = false;
      emitBatchState();
      sendToRenderer("queue-updated", await refreshQueueSnapshot());
    }
  });

  ipcMain.handle("desktop:stop-batch", function() {
    if (!isBatchRunning || !batchChild) {
      return { ok: false, error: "当前没有正在运行的发文批次。" };
    }

    if (isStopPending) {
      return { ok: true, alreadyRequested: true };
    }

    try {
      requestStopSignal("desktop_stop_button");
      batchChild.send({ type: "stop" });
      isStopPending = true;
      emitBatchState();
      return { ok: true, alreadyRequested: false };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  app.on("activate", function() {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", function() {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", function() {
  if (unsubscribeLogs) {
    unsubscribeLogs();
    unsubscribeLogs = null;
  }
});
