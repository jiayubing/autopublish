const path = require("node:path");
const { Worker } = require("node:worker_threads");
const { normalizeMaintenancePolicy } = require("./maintenance-diagnostics");

function codedError(code) {
  const error = new Error("integrity check failed");
  error.code = code;
  return error;
}

function runSqliteIntegrityCheck(options) {
  const opts = options || {};
  if (!opts.filePath || opts.filePath === ":memory:" || String(opts.filePath).startsWith("file:")) return Promise.reject(codedError("AUTH_HEALTH_CHECK_INPUT_INVALID"));
  if (opts.signal && opts.signal.aborted) return Promise.reject(codedError("AUTH_HEALTH_INTEGRITY_CANCELLED"));
  const worker = new Worker(path.join(__dirname, "sqlite-integrity-worker.js"), {
    workerData: {
      filePath: opts.filePath,
      nowMs: opts.nowMs,
      policy: normalizeMaintenancePolicy(opts.policy),
    },
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    let abortListener;
    const cleanup = () => {
      if (abortListener && opts.signal) opts.signal.removeEventListener("abort", abortListener);
      worker.removeAllListeners("message");
      worker.removeAllListeners("error");
      worker.removeAllListeners("exit");
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const terminateWith = (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      void worker.terminate().catch(() => {}).finally(() => reject(codedError(code)));
    };
    worker.on("message", (message) => {
      if (!message || message.type !== "result") {
        finish(reject, codedError(message && message.code ? message.code : "AUTH_HEALTH_INTEGRITY_FAILED"));
        return;
      }
      finish(resolve, message.result);
    });
    worker.on("error", () => finish(reject, codedError("AUTH_HEALTH_INTEGRITY_FAILED")));
    worker.on("exit", (exitCode) => {
      if (!settled && exitCode !== 0) finish(reject, codedError("AUTH_HEALTH_INTEGRITY_FAILED"));
    });
    abortListener = () => terminateWith("AUTH_HEALTH_INTEGRITY_CANCELLED");
    if (opts.signal) opts.signal.addEventListener("abort", abortListener, { once: true });
    if (opts.signal && opts.signal.aborted) abortListener();
  });
}

module.exports = { runSqliteIntegrityCheck };
