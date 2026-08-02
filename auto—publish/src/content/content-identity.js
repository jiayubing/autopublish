const crypto = require("node:crypto");
const path = require("node:path");

const WINDOWS_RESERVED_DEVICE = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/;

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function errorFor(factory, code, message) {
  if (typeof factory === "function") return factory(code, message);
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function isWindowsReservedDeviceName(value) {
  const deviceName =
    typeof value === "string"
      ? value
          .split(".")[0]
          .replace(/[ .]+$/g, "")
          .toUpperCase()
      : "";
  return WINDOWS_RESERVED_DEVICE.test(deviceName);
}

function isSafeSegment(value, options) {
  const opts = options || {};
  return (
    typeof value === "string" &&
    value.length > 0 &&
    (!opts.requireTrimmed || value.trim() === value) &&
    (!opts.maxLength || value.length <= opts.maxLength) &&
    value !== "." &&
    value !== ".." &&
    Boolean(value.trim()) &&
    !value.endsWith(" ") &&
    !value.endsWith(".") &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !/[<>:"|?*\u0000-\u001F]/.test(value) &&
    !isWindowsReservedDeviceName(value) &&
    !path.isAbsolute(value) &&
    !path.win32.isAbsolute(value)
  );
}

function assertContentSegment(value, label, options) {
  const opts = options || {};
  if (!isSafeSegment(value, opts)) {
    throw errorFor(
      opts.error,
      opts.code || "CONTENT_IDENTITY_INVALID",
      opts.message || "Invalid " + label,
    );
  }
  return value;
}

function articleIdentity(value, options) {
  const opts = options || {};
  const article = value || {};
  const clientId = article.clientId;
  const articleId =
    article.articleId === undefined ? article.id : article.articleId;
  assertContentSegment(clientId, "client id", {
    error: opts.error,
    code: opts.code || "CONTENT_IDENTITY_INVALID",
  });
  assertContentSegment(articleId, "article id", {
    error: opts.error,
    code: opts.code || "CONTENT_IDENTITY_INVALID",
  });
  return { clientId: clientId, articleId: articleId };
}

function identityKey(value) {
  const identity = articleIdentity(value);
  return identity.clientId + "\u0000" + identity.articleId;
}

function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(function (key) {
          return JSON.stringify(key) + ":" + canonical(value[key]);
        })
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}

function fingerprint(value) {
  return crypto
    .createHash("sha256")
    .update(canonical(value), "utf8")
    .digest("hex");
}

module.exports = {
  clone,
  canonical,
  fingerprint,
  isSafeSegment,
  isWindowsReservedDeviceName,
  assertContentSegment,
  articleIdentity,
  identityKey,
};
