const fs = require("node:fs");
const path = require("node:path");

const { createWorkspaceValidator } = require("./workspace-validator");
const { createWorkspaceLocationStore } = require("./workspace-location-store");
const { createWorkspacePaths, ensureWorkspaceDirectories } = require("./workspace-paths");

const WORKSPACE_MARKER_FILE = ".autopublish-workspace.json";
const BUSY_STATES = new Set(["running", "waiting", "paused", "stopping", "stop_pending", "stopping_pending"]);
const ERROR_MESSAGES = {
  WORKSPACE_SELECTION_REQUIRED: "Workspace selection is required",
  WORKSPACE_SELECTION_CANCELLED: "Workspace selection was cancelled",
  WORKSPACE_CONFIRMATION_REQUIRED: "Workspace confirmation is required",
  WORKSPACE_PATH_INVALID: "Workspace path is invalid",
  WORKSPACE_PATH_FORBIDDEN: "Workspace path is forbidden",
  WORKSPACE_LOCATION_INVALID: "\u5df2\u4fdd\u5b58\u7684\u5de5\u4f5c\u533a\u914d\u7f6e\u65e0\u6548\uff0c\u8bf7\u91cd\u65b0\u9009\u62e9",
  WORKSPACE_NOT_WRITABLE: "Workspace path is not writable",
  WORKSPACE_MARKER_INVALID: "Workspace marker is invalid",
  WORKSPACE_SELECTION_EXPIRED: "Workspace selection has expired",
  WORKSPACE_SWITCH_BUSY: "Workspace cannot be switched while work is active",
  WORKSPACE_ENV_OVERRIDE: "Workspace is controlled by AUTO_PUBLISH_WORKSPACE",
  WORKSPACE_RELAUNCH_FAILED: "Application relaunch failed",
  WORKSPACE_LOCATION_WRITE_FAILED: "Workspace location could not be saved",
  WORKSPACE_OPEN_FAILED: "Could not open the current workspace",
  WORKSPACE_CLEANUP_FAILED: "Workspace cleanup failed; some newly created items remain",
  WORKSPACE_SWITCH_STATE_UNAVAILABLE: "Workspace switch state is unavailable"
};

function stableError(code, message) {
  return { code: code, message: message || ERROR_MESSAGES[code] || "Workspace operation failed" };
}

function throwStable(code, message) {
  throw stableError(code, message);
}

function safeErrorCode(error, fallback) {
  return error && typeof error.code === "string" && ERROR_MESSAGES[error.code]
    ? error.code
    : fallback;
}

function isInvalidSavedLocation(result) {
  const code = result && result.error && result.error.code;
  return [
    "WORKSPACE_LOCATION_INVALID",
    "WORKSPACE_LOCATION_INVALID_JSON",
    "WORKSPACE_LOCATION_VERSION_UNSUPPORTED"
  ].includes(code);
}

function stableValidation(validation) {
  const output = { kind: validation.kind };
  if (validation.error) output.error = stableError(validation.error.code || "WORKSPACE_PATH_INVALID");
  return output;
}

function readClock(clock) {
  const value = typeof clock === "function" ? clock() : new Date();
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  return new Date(value);
}

function statIdentity(stats, target) {
  if (stats.dev !== undefined && stats.ino !== undefined && String(stats.ino) !== "0") {
    return { kind: "devino", dev: String(stats.dev), ino: String(stats.ino) };
  }
  if (!Number.isFinite(stats.birthtimeMs)) return { kind: "unverifiable" };
  return {
    kind: "stat",
    mode: stats.mode,
    birthtimeMs: stats.birthtimeMs,
    path: path.resolve(target)
  };
}

function sameIdentity(first, second) {
  if (!first || !second || first.kind !== second.kind) return false;
  if (first.kind === "devino") return first.dev === second.dev && first.ino === second.ino;
  if (first.kind === "unverifiable" || second.kind === "unverifiable") return false;
  return first.mode === second.mode && first.birthtimeMs === second.birthtimeMs && first.path === second.path;
}

function stateValue(value) {
  if (typeof value === "string") return value.toLowerCase();
  if (!value || typeof value !== "object") return "";
  return String(value.state || value.status || value.phase || value.lifecycle || "").toLowerCase();
}

