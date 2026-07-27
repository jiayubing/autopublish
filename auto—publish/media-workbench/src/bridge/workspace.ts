import type {
  RuntimeBrowserCapability,
  RuntimeDiagnostics,
  RuntimeCapability,
  WorkspaceBootstrapState,
  WorkspaceConfirmationResult,
  WorkspaceCurrent,
  WorkspaceDataInvalidatedEvent,
  WorkspaceRuntimeIdentity,
  WorkspaceSelectionToken,
} from "../types";
import { ipcError, isElectron, unavailable } from "./transport";

type WorkspaceResponse<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    category:
      | "validation"
      | "authentication"
      | "transport"
      | "remote"
      | "storage"
      | "conflict"
      | "internal";
    retryability: "never" | "safe" | "manual-check";
    userMessage: string;
    diagnosticId?: string;
  };
};
type WorkspaceApi = {
  getBootstrapState: () => Promise<WorkspaceResponse<WorkspaceBootstrapState>>;
  chooseDirectory: () => Promise<WorkspaceResponse<WorkspaceBootstrapState>>;
  confirmSelection: (
    input: WorkspaceSelectionToken,
  ) => Promise<WorkspaceResponse<WorkspaceConfirmationResult>>;
  cancelSelection: () => Promise<WorkspaceResponse<WorkspaceBootstrapState>>;
  getCurrent: () => Promise<WorkspaceResponse<WorkspaceCurrent>>;
  openCurrent: () => Promise<WorkspaceResponse<void>>;
  requestSwitch: () => Promise<WorkspaceResponse<WorkspaceBootstrapState>>;
};
type WorkspaceDataApi = {
  onInvalidated: (
    listener: (event: WorkspaceDataInvalidatedEvent) => void,
  ) => () => void;
  getRuntimeIdentity: () => Promise<
    WorkspaceResponse<WorkspaceRuntimeIdentity>
  >;
};
type RuntimeDiagnosticsApi = {
  get: () => Promise<WorkspaceResponse<RuntimeDiagnostics>>;
  browserSmoke: () => Promise<
    WorkspaceResponse<{
      ok: boolean;
      browserChannel: string;
      session: string;
      capability?: RuntimeBrowserCapability;
    }>
  >;
};

const workspaceApi = () =>
  window.desktopConsole?.workspace as WorkspaceApi | undefined;
const workspaceDataApi = () =>
  window.desktopConsole?.workspaceData as WorkspaceDataApi | undefined;
const runtimeDiagnosticsApi = () =>
  window.desktopConsole?.runtimeDiagnostics as
    RuntimeDiagnosticsApi | undefined;

export type { RuntimeCapability, RuntimeDiagnostics };
const selectionRequired = (): WorkspaceBootstrapState => ({
  state: "selection_required",
  configured: false,
  environmentManaged: false,
  label: "尚未配置工作区",
  selection: null,
  errorCode: null,
  changed: null,
});
export async function getWorkspaceBootstrapState(): Promise<WorkspaceBootstrapState> {
  if (!isElectron()) return selectionRequired();
  const result = await workspaceApi()!.getBootstrapState();
  if (!result.ok)
    throw ipcError(result.error, "Unable to read workspace bootstrap state");
  return result.data || selectionRequired();
}
export async function chooseWorkspaceDirectory(): Promise<WorkspaceBootstrapState> {
  if (!isElectron()) return selectionRequired();
  const result = await workspaceApi()!.chooseDirectory();
  if (!result.ok) throw ipcError(result.error, "Unable to choose a workspace");
  return result.data || selectionRequired();
}
export async function confirmWorkspaceSelection(
  input: WorkspaceSelectionToken,
): Promise<WorkspaceConfirmationResult> {
  if (!isElectron())
    throw unavailable("Workspace selection requires the desktop app");
  const result = await workspaceApi()!.confirmSelection(input);
  if (!result.ok)
    throw ipcError(result.error, "Unable to confirm workspace selection");
  return result.data || { ...selectionRequired(), state: "relaunching" };
}
export async function cancelWorkspaceSelection(): Promise<WorkspaceBootstrapState> {
  if (!isElectron()) return selectionRequired();
  const result = await workspaceApi()!.cancelSelection();
  if (!result.ok)
    throw ipcError(result.error, "Unable to cancel workspace selection");
  return result.data || selectionRequired();
}
export async function getCurrentWorkspace(): Promise<WorkspaceCurrent> {
  if (!isElectron()) return selectionRequired();
  const result = await workspaceApi()!.getCurrent();
  if (!result.ok)
    throw ipcError(result.error, "Unable to read the current workspace");
  return result.data || selectionRequired();
}
export async function openCurrentWorkspace(): Promise<void> {
  if (!isElectron())
    throw unavailable("Opening a workspace requires the desktop app");
  const result = await workspaceApi()!.openCurrent();
  if (!result.ok)
    throw ipcError(result.error, "Unable to open the current workspace");
}
export async function requestWorkspaceSwitch(): Promise<WorkspaceBootstrapState> {
  if (!isElectron()) return selectionRequired();
  const result = await workspaceApi()!.requestSwitch();
  if (!result.ok) throw ipcError(result.error, "Unable to switch workspace");
  return result.data || selectionRequired();
}
export function onWorkspaceDataInvalidated(
  listener: (event: WorkspaceDataInvalidatedEvent) => void,
): () => void {
  if (!isElectron() || typeof workspaceDataApi()?.onInvalidated !== "function")
    return () => {};
  return workspaceDataApi()!.onInvalidated(listener);
}
export async function getWorkspaceRuntimeIdentity(): Promise<WorkspaceRuntimeIdentity> {
  if (
    !isElectron() ||
    typeof workspaceDataApi()?.getRuntimeIdentity !== "function"
  ) {
    return { workspaceRuntimeId: "renderer-fixture", revision: 0 };
  }
  const result = await workspaceDataApi()!.getRuntimeIdentity();
  if (!result.ok || !result.data)
    throw ipcError(result.error, "Unable to read workspace runtime identity");
  return result.data as WorkspaceRuntimeIdentity;
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
function runtimeIpcError(
  error: { code?: string; userMessage?: string } | undefined,
  fallback: string,
) {
  return Object.assign(new Error(error?.userMessage || fallback), {
    code: error?.code,
  });
}
export async function getRuntimeDiagnostics(): Promise<RuntimeDiagnostics> {
  if (!isElectron()) return emptyDiagnostics;
  const result = await runtimeDiagnosticsApi()!.get();
  if (!result.ok)
    throw runtimeIpcError(result.error, "Unable to read runtime diagnostics");
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
  const result = await runtimeDiagnosticsApi()!.browserSmoke();
  if (!result.ok || !result.data)
    throw runtimeIpcError(result.error, "Browser self-check failed");
  return result.data;
}
export { getPlatformQueue } from "./platform";
