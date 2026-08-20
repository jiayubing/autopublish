function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
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

function cancellationResolutionFromIntent(value) {
  const parsed = typeof value === "string" ? fromText(value) : value;
  const detail = parsed && parsed.detail;
  const resolution = detail && detail.resolution;
  if (
    !resolution ||
    typeof resolution !== "object" ||
    Array.isArray(resolution) ||
    resolution.status !== "cancelled"
  )
    return null;
  return resolution;
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
    "reasonCode",
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

function isPublicationSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return (
    keys.length === 4 &&
    keys[0] === "articleId" &&
    keys[1] === "body" &&
    keys[2] === "fingerprint" &&
    keys[3] === "title"
  );
}

function rejectSensitive(value) {
  if (
    /(cookie|api[_-]?key|authorization|\"body\"|\"html\"|absolutePath)/i.test(
      JSON.stringify(value, function (key, child) {
        return isPublicationSnapshot(this) &&
          ["articleId", "title", "body", "fingerprint"].includes(key)
          ? undefined
          : child;
      }),
    )
  )
    throw fail("OPERATIONAL_SENSITIVE_FIELD");
}

module.exports = {
  fail,
  safeDisplayText,
  canonicalDisplayPrice,
  iso,
  text,
  fromText,
  cancellationResolutionFromIntent,
  safeOperationalPayload,
  rejectSensitive,
};
