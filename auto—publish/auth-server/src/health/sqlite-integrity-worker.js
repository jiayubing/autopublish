const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const { isMainThread, parentPort, workerData } = require("node:worker_threads");
const { verifySchemaOnly, verifyIntegrity } = require("../auth-database-verifier");
const { diagnoseMaintenance, normalizeMaintenancePolicy } = require("./maintenance-diagnostics");
const { classifyHealthError } = require("./health-diagnostic-mapper");

function codedError(code) {
  const error = new Error("integrity check failed");
  error.code = code;
  return error;
}

function sidecarBytes(filePath, suffix) {
  try {
    const stat = fs.statSync(`${filePath}${suffix}`);
    return stat.isFile() ? stat.size : 0;
  } catch (error) {
    if (error && error.code === "ENOENT") return 0;
    throw codedError("AUTH_HEALTH_CAPACITY_DIAGNOSTIC_FAILED");
  }
}

function databaseBytes(filePath) {
  let stat;
  try { stat = fs.statSync(filePath); } catch (_) { throw codedError("AUTH_HEALTH_DATABASE_UNAVAILABLE"); }
  if (!stat.isFile()) throw codedError("AUTH_HEALTH_DATABASE_UNAVAILABLE");
  return { databaseBytes: stat.size, walBytes: sidecarBytes(filePath, "-wal"), shmBytes: sidecarBytes(filePath, "-shm") };
}

function runIntegrityChecks(options) {
  const opts = options || {};
  if (!opts.filePath || opts.filePath === ":memory:" || String(opts.filePath).startsWith("file:")) throw codedError("AUTH_HEALTH_CHECK_INPUT_INVALID");
  const size = databaseBytes(opts.filePath);
  let db;
  try {
    db = new DatabaseSync(opts.filePath, { readOnly: true });
    verifySchemaOnly(db);
    try { verifyIntegrity(db); } catch (error) {
      throw codedError(error && error.code === "AUTH_DB_CORRUPT" ? "AUTH_HEALTH_DATABASE_CORRUPT" : "AUTH_HEALTH_INTEGRITY_FAILED");
    }
    let oldestAuditAt = null;
    try {
      const row = db.prepare("SELECT MIN(created_at) AS oldest_created_at FROM audit_events").get();
      oldestAuditAt = row && row.oldest_created_at ? row.oldest_created_at : null;
    } catch (_) {
      throw codedError("AUTH_HEALTH_AUDIT_MAINTENANCE_FAILED");
    }
    return diagnoseMaintenance({
      oldestAuditAt,
      nowMs: opts.nowMs,
      policy: normalizeMaintenancePolicy(opts.policy),
      databaseBytes: size.databaseBytes,
      walBytes: size.walBytes,
      shmBytes: size.shmBytes,
    });
  } finally {
    if (db) {
      try { db.close(); } catch (_) { /* preserve the check result */ }
    }
  }
}

if (!isMainThread) {
  try {
    parentPort.postMessage({ type: "result", result: runIntegrityChecks(workerData) });
  } catch (error) {
    parentPort.postMessage({ type: "error", code: classifyHealthError(error).code });
  }
}

module.exports = { runIntegrityChecks };
