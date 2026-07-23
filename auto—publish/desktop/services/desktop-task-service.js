const path = require("path");
const { fork, execFile } = require("child_process");
const { createPlatformTaskStateStore, createRunId } = require("./platform-task-state-store");
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

  var platformChild = null;
  var isPlatformRunning = false;
  var platformAbort = null;
  var platformTaskCount = 0;
  var platformRemoteCallStarted = false;
  var activePlatformRunId = null;
  var platformTaskStateStore = createPlatformTaskStateStore({
    persistedSnapshotPath: storagePaths.localState ? path.join(storagePaths.localState, "platform-task-snapshot.json") : null
  });

  function emitPlatformState(extra) {
    if (platformTaskStateStore.getSnapshot().runId) {
      platformTaskStateStore.setControls(Object.assign({
        isBatchRunning: false,
        isStopPending: false,
        isPlatformRunning: isPlatformRunning
      }, extra || {}));
      sendToRenderer("platform-state", platformTaskStateStore.getSnapshot());
      return;
    }
    sendToRenderer("platform-state", Object.assign({
      isBatchRunning: false,
      isStopPending: false,
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
    activePlatformRunId = createRunId();
    platformTaskStateStore.start({ runId: activePlatformRunId, tasks: workerPlan.tasks });
    sendToRenderer("platform-state", platformTaskStateStore.getSnapshot());

    var result = null;
    try {
      var submitOptions = { autoSubmit: true, interactive: false, closeAfterEach: false, timeoutMs: 90000 };
      if (hepanRuntime) submitOptions.intervalByTargetMs = { hepan: hepanRuntime.publishIntervalSeconds * 1000 };
      var payload = { plan: workerPlan, hepanRuntime: hepanRuntime, submitOptions: submitOptions, runId: activePlatformRunId };
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
          var snapshot = platformTaskStateStore.applyWorkerState(Object.assign({}, state || {}, { runId: activePlatformRunId }));
          sendToRenderer("platform-state", snapshot);
          if (hooks && typeof hooks.onState === "function") hooks.onState(snapshot);
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
      var queueRevision = invalidateData("PLATFORM_SUBMIT_" + terminalPhase.toUpperCase());
      var terminalSnapshot = platformTaskStateStore.finish(result || { errorCode: "PLATFORM_SUBMIT_FAILED" }, terminalPhase, { queueRevision: queueRevision });
      activePlatformRunId = null;
      sendToRenderer("platform-state", terminalSnapshot);
      if (hooks && typeof hooks.onState === "function") hooks.onState(terminalSnapshot);
    }
  }

  function assertActivePlatformRun(runId) {
    if (runId !== undefined && runId !== null && runId !== activePlatformRunId) {
      var error = new Error("The platform task run is no longer active.");
      error.code = "PLATFORM_RUN_MISMATCH";
      throw error;
    }
  }

  function pausePlatformSubmit(runId) {
    assertActivePlatformRun(runId);
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

  function stopPlatformSubmit(runId) {
    assertActivePlatformRun(runId);
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
    if (isPlatformRunning) platformTaskStateStore.markInterrupted();
    [platformChild].forEach(function(child) {
      if (child) {
        try { child.kill(); } catch (_) {}
      }
    });
  }

  function getState() {
    var snapshot = platformTaskStateStore.getSnapshot();
    return Object.assign(snapshot, {
      isBatchRunning: false,
      isStopPending: snapshot.isStopPending,
      isPlatformRunning: isPlatformRunning || snapshot.isPlatformRunning
    });
  }

  return {
    startPlatformSubmit, pausePlatformSubmit, stopPlatformSubmit, getState, dispose
  };
}

module.exports = { createDesktopTaskService };
