const { wrap } = require("../services/ipc-response");

const SAFE_MESSAGES = {
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
  WORKSPACE_OPEN_FAILED: "Could not open the current workspace",
  WORKSPACE_LOCATION_WRITE_FAILED: "Workspace location could not be saved",
  WORKSPACE_IPC_INPUT_INVALID: "Workspace IPC input is invalid",
  IPC_ERROR: "Workspace operation failed"
};

function inputError(message) {
  const error = { code: "WORKSPACE_IPC_INPUT_INVALID", message: message || SAFE_MESSAGES.WORKSPACE_IPC_INPUT_INVALID };
  throw error;
}

function noInput(input, label) {
  if (input !== undefined) inputError(label + " does not accept input");
}

function tokenInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 1 ||
    typeof input.token !== "string" || input.token.trim() === "") {
    inputError("Confirmation token is invalid");
  }
  return { token: input.token };
}

function safeWrap(handler) {
  return wrap(handler).then(function(result) {
    if (result.ok) return result;
    const code = result.error && SAFE_MESSAGES[result.error.code] ? result.error.code : "IPC_ERROR";
    return { ok: false, error: { code: code, message: SAFE_MESSAGES[code] } };
  });
}

function createDialogPicker(showOpenDialog, service) {
  return async function() {
    const result = await showOpenDialog({ properties: ["openDirectory"] });
    if (!result || result.canceled === true || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
      return service.cancelSelection();
    }
    if (result.filePaths.length !== 1 || typeof result.filePaths[0] !== "string" || result.filePaths[0].trim() === "") {
      inputError("Directory selection is invalid");
    }
    return result.filePaths[0];
  };
}

function registerWorkspaceBootstrapIpc(deps) {
  const options = deps || {};
  const ipcMain = options.ipcMain;
  const service = options.workspaceBootstrapService;
  const showOpenDialog = options.showOpenDialog || (options.dialog && options.dialog.showOpenDialog
    ? options.dialog.showOpenDialog.bind(options.dialog)
    : null);
  if (!ipcMain || typeof ipcMain.handle !== "function" || !service || typeof showOpenDialog !== "function") {
    throw new Error("Workspace bootstrap IPC dependencies are required");
  }
  const pickDirectory = createDialogPicker(showOpenDialog, service);

  ipcMain.handle("workspace:get-bootstrap-state", function(event, input) {
    return safeWrap(function() { noInput(input, "Bootstrap state"); return service.getBootstrapState(); });
  });
  ipcMain.handle("workspace:choose-directory", function(event, input) {
    return safeWrap(async function() { noInput(input, "Choose directory"); return service.chooseDirectory(await pickDirectory()); });
  });
  ipcMain.handle("workspace:confirm-selection", function(event, input) {
    return safeWrap(function() { return service.confirmSelection(tokenInput(input)); });
  });
  ipcMain.handle("workspace:cancel-selection", function(event, input) {
    return safeWrap(function() { noInput(input, "Cancel selection"); return service.cancelSelection(); });
  });
  ipcMain.handle("workspace:get-current", function(event, input) {
    return safeWrap(function() { noInput(input, "Current workspace"); return service.getCurrent(); });
  });
  ipcMain.handle("workspace:open-current", function(event, input) {
    return safeWrap(function() { noInput(input, "Open current workspace"); return service.openCurrent(); });
  });
  ipcMain.handle("workspace:request-switch", function(event, input) {
    return safeWrap(async function() {
      noInput(input, "Request switch");
      return service.requestSwitch(await pickDirectory());
    });
  });
}

module.exports = { registerWorkspaceBootstrapIpc };
