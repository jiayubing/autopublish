import type { IpcError } from "./ipc";

export type WorkspaceBootstrapStatus =
  | "checking"
  | "selection_required"
  | "confirmation_required"
  | "ready"
  | "invalid"
  | "relaunching";

export type WorkspaceSelectionKind =
  "existing_workspace" | "empty_directory" | "nonempty_directory";

export interface WorkspaceSelectionToken {
  token: string;
}

export interface WorkspaceSelection {
  token: string;
  kind: WorkspaceSelectionKind;
  label: string;
}

export interface WorkspaceBootstrapState {
  state: WorkspaceBootstrapStatus;
  configured: boolean;
  environmentManaged: boolean;
  label: string;
  selection: WorkspaceSelection | null;
  errorCode: string | null;
  changed: boolean | null;
}

export type WorkspaceCurrent = WorkspaceBootstrapState;
export type WorkspaceConfirmationResult = WorkspaceBootstrapState;

export type RuntimeCapabilityState =
  "ready" | "not_checked" | "optional_unconfigured" | "unavailable";
export interface RuntimeCapability {
  state: RuntimeCapabilityState;
  source: string | null;
  errorCode: string | null;
  lastCheckedAt: string | null;
  available?: boolean;
}
export interface RuntimeBrowserCapability extends RuntimeCapability {
  channel: string | null;
  configured: boolean;
  probed: boolean;
}
export interface RuntimeDiagnosticEvent {
  diagnosticId: string;
  userMessage: string;
  summary: {
    code: string;
    category: IpcError["category"];
  };
}
export interface RuntimeDiagnostics {
  ok: boolean;
  buildInfo: {
    version: string;
    commit: string;
    dirty: boolean;
    source?: string;
    observation?: "complete" | "partial" | "fallback" | "unavailable";
  };
  browserChannel: RuntimeBrowserCapability;
  capabilities: {
    playwrightNode: RuntimeCapability;
    playwrightCli: RuntimeCapability;
    browserChannel: RuntimeBrowserCapability;
    docx: RuntimeCapability;
    hepan: RuntimeCapability;
  };
  tools?: {
    playwrightNode: RuntimeCapability;
    playwrightCli: RuntimeCapability;
    hepanPython: RuntimeCapability;
  };
  errors: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
  runtimeEvents?: RuntimeDiagnosticEvent[];
  runtimeEventsObservation?: {
    status: "complete" | "partial";
    droppedCount: number;
  };
  diagnosticSink?: {
    status: "ready" | "degraded" | "not_configured" | "unavailable";
    startupStatus: string;
    memoryFailureCount: number;
    fileFailureCount: number;
    lastFailureCode: string | null;
  };
}

export type WorkspaceDataInvalidationScope =
  | "platformQueue"
  | "articleAttention"
  | "articleManagement"
  | "orders"
  | "contentSources"
  | string;
export interface WorkspaceDataInvalidatedEvent {
  schemaVersion?: 1;
  workspaceRuntimeId: string;
  revision: number;
  scopes: WorkspaceDataInvalidationScope[];
  reasonCode: string;
}

export interface WorkspaceRuntimeIdentity {
  workspaceRuntimeId: string;
  revision: number;
}
