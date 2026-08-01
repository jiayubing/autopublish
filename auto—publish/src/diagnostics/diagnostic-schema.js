"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

const CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,127}$/;
const TOKEN_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CATEGORIES = new Set([
  "validation",
  "authentication",
  "transport",
  "remote",
  "storage",
  "conflict",
  "internal",
]);

const METADATA_RULES = Object.freeze({
  platformId: "token",
  sourcePlatformId: "token",
  targetPlatformId: "token",
  accountProfileId: "token",
  operation: "token",
  phase: "token",
  state: "token",
  status: "token",
  outcome: "token",
  errorCode: "token",
  reasonCode: "token",
  category: "token",
  capability: "token",
  action: "token",
  source: "token",
  transport: "token",
  channel: "token",
  session: "token",
  taskKind: "token",
  failureKind: "token",
  taskCount: "number",
  itemCount: "number",
  attempt: "number",
  durationMs: "number",
  waitMs: "number",
  httpStatus: "number",
  queueRevision: "number",
  skippedCount: "number",
  failedCount: "number",
  uncertainCount: "number",
  successCount: "number",
  recordCount: "number",
  fileCount: "number",
  bytes: "number",
  rotatedCount: "number",
});

const SAFE_METADATA_KEYS = Object.freeze(Object.keys(METADATA_RULES));

function diagnosticError(code) {
  const error = new Error("Diagnostic record is invalid");
  error.code = code;
  return error;
}

function plainObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype,
  );
}

function isAbsolutePath(value) {
  return (
    path.isAbsolute(value) ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    /^\\\\/.test(value) ||
    /^(?:file|https?):\/\//i.test(value)
  );
}

function unsafeText(value) {
  return (
    /[\x00-\x1f\x7f]/.test(value) ||
    isAbsolutePath(value) ||
    /[\\/]/.test(value) ||
    /<[^>]{1,256}>/.test(value) ||
    /\b(?:document|window|querySelector|innerHTML|outerHTML)\b/i.test(value) ||
    /(?:cookie\s*:|api[-_ ]?key\s*[:=]|authorization\s*[:=]|bearer\s+|password\s*[:=]|secret\s*[:=]|(?:account\s*(?:name|display)|display\s*name|账号(?:显示名|名称)?|用户名)\s*[:=])/i.test(value) ||
    /(?:stack\s*trace|\bat\s+[^\s]+:\d+:\d+)/i.test(value)
  );
}

function isSafeDiagnosticText(value, max = 256) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max &&
    !unsafeText(value)
  );
}

function safeToken(value, max, code) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > max ||
    !TOKEN_PATTERN.test(value) ||
    value === "." ||
    value === ".."
  )
    throw diagnosticError(code || "DIAGNOSTIC_TOKEN_INVALID");
  return value;
}

function safeOpaque(value, max, code) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > max ||
    !ID_PATTERN.test(value) ||
    value === "." ||
    value === ".." ||
    unsafeText(value)
  )
    throw diagnosticError(code || "DIAGNOSTIC_TOKEN_INVALID");
  return value;
}

function safeDiagnosticId(value) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    !ID_PATTERN.test(value) ||
    value === "." ||
    value === ".."
  )
    return false;
  return !unsafeText(value);
}

function normalizeOccurredAt(value, now) {
  const candidate = value === undefined ? (now || new Date()) : value;
  const date = candidate instanceof Date ? candidate : new Date(candidate);
  if (!(date instanceof Date) || Number.isNaN(date.getTime()))
    throw diagnosticError("DIAGNOSTIC_TIME_INVALID");
  return date.toISOString();
}

function normalizeMetadata(value) {
  const input = value === undefined ? {} : value;
  if (!plainObject(input)) throw diagnosticError("DIAGNOSTIC_METADATA_INVALID");
  const keys = Object.keys(input);
  if (keys.length > 16) throw diagnosticError("DIAGNOSTIC_METADATA_LIMIT");
  const output = {};
  keys.forEach(function (key) {
    const rule = METADATA_RULES[key];
    if (!rule) throw diagnosticError("DIAGNOSTIC_METADATA_KEY_INVALID");
    const item = input[key];
    if (rule === "number") {
      if (!Number.isFinite(item) || Math.abs(item) > 1e12)
        throw diagnosticError("DIAGNOSTIC_METADATA_VALUE_INVALID");
      output[key] = item;
      return;
    }
    if (typeof item !== "string" || item.length > 128 || unsafeText(item))
      throw diagnosticError("DIAGNOSTIC_METADATA_VALUE_INVALID");
    output[key] = safeToken(item, 128, "DIAGNOSTIC_METADATA_VALUE_INVALID");
  });
  return Object.freeze(output);
}

function opaqueId(prefix) {
  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString("hex");
  return prefix + id;
}

function exactInput(input) {
  if (!plainObject(input)) throw diagnosticError("DIAGNOSTIC_RECORD_INVALID");
  const allowed = new Set([
    "diagnosticId",
    "occurredAt",
    "code",
    "module",
    "category",
    "operationId",
    "runId",
    "metadata",
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key)))
    throw diagnosticError("DIAGNOSTIC_RECORD_FIELD_INVALID");
}

function createDiagnosticRecord(input, options) {
  const value = input || {};
  const opts = options || {};
  exactInput(value);
  const diagnosticId = value.diagnosticId === undefined
    ? opaqueId("diag-")
    : value.diagnosticId;
  if (!safeDiagnosticId(diagnosticId))
    throw diagnosticError("DIAGNOSTIC_ID_INVALID");
  const code = safeToken(value.code, 128, "DIAGNOSTIC_CODE_INVALID");
  if (!CODE_PATTERN.test(code)) throw diagnosticError("DIAGNOSTIC_CODE_INVALID");
  const module = safeToken(value.module, 128, "DIAGNOSTIC_MODULE_INVALID");
  const category = value.category === undefined ? "internal" : value.category;
  if (typeof category !== "string" || !CATEGORIES.has(category))
    throw diagnosticError("DIAGNOSTIC_CATEGORY_INVALID");
  const operationId = value.operationId === undefined
    ? opaqueId("op-")
    : safeOpaque(value.operationId, 128, "DIAGNOSTIC_OPERATION_INVALID");
  let runId = null;
  if (value.runId !== undefined && value.runId !== null)
    runId = safeOpaque(value.runId, 128, "DIAGNOSTIC_RUN_INVALID");
  const occurredAt = normalizeOccurredAt(value.occurredAt, opts.now);
  const metadata = normalizeMetadata(value.metadata);
  return Object.freeze({
    diagnosticId,
    occurredAt,
    code,
    module,
    category,
    operationId,
    runId,
    metadata,
  });
}

function parseDiagnosticRecord(value) {
  return createDiagnosticRecord(value, { now: value && value.occurredAt });
}

module.exports = {
  CATEGORIES,
  CODE_PATTERN,
  ID_PATTERN,
  METADATA_RULES,
  SAFE_METADATA_KEYS,
  diagnosticError,
  isAbsolutePath,
  isSafeDiagnosticId: safeDiagnosticId,
  createDiagnosticRecord,
  parseDiagnosticRecord,
  normalizeMetadata,
  isSafeDiagnosticText,
  safeOpaque,
  safeToken,
};
