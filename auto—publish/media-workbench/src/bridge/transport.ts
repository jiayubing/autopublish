import type { IpcError } from "../types";

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

export function ipcError(
  error: IpcError | undefined,
  fallback: string,
): Error & {
  code?: string;
  category?: IpcError["category"];
  retryability?: IpcError["retryability"];
  diagnosticId?: string;
} {
  const value = Object.assign(new Error(error?.userMessage || fallback), {
    code: error?.code,
    category: error?.category,
    retryability: error?.retryability,
    diagnosticId: error?.diagnosticId,
  });
  return value;
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

export function unavailable(message: string): Error {
  return new Error(message);
}
