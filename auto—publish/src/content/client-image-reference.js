const path = require("node:path");

function imageReferenceError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function encode(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decode(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padding = "=".repeat((4 - (value.length % 4)) % 4);
    return Buffer.from(
      value.replace(/-/g, "+").replace(/_/g, "/") + padding,
      "base64",
    ).toString("utf8");
  } catch (_) {
    return null;
  }
}

function normalizeRelativePath(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw imageReferenceError(
      "CLIENT_IMAGE_REFERENCE_INVALID",
      "Image reference path is invalid",
    );
  }
  const normalized = value.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (
    !parts.length ||
    parts.some(function (part) {
      return !part || part === "." || part === "..";
    }) ||
    normalized.startsWith("/") ||
    path.win32.isAbsolute(normalized) ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.includes("\0")
  ) {
    throw imageReferenceError(
      "CLIENT_IMAGE_REFERENCE_INVALID",
      "Image reference path is invalid",
    );
  }
  return parts.join("/");
}

function imageIdForRelativePath(relativePath) {
  return "client-image:" + encode(normalizeRelativePath(relativePath));
}

function relativePathForImageId(imageId) {
  if (typeof imageId !== "string" || !imageId.startsWith("client-image:"))
    return null;
  const decoded = decode(imageId.slice("client-image:".length));
  if (!decoded) return null;
  try {
    return normalizeRelativePath(decoded);
  } catch (_) {
    return null;
  }
}

function isSafeRelativePath(value) {
  try {
    normalizeRelativePath(value);
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  imageIdForRelativePath,
  relativePathForImageId,
  normalizeRelativePath,
  isSafeRelativePath,
  imageReferenceError,
  pathSeparator: path.sep,
};
