const task = process.argv[2];
var stopRequested = false;

if (!task) {
  console.error("Missing desktop worker task.");
  process.exit(1);
}

function send(type, payload) {
  if (typeof process.send === "function") {
    process.send({ type, payload });
    return;
  }

  if (type === "result") {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (type === "log" && payload && payload.line) {
    console.log(payload.line);
  }
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
    AUTO_PUBLISH_PLAYWRIGHT_STATE_DIR: paths.browser && require("path").join(paths.browser, "state"),
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

  if (message.type === "stop" && !stopRequested) {
    stopRequested = true;
    var ts = new Date().toISOString().replace("T", " ").substring(0, 19);
    send("log", {
      ts: ts,
      level: "WARN",
      message: "Stop requested; the current item will stop at the next safe point",
      line: "[" + ts + "] [WARN] Stop requested; the current item will stop at the next safe point"
    });
    return;
  }

  if (message.type === "pause") {
    // Immediately close all browser sessions to break the current blocking pwRun call
    var ts2 = new Date().toISOString().replace("T", " ").substring(0, 19);
    send("log", {
      ts: ts2,
      level: "WARN",
      message: "Pause requested; closing browser immediately",
      line: "[" + ts2 + "] [WARN] Pause requested; closing browser immediately"
    });
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

    if (task === "batch") {
      const options = process.argv[3] ? JSON.parse(process.argv[3]) : {};
      configureWorkerEnvironment(options.paths);
      const { clearStopSignal } = require("../../src/core/stop-signal");
      const { subscribe } = require("../../src/core/logger");
      const { runPublicationBatch } = require("../../src/app/publish-batch");
      clearStopSignal();
      const unsubscribe = subscribe(function(entry) {
        send("log", entry);
      });

      try {
        const result = await runPublicationBatch(Object.assign({}, options, {
          interactive: false,
          shouldStop: function() {
            return stopRequested;
          }
        }));
        send("result", { ok: true, data: result });
      } finally {
        unsubscribe();
      }
      return;
    }

    if (task === "platform-submit") {
      const options = process.argv[3] ? JSON.parse(process.argv[3]) : {};
      configureWorkerEnvironment(options.paths);
      const { loadPlatforms } = require("../../src/core/platforms");
      const { createPlatformWorkbenchService } = require("../services/platform-workbench-service");
      const { subscribe } = require("../../src/core/logger");
      const { clearStopSignal } = require("../../src/core/stop-signal");
      const rootDir = options.paths && (options.paths.contentLibrary || options.paths.workspaceRoot) || process.env.AUTO_PUBLISH_WORKSPACE || require("path").resolve(__dirname, "..", "..");
      const plan = options.plan || { tasks: [] };
      const submitOptions = options.submitOptions || { autoSubmit: true, interactive: false, closeAfterEach: false, timeoutMs: 90000 };

      clearStopSignal();

      const unsubscribe = subscribe(function(entry) {
        send("log", entry);
      });

      try {
        send("log", {
          ts: new Date().toISOString(),
          level: "INFO",
          message: "Platform publish starting (" + plan.tasks.length + " tasks)",
          line: "[" + new Date().toISOString().replace("T", " ").substring(0, 19) + "] [INFO] Platform publish starting (" + plan.tasks.length + " tasks)"
        });

        const loadedPlatforms = loadPlatforms();
      const adapters = {};
      loadedPlatforms.forEach(function(platform) { adapters[platform.id] = platform; });
      if (adapters.hepan && typeof adapters.hepan.setRuntimeConfig === "function") {
        adapters.hepan.setRuntimeConfig(options.hepanRuntime || null);
      }

        var servicePlatforms = loadedPlatforms.map(function(platform) {
          return { id: platform.id, scanDir: platform.scanDir };
        });

        const service = createPlatformWorkbenchService({
           rootDir: rootDir,
           paths: options.paths,
          platforms: servicePlatforms,
          adapters: adapters
        });

        const result = await service.submitSelectedPlanSerially(plan, Object.assign({}, submitOptions, {
          onTaskState: function(state) {
            send("state", state);
          }
        }));
        result.skipped = result.skipped || result.pending || 0;
        send("result", { ok: true, data: result });
      } catch (error) {
        send("result", { ok: false, error: error.message });
      } finally {
        unsubscribe();
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
    send("result", { ok: false, error: error.message });
    process.exitCode = 1;
  }
})();
