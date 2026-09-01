const fs = require("node:fs");
const path = require("node:path");
const { reportDiagnostic } = require("../../diagnostics/diagnostic-producer");

let nextLeaseId = 0;
let nextTemporaryStateId = 0;
const activeStateLeases = new Map();

function lifecycleError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function stateLeaseFilename(stateFile) {
  return path.resolve(stateFile) + ".autopublish-lease";
}

function defaultProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error && error.code === "EPERM");
  }
}

function createStateFileLease(options) {
  const opts = options || {};
  const stateFile = opts.stateFile;
  const io = opts.fs || fs;
  const isProcessAlive = opts.isProcessAlive || defaultProcessAlive;
  if (typeof stateFile !== "string" || !stateFile)
    throw new Error("State-file lease requires a state file");

  const stateKey = path.resolve(stateFile);
  const leaseFile = stateLeaseFilename(stateFile);
  const leaseId = "lease-" + process.pid + "-" + ++nextLeaseId;
  let acquired = false;

  function unavailable() {
    return lifecycleError(
      "BROWSER_SESSION_STATE_LEASE_UNAVAILABLE",
      "Platform session state is in use",
    );
  }

  function lockOwnerIsStale() {
    let data;
    try {
      data = JSON.parse(io.readFileSync(leaseFile, "utf8"));
    } catch (_) {
      return false;
    }
    return (
      data &&
      Number.isSafeInteger(data.pid) &&
      data.pid > 0 &&
      isProcessAlive(data.pid) === false
    );
  }

  function acquire() {
    if (acquired) return;
    if (activeStateLeases.has(stateKey)) throw unavailable();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const descriptor = io.openSync(leaseFile, "wx", 0o600);
        try {
          io.writeFileSync(
            descriptor,
            JSON.stringify({ version: 1, pid: process.pid, leaseId }),
            "utf8",
          );
        } finally {
          io.closeSync(descriptor);
        }
        activeStateLeases.set(stateKey, leaseId);
        acquired = true;
        return;
      } catch (error) {
        if (!error || error.code !== "EEXIST") throw unavailable();
        if (attempt === 0 && lockOwnerIsStale()) {
          try {
            io.unlinkSync(leaseFile);
            continue;
          } catch (_) {
            throw unavailable();
          }
        }
        throw unavailable();
      }
    }
    throw unavailable();
  }

  function release() {
    if (!acquired) return;
    let releaseError = null;
    try {
      io.unlinkSync(leaseFile);
    } catch (error) {
      if (!error || error.code !== "ENOENT") releaseError = error;
    } finally {
      activeStateLeases.delete(stateKey);
      acquired = false;
    }
    if (releaseError)
      throw lifecycleError(
        "BROWSER_SESSION_STATE_LEASE_RELEASE_FAILED",
        "Platform session state lease could not be released",
      );
  }

  return Object.freeze({ acquire, release });
}

function createBrowserSessionLifecycle(options) {
  const opts = options || {};
  const session = opts.session;
  const run = opts.run;
  const sleep = opts.sleep || function () {};
  const ensureDir = opts.ensureDir || function () {};
  const io = opts.fs || fs;
  const stateLease = opts.stateLease || null;
  if (!session || typeof run !== "function")
    throw new Error("Browser session lifecycle dependencies are required");
  let probeFailed = false;

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
      const output = run(["list"], { timeout: 8000, session: session });
      probeFailed = false;
      return output.indexOf(session.session) !== -1;
    } catch (error) {
      // A missing named session is the normal cold-start state. Only unknown
      // probe failures should prevent the lifecycle from starting a session.
      if (error && error.code === "PLAYWRIGHT_SESSION_NOT_OPEN") {
        probeFailed = false;
        return false;
      }
      probeFailed = true;
      diagnose("BROWSER_SESSION_PROBE_FAILED", "transport", "probe");
      return false;
    }
  }

  function probeError() {
    const error = new Error("Browser session status is unavailable");
    error.code = "BROWSER_SESSION_PROBE_FAILED";
    return error;
  }

  function acquireStateLease() {
    if (!stateLease) return;
    ensureDir(opts.stateDir);
    stateLease.acquire();
  }

  function releaseStateLease() {
    if (!stateLease) return;
    try {
      stateLease.release();
    } catch (_) {
      diagnose("BROWSER_SESSION_STATE_LEASE_RELEASE_FAILED", "storage", "lease");
    }
  }

  function ensureStarted() {
    if (isAlive()) {
      acquireStateLease();
      diagnose("BROWSER_SESSION_ALREADY_RUNNING", "transport", "ensure");
      return;
    }
    if (probeFailed) throw probeError();
    if (typeof opts.start !== "function")
      throw new Error("Browser daemon start command is unavailable");
    acquireStateLease();
    diagnose("BROWSER_SESSION_STARTING", "transport", "start");
    try {
      opts.start();
    } catch (error) {
      diagnose("BROWSER_SESSION_START_FAILED", "transport", "start");
      releaseStateLease();
      throw error;
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
      if (probeFailed) {
        releaseStateLease();
        throw probeError();
      }
    }
    diagnose("BROWSER_SESSION_START_TIMEOUT", "transport", "start");
    releaseStateLease();
    throw new Error("Failed to start browser daemon");
  }

  function loadSavedState() {
    acquireStateLease();
    if (!io.existsSync(session.stateFile)) return false;
    run(["state-load", session.stateFile], {
      timeout: 20000,
      session: session,
    });
    diagnose("BROWSER_SESSION_STATE_LOADED", "authentication", "state-load");
    return true;
  }

  function saveState() {
    acquireStateLease();
    ensureDir(opts.stateDir);
    if (opts.atomicStateSave === true) {
      const temporaryStateFile =
        session.stateFile +
        ".tmp-" +
        process.pid +
        "-" +
        ++nextTemporaryStateId;
      let primaryError = null;
      try {
        run(["state-save", temporaryStateFile], {
          timeout: 20000,
          session: session,
        });
        io.renameSync(temporaryStateFile, session.stateFile);
      } catch (_) {
        primaryError = lifecycleError(
          "BROWSER_SESSION_STATE_SAVE_FAILED",
          "Platform session state could not be saved",
        );
      } finally {
        try {
          if (io.existsSync(temporaryStateFile)) io.unlinkSync(temporaryStateFile);
        } catch (_) {
          diagnose("BROWSER_SESSION_STATE_TEMP_CLEANUP_FAILED", "storage", "state-save");
        }
      }
      if (primaryError) throw primaryError;
    } else {
      run(["state-save", session.stateFile], {
        timeout: 20000,
        session: session,
      });
    }
    diagnose("BROWSER_SESSION_STATE_SAVED", "authentication", "state-save");
  }

  function close() {
    try {
      saveState();
    } catch (error) {
      diagnose("BROWSER_SESSION_STATE_SAVE_FAILED", "storage", "state-save");
    }
    try {
      run(["close"], { timeout: 15000, session: session });
      diagnose("BROWSER_SESSION_CLOSED", "transport", "close");
    } catch (error) {
      diagnose("BROWSER_SESSION_CLOSE_FAILED", "transport", "close");
    } finally {
      releaseStateLease();
    }
  }

  return { isAlive, ensureStarted, loadSavedState, saveState, close };
}

module.exports = {
  createBrowserSessionLifecycle,
  createStateFileLease,
  stateLeaseFilename,
};
