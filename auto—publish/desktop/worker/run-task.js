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
      const { createQueueSnapshot } = require("../../src/app/publish-batch");
      const options = process.argv[3] ? JSON.parse(process.argv[3]) : {};
      send("result", { ok: true, data: createQueueSnapshot(options) });
      return;
    }

    if (task === "batch") {
      const { clearStopSignal } = require("../../src/core/stop-signal");
      const { subscribe } = require("../../src/core/logger");
      const { runPublicationBatch } = require("../../src/app/publish-batch");
      clearStopSignal();
      const options = process.argv[3] ? JSON.parse(process.argv[3]) : {};
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
      const { loadPlatforms } = require("../../src/core/platforms");
      const { createPlatformWorkbenchService } = require("../services/platform-workbench-service");
      const { subscribe } = require("../../src/core/logger");
      const { clearStopSignal } = require("../../src/core/stop-signal");
      const rootDir = require("path").resolve(__dirname, "..", "..");
      const options = process.argv[3] ? JSON.parse(process.argv[3]) : {};
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

        var servicePlatforms = loadedPlatforms.map(function(platform) {
          return { id: platform.id, scanDir: platform.scanDir };
        });

        const service = createPlatformWorkbenchService({
          rootDir: rootDir,
          platforms: servicePlatforms,
          adapters: adapters
        });

        const result = await service.submitSelectedPlanSerially(plan, submitOptions);
        result.skipped = result.skipped || result.pending || 0;
        send("result", { ok: true, data: result });
      } catch (error) {
        send("result", { ok: false, error: error.message });
      } finally {
        unsubscribe();
        try {
          const loadedPlatforms = require("../../src/core/platforms").loadPlatforms();
          loadedPlatforms.forEach(function(platform) {
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