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
  error: Partial<IpcError> | undefined,
  fallback: string,
): Error & {
  code?: string;
  category?: IpcError["category"];
  retryability?: IpcError["retryability"];
  diagnosticId?: string;
} {
  const value = Object.assign(new Error(error?.userMessage || fallback), {
    name: "OperationalError",
    code: error?.code || "IPC_RESULT_INVALID",
    category: error?.category || "transport",
    retryability: error?.retryability || "safe",
    diagnosticId: error?.diagnosticId,
  });
  return value;
}

export function requireBridgeApi<T extends object>(namespace: string): T {
  const desktopConsole =
    typeof window === "undefined" ? undefined : window.desktopConsole;
  const raw = desktopConsole?.[namespace as keyof DesktopConsoleApi];
  if (!raw || typeof raw !== "object") throw unavailable();

  return new Proxy(raw as T, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof property === "string" && typeof value !== "function") {
        throw unavailable();
      }
      return value;
    },
  });
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
