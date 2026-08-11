const { productionIpcRegistry } = require("./contracts/production-registry");
const { createTypedIpcMain } = require("./register");
const { reportDiagnostic } = require("../../src/diagnostics/diagnostic-producer");

const STATE_VALUES = new Set([
  "checking",
  "selection_required",
  "confirmation_required",
  "ready",
  "invalid",
  "relaunching",
]);
const BOOTSTRAP_CHANNELS = [
  "workspace:get-bootstrap-state",
  "workspace:choose-directory",
  "workspace:confirm-selection",
  "workspace:cancel-selection",
  "workspace:get-current",
  "workspace:open-current",
  "workspace:request-switch",
];

function selectionLabel(kind) {
  if (kind === "existing_workspace") return "已有工作区";
  if (kind === "empty_directory") return "空目录";
  if (kind === "nonempty_directory") return "非空目录";
  return null;
}

function safeErrorCode(value) {
  const code = value && value.error && value.error.code;
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{0,95}$/.test(code)
    ? code
    : null;
}

function rendererWorkspaceState(value) {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const configured =
    typeof source.workspacePath === "string" && source.workspacePath.length > 0;
  const rawState = STATE_VALUES.has(source.state)
    ? source.state
    : configured
      ? "ready"
      : "selection_required";
  const kind =
    source.selection && selectionLabel(source.selection.kind)
      ? source.selection.kind
      : null;
  const token =
    source.selection && typeof source.selection.token === "string"
      ? source.selection.token
      : null;
  return {
    state: rawState,
    configured,
    environmentManaged: source.envOverride === true,
    label: configured ? "工作区已配置" : "尚未配置工作区",
    selection:
      kind && token ? { token, kind, label: selectionLabel(kind) } : null,
    errorCode: safeErrorCode(source),
    changed: typeof source.changed === "boolean" ? source.changed : null,
  };
}

function createDialogPicker(showOpenDialog, service) {
  return async function () {
    const result = await showOpenDialog({ properties: ["openDirectory"] });
    if (
      !result ||
      result.canceled === true ||
      !Array.isArray(result.filePaths) ||
      result.filePaths.length === 0
    ) {
      return service.cancelSelection();
    }
    if (
      result.filePaths.length !== 1 ||
      typeof result.filePaths[0] !== "string" ||
      result.filePaths[0].trim() === ""
    ) {
      const error = new Error("Workspace dialog result is invalid");
      error.code = "WORKSPACE_IPC_INPUT_INVALID";
      throw error;
    }
    return result.filePaths[0];
  };
}

function registerWorkspaceBootstrapIpc(deps) {
  const options = deps || {};
  const ipcMain = options.ipcMain;
  const service = options.workspaceBootstrapService;
  const requireAuthenticated = options.requireAuthenticated;
  const showOpenDialog =
    options.showOpenDialog ||
    (options.dialog && options.dialog.showOpenDialog
      ? options.dialog.showOpenDialog.bind(options.dialog)
      : null);
  if (
    !ipcMain ||
    typeof ipcMain.handle !== "function" ||
    !service ||
    typeof showOpenDialog !== "function"
  ) {
    throw new Error("Workspace bootstrap IPC dependencies are required");
  }
  const pickDirectory = createDialogPicker(showOpenDialog, service);

  const typedIpcMain = createTypedIpcMain(ipcMain, requireAuthenticated);
  for (const channel of BOOTSTRAP_CHANNELS) {
    if (productionIpcRegistry.byChannel(channel)) continue;
    const error = new Error("Non-Auth IPC channel must have a production contract");
    error.code = "IPC_CONTRACT_REQUIRED";
    throw error;
  }
  const registeredChannels = [];
  try {
    typedIpcMain.handle("workspace:get-bootstrap-state", async function () {
      return rendererWorkspaceState(await service.getBootstrapState());
    });
    registeredChannels.push("workspace:get-bootstrap-state");
    typedIpcMain.handle("workspace:choose-directory", async function () {
      return rendererWorkspaceState(await service.chooseDirectory(await pickDirectory()));
    });
    registeredChannels.push("workspace:choose-directory");
    typedIpcMain.handle("workspace:confirm-selection", async function (event, payload) {
      return rendererWorkspaceState(await service.confirmSelection({ token: payload.token }));
    });
    registeredChannels.push("workspace:confirm-selection");
    typedIpcMain.handle("workspace:cancel-selection", async function () {
      return rendererWorkspaceState(await service.cancelSelection());
    });
    registeredChannels.push("workspace:cancel-selection");
    typedIpcMain.handle("workspace:get-current", async function () {
      return rendererWorkspaceState(await service.getCurrent());
    });
    registeredChannels.push("workspace:get-current");
    typedIpcMain.handle("workspace:open-current", async function () {
      await service.openCurrent();
      return { opened: true };
    });
    registeredChannels.push("workspace:open-current");
    typedIpcMain.handle("workspace:request-switch", async function () {
      return rendererWorkspaceState(await service.requestSwitch(await pickDirectory()));
    });
    registeredChannels.push("workspace:request-switch");
  } catch (error) {
    registeredChannels.reverse().forEach(function(channel) {
      try {
        typedIpcMain.removeHandler(channel);
      } catch (_) {
        reportDiagnostic({
          code: "WORKSPACE_BOOTSTRAP_IPC_CLEANUP_FAILED",
          module: "workspace-bootstrap-ipc",
          category: "transport",
          operationId: "workspace-bootstrap-registration-rollback",
          metadata: { action: "remove-handler", transport: "ipc", outcome: "failed" },
        });
      }
    });
    throw error;
  }
}

module.exports = { registerWorkspaceBootstrapIpc, rendererWorkspaceState };
