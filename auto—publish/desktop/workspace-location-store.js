const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const WORKSPACE_LOCATION_FILE = "workspace-location.json";

function resultError(code, message) {
  return { code: code, message: message };
}

function invalidUserDataResult() {
  return { ok: false, error: resultError("WORKSPACE_LOCATION_USER_DATA_INVALID", "Electron userData path is invalid") };
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateWorkspaceLocation(value) {
  try {
    if (!isPlainObject(value)) {
      return { ok: false, error: resultError("WORKSPACE_LOCATION_INVALID", "Workspace location configuration is invalid") };
    }

    const keys = Object.keys(value).sort();
    if (keys.length !== 2 || keys[0] !== "version" || keys[1] !== "workspacePath") {
      return { ok: false, error: resultError("WORKSPACE_LOCATION_INVALID", "Workspace location configuration is invalid") };
    }
    if (value.version !== 1) {
      return { ok: false, error: resultError("WORKSPACE_LOCATION_VERSION_UNSUPPORTED", "Workspace location configuration version is unsupported") };
    }
    if (
      typeof value.workspacePath !== "string" ||
      value.workspacePath.length === 0 ||
      value.workspacePath.trim().length === 0 ||
      value.workspacePath !== value.workspacePath.trim() ||
      value.workspacePath.includes("\0") ||
      !path.isAbsolute(value.workspacePath)
    ) {
      return { ok: false, error: resultError("WORKSPACE_LOCATION_INVALID", "Workspace location configuration is invalid") };
    }
    return { ok: true, value: { version: 1, workspacePath: value.workspacePath } };
  } catch (error) {
    return { ok: false, error: resultError("WORKSPACE_LOCATION_INVALID", "Workspace location configuration is invalid") };
  }
}

function createWorkspaceLocationStore(options) {
  if (typeof options === "string") options = { userDataPath: options };
  options = options || {};
  const io = options.fs || fs;
  const requestedUserDataPath = options.userDataPath;
  const userDataPath = typeof requestedUserDataPath === "string" &&
    requestedUserDataPath.length > 0 &&
    requestedUserDataPath === requestedUserDataPath.trim() &&
    path.isAbsolute(requestedUserDataPath)
    ? path.resolve(requestedUserDataPath)
    : null;
  if (!userDataPath) {
    return {
      userDataPath: null,
      locationPath: null,
      read: invalidUserDataResult,
      write: invalidUserDataResult,
      save: invalidUserDataResult
    };
  }
  const locationPath = path.join(userDataPath, WORKSPACE_LOCATION_FILE);

  function inspectLocationFile() {
    let stats;
    try {
      stats = io.lstatSync(locationPath);
    } catch (error) {
      if (error && error.code === "ENOENT") return { ok: true, exists: false };
      return { ok: false, error: resultError("WORKSPACE_LOCATION_READ_FAILED", "Workspace location configuration could not be inspected") };
    }
    if (stats.isSymbolicLink() || !stats.isFile()) {
      return { ok: false, error: resultError("WORKSPACE_LOCATION_INVALID", "Workspace location configuration is invalid") };
    }
    return { ok: true, exists: true };
  }

  function read() {
    const inspected = inspectLocationFile();
    if (!inspected.ok) return inspected;
    if (!inspected.exists) return { ok: true, value: null };

    let raw;
    try {
      raw = io.readFileSync(locationPath, "utf8");
    } catch (error) {
      return { ok: false, error: resultError("WORKSPACE_LOCATION_READ_FAILED", "Workspace location configuration could not be read") };
    }

    let value;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      return { ok: false, error: resultError("WORKSPACE_LOCATION_INVALID_JSON", "Workspace location configuration is not valid JSON") };
    }
    return validateWorkspaceLocation(value);
  }

  function write(workspacePathOrConfig) {
    const config = typeof workspacePathOrConfig === "string"
      ? { version: 1, workspacePath: workspacePathOrConfig }
      : workspacePathOrConfig;
    let validation;
    try {
      validation = validateWorkspaceLocation(config);
    } catch (error) {
      return { ok: false, error: resultError("WORKSPACE_LOCATION_INVALID", "Workspace location configuration is invalid") };
    }
    if (!validation.ok) return validation;

    const inspected = inspectLocationFile();
    if (!inspected.ok) return inspected;

    let descriptor = null;
    let temporaryPath = null;
    try {
      const serialized = JSON.stringify(validation.value) + "\n";
      temporaryPath = path.join(
        userDataPath,
        ".workspace-location-" + process.pid + "-" + crypto.randomBytes(16).toString("hex") + ".tmp"
      );
      io.mkdirSync(userDataPath, { recursive: true });
      descriptor = io.openSync(temporaryPath, "wx", 0o600);
      io.writeSync(descriptor, serialized, 0, "utf8");
      if (typeof io.fsyncSync === "function") io.fsyncSync(descriptor);
      io.closeSync(descriptor);
      descriptor = null;
      io.renameSync(temporaryPath, locationPath);
      return { ok: true, value: validation.value };
    } catch (error) {
      if (descriptor !== null) {
        try { io.closeSync(descriptor); } catch (closeError) { /* best effort cleanup */ }
      }
      if (temporaryPath) {
        try { io.unlinkSync(temporaryPath); } catch (cleanupError) { /* best effort cleanup */ }
      }
      return { ok: false, error: resultError("WORKSPACE_LOCATION_WRITE_FAILED", "Workspace location configuration could not be written") };
    }
  }

  return {
    userDataPath: userDataPath,
    locationPath: locationPath,
    read: read,
    write: write,
    save: write
  };
}

function readWorkspaceLocation(userDataPath, options) {
  const storeOptions = Object.assign({}, options || {}, { userDataPath: userDataPath });
  return createWorkspaceLocationStore(storeOptions).read();
}

function writeWorkspaceLocation(userDataPath, workspacePathOrConfig, options) {
  const storeOptions = Object.assign({}, options || {}, { userDataPath: userDataPath });
  return createWorkspaceLocationStore(storeOptions).write(workspacePathOrConfig);
}

module.exports = {
  WORKSPACE_LOCATION_FILE,
  validateWorkspaceLocation,
  createWorkspaceLocationStore,
  readWorkspaceLocation,
  writeWorkspaceLocation
};
