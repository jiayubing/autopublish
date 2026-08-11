"use strict";

const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const {
  reportDiagnostic,
} = require("../../../diagnostics/diagnostic-producer");

function recoveryGuardPath(filename) {
  return path.join(path.dirname(filename), "recovery.guard.db");
}

function guardFailure(code, cause) {
  const error = new Error(code);
  error.code = code;
  error.cause = cause;
  return error;
}

function reportGuardCleanupFailure(phase, failureKind) {
  reportDiagnostic({
    code: "OPERATIONAL_RECOVERY_GUARD_CLEANUP_FAILED",
    module: "operational-store-recovery-guard",
    category: "storage",
    metadata: { operation: "recovery-guard", phase, failureKind },
  });
}

function isDatabaseBusy(error) {
  return Boolean(error && /database is locked/i.test(String(error.message)));
}

function isRecoveryGuardBusy(error) {
  return Boolean(
    error &&
    (error.code === "OPERATIONAL_RECOVERY_GUARD_BUSY" || isDatabaseBusy(error)),
  );
}

function withRecoveryGuard(filename, callback, busyTimeoutMs = 0) {
  let db;
  try {
    db = new DatabaseSync(recoveryGuardPath(filename));
    const timeout =
      Number.isInteger(busyTimeoutMs) && busyTimeoutMs >= 0 ? busyTimeoutMs : 0;
    db.exec(`PRAGMA busy_timeout = ${timeout}`);
    db.exec("BEGIN IMMEDIATE");
  } catch (error) {
    let cleanupError = null;
    try {
      if (db) db.close();
    } catch (_) {
      cleanupError = guardFailure("OPERATIONAL_RECOVERY_GUARD_CLOSE_FAILED");
      reportGuardCleanupFailure("open", "close");
    }
    const failure = guardFailure(
      isDatabaseBusy(error)
        ? "OPERATIONAL_RECOVERY_GUARD_BUSY"
        : "OPERATIONAL_RECOVERY_GUARD_UNAVAILABLE",
      error,
    );
    if (cleanupError) failure.cleanupCode = cleanupError.code;
    throw failure;
  }

  let result;
  let callbackError = null;
  try {
    result = callback();
  } catch (error) {
    callbackError = error;
  }

  let cleanupError = null;
  try {
    db.exec("ROLLBACK");
  } catch (_) {
    cleanupError = guardFailure("OPERATIONAL_RECOVERY_GUARD_ROLLBACK_FAILED");
    reportGuardCleanupFailure("close", "rollback");
  }
  try {
    db.close();
  } catch (_) {
    if (!cleanupError)
      cleanupError = guardFailure("OPERATIONAL_RECOVERY_GUARD_CLOSE_FAILED");
    reportGuardCleanupFailure("close", "close");
  }

  if (callbackError) {
    if (cleanupError && !callbackError.cleanupCode)
      callbackError.cleanupCode = cleanupError.code;
    throw callbackError;
  }
  if (cleanupError) throw cleanupError;
  return result;
}

module.exports = {
  isRecoveryGuardBusy,
  recoveryGuardPath,
  withRecoveryGuard,
};
