const path = require("path");
const { fork, execFile } = require("child_process");
const { createPlatformTaskStateStore, createRunId } = require("./platform-task-state-store");
const { createPlatformRun, WORKER_SCHEMA_VERSION } = require("./platform-run");
const { requestStopSignal, clearStopSignal } = require("../../src/core/stop-signal");
const { cleanupExpiredHepanPayloads } = require("../../src/platforms/hepan/adapter");
const { productionIpcRegistry } = require("../ipc/contracts/production-registry");
const { projectPlatformSnapshot } = require("../ipc/contracts/platform-contracts");

var PLATFORM_SESSIONS = ["lieju", "toutiao", "hepan"];

function encodePlatformStateEvent(snapshot) {
  var contract = productionIpcRegistry.byChannel("platform-state");
  return productionIpcRegistry.event(contract, projectPlatformSnapshot(snapshot));
}

function sanitizePlatformPlan(plan) {
  var tasks = plan && Array.isArray(plan.tasks) ? plan.tasks : [];
  return {
    taskCount: tasks.length,
    tasks: tasks.map(function(task) {
      task = task || {};
      return {
        sourcePlatformId: typeof task.sourcePlatformId === "string" ? task.sourcePlatformId : "",
        filename: typeof task.filename === "string" ? task.filename : "",
        targetPlatformId: typeof task.targetPlatformId === "string" ? task.targetPlatformId : "",
        accountProfileId: typeof task.accountProfileId === "string" ? task.accountProfileId : ""
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

  function sendPlatformState(snapshot) {
    sendToRenderer("platform-state", encodePlatformStateEvent(snapshot));
  }

  function stopSignalDirectory() {
    return storagePaths.tmp || path.join(cwd, "tmp");
  }

  var platformRun = null;
  var platformTaskStateStore = createPlatformTaskStateStore({
    persistedSnapshotPath: storagePaths.localState ? path.join(storagePaths.localState, "platform-task-snapshot.json") : null
  });

  function emitPlatformState(extra) {
    if (platformTaskStateStore.getSnapshot().runId) {
      platformTaskStateStore.setControls(Object.assign({
        isBatchRunning: false,
        isStopPending: false,
        isPlatformRunning: Boolean(platformRun && platformRun.snapshot())
      }, extra || {}));
      sendPlatformState(platformTaskStateStore.getSnapshot());
      return;
    }
    sendPlatformState(Object.assign({
      isBatchRunning: false,
      isStopPending: false,
      isPlatformRunning: Boolean(platformRun && platformRun.snapshot())
    }, extra || {}));
  }

  function spawnDesktopTask(taskName, payload, hooks) {
    var workerPayload = Object.assign({}, payload || {}, { paths: storagePaths });
    var expectedRunId = typeof workerPayload.runId === "string" ? workerPayload.runId : null;
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

      function redactWorkerPayload(value) {
        if (Array.isArray(value)) return value.map(redactWorkerPayload);
        if (!value || typeof value !== "object") return value;
        var output = {};
        Object.keys(value).forEach(function(key) {
          if (/^(?:cookie|api[_-]?key|contentHtml|filePath|body|accountName)$/i.test(key)) return;
          output[key] = redactWorkerPayload(value[key]);
        });
        return output;
      }

      child.on("message", function(message) {
        if (!message || message.schemaVersion !== WORKER_SCHEMA_VERSION || message.runId !== expectedRunId ||
          !["log", "state", "result", "error"].includes(message.type)) return;
        var safePayload = message.type === "result" ? redactWorkerPayload(message.payload || {}) : message.payload || {};
        var serialized;
        try { serialized = JSON.stringify(safePayload); } catch (_) { return; }
        if (Buffer.byteLength(serialized, "utf8") > 32768 || (message.type !== "result" && /(?:cookie|api[_-]?key|contentHtml|filePath|body|accountName)/i.test(serialized))) return;
        if (message.type === "log" && hooks && typeof hooks.onLog === "function") {
          hooks.onLog(safePayload);
          return;
        }
        if (message.type === "state" && message.payload) {
          if (hooks && typeof hooks.onState === "function") hooks.onState(safePayload);
          return;
        }
        if (message.type === "result") {
          settled = true;
          resolve(safePayload);
        }
      });

      child.on("exit", function(code) {
        // Node may deliver the child's exit notification before the final IPC
        // result message already queued by process.send(). Give that message
        // one turn to arrive before manufacturing WORKER_RESULT_MISSING.
        if (!settled) setImmediate(function() {
          if (!settled) resolve({ ok: false, error: { code: "PLATFORM_WORKER_EXITED", category: "transport", retryability: "manual-check", userMessage: "投稿执行器意外结束" } });
        });
      });

      child.on("error", function(error) {
        if (!settled) {
          resolve({ ok: false, error: { code: error && error.code || "PLATFORM_WORKER_FAILED", category: "transport", retryability: "manual-check", userMessage: "投稿执行器未启动" } });
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
    if (platformRun && platformRun.snapshot()) {
      var alreadyActive = new Error("当前已有平台投稿任务正在运行。");
      alreadyActive.code = "PLATFORM_RUN_ACTIVE";
      throw alreadyActive;
    }
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
      if (typeof runtime.adapter.cleanupExpiredTemporaryFiles === "function") {
        try { runtime.adapter.cleanupExpiredTemporaryFiles(); } catch (_) {}
      }
      try { cleanupExpiredHepanPayloads({ tempDir: path.join(stopSignalDirectory(), "hepan") }); } catch (_) {}
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

    var result = null;
    try {
      // Hepan performs up to two HTTP requests, each allowed to take 180s.
      // Keep the worker watchdog beyond that bounded window so an in-flight
      // request is not killed before it can return a safe outcome.
      var submitOptions = { autoSubmit: true, interactive: false, closeAfterEach: false, timeoutMs: hepanRuntime ? 120000 : 90000 };
      if (hepanRuntime) submitOptions.intervalByTargetMs = { hepan: hepanRuntime.publishIntervalSeconds * 1000 };
      var payload = { plan: workerPlan, hepanRuntime: hepanRuntime, submitOptions: submitOptions };
      var watchdogMs = Number.isInteger(hooks && hooks.platformWatchdogMs) && hooks.platformWatchdogMs > 0
        ? hooks.platformWatchdogMs
        : (Number.isInteger(options.platformWatchdogMs) && options.platformWatchdogMs > 0
          ? options.platformWatchdogMs
          : Math.max(submitOptions.timeoutMs + 5000, 15000));
      platformRun = createPlatformRun({
        watchdogMs: watchdogMs,
        launch: function(run) {
          platformTaskStateStore.start({ runId: run.runId, tasks: run.command.tasks });
          sendPlatformState(platformTaskStateStore.getSnapshot());
          return spawnDesktopTask("platform-submit", Object.assign({}, payload, { plan: { tasks: run.command.tasks }, runId: run.runId }), {
            onLog: hooks && hooks.onLog ? hooks.onLog : function() {},
            onState: function(state) { run.onMessage({ schemaVersion: WORKER_SCHEMA_VERSION, runId: run.runId, type: "state", payload: state }); }
          });
        },
        onSnapshot: function(snapshot) {
          if (snapshot.phase === "running" || snapshot.phase === "stopping") {
            var value = platformTaskStateStore.applyWorkerState({ runId: snapshot.runId, phase: snapshot.phase === "stopping" ? "stopping" : "heartbeat" });
            sendPlatformState(value);
            if (hooks && typeof hooks.onState === "function") hooks.onState(value);
          }
        }
      });
      var targetPlatformIds = Array.from(new Set(workerPlan.tasks.map(function(task) { return task.targetPlatformId; }).filter(Boolean)));
      var accountProfileIds = Array.from(new Set(workerPlan.tasks.map(function(task) { return task.accountProfileId; }).filter(Boolean)));
      result = await platformRun.start({
        publisher: "platform-submit",
        target: targetPlatformIds.length === 1 ? targetPlatformIds[0] : "mixed",
        accountProfileId: accountProfileIds.length === 1 ? accountProfileIds[0] : "",
        tasks: workerPlan.tasks,
        cleanup: hepanCleanup,
        onMessage: function(message) {
          if (!message || message.type !== "state") return;
          var snapshot = platformTaskStateStore.applyWorkerState(Object.assign({}, message.payload || {}, { runId: message.runId }));
          sendPlatformState(snapshot);
          if (hooks && typeof hooks.onState === "function") hooks.onState(snapshot);
        }
      });

      return result;
    } finally {
      if (activeRuntimeCleanup === hepanCleanup) activeRuntimeCleanup = null;
      var terminalPhase = result && result.errorCode === "STOP_REQUESTED" ? "stopped"
        : result && result.ok && result.data && Number(result.data.fail || 0) === 0 && Number(result.data.uncertain || 0) === 0 ? "completed"
        : "failed";
      var queueRevision = invalidateData("PLATFORM_SUBMIT_" + terminalPhase.toUpperCase());
      var terminalSnapshot = platformTaskStateStore.finish(result || { errorCode: "PLATFORM_SUBMIT_FAILED" }, terminalPhase, { queueRevision: queueRevision });
      sendPlatformState(terminalSnapshot);
      if (hooks && typeof hooks.onState === "function") hooks.onState(terminalSnapshot);
    }
  }

  function assertActivePlatformRun(runId) {
    var active = platformRun && platformRun.snapshot();
    if (runId !== undefined && runId !== null && (!active || runId !== active.runId)) {
      var error = new Error("The platform task run is no longer active.");
      error.code = "PLATFORM_RUN_MISMATCH";
      throw error;
    }
  }

  function pausePlatformSubmit(runId) {
    assertActivePlatformRun(runId);
    if (!platformRun || !platformRun.snapshot()) return { ok: true };

    closeBrowserSessions();
    requestStopSignal("operator_pause", stopSignalDirectory());

    platformRun.stop(runId, "operator_pause");
    emitPlatformState();
    return { ok: true };
  }

  function stopPlatformSubmit(runId) {
    assertActivePlatformRun(runId);
    if (!platformRun || !platformRun.snapshot()) return { alreadyStopped: true };
    requestStopSignal("desktop_stop_button", stopSignalDirectory());
    var stopped = platformRun.stop(runId, "operator_stop");
    emitPlatformState();
    return stopped;
  }

  function dispose() {
    if (activeRuntimeCleanup) {
      try { activeRuntimeCleanup(); } catch (_) {}
      activeRuntimeCleanup = null;
    }
    if (platformRun && platformRun.snapshot()) { platformTaskStateStore.markInterrupted(); platformRun.stop(null, "dispose"); }
  }

  function getState() {
    var snapshot = platformTaskStateStore.getSnapshot();
    return Object.assign(snapshot, {
      isBatchRunning: false,
      isStopPending: snapshot.isStopPending,
      isPlatformRunning: Boolean(platformRun && platformRun.snapshot()) || snapshot.isPlatformRunning
    });
  }

  return {
    startPlatformSubmit, pausePlatformSubmit, stopPlatformSubmit, getState, dispose
  };
}

module.exports = { createDesktopTaskService, encodePlatformStateEvent };
