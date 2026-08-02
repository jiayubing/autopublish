"use strict";

const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");

function recoveryGuardPath(filename) {
  return path.join(path.dirname(filename), "recovery.guard.db");
}

function guardFailure(code, cause) {
  const error = new Error(code);
  error.code = code;
  error.cause = cause;
  return error;
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
    try {
      if (db) db.close();
    } catch (_) {}
    throw guardFailure(
      isDatabaseBusy(error)
        ? "OPERATIONAL_RECOVERY_GUARD_BUSY"
        : "OPERATIONAL_RECOVERY_GUARD_UNAVAILABLE",
      error,
    );
  }
  try {
    return callback();
  } finally {
    try {
      db.exec("ROLLBACK");
    } catch (_) {}
    try {
      db.close();
    } catch (_) {}
  }
}

module.exports = {
  isRecoveryGuardBusy,
  recoveryGuardPath,
  withRecoveryGuard,
};
