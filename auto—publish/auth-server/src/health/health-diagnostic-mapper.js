const HEALTH_CODES = Object.freeze({
  LIVENESS_OK: "AUTH_LIVE",
  READINESS_OK: "AUTH_READY",
  INTEGRITY_OK: "AUTH_INTEGRITY_OK",
  PROCESS_UNAVAILABLE: "AUTH_HEALTH_PROCESS_UNAVAILABLE",
  DATABASE_UNAVAILABLE: "AUTH_HEALTH_DATABASE_UNAVAILABLE",
  SCHEMA_UNKNOWN: "AUTH_HEALTH_SCHEMA_UNKNOWN",
  SCHEMA_LEGACY: "AUTH_HEALTH_SCHEMA_LEGACY",
  DATABASE_CORRUPT: "AUTH_HEALTH_DATABASE_CORRUPT",
  LOCK_TIMEOUT: "AUTH_HEALTH_LOCK_TIMEOUT",
  CAPACITY_WARNING: "AUTH_HEALTH_CAPACITY_WARNING",
  CAPACITY_EXCEEDED: "AUTH_HEALTH_CAPACITY_EXCEEDED",
  AUDIT_RETENTION_DUE: "AUTH_HEALTH_AUDIT_RETENTION_DUE",
  AUDIT_ROTATION_DUE: "AUTH_HEALTH_AUDIT_ROTATION_DUE",
  AUDIT_MAINTENANCE_FAILED: "AUTH_HEALTH_AUDIT_MAINTENANCE_FAILED",
  CAPACITY_DIAGNOSTIC_FAILED: "AUTH_HEALTH_CAPACITY_DIAGNOSTIC_FAILED",
  INTEGRITY_TIMEOUT: "AUTH_HEALTH_INTEGRITY_TIMEOUT",
  INTEGRITY_CANCELLED: "AUTH_HEALTH_INTEGRITY_CANCELLED",
  INTEGRITY_FAILED: "AUTH_HEALTH_INTEGRITY_FAILED",
  CHECK_INPUT_INVALID: "AUTH_HEALTH_CHECK_INPUT_INVALID",
  CHECK_FAILED: "AUTH_HEALTH_CHECK_FAILED",
});

const CLASSIFICATIONS = Object.freeze({
  [HEALTH_CODES.PROCESS_UNAVAILABLE]: { category: "process", retryable: true },
  [HEALTH_CODES.DATABASE_UNAVAILABLE]: { category: "availability", retryable: true },
  [HEALTH_CODES.SCHEMA_UNKNOWN]: { category: "schema", retryable: false },
  [HEALTH_CODES.SCHEMA_LEGACY]: { category: "schema", retryable: false },
  [HEALTH_CODES.DATABASE_CORRUPT]: { category: "integrity", retryable: false },
  [HEALTH_CODES.LOCK_TIMEOUT]: { category: "lock", retryable: true },
  [HEALTH_CODES.CAPACITY_WARNING]: { category: "capacity", retryable: false },
  [HEALTH_CODES.CAPACITY_EXCEEDED]: { category: "capacity", retryable: false },
  [HEALTH_CODES.AUDIT_RETENTION_DUE]: { category: "audit", retryable: false },
  [HEALTH_CODES.AUDIT_ROTATION_DUE]: { category: "audit", retryable: false },
  [HEALTH_CODES.AUDIT_MAINTENANCE_FAILED]: { category: "audit", retryable: true },
  [HEALTH_CODES.CAPACITY_DIAGNOSTIC_FAILED]: { category: "capacity", retryable: true },
  [HEALTH_CODES.INTEGRITY_TIMEOUT]: { category: "timeout", retryable: true },
  [HEALTH_CODES.INTEGRITY_CANCELLED]: { category: "cancelled", retryable: false },
  [HEALTH_CODES.INTEGRITY_FAILED]: { category: "integrity", retryable: true },
  [HEALTH_CODES.CHECK_INPUT_INVALID]: { category: "input", retryable: false },
  [HEALTH_CODES.CHECK_FAILED]: { category: "unknown", retryable: true },
});

const SAFE_CODES = new Set(Object.values(HEALTH_CODES));
const SAFE_PROBES = new Set(["process-http", "lightweight", "integrity"]);
const SAFE_STATES = new Set(["normal", "warning", "exceeded", "ok", "due"]);

function errorCode(error) {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "";
  return typeof error.code === "string" ? error.code : (typeof error.errorCode === "string" ? error.errorCode : "");
}

