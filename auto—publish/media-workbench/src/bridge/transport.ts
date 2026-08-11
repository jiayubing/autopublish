import type { IpcError } from "../types/ipc";

export interface DesktopConsoleApi {
  auth?: unknown;
  workspace?: unknown;
  workspaceData?: unknown;
  aiProvider?: unknown;
  platformSettings?: unknown;
  storageMaintenance?: unknown;
  runtimeDiagnostics?: unknown;
  media?: unknown;
  platforms?: unknown;
  content?: unknown;
  publication?: unknown;
  orders?: unknown;
}

declare global {
  interface Window {
    desktopConsole?: DesktopConsoleApi;
  }
}

export function isElectron(): boolean {
  return typeof window !== "undefined" && Boolean(window.desktopConsole);
}

export function requireDesktopConsole(): DesktopConsoleApi {
  const desktopConsole =
    typeof window === "undefined" ? undefined : window.desktopConsole;
  if (!desktopConsole) throw unavailable();
  return desktopConsole;
}

export function ipcError(
  error: Partial<IpcError> | undefined,
  fallback: string,
): Error & {
  code?: string;
  category?: IpcError["category"];
  retryability?: IpcError["retryability"];
  diagnosticId?: string;
  userMessage?: string;
} {
  const userMessage = error?.userMessage || fallback;
  const value = Object.assign(new Error(error?.userMessage || fallback), {
    name: "OperationalError",
    userMessage,
    code: error?.code || "IPC_RESULT_INVALID",
    category: error?.category || "transport",
    retryability: error?.retryability || "safe",
    diagnosticId: error?.diagnosticId,
  });
  return value;
}

export function requireBridgeCapability<T extends object>(value: unknown): T {
  if (!value || typeof value !== "object") throw unavailable();
  return value as T;
}

export function requireBridgeMethod<T extends (...args: never[]) => unknown>(
  value: T | null | undefined,
): T {
  if (typeof value !== "function") throw unavailable();
  return value;
}

export function requireAuthApi<T extends object>(): T {
  return requireBridgeCapability<T>(requireDesktopConsole().auth);
}

export function requireContentApi<T extends object>(): T {
  return requireBridgeCapability<T>(requireDesktopConsole().content);
}

export function requirePlatformsApi<T extends object>(): T {
  return requireBridgeCapability<T>(requireDesktopConsole().platforms);
}

export function requireMediaApi<T extends object>(): T {
  return requireBridgeCapability<T>(requireDesktopConsole().media);
}

export function requireOrdersApi<T extends object>(): T {
  return requireBridgeCapability<T>(requireDesktopConsole().orders);
}

export function requirePublicationApi<T extends object>(): T {
  return requireBridgeCapability<T>(requireDesktopConsole().publication);
}

export function requireWorkspaceApi<T extends object>(): T {
  return requireBridgeCapability<T>(requireDesktopConsole().workspace);
}

export function requireWorkspaceDataApi<T extends object>(): T {
  return requireBridgeCapability<T>(requireDesktopConsole().workspaceData);
}

export function requireRuntimeDiagnosticsApi<T extends object>(): T {
  return requireBridgeCapability<T>(requireDesktopConsole().runtimeDiagnostics);
}

export function requireAiProviderApi<T extends object>(): T {
  return requireBridgeCapability<T>(requireDesktopConsole().aiProvider);
}

export function requirePlatformSettingsApi<T extends object>(): T {
  return requireBridgeCapability<T>(requireDesktopConsole().platformSettings);
}

export function requireStorageMaintenanceApi<T extends object>(): T {
  return requireBridgeCapability<T>(requireDesktopConsole().storageMaintenance);
}

// Phase 07 owns the legacy auth envelope. Keep its message-shaped error
// isolated from every versioned non-Auth capability.
export function authIpcError(
  error: { code?: string; message?: string } | undefined,
  fallback: string,
): Error & { code?: string } {
  return Object.assign(new Error(error?.message || fallback), {
    code: error?.code,
  });
}

export function unavailable(
  message = "Desktop capability is unavailable",
): Error & {
  code: string;
  category: "transport";
  retryability: "safe";
} {
  return Object.assign(new Error(message), {
    name: "OperationalError",
    code: "IPC_CAPABILITY_UNAVAILABLE",
    category: "transport" as const,
    retryability: "safe" as const,
  });
}

export function requireDisposer(value: unknown, fallback: string): () => void {
  if (typeof value !== "function") throw ipcError(undefined, fallback);
  return value as () => void;
}
