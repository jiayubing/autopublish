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
import { ipcError, requireBridgeApi, requireDisposer } from "./transport";

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
  openCurrent: () => Promise<WorkspaceResponse<{ opened: boolean }>>;
  requestSwitch: () => Promise<WorkspaceResponse<WorkspaceBootstrapState>>;
};
type WorkspaceDataApi = {
  onInvalidated: (
    listener: (event: WorkspaceDataInvalidatedEvent) => void,
  ) => () => void;
  onInvalidationDiagnostic?: (listener: () => void) => () => void;
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

const workspaceApi = () => requireBridgeApi<WorkspaceApi>("workspace");
const workspaceDataApi = () =>
  requireBridgeApi<WorkspaceDataApi>("workspaceData");
const runtimeDiagnosticsApi = () =>
  requireBridgeApi<RuntimeDiagnosticsApi>("runtimeDiagnostics");

export type { RuntimeCapability, RuntimeDiagnostics };
export async function getWorkspaceBootstrapState(): Promise<WorkspaceBootstrapState> {
  const result = await workspaceApi().getBootstrapState();
  if (!result.ok)
    throw ipcError(result.error, "Unable to read workspace bootstrap state");
  if (!result.data)
    throw ipcError(undefined, "Unable to read workspace bootstrap state");
  return result.data;
}
export async function chooseWorkspaceDirectory(): Promise<WorkspaceBootstrapState> {
  const result = await workspaceApi().chooseDirectory();
  if (!result.ok) throw ipcError(result.error, "Unable to choose a workspace");
  if (!result.data) throw ipcError(undefined, "Unable to choose a workspace");
  return result.data;
}
export async function confirmWorkspaceSelection(
  input: WorkspaceSelectionToken,
): Promise<WorkspaceConfirmationResult> {
  const result = await workspaceApi().confirmSelection(input);
  if (!result.ok)
    throw ipcError(result.error, "Unable to confirm workspace selection");
  if (!result.data)
    throw ipcError(undefined, "Unable to confirm workspace selection");
  return result.data;
}
export async function cancelWorkspaceSelection(): Promise<WorkspaceBootstrapState> {
  const result = await workspaceApi().cancelSelection();
  if (!result.ok)
    throw ipcError(result.error, "Unable to cancel workspace selection");
  if (!result.data)
    throw ipcError(undefined, "Unable to cancel workspace selection");
  return result.data;
}
export async function getCurrentWorkspace(): Promise<WorkspaceCurrent> {
  const result = await workspaceApi().getCurrent();
  if (!result.ok)
    throw ipcError(result.error, "Unable to read the current workspace");
  if (!result.data)
    throw ipcError(undefined, "Unable to read the current workspace");
  return result.data;
}
export async function openCurrentWorkspace(): Promise<void> {
  const result = await workspaceApi().openCurrent();
  if (!result.ok)
    throw ipcError(result.error, "Unable to open the current workspace");
  if (!result.data)
    throw ipcError(undefined, "Unable to open the current workspace");
}
export async function requestWorkspaceSwitch(): Promise<WorkspaceBootstrapState> {
  const result = await workspaceApi().requestSwitch();
  if (!result.ok) throw ipcError(result.error, "Unable to switch workspace");
  if (!result.data) throw ipcError(undefined, "Unable to switch workspace");
  return result.data;
}
export function onWorkspaceDataInvalidated(
  listener: (event: WorkspaceDataInvalidatedEvent) => void,
): () => void {
  return requireDisposer(
    workspaceDataApi().onInvalidated(listener),
    "Workspace invalidation subscription failed",
  );
}
export function onWorkspaceInvalidationDiagnostic(
  listener: () => void,
): () => void {
  let subscribe: WorkspaceDataApi["onInvalidationDiagnostic"];
  try {
    subscribe = workspaceDataApi().onInvalidationDiagnostic;
  } catch {
    return () => {};
  }
  if (typeof subscribe !== "function") return () => {};
  return requireDisposer(
    subscribe(listener),
    "Workspace invalidation diagnostic subscription failed",
  );
}
export async function getWorkspaceRuntimeIdentity(): Promise<WorkspaceRuntimeIdentity> {
  const result = await workspaceDataApi().getRuntimeIdentity();
  if (!result.ok || !result.data)
    throw ipcError(result.error, "Unable to read workspace runtime identity");
  return result.data as WorkspaceRuntimeIdentity;
}
function runtimeIpcError(
  error: { code?: string; userMessage?: string } | undefined,
  fallback: string,
) {
  return ipcError(error, fallback);
}
export async function getRuntimeDiagnostics(): Promise<RuntimeDiagnostics> {
  const result = await runtimeDiagnosticsApi().get();
  if (!result.ok)
    throw runtimeIpcError(result.error, "Unable to read runtime diagnostics");
  if (!result.data)
    throw runtimeIpcError(undefined, "Unable to read runtime diagnostics");
  return result.data;
}
export async function runBrowserSelfCheck(): Promise<{
  ok: boolean;
  browserChannel: string;
  session: string;
  capability?: RuntimeBrowserCapability;
}> {
  const result = await runtimeDiagnosticsApi().browserSmoke();
  if (!result.ok || !result.data)
    throw runtimeIpcError(result.error, "Browser self-check failed");
  return result.data;
}
export { getPlatformQueue } from "./platform";
