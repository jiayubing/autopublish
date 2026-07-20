const fs = require("node:fs");

function createBrowserSessionLifecycle(options) {
  const opts = options || {};
  const session = opts.session;
  const run = opts.pwRun;
  const logger = opts.log || function () {};
  const sleep = opts.sleep || function () {};
  const ensureDir = opts.ensureDir || function () {};
  const io = opts.fs || fs;
  if (!session || typeof run !== "function")
    throw new Error("Browser session lifecycle dependencies are required");

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
      logger("Browser daemon already running", "INFO");
      return;
    }
    if (typeof opts.start !== "function")
      throw new Error("Browser daemon start command is unavailable");
    logger("Starting browser daemon...", "WARN");
    try {
      opts.start();
    } catch (error) {
      logger("Daemon start command returned: " + error.message, "WARN");
    }
    for (
      let attempt = 0;
      attempt < Number(opts.maxAttempts || 20);
      attempt += 1
    ) {
      sleep(Number(opts.pollMs || 1500));
      if (isAlive()) {
        logger("Browser daemon ready", "INFO");
        return;
      }
    }
    throw new Error("Failed to start browser daemon");
  }

  function loadSavedState() {
    if (!io.existsSync(session.stateFile)) return false;
    run("state-load " + opts.quoteArg(session.stateFile), {
      timeout: 20000,
      session: session,
    });
    logger("Loaded saved login state", "INFO");
    return true;
  }

  function saveState() {
    ensureDir(opts.stateDir);
    run("state-save " + opts.quoteArg(session.stateFile), {
      timeout: 20000,
      session: session,
    });
    logger("Saved login state", "INFO");
  }

  function close() {
    try {
      saveState();
    } catch (error) {
      logger(
        "Failed to save login state before close: " + error.message,
        "WARN",
      );
    }
    try {
      run("close", { timeout: 15000, session: session });
      logger("Browser session closed", "INFO");
    } catch (error) {
      logger("Failed to close browser session: " + error.message, "WARN");
    }
  }

  return { isAlive, ensureStarted, loadSavedState, saveState, close };
}

module.exports = { createBrowserSessionLifecycle };
