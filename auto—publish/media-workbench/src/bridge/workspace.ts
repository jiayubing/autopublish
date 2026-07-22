import type {
  RuntimeBrowserCapability,
  RuntimeDiagnostics,
  RuntimeCapability,
  WorkspaceBootstrapState,
  WorkspaceConfirmationResult,
  WorkspaceCurrent,
  WorkspaceDataInvalidatedEvent,
  WorkspaceSelectionToken,
} from "../types";
import { ipcError, isElectron, unavailable } from "./transport";

export type { RuntimeCapability, RuntimeDiagnostics };
const selectionRequired = (): WorkspaceBootstrapState => ({
  state: "selection_required",
  workspacePath: null,
  envOverride: false,
});
export async function getWorkspaceBootstrapState(): Promise<WorkspaceBootstrapState> {
  if (!isElectron()) return selectionRequired();
  const result = await window.desktopConsole!.workspace.getBootstrapState();
  if (!result.ok)
    throw ipcError(result.error, "Unable to read workspace bootstrap state");
  return result.data || selectionRequired();
}
export async function chooseWorkspaceDirectory(): Promise<WorkspaceBootstrapState> {
  if (!isElectron()) return selectionRequired();
  const result = await window.desktopConsole!.workspace.chooseDirectory();
  if (!result.ok) throw ipcError(result.error, "Unable to choose a workspace");
  return result.data || selectionRequired();
}
export async function confirmWorkspaceSelection(
  input: WorkspaceSelectionToken,
): Promise<WorkspaceConfirmationResult> {
  if (!isElectron())
    throw unavailable("Workspace selection requires the desktop app");
  const result = await window.desktopConsole!.workspace.confirmSelection(input);
  if (!result.ok)
    throw ipcError(result.error, "Unable to confirm workspace selection");
  return result.data || { state: "relaunching" };
}
export async function cancelWorkspaceSelection(): Promise<WorkspaceBootstrapState> {
  if (!isElectron()) return selectionRequired();
  const result = await window.desktopConsole!.workspace.cancelSelection();
  if (!result.ok)
    throw ipcError(result.error, "Unable to cancel workspace selection");
  return result.data || selectionRequired();
}
export async function getCurrentWorkspace(): Promise<WorkspaceCurrent> {
  if (!isElectron())
    return { workspacePath: null, envOverride: false, validation: null };
  const result = await window.desktopConsole!.workspace.getCurrent();
  if (!result.ok)
    throw ipcError(result.error, "Unable to read the current workspace");
  return (
    result.data || { workspacePath: null, envOverride: false, validation: null }
  );
}
export async function openCurrentWorkspace(): Promise<void> {
  if (!isElectron())
    throw unavailable("Opening a workspace requires the desktop app");
  const result = await window.desktopConsole!.workspace.openCurrent();
  if (!result.ok)
    throw ipcError(result.error, "Unable to open the current workspace");
}
export async function requestWorkspaceSwitch(): Promise<WorkspaceBootstrapState> {
  if (!isElectron()) return selectionRequired();
  const result = await window.desktopConsole!.workspace.requestSwitch();
  if (!result.ok) throw ipcError(result.error, "Unable to switch workspace");
  return result.data || selectionRequired();
}
export function onWorkspaceDataInvalidated(
  listener: (event: WorkspaceDataInvalidatedEvent) => void,
): () => void {
  if (
    !isElectron() ||
    typeof window.desktopConsole?.workspaceData?.onInvalidated !== "function"
  )
    return () => {};
  return window.desktopConsole.workspaceData.onInvalidated(listener);
}
const emptyDiagnostics: RuntimeDiagnostics = {
  ok: false,
  buildInfo: { version: "unknown", commit: "unknown", dirty: false },
  browserChannel: {
    channel: "msedge",
    configured: true,
    state: "not_checked",
    probed: false,
    source: "default",
    errorCode: null,
    lastCheckedAt: null,
  },
  capabilities: {
    playwrightNode: {
      state: "unavailable",
      source: null,
      errorCode: "PLAYWRIGHT_NODE_UNAVAILABLE",
      lastCheckedAt: null,
    },
    playwrightCli: {
      state: "unavailable",
      source: null,
      errorCode: "PLAYWRIGHT_CLI_UNAVAILABLE",
      lastCheckedAt: null,
    },
    browserChannel: {
      channel: "msedge",
      configured: true,
      state: "not_checked",
      probed: false,
      source: "default",
      errorCode: null,
      lastCheckedAt: null,
    },
    docx: {
      state: "unavailable",
      source: "bundled",
      errorCode: "DOCX_RUNTIME_UNAVAILABLE",
      lastCheckedAt: null,
    },
    hepan: {
      state: "optional_unconfigured",
      source: "optional",
      errorCode: "HEPAN_PYTHON_UNAVAILABLE",
      lastCheckedAt: null,
    },
  },
  errors: [],
  warnings: [],
};
export async function getRuntimeDiagnostics(): Promise<RuntimeDiagnostics> {
  if (!isElectron()) return emptyDiagnostics;
  const result = await window.desktopConsole!.runtimeDiagnostics.get();
  if (!result.ok)
    throw ipcError(result.error, "Unable to read runtime diagnostics");
  return result.data || emptyDiagnostics;
}
export async function runBrowserSelfCheck(): Promise<{
  ok: boolean;
  browserChannel: string;
  session: string;
  capability?: RuntimeBrowserCapability;
}> {
  if (!isElectron())
    throw unavailable("Browser self-check requires the desktop app");
  const result = await window.desktopConsole!.runtimeDiagnostics.browserSmoke();
  if (!result.ok || !result.data)
    throw ipcError(result.error, "Browser self-check failed");
  return result.data;
}
export { getPlatformQueue } from "./platform";
