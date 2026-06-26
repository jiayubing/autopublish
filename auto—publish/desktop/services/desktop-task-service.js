const path = require("path");
const { fork } = require("child_process");
const { requestStopSignal, clearStopSignal } = require("../../src/core/stop-signal");

function createDesktopTaskService(opts) {
  var options = opts || {};
  var cwd = options.cwd || path.resolve(__dirname, "..", "..");
  var sendToRenderer = options.sendToRenderer || function() {};

  var isBatchRunning = false;
  var isStopPending = false;
  var snapshotTask = null;
  var batchTask = null;
  var batchChild = null;

  function emitBatchState() {
    sendToRenderer("batch-state", {
      isBatchRunning: isBatchRunning,
      isStopPending: isStopPending
    });
  }

  function spawnDesktopTask(taskName, payload, hooks) {
    var child = fork(path.join(__dirname, "..", "worker", "run-task.js"), [taskName, JSON.stringify(payload || {})], {
      cwd: cwd,
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

  async function startBatch(options, hooks) {
    if (isBatchRunning) {
      throw new Error("当前已有发文批次正在运行。");
    }

    clearStopSignal();
    isBatchRunning = true;
    isStopPending = false;
    emitBatchState();

    try {
      var task = spawnDesktopTask("batch", options || {}, {
        onLog: hooks && hooks.onLog ? hooks.onLog : function() {}
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
  }

  function stopBatch() {
    if (!isBatchRunning || !batchChild) {
      throw new Error("当前没有正在运行的发文批次。");
    }

    if (isStopPending) {
      return { alreadyRequested: true };
    }

    requestStopSignal("desktop_stop_button");
    batchChild.send({ type: "stop" });
    isStopPending = true;
    emitBatchState();
    return { alreadyRequested: false };
  }

  function getState() {
    return { isBatchRunning: isBatchRunning, isStopPending: isStopPending };
  }

  return {
    refreshQueueSnapshot: refreshQueueSnapshot,
    startBatch: startBatch,
    stopBatch: stopBatch,
    getState: getState
  };
}

module.exports = { createDesktopTaskService };
