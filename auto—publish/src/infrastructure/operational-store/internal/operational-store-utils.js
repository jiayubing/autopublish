const { URL } = require("node:url");

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function supplierStatusCode(value) {
  const code = typeof value === "number" ? String(value) : value;
  return ["0", "1", "2", "4", "9"].includes(code) ? code : null;
}

function supplierObservation(evidence) {
  const value = evidence && evidence.supplierObservation;
  const statusCode = value && supplierStatusCode(value.statusCode);
  if (statusCode)
    return {
      statusCode,
      observedAt: observationTimestamp(value.observedAt),
      publishedAt: observationTimestamp(value.publishedAt),
    };
  return null;
}

function observationTimestamp(value) {
  if (typeof value !== "string" || value.length > 64) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function safeEvidenceUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
      ? url.href
      : null;
  } catch (_) {
    return null;
  }
}

function safeDisplayText(value, max) {
  return typeof value === "string" &&
    value.length <= max &&
    !/[\x00-\x1f\x7f]/.test(value)
    ? value
    : "";
}

function canonicalDisplayPrice(value) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100000000
    ? value
    : null;
}

function iso(clock) {
  const date = new Date(clock());
  if (!Number.isFinite(date.getTime())) throw fail("OPERATIONAL_CLOCK_INVALID");
  return date.toISOString();
}

function text(value) {
  return JSON.stringify(value);
}

function fromText(value) {
  return value ? JSON.parse(value) : null;
}

function safeOperationalPayload(value) {
  const parsed = fromText(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const allowed = [
    "accountProfileId",
    "attemptId",
    "batchItemId",
    "clientId",
    "contentHash",
    "filename",
    "outcomeStatus",
    "quotedPrice",
    "resourceNameSnapshot",
    "sourcePlatformId",
    "systemSubmissionCode",
    "titleSnapshot",
  ];
  return Object.fromEntries(
    allowed
      .filter((key) => Object.prototype.hasOwnProperty.call(parsed, key))
      .map((key) => [key, parsed[key]]),
  );
}

function rejectSensitive(value) {
  if (
    /(cookie|api[_-]?key|authorization|\"body\"|\"html\"|absolutePath)/i.test(
      text(value),
    )
  )
    throw fail("OPERATIONAL_SENSITIVE_FIELD");
}

module.exports = {
  fail,
  supplierStatusCode,
  supplierObservation,
  observationTimestamp,
  safeEvidenceUrl,
  safeDisplayText,
  canonicalDisplayPrice,
  iso,
  text,
  fromText,
  safeOperationalPayload,
  rejectSensitive,
};
