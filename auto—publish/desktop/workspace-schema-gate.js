"use strict";

const fs = require("node:fs");

const WORKSPACE_MARKER_FILE = ".autopublish-workspace.json";
const CURRENT_WORKSPACE_SCHEMA_VERSION = 1;

function gateError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function invalidResult(code, message) {
  return {
    allowed: false,
    status: "rejected",
    code,
    message,
    marker: null,
  };
}

function parseMarker(value, currentVersion) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "createdAt,version" ||
    value.version !== currentVersion ||
    typeof value.createdAt !== "string" ||
    value.createdAt.trim() === ""
  ) {
    return null;
  }
  const timestamp = new Date(value.createdAt);
  if (
    Number.isNaN(timestamp.getTime()) ||
    timestamp.toISOString() !== value.createdAt
  ) {
    return null;
  }
  return { version: value.version, createdAt: value.createdAt };
}

function readWorkspaceSchemaMarker(markerPath, options) {
  const opts = options || {};
  const io = opts.fs || fs;
  if (
    typeof markerPath !== "string" ||
    markerPath.trim() === "" ||
    markerPath.includes("\0")
  ) {
    return invalidResult(
      "WORKSPACE_SCHEMA_MARKER_INVALID",
      "Workspace schema marker is invalid",
    );
  }
  let stat;
  try {
    stat = io.lstatSync(markerPath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        allowed: true,
        status: "missing",
        code: null,
        message: null,
        marker: null,
      };
    }
    return invalidResult(
      "WORKSPACE_SCHEMA_MARKER_UNAVAILABLE",
      "Workspace schema marker is unavailable",
    );
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    return invalidResult(
      "WORKSPACE_SCHEMA_MARKER_INVALID",
      "Workspace schema marker is invalid",
    );
  }
  let value;
  try {
    value = JSON.parse(io.readFileSync(markerPath, "utf8"));
  } catch (_) {
    return invalidResult(
      "WORKSPACE_SCHEMA_MARKER_INVALID",
      "Workspace schema marker is invalid",
    );
  }
  return evaluateWorkspaceSchema(value, opts);
}

function evaluateWorkspaceSchema(marker, options) {
  const opts = options || {};
  const currentVersion = Number.isSafeInteger(opts.currentVersion)
    ? opts.currentVersion
    : CURRENT_WORKSPACE_SCHEMA_VERSION;
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 1) {
    throw gateError(
      "WORKSPACE_SCHEMA_GATE_INVALID",
      "Current workspace schema version is invalid",
    );
  }
  if (marker === null || marker === undefined) {
    return {
      allowed: true,
      status: "missing",
      code: null,
      message: null,
      marker: null,
    };
  }
  if (typeof marker !== "object" || Array.isArray(marker)) {
    return invalidResult(
      "WORKSPACE_SCHEMA_MARKER_INVALID",
      "Workspace schema marker is invalid",
    );
  }
  const version = marker.version;
  if (!Number.isSafeInteger(version) || version < 1) {
    return invalidResult(
      "WORKSPACE_SCHEMA_MARKER_INVALID",
      "Workspace schema marker is invalid",
    );
  }
  if (version > currentVersion) {
    return {
      allowed: false,
      status: "future",
      code: "WORKSPACE_SCHEMA_FUTURE",
      message: "Workspace schema is newer than this application supports",
      marker: { version },
    };
  }
  if (version < currentVersion) {
    return {
      allowed: false,
      status: "older",
      code: "WORKSPACE_SCHEMA_OLDER_UNSUPPORTED",
      message: "Workspace schema requires an explicit upgrade",
      marker: { version },
    };
  }
  const parsed = parseMarker(marker, currentVersion);
  if (!parsed) {
    return invalidResult(
      "WORKSPACE_SCHEMA_MARKER_INVALID",
      "Workspace schema marker is invalid",
    );
  }
  return {
    allowed: true,
    status: "supported",
    code: null,
    message: null,
    marker: parsed,
  };
}

function assertWorkspaceSchema(markerPath, options) {
  const result = readWorkspaceSchemaMarker(markerPath, options);
  if (!result.allowed) throw gateError(result.code, result.message);
  return result;
}

module.exports = {
  WORKSPACE_MARKER_FILE,
  CURRENT_WORKSPACE_SCHEMA_VERSION,
  readWorkspaceSchemaMarker,
  evaluateWorkspaceSchema,
  assertWorkspaceSchema,
};
