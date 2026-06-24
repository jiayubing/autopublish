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

function refreshQueueSnapshot(options) {
  var payload = options || {};
  if (!snapshotTask) {
    snapshotTask = spawnDesktopTask("snapshot", payload).promise.finally(function() {
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

  ipcMain.handle("desktop:refresh-queue", function(event, options) {
    snapshotTask = null;
    return refreshQueueSnapshot(options || {});
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
      sendToRenderer("queue-updated", await refreshQueueSnapshot(options));
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



  // -------- Media submission IPC handlers --------

  const { MediaResourceStore } = require("../src/platforms/media/media-resource-store");
  const { MediaPoolStore } = require("../src/platforms/media/media-pool-store");
  const { MediaClient } = require("../src/platforms/media/media-client");
  const { resolveApiKey } = require("../src/platforms/media/config");

  var mediaResourceStore = new MediaResourceStore();
  var mediaPoolStore = new MediaPoolStore();

  function getMediaClient() {
    var apiKey = resolveApiKey(null);
    return new MediaClient({ apiKey: apiKey });
  }

  ipcMain.handle("media:list-resources", async function() {
    try {
      var client = getMediaClient();
      var response = await client.mediaList({ page: 1 });
      var resources = [];
      if (response && response.data) {
        resources = Array.isArray(response.data) ? response.data :
                    Array.isArray(response.data.list) ? response.data.list : [];
      }
      mediaResourceStore.setAll(resources, {
        total: response && response.data && response.data.total,
        raw: response
      });
      return {
        ok: true,
        data: {
          count: resources.length,
          updatedAt: mediaResourceStore.getAll().updatedAt
        }
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("media:get-cached-resources", function() {
    var data = mediaResourceStore.getAll();
    return {
      ok: true,
      data: data || { updatedAt: null, count: 0, resources: [] }
    };
  });

  ipcMain.handle("media:search-resources", function(event, keyword) {
    var results = mediaResourceStore.search(keyword);
    return { ok: true, data: results };
  });

  ipcMain.handle("media:filter-resources-by-price", function(event, minPrice, maxPrice) {
    var results = mediaResourceStore.filterByPrice(minPrice, maxPrice);
    return { ok: true, data: results };
  });

  ipcMain.handle("media:get-pool", function() {
    return { ok: true, data: mediaPoolStore.getAll() };
  });

  ipcMain.handle("media:add-to-pool", function(event, resource) {
    mediaPoolStore.add(resource);
    return { ok: true };
  });

  ipcMain.handle("media:remove-from-pool", function(event, resourceId) {
    mediaPoolStore.remove(resourceId);
    return { ok: true };
  });

  ipcMain.handle("media:pool-contains", function(event, resourceId) {
    return { ok: true, data: mediaPoolStore.contains(resourceId) };
  });

  ipcMain.handle("media:get-balance", async function() {
    try {
      var client = getMediaClient();
      var response = await client.getBalance();
      return { ok: true, data: response };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });


  const { MediaDraftStore } = require("../src/platforms/media/media-draft-store");
  var mediaDraftStore = new MediaDraftStore();

  ipcMain.handle("media:get-drafts", function() {
    return { ok: true, data: mediaDraftStore.getAll() };
  });

  ipcMain.handle("media:get-draft", function(event, filename) {
    var draft = mediaDraftStore.get(filename);
    return { ok: true, data: draft };
  });

  ipcMain.handle("media:set-draft", function(event, filename, draft) {
    mediaDraftStore.set(filename, draft);
    return { ok: true };
  });

  ipcMain.handle("media:remove-draft", function(event, filename) {
    mediaDraftStore.remove(filename);
    return { ok: true };
  });

  ipcMain.handle("media:set-bulk-resource", function(event, filenames, resourceId, resourceName) {
    mediaDraftStore.setBulkResource(filenames, resourceId, resourceName);
    return { ok: true };
  });

  ipcMain.handle("media:scan-articles", function() {
    var fs = require("fs");
    var path = require("path");
    var scanDir = path.resolve(__dirname, "..", "input", "media");
    if (!fs.existsSync(scanDir)) {
      return { ok: true, data: [] };
    }
    var files = fs.readdirSync(scanDir).filter(function(name) {
      if (name.indexOf("~$") === 0) return false;
      if (name === ".gitkeep") return false;
      return name.endsWith(".docx") || name.endsWith(".txt") || name.endsWith(".md");
    });
    // Auto-detect title from filename (simple: strip extension)
    var articles = files.map(function(fn) {
      var ext = path.extname(fn);
      var base = path.basename(fn, ext);
      // Check draft for title override
      var draft = mediaDraftStore.get(fn);
      return {
        filename: fn,
        filePath: path.join(scanDir, fn),
        title: (draft && draft.title) || base,
        hasImages: draft ? draft.hasImages : null,
        imageCount: draft ? draft.imageCount : null,
        resourceId: draft ? draft.resourceId : null,
        resourceName: draft ? draft.resourceName : null,
        ignoreImages: draft ? !!draft.ignoreImages : false
      };
    });
    return { ok: true, data: articles };
  });


  const { runPreflight } = require("../src/platforms/media/preflight");

  ipcMain.handle("media:preflight", async function(event, articles, dryRun) {
    try {
      var result = await runPreflight({ articles: articles, dryRun: dryRun !== false });
      return { ok: true, data: result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });


  const { SubmissionOrderStore } = require("../src/platforms/media/submission-order-store");
  var submissionOrderStore = new SubmissionOrderStore();

  ipcMain.handle("media:get-orders", async function() {
    // Read all orders from JSONL
    var fs = require("fs");
    var path = require("path");
    var storePath = path.resolve(__dirname, "..", "data", "submission-orders.jsonl");
    var orders = [];
    try {
      if (fs.existsSync(storePath)) {
        var lines = fs.readFileSync(storePath, "utf-8").trim().split("
");
        for (var i = 0; i < lines.length; i++) {
          if (lines[i].trim()) {
            try { orders.push(JSON.parse(lines[i])); } catch (_) {}
          }
        }
      }
    } catch (_) {}
    return { ok: true, data: orders };
  });

  ipcMain.handle("media:sync-order", async function(event, orderNid) {
    try {
      var client = getMediaClient();
      var response = await client.orderInfo(orderNid);
      return { ok: true, data: response };
    } catch (err) {
      return { ok: false, error: err.message };
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
