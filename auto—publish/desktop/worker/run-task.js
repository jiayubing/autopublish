const task = process.argv[2];
const path = require("node:path");
const {
  createDiagnosticRecord,
} = require("../../src/diagnostics/diagnostic-schema");
const { reportDiagnostic, setDiagnosticReporter } = require("../../src/diagnostics/diagnostic-producer");
const { createDiagnosticFileSink } = require("../../src/diagnostics/diagnostic-file-sink");
var stopRequested = false;
var activeRunId = null;
var activeAbortController = null;
var resultDisconnectScheduled = false;
const WORKER_SCHEMA_VERSION = 1;

if (!task) {
  process.exit(1);
}

function send(type, payload) {
  if (typeof process.send === "function") {
    var message = { schemaVersion: WORKER_SCHEMA_VERSION, runId: activeRunId, type, payload };
    process.send(message);
    if (type === "result" && !resultDisconnectScheduled) {
      resultDisconnectScheduled = true;
      // The IPC channel itself is an active handle in a forked worker. Once
      // the final result is queued, close that channel so PlatformRun can
      // observe child exit and publish the terminal state to the renderer.
      setImmediate(function() {
        try { if (typeof process.disconnect === "function" && process.connected) process.disconnect(); } catch (_) {}
      });
    }
    return;
  }

  if (type === "result") process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

}

function installWorkerDiagnosticReporter(paths) {
  if (!paths || typeof paths.logs !== "string" || !paths.logs.trim()) return function () {};
  let sink;
  try {
    sink = createDiagnosticFileSink({
      directory: paths.logs,
      root: paths.localState || paths.logs,
    });
    sink.initialize();
  } catch (_) {
    return function () {};
  }
  return setDiagnosticReporter(function (record) {
    try {
      const correlated = record.runId === null && activeRunId
        ? createDiagnosticRecord(Object.assign({}, record, { runId: activeRunId }))
        : record;
      sink.append(correlated);
      return true;
    } catch (_) {
      return false;
    }
  });
}

function reportWorkerDiagnostic(code, category, operationId, metadata) {
  reportDiagnostic({
    code: code,
    module: "desktop-worker",
    category: category,
    operationId: operationId,
    runId: activeRunId,
    metadata: metadata,
  });
}

function configureWorkerEnvironment(paths) {
  if (!paths || typeof paths !== "object") return;
  const values = {
    AUTO_PUBLISH_WORKSPACE: paths.contentLibrary || paths.workspaceRoot,
    AUTO_PUBLISH_ROOT_DIR: paths.contentLibrary || paths.workspaceRoot,
    AUTO_PUBLISH_LOCAL_STATE: paths.localState,
    AUTO_PUBLISH_INPUT_DIR: paths.input,
    AUTO_PUBLISH_DATA_DIR: paths.data,
    AUTO_PUBLISH_PUBLISHED_DIR: paths.published,
    AUTO_PUBLISH_FAILED_DIR: paths.failed,
    AUTO_PUBLISH_TMP_DIR: paths.tmp,
    AUTO_PUBLISH_LOGS_DIR: paths.logs,
    AUTO_PUBLISH_PLAYWRIGHT_HOME: paths.browser,
    AUTO_PUBLISH_PLAYWRIGHT_PROFILE_DIR: paths.doubaoBrowser,
    AUTO_PUBLISH_PLAYWRIGHT_STATE_DIR: paths.browser && path.join(paths.browser, "state"),
    AUTO_PUBLISH_NODE_EXEC_PATH: paths.playwrightNodeExecPath,
    PLAYWRIGHT_CLI_JS: paths.playwrightCliJs,
    BROWSER_CHANNEL: paths.browserChannel,
    AUTO_PUBLISH_APP_ROOT: paths.installation,
    AUTO_PUBLISH_PACKAGED: process.env.AUTO_PUBLISH_PACKAGED || "0"
  };
  Object.keys(values).forEach(function(key) { if (values[key]) process.env[key] = values[key]; });
}

