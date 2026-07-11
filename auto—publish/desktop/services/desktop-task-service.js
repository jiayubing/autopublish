const path = require("path");
const { fork, exec } = require("child_process");
const { requestStopSignal, clearStopSignal } = require("../../src/core/stop-signal");

var PLATFORM_SESSIONS = ["lieju", "toutiao", "hepan"];

function createDesktopTaskService(opts) {
  var options = opts || {};
  var cwd = options.cwd || path.resolve(__dirname, "..", "..");
  var sendToRenderer = options.sendToRenderer || function() {};

  var isBatchRunning = false;
  var isStopPending = false;
  var snapshotTask = null;
  var batchTask = null;
  var batchChild = null;
  var platformChild = null;
  var isPlatformRunning = false;
  var platformAbort = null;
  var platformTaskCount = 0;

  function emitBatchState() {
    sendToRenderer("batch-state", {
      isBatchRunning: isBatchRunning,
      isStopPending: isStopPending
    });
  }

  function emitPlatformState() {
    sendToRenderer("platform-state", {
      isBatchRunning: isBatchRunning,
      isStopPending: isStopPending,
      isPlatformRunning: isPlatformRunning
    });
  }

  function spawnDesktopTask(taskName, payload, hooks) {
    var child = fork(path.join(__dirname, "..", "worker", "run-task.js"), [taskName, JSON.stringify(payload || {})], {
      cwd: cwd,
      env: Object.assign({}, process.env, {
        AUTO_PUBLISH_DESKTOP: "1",
        AUTO_PUBLISH_NODE_EXEC_PATH: process.env.AUTO_PUBLISH_NODE_EXEC_PATH || ''
      }),
      stdio: ["ignore", "ignore", "ignore", "ipc"]
    });

    var promise = new Promise(function(resolve) {
      var settled = false;

      child.on("message", function(message) {
        if (!message) return;
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

function closeBrowserSessions() {
    // Resolve real Node.js (not Electron EXE) to run playwright-cli correctly
    var nodeExe = process.env.AUTO_PUBLISH_NODE_EXEC_PATH || "";
    if (!nodeExe) {
      try {
        var whereResult = require("child_process").execSync("where node 2>nul", { encoding: "utf8", timeout: 5000 });
        var lines = String(whereResult).trim().split(/\r?\n/).filter(Boolean);
        nodeExe = lines[0] || process.execPath;
      } catch (_) { nodeExe = process.execPath; }
    }
    var cliJs = require("../../scripts/config").PLAYWRIGHT_CLI_JS;
    // Use workspace root for sessions, same as pwSessionConfig
    var rootDir = require("../../scripts/config").DIRS.rootDir;
    var workDir = require("path").join(rootDir, "work", "playwright-cli");

    PLATFORM_SESSIONS.forEach(function(session) {
      var sessionDir = require("path").join(workDir, "sessions", session);
      var cmd = 'chcp 65001 > nul && set PLAYWRIGHT_DAEMON_SESSION_DIR=' + sessionDir + ' && "' + nodeExe + '" "' + cliJs + '" -s=' + session + ' close';
      exec(cmd, { timeout: 5000 }, function() {});
    });
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
    if (isBatchRunning) throw new Error("当前已有发文批次正在运行。");
    clearStopSignal();
    isBatchRunning = true;
    isStopPending = false;
    emitBatchState();
    try {
      var task = spawnDesktopTask("batch", options || {}, { onLog: hooks && hooks.onLog ? hooks.onLog : function() {} });
      batchChild = task.child;
      batchTask = task.promise;
      return await batchTask;
    } finally {
      batchChild = null; batchTask = null;
      isBatchRunning = false; isStopPending = false;
      emitBatchState();
      sendToRenderer("queue-updated", await refreshQueueSnapshot(options));
    }
  }

  function stopBatch() {
    if (!isBatchRunning || !batchChild) throw new Error("当前没有正在运行的发文批次。");
    if (isStopPending) return { alreadyRequested: true };
    requestStopSignal("desktop_stop_button");
    batchChild.send({ type: "stop" });
    isStopPending = true;
    emitBatchState();
    return { alreadyRequested: false };
  }

  async function startPlatformSubmit(plan, hooks) {
    if (isPlatformRunning) throw new Error("当前已有平台投稿任务正在运行。");

    clearStopSignal();
    isPlatformRunning = true;
    platformTaskCount = (plan && plan.tasks) ? plan.tasks.length : 0;
    emitPlatformState();

    try {
      var payload = { plan: plan, submitOptions: { autoSubmit: true, interactive: false, closeAfterEach: false, timeoutMs: 90000 } };
      var task = spawnDesktopTask("platform-submit", payload, { onLog: hooks && hooks.onLog ? hooks.onLog : function() {} });
      platformChild = task.child;

      var abortPromise = new Promise(function(resolve) {
        platformAbort = function() {
          resolve({ ok: true, data: { ok: 0, fail: 0, skipped: platformTaskCount, pending: 0, results: [] } });
        };
      });

      var timeoutMs = 120000;
      var timeoutPromise = new Promise(function(resolve) {
        setTimeout(function() {
          resolve({ ok: false, error: "Platform publish timed out after " + (timeoutMs / 1000) + "s" });
        }, timeoutMs);
      });

      var result = await Promise.race([task.promise, abortPromise, timeoutPromise]);

      if (result && !result.ok && result.error && result.error.indexOf("timed out") !== -1) {
        try { platformChild.kill(); } catch (_) {}
      }

      return result;
    } finally {
      platformAbort = null;
      platformTaskCount = 0;
      platformChild = null;
      isPlatformRunning = false;
      emitPlatformState();
    }
  }

  function pausePlatformSubmit() {
    if (!isPlatformRunning) return { ok: true };

    if (platformAbort) { platformAbort(); platformAbort = null; }

    // Kill the worker immediately to prevent ensureDaemon from reopening browser.
    // The main promise already resolved via platformAbort.
    if (platformChild) {
      try { platformChild.send({ type: "pause" }); } catch (_) {}
      var dyingChild = platformChild;
      setTimeout(function() { try { dyingChild.kill("SIGKILL"); } catch (_) {} }, 500);
    }

    closeBrowserSessions();
    requestStopSignal("operator_pause");

    isPlatformRunning = false;
    emitPlatformState();
    return { ok: true };
  }

  function stopPlatformSubmit() {
    if (!isPlatformRunning) return { alreadyStopped: true };
    if (platformAbort) { platformAbort(); platformAbort = null; }
    if (platformChild) {
      requestStopSignal("desktop_stop_button");
      platformChild.send({ type: "stop" });
      setTimeout(function() { try { if (platformChild) platformChild.kill(); } catch (_) {} }, 3000);
    }
    isPlatformRunning = false;
    emitPlatformState();
    return { alreadyRequested: false };
  }

  function getState() {
    return { isBatchRunning: isBatchRunning, isStopPending: isStopPending, isPlatformRunning: isPlatformRunning };
  }

  return {
    refreshQueueSnapshot, startBatch, stopBatch,
    startPlatformSubmit, pausePlatformSubmit, stopPlatformSubmit, getState
  };
}

module.exports = { createDesktopTaskService };