function isBusy(value) {
  if (BUSY_STATES.has(stateValue(value))) return true;
  if (!value || typeof value !== "object") return false;
  return value.isBatchRunning === true || value.isPlatformRunning === true || value.isStopPending === true ||
    value.isStopping === true || value.stopping === true || value.running === true || value.waiting === true ||
    value.paused === true;
}

function createWorkspaceBootstrapService(options) {
  const opts = options || {};
  const io = opts.fs || fs;
  const env = opts.env || process.env;
  const clock = opts.clock || function() { return new Date(); };
  const makeToken = opts.tokenGenerator || function() {
    return require("node:crypto").randomBytes(24).toString("hex");
  };
  const ttlMs = Number.isFinite(opts.selectionTtlMs) ? opts.selectionTtlMs : 10 * 60 * 1000;
  const validator = opts.validator || createWorkspaceValidator(opts.validatorOptions || {});
  const locationStore = opts.locationStore || createWorkspaceLocationStore({ userDataPath: opts.userDataPath, fs: io });
  const makePaths = opts.createWorkspacePaths || createWorkspacePaths;
  const ensureDirectories = opts.ensureWorkspaceDirectories || ensureWorkspaceDirectories;
  const taskService = opts.taskService || {};
  const doubaoCollectionService = opts.doubaoCollectionService || {};
  const relaunch = opts.relaunch || opts.relaunchCallback || function() {};
  const openPath = opts.openPath || opts.openCallback || function() {};

  let state = "checking";
  let current = null;
  let lastError = null;
  let pending = null;
  let retryRelaunchPath = null;
  let activeOperation = null;
  let operationGeneration = 0;

  function currentPath() { return current ? current.path : null; }

  function stateDto() {
    const result = {
      state: state,
      workspacePath: currentPath(),
      envOverride: current ? current.envOverride : false
    };
    if (lastError) result.error = stableError(lastError.code, lastError.message);
    return result;
  }

  function invalidateSelection() { pending = null; }

  function beginOperation() {
    if (activeOperation) throwStable("WORKSPACE_SWITCH_BUSY");
    const operation = { generation: ++operationGeneration };
    activeOperation = operation;
    return operation;
  }

  function endOperation(operation) {
    if (activeOperation === operation) activeOperation = null;
  }

  function assertOperation(operation) {
    if (activeOperation !== operation || operation.generation !== operationGeneration) {
      throwStable("WORKSPACE_SWITCH_BUSY");
    }
  }

  function classify(candidate) {
    let result;
    try {
      result = typeof validator.validate === "function" ? validator.validate(candidate) : validator(candidate);
    } catch (error) {
      return { kind: "invalid", error: stableError("WORKSPACE_PATH_INVALID") };
    }
    if (!result || typeof result !== "object") return { kind: "invalid", error: stableError("WORKSPACE_PATH_INVALID") };
    if (result.kind === "invalid") {
      const code = result.error && result.error.code === "WORKSPACE_PROBE_CLEANUP_FAILED"
        ? "WORKSPACE_NOT_WRITABLE"
        : safeErrorCode(result.error, "WORKSPACE_PATH_INVALID");
      return { kind: "invalid", error: stableError(code) };
    }
    if (!["existing_workspace", "empty_directory", "nonempty_directory"].includes(result.kind) ||
      typeof result.path !== "string" || !path.isAbsolute(result.path)) {
      return { kind: "invalid", error: stableError("WORKSPACE_PATH_INVALID") };
    }
    return { kind: result.kind, path: path.resolve(result.path) };
  }

  function setSelectionRequired(code) {
    current = null;
    state = "selection_required";
    lastError = stableError(code || "WORKSPACE_SELECTION_REQUIRED");
    invalidateSelection();
    return stateDto();
  }

  function setInvalid(code) {
    current = null;
    state = "invalid";
    lastError = stableError(code || "WORKSPACE_PATH_INVALID");
    invalidateSelection();
    return stateDto();
  }

  function bootstrap() {
    const operation = beginOperation();
    try {
      state = "checking";
      lastError = null;
      invalidateSelection();

      const environmentPath = typeof env.AUTO_PUBLISH_WORKSPACE === "string" && env.AUTO_PUBLISH_WORKSPACE.trim() !== ""
        ? env.AUTO_PUBLISH_WORKSPACE
        : null;
      if (environmentPath) {
        const environmentResult = classify(environmentPath);
        if (environmentResult.kind === "invalid") return setInvalid(environmentResult.error.code);
        if (retryRelaunchPath && retryRelaunchPath !== environmentResult.path) retryRelaunchPath = null;
        current = { path: environmentResult.path, envOverride: true, validation: environmentResult };
        state = "ready";
        return stateDto();
      }

      let saved;
      try { saved = locationStore.read(); } catch (error) { return setSelectionRequired("WORKSPACE_SELECTION_REQUIRED"); }
      if (!saved || saved.ok !== true) {
        return setSelectionRequired(isInvalidSavedLocation(saved) ? "WORKSPACE_LOCATION_INVALID" : "WORKSPACE_SELECTION_REQUIRED");
      }
      if (!saved.value || typeof saved.value.workspacePath !== "string") return setSelectionRequired("WORKSPACE_SELECTION_REQUIRED");

      const savedResult = classify(saved.value.workspacePath);
      if (savedResult.kind === "invalid") return setInvalid(savedResult.error.code);
      if (retryRelaunchPath && retryRelaunchPath !== savedResult.path) retryRelaunchPath = null;
      current = { path: savedResult.path, envOverride: false, validation: savedResult };
      state = "ready";
      return stateDto();
    } finally {
      endOperation(operation);
    }
  }

  function getBootstrapState() { return stateDto(); }

  function pendingDto() {
    return {
      state: "confirmation_required",
      selection: { token: pending.token, path: pending.path, kind: pending.kind }
    };
  }

  function selectDirectory(candidate) {
    invalidateSelection();
    if (candidate === null || candidate === undefined) throwStable("WORKSPACE_SELECTION_CANCELLED");
    const result = classify(candidate);
    if (result.kind === "invalid") throwStable(result.error.code);
    const now = readClock(clock).getTime();
    pending = {
      token: String(makeToken()),
      path: result.path,
      kind: result.kind,
      expiresAt: now + ttlMs
    };
    state = "confirmation_required";
    lastError = null;
    return pendingDto();
  }

  function chooseDirectory(candidate) {
    if (activeOperation) throwStable("WORKSPACE_SWITCH_BUSY");
    return selectDirectory(candidate);
  }

  async function readBusyState() {
    let taskValue = null;
    let queueValue = null;
    let unavailable = false;
    try {
      if (typeof taskService.getState === "function") taskValue = await taskService.getState();
    } catch (error) {
      unavailable = true;
    }
    try {
      if (typeof doubaoCollectionService.getQueueState === "function") queueValue = await doubaoCollectionService.getQueueState();
    } catch (error) {
      unavailable = true;
    }
    if (unavailable) throwStable("WORKSPACE_SWITCH_STATE_UNAVAILABLE");
    if (isBusy(taskValue) || isBusy(queueValue)) throwStable("WORKSPACE_SWITCH_BUSY");
  }

  async function requestSwitch(candidate) {
    const operation = beginOperation();
    try {
      if (current && current.envOverride) throwStable("WORKSPACE_ENV_OVERRIDE");
      await readBusyState();
      assertOperation(operation);
      return selectDirectory(candidate);
    } finally {
      endOperation(operation);
    }
  }

  function cancelSelection() {
    if (activeOperation) throwStable("WORKSPACE_SWITCH_BUSY");
    invalidateSelection();
    state = current ? "ready" : "selection_required";
    lastError = null;
    throwStable("WORKSPACE_SELECTION_CANCELLED");
  }

  function getPending(input) {
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 1 ||
      typeof input.token !== "string" || input.token.trim() === "") {
      invalidateSelection();
      throwStable("WORKSPACE_SELECTION_EXPIRED");
    }
    if (!pending || pending.token !== input.token || readClock(clock).getTime() >= pending.expiresAt) {
      invalidateSelection();
      throwStable("WORKSPACE_SELECTION_EXPIRED");
    }
    return pending;
  }

  function rollbackInitialization(record) {
    let failed = record.captureFailed;
    if (record.markerCreated) {
      try {
        const markerStats = io.lstatSync(record.markerPath);
        const markerContent = io.readFileSync(record.markerPath, "utf8");
        if (!sameIdentity(record.markerIdentity, statIdentity(markerStats, record.markerPath)) || markerContent !== record.markerContent) {
          failed = true;
        } else if (markerStats.isFile() && !markerStats.isSymbolicLink()) {
          io.unlinkSync(record.markerPath);
        } else {
          failed = true;
        }
      } catch (error) {
        if (!error || error.code !== "ENOENT") failed = true;
      }
    }
    record.directories
      .filter(function(item) { return !item.present; })
      .sort(function(first, second) { return second.path.length - first.path.length; })
      .forEach(function(item) {
        try {
          const stats = io.lstatSync(item.path);
          if (!sameIdentity(item.identity, statIdentity(stats, item.path))) {
            failed = true;
          } else if (stats.isDirectory() && !stats.isSymbolicLink()) {
            io.rmdirSync(item.path);
          } else {
            failed = true;
          }
        } catch (error) {
          if (!error || error.code !== "ENOENT") failed = true;
        }
      });
    return !failed;
  }

  function captureDirectoryArtifacts(record) {
    record.directories.forEach(function(item) {
      if (item.present) return;
      try {
        const stats = io.lstatSync(item.path);
        if (!stats.isDirectory() || stats.isSymbolicLink()) {
          record.captureFailed = true;
        } else {
          const identity = statIdentity(stats, item.path);
          if (!item.identity) item.identity = identity;
          else if (!sameIdentity(item.identity, identity)) record.captureFailed = true;
        }
      } catch (error) {
        if (!error || error.code !== "ENOENT") record.captureFailed = true;
      }
    });
  }

  function inspectWorkspaceDirectory(target) {
    let stats;
    try {
      stats = io.lstatSync(target);
    } catch (error) {
      if (error && error.code === "ENOENT") return false;
      throwStable("WORKSPACE_PATH_FORBIDDEN");
    }
    if (stats.isSymbolicLink()) throwStable("WORKSPACE_PATH_FORBIDDEN");
    if (!stats.isDirectory()) throwStable("WORKSPACE_PATH_INVALID");
    return true;
  }

  function collectWorkspaceDirectories(paths, workspaceRoot) {
    const root = path.resolve(workspaceRoot);
    const directories = [];
    const seen = new Set();

    inspectWorkspaceDirectory(root);

    Object.keys(paths).forEach(function(key) {
      const target = paths[key];
      if (typeof target !== "string") throwStable("WORKSPACE_PATH_INVALID");
      const resolvedTarget = path.resolve(target);
      const relative = path.relative(root, resolvedTarget);
      if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
        throwStable("WORKSPACE_PATH_FORBIDDEN");
      }
      if (seen.has(resolvedTarget)) return;
      seen.add(resolvedTarget);

      let current = root;
      const segments = relative ? relative.split(path.sep) : [];
      for (const segment of segments) {
        current = path.join(current, segment);
        inspectWorkspaceDirectory(current);
      }
      if (key !== "root") directories.push({ path: resolvedTarget, present: inspectWorkspaceDirectory(resolvedTarget) });
    });

    return directories;
  }

  function secureEnsureWorkspaceDirectories(paths) {
    const targets = Object.keys(paths)
      .filter(function(key) { return key !== "root"; })
      .map(function(key) { return path.resolve(paths[key]); })
      .filter(function(target, index, all) { return all.indexOf(target) === index; })
      .sort(function(first, second) { return first.length - second.length; });

    targets.forEach(function(target) {
      if (inspectWorkspaceDirectory(target)) return;
      try {
        io.mkdirSync(target);
      } catch (error) {
        if (!error || error.code !== "EEXIST") throw error;
      }
      inspectWorkspaceDirectory(target);
    });
    return paths;
  }

  function initializeWorkspace(root) {
    const workspaceRoot = path.resolve(root);
    const paths = makePaths(workspaceRoot);
    const directories = collectWorkspaceDirectories(paths, workspaceRoot)
      .filter(function(item) { return item.path !== workspaceRoot; });
    const record = {
      markerPath: path.join(workspaceRoot, WORKSPACE_MARKER_FILE),
      markerCreated: false,
      markerIdentity: null,
      markerContent: null,
      captureFailed: false,
      directories: directories,
      rollback: function() { return rollbackInitialization(record); }
    };
    try {
      if (opts.ensureWorkspaceDirectories) ensureDirectories(paths);
      else secureEnsureWorkspaceDirectories(paths);
      captureDirectoryArtifacts(record);
      const marker = JSON.stringify({ version: 1, createdAt: readClock(clock).toISOString() }) + "\n";
      try {
        io.writeFileSync(record.markerPath, marker, { encoding: "utf8", flag: "wx" });
        record.markerCreated = true;
        record.markerContent = marker;
        record.markerIdentity = statIdentity(io.lstatSync(record.markerPath), record.markerPath);
        if (io.readFileSync(record.markerPath, "utf8") !== marker) {
          record.captureFailed = true;
          throwStable("WORKSPACE_CLEANUP_FAILED");
        }
      } catch (error) {
        if (!error || error.code !== "EEXIST") throw error;
        const rechecked = classify(root);
        if (rechecked.kind !== "existing_workspace") throwStable("WORKSPACE_MARKER_INVALID");
      }
      return record;
    } catch (error) {
      if (!record.markerCreated) captureDirectoryArtifacts(record);
      const cleanupSucceeded = record.rollback();
      if (!cleanupSucceeded) throwStable("WORKSPACE_CLEANUP_FAILED");
      if (error && error.code && ERROR_MESSAGES[error.code]) throw error;
      throwStable(safeErrorCode(error, "WORKSPACE_NOT_WRITABLE"));
    }
  }

  async function relaunchWorkspace(workspacePath, changed, operation) {
    state = "relaunching";
    lastError = null;
    try {
      const result = await relaunch();
      assertOperation(operation);
      if (result === false) throw new Error("relaunch returned false");
      retryRelaunchPath = null;
      return { state: "relaunching", workspacePath: workspacePath, envOverride: false, changed: changed };
    } catch (error) {
      retryRelaunchPath = workspacePath;
      state = "ready";
      lastError = stableError("WORKSPACE_RELAUNCH_FAILED");
      throw lastError;
    }
  }

  async function confirmSelection(input) {
    const operation = beginOperation();
    try {
      const selection = getPending(input);
      invalidateSelection();
      if (current && current.envOverride) throwStable("WORKSPACE_ENV_OVERRIDE");

      const rechecked = classify(selection.path);
      if (rechecked.kind === "invalid" || rechecked.path !== selection.path || rechecked.kind !== selection.kind) {
        throwStable(rechecked.kind === "invalid" ? rechecked.error.code : "WORKSPACE_SELECTION_EXPIRED");
      }
      await readBusyState();
      assertOperation(operation);

      const retryingCurrentPath = current && current.path === selection.path && retryRelaunchPath === selection.path;
      if (current && current.path === selection.path && !retryingCurrentPath) {
        state = "ready";
        lastError = null;
        return { state: "ready", workspacePath: current.path, envOverride: current.envOverride, changed: false };
      }

      let initialization = null;
      if (!retryingCurrentPath && selection.kind !== "existing_workspace") initialization = initializeWorkspace(selection.path);

      if (!retryingCurrentPath) {
        let saved;
        try { saved = locationStore.write(selection.path); } catch (error) { saved = { ok: false, error: error }; }
        if (!saved || saved.ok !== true) {
          if (initialization) {
            const cleanupSucceeded = initialization.rollback();
            if (!cleanupSucceeded) throwStable("WORKSPACE_CLEANUP_FAILED");
          }
          throwStable(safeErrorCode(saved && saved.error, "WORKSPACE_LOCATION_WRITE_FAILED"));
        }
        current = { path: selection.path, envOverride: false, validation: classify(selection.path) };
        retryRelaunchPath = null;
      }

      return await relaunchWorkspace(selection.path, true, operation);
    } catch (error) {
      const code = safeErrorCode(error, "WORKSPACE_NOT_WRITABLE");
      if (code !== "WORKSPACE_RELAUNCH_FAILED") {
        state = current ? "ready" : "selection_required";
        lastError = stableError(code);
      }
      throw stableError(code);
    } finally {
      endOperation(operation);
    }
  }

  function getCurrent() {
    if (!current) return { workspacePath: null, envOverride: false, validation: null };
    return {
      workspacePath: current.path,
      envOverride: current.envOverride,
      validation: stableValidation(current.validation)
    };
  }

  async function openCurrent() {
    if (!current || !current.path) throwStable("WORKSPACE_SELECTION_REQUIRED");
    try {
      return await openPath(current.path);
    } catch (error) {
      throwStable("WORKSPACE_OPEN_FAILED");
    }
  }

  return {
    bootstrap,
    getBootstrapState,
    chooseDirectory,
    requestSwitch,
    confirmSelection,
    cancelSelection,
    getCurrent,
    openCurrent
  };
}

module.exports = { createWorkspaceBootstrapService };
