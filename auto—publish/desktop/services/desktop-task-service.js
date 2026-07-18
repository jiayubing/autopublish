const path = require("path");
const { fork, execFile } = require("child_process");
const { requestStopSignal, clearStopSignal } = require("../../src/core/stop-signal");

var PLATFORM_SESSIONS = ["lieju", "toutiao", "hepan"];

function sanitizePlatformPlan(plan) {
  var tasks = plan && Array.isArray(plan.tasks) ? plan.tasks : [];
  return {
    taskCount: tasks.length,
    tasks: tasks.map(function(task) {
      task = task || {};
      return {
        sourcePlatformId: typeof task.sourcePlatformId === "string" ? task.sourcePlatformId : "",
        filename: typeof task.filename === "string" ? task.filename : "",
        targetPlatformId: typeof task.targetPlatformId === "string" ? task.targetPlatformId : ""
      };
    })
  };
}

function createDesktopTaskService(opts) {
  var options = opts || {};
  var cwd = options.cwd || path.resolve(__dirname, "..", "..");
  var sendToRenderer = options.sendToRenderer || function() {};
  var invalidateData = options.invalidateData || function() {};
  var storagePaths = options.paths || {};
  var forkProcess = options.fork || fork;
  var execFileProcess = options.execFile || execFile;
  var platformSettingsService = options.platformSettingsService || null;
  var activeRuntimeCleanup = null;

  function stopSignalDirectory() {
    return storagePaths.tmp || path.join(cwd, "tmp");
  }

  var isBatchRunning = false;
  var isStopPending = false;
  var snapshotTask = null;
  var batchTask = null;
  var batchChild = null;
  var platformChild = null;
  var isPlatformRunning = false;
  var platformAbort = null;
  var platformTaskCount = 0;
  var platformRemoteCallStarted = false;

  function emitBatchState() {
    sendToRenderer("batch-state", {
      isBatchRunning: isBatchRunning,
      isStopPending: isStopPending
    });
  }

  function emitPlatformState(extra) {
    sendToRenderer("platform-state", Object.assign({
      isBatchRunning: isBatchRunning,
      isStopPending: isStopPending,
      isPlatformRunning: isPlatformRunning
    }, extra || {}));
  }

  function spawnDesktopTask(taskName, payload, hooks) {
    var workerPayload = Object.assign({}, payload || {}, { paths: storagePaths });
    var child = forkProcess(path.join(__dirname, "..", "worker", "run-task.js"), [taskName, JSON.stringify(workerPayload)], {
      cwd: cwd,
      env: Object.assign({}, process.env, {
        AUTO_PUBLISH_DESKTOP: "1",
        AUTO_PUBLISH_WORKSPACE: storagePaths.contentLibrary || storagePaths.workspaceRoot || cwd,
        AUTO_PUBLISH_ROOT_DIR: storagePaths.contentLibrary || storagePaths.workspaceRoot || cwd,
        AUTO_PUBLISH_LOCAL_STATE: storagePaths.localState || "",
        AUTO_PUBLISH_INPUT_DIR: storagePaths.input || "",
        AUTO_PUBLISH_DATA_DIR: storagePaths.data || "",
        AUTO_PUBLISH_PUBLISHED_DIR: storagePaths.published || "",
        AUTO_PUBLISH_FAILED_DIR: storagePaths.failed || "",
        AUTO_PUBLISH_TMP_DIR: storagePaths.tmp || "",
        AUTO_PUBLISH_LOGS_DIR: storagePaths.logs || "",
        AUTO_PUBLISH_PLAYWRIGHT_HOME: storagePaths.browser || "",
        AUTO_PUBLISH_PLAYWRIGHT_PROFILE_DIR: storagePaths.doubaoBrowser || "",
        AUTO_PUBLISH_PLAYWRIGHT_STATE_DIR: storagePaths.browser ? path.join(storagePaths.browser, "state") : "",
        AUTO_PUBLISH_NODE_EXEC_PATH: storagePaths.playwrightNodeExecPath || process.env.AUTO_PUBLISH_NODE_EXEC_PATH || "",
        PLAYWRIGHT_CLI_JS: storagePaths.playwrightCliJs || process.env.PLAYWRIGHT_CLI_JS || "",
        BROWSER_CHANNEL: storagePaths.browserChannel || process.env.BROWSER_CHANNEL || "msedge",
        AUTO_PUBLISH_APP_ROOT: storagePaths.installation || process.env.AUTO_PUBLISH_APP_ROOT || "",
        AUTO_PUBLISH_PACKAGED: process.env.AUTO_PUBLISH_PACKAGED || "0"
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
        if (message.type === "state" && message.payload) {
          if (message.payload.phase === "remote-started") platformRemoteCallStarted = true;
          if (message.payload.phase === "before-remote" || message.payload.phase === "remote-finished") platformRemoteCallStarted = false;
          if (hooks && typeof hooks.onState === "function") hooks.onState(message.payload);
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
    var resolver = require("./runtime-diagnostics-service").resolvePlaywrightRuntime;
    var resolved = resolver({
      appRoot: storagePaths.installation || process.env.AUTO_PUBLISH_APP_ROOT || cwd,
      paths: storagePaths,
      applicationTools: {
        nodeExecPath: storagePaths.playwrightNodeExecPath,
        playwrightCliJs: storagePaths.playwrightCliJs
      },
      env: process.env,
      packaged: process.env.AUTO_PUBLISH_PACKAGED === "1"
    });
    var nodeExe = resolved.playwrightNode.command;
    var cliJs = resolved.playwrightCli.command;
    if (!nodeExe || !cliJs) return;
    var workDir = storagePaths.browser || path.join(cwd, "work", "playwright-cli");

    PLATFORM_SESSIONS.forEach(function(session) {
      var sessionDir = path.join(workDir, "sessions", session);
      var env = Object.assign({}, process.env, { PLAYWRIGHT_DAEMON_SESSION_DIR: sessionDir });
      execFileProcess(nodeExe, [cliJs, "-s=" + session, "close"], { timeout: 5000, windowsHide: true, env: env }, function() {});
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
    clearStopSignal(stopSignalDirectory());
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
    requestStopSignal("desktop_stop_button", stopSignalDirectory());
    batchChild.send({ type: "stop" });
    isStopPending = true;
    emitBatchState();
    return { alreadyRequested: false };
  }

  async function startPlatformSubmit(plan, hooks) {
    if (isPlatformRunning) throw new Error("当前已有平台投稿任务正在运行。");
    var workerPlan = sanitizePlatformPlan(plan);

    var hepanRuntime = null;
    var hepanCleanup = null;
    var hasHepanTask = Boolean(workerPlan.tasks.some(function(task) { return task && task.targetPlatformId === "hepan"; }));
    if (hasHepanTask) {
      if (!platformSettingsService) {
        var missingSettings = new Error("蓝色河畔配置未设置");
        missingSettings.code = "HEPAN_CONFIG_NOT_SET";
        throw missingSettings;
      }
      var runtime = platformSettingsService.getAdapterForRuntime("hepan");
      if (!runtime.adapter || typeof runtime.adapter.createTemporaryCookie !== "function") {
        var missingCookie = new Error("蓝色河畔配置未设置");
        missingCookie.code = "HEPAN_CONFIG_NOT_SET";
        throw missingCookie;
      }
      var temporaryCookie = runtime.adapter.createTemporaryCookie(runtime.config);
      hepanCleanup = temporaryCookie.cleanup;
      activeRuntimeCleanup = hepanCleanup;
      hepanRuntime = {
        pythonPath: runtime.config.pythonPath,
        categoryId: runtime.config.categoryId,
        vendorDir: runtime.config.vendorDir || "",
        publishIntervalSeconds: Number.isInteger(runtime.config.publishIntervalSeconds) && runtime.config.publishIntervalSeconds >= 0 && runtime.config.publishIntervalSeconds <= 3600
          ? runtime.config.publishIntervalSeconds
          : 30,
        cookiePath: temporaryCookie.cookiePath
      };
    }

    clearStopSignal(stopSignalDirectory());
    isPlatformRunning = true;
    platformTaskCount = workerPlan.tasks.length;
    platformRemoteCallStarted = false;
    emitPlatformState();

    var result = null;
    try {
      var submitOptions = { autoSubmit: true, interactive: false, closeAfterEach: false, timeoutMs: 90000 };
      if (hepanRuntime) submitOptions.intervalByTargetMs = { hepan: hepanRuntime.publishIntervalSeconds * 1000 };
      var payload = { plan: workerPlan, hepanRuntime: hepanRuntime, submitOptions: submitOptions };
      var watchdogMs = Number.isInteger(hooks && hooks.platformWatchdogMs) && hooks.platformWatchdogMs > 0
        ? hooks.platformWatchdogMs
        : (Number.isInteger(options.platformWatchdogMs) && options.platformWatchdogMs > 0
          ? options.platformWatchdogMs
          : Math.max(submitOptions.timeoutMs + 5000, 15000));
      var watchdogId;
      var watchdogResolve;
      var watchdogPromise = new Promise(function(resolve) { watchdogResolve = resolve; });
      function armWatchdog() {
        clearTimeout(watchdogId);
        watchdogId = setTimeout(function() {
          watchdogResolve({ ok: false, errorCode: "PLATFORM_WORKER_WATCHDOG_TIMEOUT", error: "Platform publish worker stopped making progress." });
        }, watchdogMs);
      }
      var task = spawnDesktopTask("platform-submit", payload, {
        onLog: hooks && hooks.onLog ? hooks.onLog : function() {},
        onState: function(state) {
          armWatchdog();
          sendToRenderer("platform-state", Object.assign({
            isBatchRunning: isBatchRunning,
            isStopPending: isStopPending,
            isPlatformRunning: true
          }, state || {}));
          if (hooks && typeof hooks.onState === "function") hooks.onState(state);
        }
      });
      platformChild = task.child;
      armWatchdog();

      var abortPromise = new Promise(function(resolve) {
        platformAbort = function() {
          resolve({ ok: true, errorCode: "STOP_REQUESTED", data: { ok: 0, fail: 0, skipped: platformTaskCount, pending: 0, results: [] } });
        };
      });

      result = await Promise.race([task.promise, abortPromise, watchdogPromise]);
      clearTimeout(watchdogId);

      if (result && result.errorCode === "PLATFORM_WORKER_WATCHDOG_TIMEOUT") {
        try { platformChild.kill(); } catch (_) {}
      } else if (result && result.data && result.data.skipped === platformTaskCount) {
        if (!platformRemoteCallStarted) {
          try { platformChild.kill(); } catch (_) {}
        }
      }

      return result;
    } finally {
      if (hepanCleanup) {
        try { hepanCleanup(); } catch (_) {}
        if (activeRuntimeCleanup === hepanCleanup) activeRuntimeCleanup = null;
      }
      platformAbort = null;
      platformTaskCount = 0;
      platformRemoteCallStarted = false;
      platformChild = null;
      isPlatformRunning = false;
      var terminalPhase = result && result.errorCode === "STOP_REQUESTED" ? "stopped"
        : result && result.ok && result.data && Number(result.data.fail || 0) === 0 && Number(result.data.uncertain || 0) === 0 ? "completed"
        : "failed";
      emitPlatformState({ phase: terminalPhase, status: terminalPhase, queueRevision: invalidateData(["platformQueue", "navigationSummary", "articleAttention"], "PLATFORM_SUBMIT_" + terminalPhase.toUpperCase()) });
    }
  }

  function pausePlatformSubmit() {
    if (!isPlatformRunning) return { ok: true };

    if (platformAbort && !platformRemoteCallStarted) { platformAbort(); platformAbort = null; }

    // Kill the worker immediately to prevent ensureDaemon from reopening browser.
    // The main promise already resolved via platformAbort.
    if (platformChild) {
      try { platformChild.send({ type: "pause" }); } catch (_) {}
      if (!platformRemoteCallStarted) {
        var dyingChild = platformChild;
        setTimeout(function() { try { dyingChild.kill("SIGKILL"); } catch (_) {} }, 500);
      }
    }

    closeBrowserSessions();
    requestStopSignal("operator_pause", stopSignalDirectory());

    isPlatformRunning = false;
    emitPlatformState();
    return { ok: true };
  }

  function stopPlatformSubmit() {
    if (!isPlatformRunning) return { alreadyStopped: true };
    if (platformAbort && !platformRemoteCallStarted) { platformAbort(); platformAbort = null; }
    if (platformChild) {
      requestStopSignal("desktop_stop_button", stopSignalDirectory());
      try { platformChild.send({ type: "stop" }); } catch (_) {}
      if (!platformRemoteCallStarted) {
        setTimeout(function() { try { if (platformChild) platformChild.kill(); } catch (_) {} }, 3000);
      }
    }
    isPlatformRunning = false;
    emitPlatformState();
    return { alreadyRequested: false };
  }

  function dispose() {
    if (activeRuntimeCleanup) {
      try { activeRuntimeCleanup(); } catch (_) {}
      activeRuntimeCleanup = null;
    }
    [batchChild, platformChild].forEach(function(child) {
      if (child) {
        try { child.kill(); } catch (_) {}
      }
    });
  }

  function getState() {
    return { isBatchRunning: isBatchRunning, isStopPending: isStopPending, isPlatformRunning: isPlatformRunning };
  }

  return {
    refreshQueueSnapshot, startBatch, stopBatch,
    startPlatformSubmit, pausePlatformSubmit, stopPlatformSubmit, getState, dispose
  };
}

module.exports = { createDesktopTaskService };
