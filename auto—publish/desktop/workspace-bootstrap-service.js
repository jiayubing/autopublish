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
  WORKSPACE_NOT_WRITABLE: "Workspace path is not writable",
  WORKSPACE_MARKER_INVALID: "Workspace marker is invalid",
  WORKSPACE_SELECTION_EXPIRED: "Workspace selection has expired",
  WORKSPACE_SWITCH_BUSY: "Workspace cannot be switched while work is active",
  WORKSPACE_ENV_OVERRIDE: "Workspace is controlled by AUTO_PUBLISH_WORKSPACE",
  WORKSPACE_RELAUNCH_FAILED: "Application relaunch failed",
  WORKSPACE_LOCATION_WRITE_FAILED: "Workspace location could not be saved"
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
    state = "checking";
    lastError = null;
    invalidateSelection();

    const environmentPath = typeof env.AUTO_PUBLISH_WORKSPACE === "string" && env.AUTO_PUBLISH_WORKSPACE.trim() !== ""
      ? env.AUTO_PUBLISH_WORKSPACE
      : null;
    if (environmentPath) {
      const environmentResult = classify(environmentPath);
      if (environmentResult.kind === "invalid") return setInvalid(environmentResult.error.code);
      current = { path: environmentResult.path, envOverride: true, validation: environmentResult };
      state = "ready";
      return stateDto();
    }

    let saved;
    try { saved = locationStore.read(); } catch (error) { return setSelectionRequired("WORKSPACE_SELECTION_REQUIRED"); }
    if (!saved || saved.ok !== true) return setSelectionRequired("WORKSPACE_SELECTION_REQUIRED");
    if (!saved.value || typeof saved.value.workspacePath !== "string") return setSelectionRequired("WORKSPACE_SELECTION_REQUIRED");

    const savedResult = classify(saved.value.workspacePath);
    if (savedResult.kind === "invalid") return setInvalid(savedResult.error.code);
    current = { path: savedResult.path, envOverride: false, validation: savedResult };
    state = "ready";
    return stateDto();
  }

  function getBootstrapState() { return stateDto(); }

  function pendingDto() {
    return {
      state: "confirmation_required",
      selection: { token: pending.token, path: pending.path, kind: pending.kind }
    };
  }

  function chooseDirectory(candidate) {
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

  async function readBusyState() {
    const taskValue = typeof taskService.getState === "function" ? await taskService.getState() : null;
    const queueValue = typeof doubaoCollectionService.getQueueState === "function"
      ? await doubaoCollectionService.getQueueState()
      : null;
    if (isBusy(taskValue) || isBusy(queueValue)) throwStable("WORKSPACE_SWITCH_BUSY");
  }

  async function requestSwitch(candidate) {
    if (current && current.envOverride) throwStable("WORKSPACE_ENV_OVERRIDE");
    await readBusyState();
    return chooseDirectory(candidate);
  }

  function cancelSelection() {
    invalidateSelection();
    state = current ? "ready" : "selection_required";
    lastError = null;
    return Promise.reject(stableError("WORKSPACE_SELECTION_CANCELLED"));
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

  function initializeWorkspace(root) {
    try {
      const paths = makePaths(root);
      ensureDirectories(paths);
      const markerPath = path.join(root, WORKSPACE_MARKER_FILE);
      const marker = JSON.stringify({ version: 1, createdAt: readClock(clock).toISOString() }) + "\n";
      try {
        io.writeFileSync(markerPath, marker, { encoding: "utf8", flag: "wx" });
      } catch (error) {
        if (!error || error.code !== "EEXIST") throw error;
        const rechecked = classify(root);
        if (rechecked.kind !== "existing_workspace") throwStable("WORKSPACE_MARKER_INVALID");
      }
    } catch (error) {
      if (error && error.code && ERROR_MESSAGES[error.code]) throw error;
      throwStable(safeErrorCode(error, "WORKSPACE_NOT_WRITABLE"));
    }
  }

  async function confirmSelection(input) {
    const selection = getPending(input);
    invalidateSelection();
    if (current && current.envOverride) throwStable("WORKSPACE_ENV_OVERRIDE");

    const rechecked = classify(selection.path);
    if (rechecked.kind === "invalid" || rechecked.path !== selection.path || rechecked.kind !== selection.kind) {
      throwStable(rechecked.kind === "invalid" ? rechecked.error.code : "WORKSPACE_SELECTION_EXPIRED");
    }
    await readBusyState();

    if (current && current.path === selection.path) {
      state = "ready";
      lastError = null;
      return { state: "ready", workspacePath: current.path, envOverride: current.envOverride, changed: false };
    }

    if (selection.kind !== "existing_workspace") initializeWorkspace(selection.path);

    let saved;
    try { saved = locationStore.write(selection.path); } catch (error) { saved = { ok: false, error: error }; }
    if (!saved || saved.ok !== true) {
      throwStable(safeErrorCode(saved && saved.error, "WORKSPACE_LOCATION_WRITE_FAILED"));
    }

    current = { path: selection.path, envOverride: false, validation: classify(selection.path) };
    state = "relaunching";
    lastError = null;
    try {
      const result = await relaunch();
      if (result === false) throw new Error("relaunch returned false");
    } catch (error) {
      state = "ready";
      lastError = stableError("WORKSPACE_RELAUNCH_FAILED");
      throw lastError;
    }
    return { state: "relaunching", workspacePath: selection.path, envOverride: false, changed: true };
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
    return await openPath(current.path);
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
