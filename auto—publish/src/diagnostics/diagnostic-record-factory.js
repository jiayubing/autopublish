"use strict";

const crypto = require("node:crypto");
const {
  CATEGORIES,
  CODE_PATTERN,
  RECORD_FIELDS,
  diagnosticError,
  plainObject,
  isSafeDiagnosticId,
  safeOpaque,
  safeToken,
  normalizeOccurredAt,
  normalizeMetadata,
} = require("./diagnostic-contract");

function opaqueId(prefix) {
  const id =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString("hex");
  return prefix + id;
}

function exactInput(input) {
  if (!plainObject(input)) throw diagnosticError("DIAGNOSTIC_RECORD_INVALID");
  if (Object.keys(input).some((key) => !RECORD_FIELDS.includes(key)))
    throw diagnosticError("DIAGNOSTIC_RECORD_FIELD_INVALID");
}

function createDiagnosticRecord(input, options) {
  const value = input || {};
  const opts = options || {};
  exactInput(value);
  const diagnosticId =
    value.diagnosticId === undefined ? opaqueId("diag-") : value.diagnosticId;
  if (!isSafeDiagnosticId(diagnosticId))
    throw diagnosticError("DIAGNOSTIC_ID_INVALID");
  const code = safeToken(value.code, 128, "DIAGNOSTIC_CODE_INVALID");
  if (!CODE_PATTERN.test(code))
    throw diagnosticError("DIAGNOSTIC_CODE_INVALID");
  const module = safeToken(value.module, 128, "DIAGNOSTIC_MODULE_INVALID");
  const category = value.category === undefined ? "internal" : value.category;
  if (typeof category !== "string" || !CATEGORIES.has(category))
    throw diagnosticError("DIAGNOSTIC_CATEGORY_INVALID");
  const operationId =
    value.operationId === undefined
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

module.exports = { createDiagnosticRecord, parseDiagnosticRecord };
