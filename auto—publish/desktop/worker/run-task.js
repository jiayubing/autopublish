const task = process.argv[2];
const path = require("node:path");
var activeRunId = null;
var resultDisconnectScheduled = false;
const WORKER_SCHEMA_VERSION = 1;

if (!task) {
  process.exit(1);
}

function send(type, payload) {
  if (typeof process.send === "function") {
    var message = {
      schemaVersion: WORKER_SCHEMA_VERSION,
      runId: activeRunId,
      type,
      payload,
    };
    process.send(message);
    if (type === "result" && !resultDisconnectScheduled) {
      resultDisconnectScheduled = true;
      // The IPC channel itself is an active handle in a forked worker. Once
      // the final result is queued, close that channel so PlatformRun can
      // observe child exit and publish the terminal state to the renderer.
      setImmediate(function () {
        try {
          if (typeof process.disconnect === "function" && process.connected)
            process.disconnect();
        } catch (_) {
          // IPC disconnect is best-effort cleanup after the result is queued.
          reportWorkerDiagnostic(
            "PLATFORM_WORKER_DISCONNECT_FAILED",
            "cleanup",
            "result-disconnect",
            { action: "disconnect" },
          );
        }
      });
    }
    return;
  }

  if (type === "result")
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
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
    AUTO_PUBLISH_PLAYWRIGHT_STATE_DIR:
      paths.browser && path.join(paths.browser, "state"),
    AUTO_PUBLISH_NODE_EXEC_PATH: paths.playwrightNodeExecPath,
    PLAYWRIGHT_CLI_JS: paths.playwrightCliJs,
    BROWSER_CHANNEL: paths.browserChannel,
    AUTO_PUBLISH_APP_ROOT: paths.installation,
    AUTO_PUBLISH_PACKAGED: process.env.AUTO_PUBLISH_PACKAGED || "0",
  };
  Object.keys(values).forEach(function (key) {
    if (values[key]) process.env[key] = values[key];
  });
}

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

    throw new Error("Unsupported desktop worker task: " + task);
  } catch (error) {
    send("result", {
      ok: false,
      error: {
        code: (error && error.code) || "PLATFORM_WORKER_FAILED",
        category: "internal",
        retryability: "manual-check",
        userMessage: "投稿执行器未完成",
      },
    });
    process.exitCode = 1;
  }
})();
