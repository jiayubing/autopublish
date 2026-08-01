const CATEGORIES = new Set([
  "validation",
  "authentication",
  "transport",
  "remote",
  "storage",
  "conflict",
  "internal",
]);
const RETRYABILITY = new Set(["never", "safe", "manual-check"]);
function dtoError(code) {
  const error = new Error("Operational DTO is invalid");
  error.code = code;
  return error;
}
function exact(input, fields) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw dtoError("DTO_INVALID");
  for (const key of Object.keys(input))
    if (!fields.includes(key)) throw dtoError("DTO_UNKNOWN_FIELD");
}
function safeString(value, max) {
  return (
    typeof value === "string" &&
    value.trim() &&
    value.length <= max &&
    !/[\x00-\x1f\x7f]/.test(value)
  );
}
function safeDiagnosticId(value) {
  return (
    typeof value === "string" &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value) &&
    value !== "." &&
    value !== ".."
  );
}
function parseSafeOperationalError(input) {
  exact(input, [
    "code",
    "category",
    "retryability",
    "userMessage",
    "diagnosticId",
  ]);
  if (
    !safeString(input.code, 128) ||
    !CATEGORIES.has(input.category) ||
    !RETRYABILITY.has(input.retryability) ||
    !safeString(input.userMessage, 512) ||
    (input.diagnosticId !== undefined && !safeDiagnosticId(input.diagnosticId))
  )
    throw dtoError("SAFE_ERROR_INVALID");
  const result = {
    code: input.code.trim(),
    category: input.category,
    retryability: input.retryability,
    userMessage: input.userMessage.trim(),
  };
  if (input.diagnosticId !== undefined)
    result.diagnosticId = input.diagnosticId.trim();
  return Object.freeze(result);
}
module.exports = { parseSafeOperationalError, dtoError, exact, safeString };
