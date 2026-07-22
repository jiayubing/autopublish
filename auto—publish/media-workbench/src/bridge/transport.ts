import type { IpcError } from "../types";

declare global {
  interface Window {
    desktopConsole?: Record<string, any>;
  }
}

export function isElectron(): boolean {
  return typeof window !== "undefined" && Boolean(window.desktopConsole);
}

export function ipcError(
  error: IpcError | { code?: string; message?: string } | undefined,
  fallback: string,
): Error & { code?: string } {
  const value = Object.assign(new Error(error?.message || fallback), {
    code: error?.code,
  });
  return value;
}

export function unavailable(message: string): Error {
  return new Error(message);
}