function classifyHealthError(error) {
  const code = errorCode(error);
  if (CLASSIFICATIONS[code]) return Object.assign({ code }, CLASSIFICATIONS[code]);

  const message = error && typeof error.message === "string" ? error.message.toLowerCase() : "";
  if (error && error.cause && error.cause !== error) {
    const nested = classifyHealthError(error.cause);
    if (nested.code !== HEALTH_CODES.CHECK_FAILED) return nested;
  }
  if (code === "AUTH_DB_UNKNOWN_SCHEMA" || code === "AUTH_DB_SCHEMA_INVALID") {
    return { code: HEALTH_CODES.SCHEMA_UNKNOWN, category: "schema", retryable: false };
  }
  if (code === "AUTH_DB_LEGACY_SCHEMA") {
    return { code: HEALTH_CODES.SCHEMA_LEGACY, category: "schema", retryable: false };
  }
  if (code === "AUTH_DB_CORRUPT" || code === "SQLITE_NOTADB" || message.includes("not a database") || message.includes("malformed")) {
    return { code: HEALTH_CODES.DATABASE_CORRUPT, category: "integrity", retryable: false };
  }
  if (code === "AUTH_DB_LOCK_TIMEOUT" || code === "SQLITE_BUSY" || code === "SQLITE_LOCKED" || message.includes("database is locked")) {
    return { code: HEALTH_CODES.LOCK_TIMEOUT, category: "lock", retryable: true };
  }
  if (code === "ENOSPC" || code === "SQLITE_FULL" || code === "AUTH_DB_CAPACITY_EXCEEDED") {
    return { code: HEALTH_CODES.CAPACITY_EXCEEDED, category: "capacity", retryable: false };
  }
  if (code === "AUTH_HEALTH_AUDIT_ERROR") {
    return { code: HEALTH_CODES.AUDIT_MAINTENANCE_FAILED, category: "audit", retryable: true };
  }
  if (["AUTH_DB_FILE_NOT_FOUND", "AUTH_DB_NOT_READABLE", "AUTH_DB_OPEN_FAILED", "AUTH_DB_MIGRATION_FAILED", "AUTH_DB_UNAVAILABLE"].includes(code)) {
    return { code: HEALTH_CODES.DATABASE_UNAVAILABLE, category: "availability", retryable: true };
  }
  return { code: HEALTH_CODES.CHECK_FAILED, category: "unknown", retryable: true };
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeMetadata(source) {
  const input = source && typeof source === "object" ? source : {};
  const output = {};
  const numericKeys = [
    "schemaVersion", "durationMs", "timeoutMs", "databaseBytes", "databaseWarnBytes", "databaseMaxBytes",
    "auditRetentionDays", "auditOldestAgeDays", "auditRotationBytes",
  ];
  for (const key of numericKeys) {
    const value = finiteNumber(input[key]);
    if (value !== null) output[key] = value;
  }
  if (SAFE_PROBES.has(input.probe)) output.probe = input.probe;
  if (SAFE_STATES.has(input.capacityState)) output.capacityState = input.capacityState;
  if (SAFE_STATES.has(input.auditRetentionState)) output.auditRetentionState = input.auditRetentionState;
  if (SAFE_STATES.has(input.auditRotationState)) output.auditRotationState = input.auditRotationState;
  if (typeof input.connection === "string" && ["open", "memory"].includes(input.connection)) output.connection = input.connection;
  if (typeof input.cancelled === "boolean") output.cancelled = input.cancelled;
  if (Array.isArray(input.attentionCodes)) {
    const codes = input.attentionCodes.filter((value) => typeof value === "string" && SAFE_CODES.has(value));
    if (codes.length) output.attentionCodes = Array.from(new Set(codes));
  }
  return output;
}

function timestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  return new Date().toISOString();
}

function baseMetadata(context, result) {
  const metadata = safeMetadata((result && result.metadata) || (context && context.metadata));
  const durationMs = finiteNumber(context && context.durationMs);
  if (durationMs !== null) metadata.durationMs = durationMs;
  const timeoutMs = finiteNumber(context && context.timeoutMs);
  if (timeoutMs !== null) metadata.timeoutMs = timeoutMs;
  return metadata;
}

function mapHealthError(error, context) {
  const classification = classifyHealthError(error);
  return {
    ok: false,
    status: "failed",
    code: classification.code,
    category: classification.category,
    retryable: classification.retryable,
    time: timestamp(context && context.time),
    metadata: baseMetadata(context || {}, null),
  };
}

function mapHealthResult(result, context) {
  const details = context || {};
  if (!result || result.ok === false || result.error || result.errorCode) {
    const failureContext = result && result.metadata ? Object.assign({}, details, { metadata: result.metadata }) : details;
    return mapHealthError(result && (result.error || result.errorCode) || result, failureContext);
  }
  const code = SAFE_CODES.has(result.code) ? result.code : (details.operation === "liveness" ? HEALTH_CODES.LIVENESS_OK : HEALTH_CODES.READINESS_OK);
  const classification = CLASSIFICATIONS[code] || { category: details.operation || "health", retryable: false };
  return {
    ok: true,
    status: result.status === "attention" ? "attention" : "ok",
    code,
    category: classification.category,
    retryable: classification.retryable,
    time: timestamp(details.time),
    metadata: baseMetadata(details, result),
  };
}

module.exports = { HEALTH_CODES, classifyHealthError, mapHealthError, mapHealthResult, safeMetadata };
