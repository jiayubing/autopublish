const fs = require("node:fs");
const { reportDiagnostic } = require("../../diagnostics/diagnostic-producer");

function createBrowserSessionLifecycle(options) {
  const opts = options || {};
  const session = opts.session;
  const run = opts.pwRun;
  const sleep = opts.sleep || function () {};
  const ensureDir = opts.ensureDir || function () {};
  const io = opts.fs || fs;
  if (!session || typeof run !== "function")
    throw new Error("Browser session lifecycle dependencies are required");

  function diagnose(code, category, operation) {
    reportDiagnostic({
      code,
      module: "browser-session",
      category,
      operationId: operation || "browser-session",
      metadata: { session: session.session, action: operation || "lifecycle" },
    });
  }

  function isAlive() {
    try {
      return (
        run("list", { timeout: 8000, session: session }).indexOf(
          session.session,
        ) !== -1
      );
    } catch (_) {
      return false;
    }
  }

  function ensureStarted() {
    if (isAlive()) {
      diagnose("BROWSER_SESSION_ALREADY_RUNNING", "transport", "ensure");
      return;
    }
    if (typeof opts.start !== "function")
      throw new Error("Browser daemon start command is unavailable");
    diagnose("BROWSER_SESSION_STARTING", "transport", "start");
    try {
      opts.start();
    } catch (error) {
      diagnose("BROWSER_SESSION_START_FAILED", "transport", "start");
    }
    for (
      let attempt = 0;
      attempt < Number(opts.maxAttempts || 20);
      attempt += 1
    ) {
      sleep(Number(opts.pollMs || 1500));
      if (isAlive()) {
        diagnose("BROWSER_SESSION_READY", "transport", "ready");
        return;
      }
    }
    diagnose("BROWSER_SESSION_START_TIMEOUT", "transport", "start");
    throw new Error("Failed to start browser daemon");
  }

  function loadSavedState() {
    if (!io.existsSync(session.stateFile)) return false;
    run("state-load " + opts.quoteArg(session.stateFile), {
      timeout: 20000,
      session: session,
    });
    diagnose("BROWSER_SESSION_STATE_LOADED", "authentication", "state-load");
    return true;
  }

  function saveState() {
    ensureDir(opts.stateDir);
    run("state-save " + opts.quoteArg(session.stateFile), {
      timeout: 20000,
      session: session,
    });
    diagnose("BROWSER_SESSION_STATE_SAVED", "authentication", "state-save");
  }

  function close() {
    try {
      saveState();
    } catch (error) {
      diagnose("BROWSER_SESSION_STATE_SAVE_FAILED", "storage", "state-save");
    }
    try {
      run("close", { timeout: 15000, session: session });
      diagnose("BROWSER_SESSION_CLOSED", "transport", "close");
    } catch (error) {
      diagnose("BROWSER_SESSION_CLOSE_FAILED", "transport", "close");
    }
  }

  return { isAlive, ensureStarted, loadSavedState, saveState, close };
}

module.exports = { createBrowserSessionLifecycle };
