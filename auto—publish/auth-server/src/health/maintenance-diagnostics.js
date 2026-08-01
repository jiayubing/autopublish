const { HEALTH_CODES } = require("./health-diagnostic-mapper");

const DEFAULT_POLICY = Object.freeze({
  auditRetentionDays: 90,
  auditRotationBytes: 64 * 1024 * 1024,
  databaseWarnBytes: 400 * 1024 * 1024,
  databaseMaxBytes: 512 * 1024 * 1024,
});

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeMaintenancePolicy(policy) {
  const input = policy || {};
  const result = {
    auditRetentionDays: positiveNumber(input.auditRetentionDays, DEFAULT_POLICY.auditRetentionDays),
    auditRotationBytes: positiveNumber(input.auditRotationBytes, DEFAULT_POLICY.auditRotationBytes),
    databaseWarnBytes: positiveNumber(input.databaseWarnBytes, DEFAULT_POLICY.databaseWarnBytes),
    databaseMaxBytes: positiveNumber(input.databaseMaxBytes, DEFAULT_POLICY.databaseMaxBytes),
  };
  if (result.databaseMaxBytes < result.databaseWarnBytes) result.databaseMaxBytes = result.databaseWarnBytes;
  if (result.auditRotationBytes > result.databaseMaxBytes) result.auditRotationBytes = result.databaseMaxBytes;
  return result;
}

function safeTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.length <= 64) return Date.parse(value);
  return Number.NaN;
}

function ageDays(oldestAuditAt, nowMs) {
  if (oldestAuditAt === null || oldestAuditAt === undefined) return null;
  const timestamp = safeTimestamp(oldestAuditAt);
  if (!Number.isFinite(timestamp) || timestamp > nowMs) return null;
  return Math.max(0, Math.floor((nowMs - timestamp) / 86400000));
}

function diagnoseMaintenance(input) {
  const value = input || {};
  const policy = normalizeMaintenancePolicy(value.policy);
  const nowMs = Number.isFinite(Number(value.nowMs)) ? Number(value.nowMs) : Date.now();
  const databaseBytes = Number(value.databaseBytes);
  const walBytes = Number(value.walBytes || 0);
  const shmBytes = Number(value.shmBytes || 0);
  if (![databaseBytes, walBytes, shmBytes].every((item) => Number.isFinite(item) && item >= 0)) {
    return {
      ok: false,
      status: "failed",
      code: HEALTH_CODES.CAPACITY_DIAGNOSTIC_FAILED,
      metadata: { probe: "integrity" },
    };
  }

  const totalBytes = databaseBytes + walBytes + shmBytes;
  const oldestAgeDays = ageDays(value.oldestAuditAt, nowMs);
  const auditRetentionDue = oldestAgeDays !== null && oldestAgeDays > policy.auditRetentionDays;
  const auditRotationDue = totalBytes >= policy.auditRotationBytes;
  const capacityState = totalBytes >= policy.databaseMaxBytes
    ? "exceeded"
    : (totalBytes >= policy.databaseWarnBytes ? "warning" : "normal");
  const attentionCodes = [];
  if (auditRetentionDue) attentionCodes.push(HEALTH_CODES.AUDIT_RETENTION_DUE);
  if (auditRotationDue) attentionCodes.push(HEALTH_CODES.AUDIT_ROTATION_DUE);
  if (capacityState === "warning") attentionCodes.push(HEALTH_CODES.CAPACITY_WARNING);

  const metadata = {
    probe: "integrity",
    databaseBytes: totalBytes,
    databaseWarnBytes: policy.databaseWarnBytes,
    databaseMaxBytes: policy.databaseMaxBytes,
    auditRetentionDays: policy.auditRetentionDays,
    auditRotationBytes: policy.auditRotationBytes,
    auditOldestAgeDays: oldestAgeDays === null ? 0 : oldestAgeDays,
    auditRetentionState: auditRetentionDue ? "due" : "ok",
    auditRotationState: auditRotationDue ? "due" : "ok",
    capacityState,
    attentionCodes,
  };
  if (capacityState === "exceeded") return { ok: false, status: "failed", code: HEALTH_CODES.CAPACITY_EXCEEDED, metadata };
  if (attentionCodes.length) return { ok: true, status: "attention", code: attentionCodes[0], metadata };
  return { ok: true, status: "pass", code: HEALTH_CODES.INTEGRITY_OK, metadata };
}

module.exports = { DEFAULT_POLICY, normalizeMaintenancePolicy, diagnoseMaintenance };