process.on("message", function(message) {
  if (!message) return;

  if (message.schemaVersion !== WORKER_SCHEMA_VERSION || message.runId !== activeRunId) return;

  if (message.type === "stop" && !stopRequested) {
    stopRequested = true;
    if (activeAbortController) activeAbortController.abort("operator");
    reportWorkerDiagnostic("PLATFORM_WORKER_STOP_REQUESTED", "conflict", "platform-stop", { action: "stop" });
    return;
  }

  if (message.type === "pause") {
    // Immediately close all browser sessions to break the current blocking pwRun call
    reportWorkerDiagnostic("PLATFORM_WORKER_PAUSE_REQUESTED", "conflict", "platform-pause", { action: "pause" });
    stopRequested = true;
    try {
      const { loadPlatforms } = require("../../src/core/platforms");
      const platforms = loadPlatforms();
      platforms.forEach(function(p) {
        if (typeof p.closeSession === "function") {
          try { p.closeSession(); } catch (_) {}
        }
      });
    } catch (_) {}
    // Also set stop signal for throwIfStopped checkpoints
    try {
      const { requestStopSignal } = require("../../src/core/stop-signal");
      requestStopSignal("operator_pause");
    } catch (_) {}
    return;
  }
});

(async function main() {
  try {
    process.env.AUTO_PUBLISH_DESKTOP = "1";

    if (task === "snapshot") {
      const options = process.argv[3] ? JSON.parse(process.argv[3]) : {};
      configureWorkerEnvironment(options.paths);
      const { createQueueSnapshot } = require("../../src/app/publish-batch");
      send("result", { ok: true, data: createQueueSnapshot(options) });
      return;
    }

    if (task === "platform-submit") {
      const options = process.argv[3] ? JSON.parse(process.argv[3]) : {};
      configureWorkerEnvironment(options.paths);
      const { createWorkerPublisherExecutor } = require("./publisher-executor");
      const { clearStopSignal } = require("../../src/core/stop-signal");
      const plan = options.plan || { tasks: [] };
      const submitOptions = options.submitOptions || { autoSubmit: true, interactive: false, closeAfterEach: false, timeoutMs: 90000 };
      const runId = typeof options.runId === "string" ? options.runId : null;
      if (!runId) throw new Error("Platform worker runId is required");
      activeRunId = runId;
      const restoreDiagnosticReporter = installWorkerDiagnosticReporter(options.paths);

      function sendPlatformState(state) {
        send("state", Object.assign({}, state || {}, {
          runId: runId,
          updatedAt: new Date().toISOString()
        }));
      }

      clearStopSignal();
      activeAbortController = new AbortController();

      try {
        reportWorkerDiagnostic("PLATFORM_WORKER_STARTED", "transport", "platform-submit", { taskKind: "platform-submit", taskCount: plan.tasks.length });

        const { loadPlatforms } = require("../../src/core/platforms");
        const loadedPlatforms = loadPlatforms();
      const adapters = {};
      loadedPlatforms.forEach(function(platform) { adapters[platform.id] = platform; });
      if (adapters.hepan && typeof adapters.hepan.setRuntimeConfig === "function") {
        adapters.hepan.setRuntimeConfig(options.hepanRuntime || null);
      }

        var activeTask = null;
        var heartbeat = setInterval(function() {
          sendPlatformState({ phase: "heartbeat", task: activeTask || undefined });
        }, 250);
        try {
          const executor = createWorkerPublisherExecutor({
            adapters: adapters,
            paths: options.paths,
            shouldStop: function() { return stopRequested; },
            onState: function(state) {
              if (state && state.task) activeTask = state.task;
              sendPlatformState(state);
            }
          });
          const result = await executor.execute(plan, Object.assign({}, submitOptions, { signal: activeAbortController.signal }));
          send("result", { ok: true, data: result });
        } finally {
          clearInterval(heartbeat);
        }
      } catch (error) {
        reportWorkerDiagnostic("PLATFORM_WORKER_FAILED", "internal", "platform-submit", { outcome: "failed" });
        send("result", { ok: false, error: { code: error && error.code || "PLATFORM_WORKER_FAILED", category: "internal", retryability: "manual-check", userMessage: "投稿执行器未完成" } });
      } finally {
        activeAbortController = null;
        restoreDiagnosticReporter();
        try {
          const loadedPlatforms = require("../../src/core/platforms").loadPlatforms();
          loadedPlatforms.forEach(function(platform) {
            if (platform.id === "hepan" && typeof platform.clearRuntimeConfig === "function") platform.clearRuntimeConfig();
            if (typeof platform.closeSession === "function") {
              try { platform.closeSession(); } catch (_) {}
            }
          });
        } catch (_) {}
      }
      return;
    }

    throw new Error("Unsupported desktop worker task: " + task);
  } catch (error) {
    send("result", { ok: false, error: { code: error && error.code || "PLATFORM_WORKER_FAILED", category: "internal", retryability: "manual-check", userMessage: "投稿执行器未完成" } });
    process.exitCode = 1;
  }
})();
