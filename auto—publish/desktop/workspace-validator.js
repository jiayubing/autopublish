const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const WORKSPACE_MARKER_FILE = ".autopublish-workspace.json";

function invalid(code, message, candidatePath) {
  const result = { kind: "invalid", path: candidatePath || null, error: { code: code, message: message } };
  return result;
}

function isWithin(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

function isRelated(first, second) {
  return isWithin(first, second) || isWithin(second, first);
}

function canonicalPath(io, value) {
  if (typeof value !== "string" || value.trim() === "" || value.includes("\0")) return null;
  const normalized = path.resolve(value);
  try {
    return io.realpathSync(normalized);
  } catch (error) {
    return normalized;
  }
}

function defaultSystemPaths() {
  if (process.platform !== "win32") return [];
  const systemDrive = process.env.SystemDrive || "C:\\";
  return [
    process.env.WINDIR,
    process.env.SystemRoot,
    path.join(systemDrive, "Windows"),
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.ProgramData,
    path.join(systemDrive, "ProgramData")
  ].filter(Boolean);
}

function validateMarker(io, markerPath) {
  let markerStats;
  try {
    markerStats = io.lstatSync(markerPath);
  } catch (error) {
    return { ok: false };
  }
  if (markerStats.isSymbolicLink() || !markerStats.isFile()) return { ok: false };

  let value;
  try {
    value = JSON.parse(io.readFileSync(markerPath, "utf8"));
  } catch (error) {
    return { ok: false };
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false };
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "createdAt" || keys[1] !== "version") return { ok: false };
  if (value.version !== 1 || typeof value.createdAt !== "string" || value.createdAt.trim() === "") return { ok: false };
  const timestamp = new Date(value.createdAt);
  if (Number.isNaN(timestamp.getTime()) || timestamp.toISOString() !== value.createdAt) return { ok: false };
  return { ok: true, value: { version: 1, createdAt: value.createdAt } };
}

function createWorkspaceValidator(options) {
  options = options || {};
  const io = options.fs || fs;
  const markerFileName = options.markerFileName || WORKSPACE_MARKER_FILE;
  const userDataPath = canonicalPath(io, options.userDataPath);
  const applicationPaths = [options.appPath, options.applicationPath, options.installPath, options.resourcesPath]
    .filter(function(value) { return typeof value === "string" && value.trim() !== ""; })
    .map(function(value) { return canonicalPath(io, value); })
    .filter(Boolean);
  const systemPaths = (options.systemPaths === undefined ? defaultSystemPaths() : options.systemPaths)
    .map(function(value) { return canonicalPath(io, value); })
    .filter(Boolean);

  function isForbidden(candidatePath) {
    if (path.parse(candidatePath).root === candidatePath) return true;
    if (systemPaths.some(function(systemPath) { return isRelated(candidatePath, systemPath); })) return true;
    if (applicationPaths.some(function(applicationPath) { return isRelated(candidatePath, applicationPath); })) return true;
    if (userDataPath && isWithin(candidatePath, userDataPath)) return true;
    return false;
  }

  function isWritable(candidatePath) {
    const probePath = path.join(
      candidatePath,
      ".autopublish-write-probe-" + process.pid + "-" + crypto.randomBytes(16).toString("hex") + ".tmp"
    );
    let descriptor = null;
    try {
      descriptor = io.openSync(probePath, "wx", 0o600);
      io.closeSync(descriptor);
      descriptor = null;
      io.unlinkSync(probePath);
      return true;
    } catch (error) {
      if (descriptor !== null) {
        try { io.closeSync(descriptor); } catch (closeError) { /* best effort cleanup */ }
      }
      try { io.unlinkSync(probePath); } catch (cleanupError) { /* best effort cleanup */ }
      return false;
    }
  }

  function validate(candidate) {
    if (typeof candidate !== "string" || candidate.trim() === "" || candidate.includes("\0")) {
      return invalid("WORKSPACE_PATH_INVALID", "Workspace path is invalid");
    }
    const normalized = path.resolve(candidate);
    let realPath;
    try {
      realPath = io.realpathSync(normalized);
    } catch (error) {
      return invalid("WORKSPACE_PATH_INVALID", "Workspace path is invalid");
    }
    if (typeof realPath !== "string" || !path.isAbsolute(realPath)) {
      return invalid("WORKSPACE_PATH_INVALID", "Workspace path is invalid");
    }
    if (isForbidden(realPath)) {
      return invalid("WORKSPACE_PATH_FORBIDDEN", "Workspace path is forbidden", realPath);
    }

    try {
      if (!io.statSync(realPath).isDirectory()) {
        return invalid("WORKSPACE_PATH_INVALID", "Workspace path is invalid", realPath);
      }
    } catch (error) {
      return invalid("WORKSPACE_PATH_INVALID", "Workspace path is invalid", realPath);
    }
    if (!isWritable(realPath)) {
      return invalid("WORKSPACE_NOT_WRITABLE", "Workspace path is not writable", realPath);
    }

    let entries;
    try {
      entries = io.readdirSync(realPath);
    } catch (error) {
      return invalid("WORKSPACE_PATH_INVALID", "Workspace path is invalid", realPath);
    }
    const markerPath = path.join(realPath, markerFileName);
    if (entries.includes(markerFileName)) {
      const marker = validateMarker(io, markerPath);
      if (!marker.ok) return invalid("WORKSPACE_MARKER_INVALID", "Workspace marker is invalid", realPath);
      return { kind: "existing_workspace", path: realPath, marker: marker.value };
    }
    if (entries.length === 0) return { kind: "empty_directory", path: realPath };
    return { kind: "nonempty_directory", path: realPath };
  }

  return {
    markerFileName: markerFileName,
    validate: validate,
    classify: validate
  };
}

function validateWorkspacePath(candidate, options) {
  return createWorkspaceValidator(options).validate(candidate);
}

module.exports = {
  WORKSPACE_MARKER_FILE,
  createWorkspaceValidator,
  validateWorkspacePath
};
