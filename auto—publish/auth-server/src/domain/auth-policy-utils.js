const { AuthError } = require("../auth-errors");

function nowIso(now) {
  return new Date(now()).toISOString();
}

function safeText(value, maxLength) {
  if (value === undefined || value === null) return null;
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeLoginName(value) {
  const loginName = typeof value === "string" ? value.trim() : "";
  if (!loginName || loginName.length > 128)
    throw new AuthError("AUTH_INPUT_INVALID");
  return loginName;
}

function normalizeExpiry(value, required) {
  if (value === null && !required) return null;
  if (value === undefined) {
    if (required) throw new AuthError("AUTH_EXPIRY_REQUIRED");
    return null;
  }
  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp)) throw new AuthError("AUTH_INPUT_INVALID");
  return new Date(timestamp).toISOString();
}

function isExpired(expiresAt, now) {
  return Boolean(expiresAt) && Date.parse(expiresAt) <= now();
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

module.exports = {
  isExpired,
  normalizeExpiry,
  normalizeLoginName,
  nowIso,
  positiveInteger,
  positiveNumber,
  safeText,
};
