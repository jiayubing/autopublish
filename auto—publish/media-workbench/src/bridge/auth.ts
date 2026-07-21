import type { AuthState } from "../types";
import { ipcError, isElectron, unavailable } from "./transport";

export function createUnauthenticatedState(): AuthState { return { authenticated: false, user: null, entitlements: [], errorCode: null }; }

export async function getAuthState(): Promise<AuthState> {
  if (!isElectron() || !window.desktopConsole?.auth) return createUnauthenticatedState();
  const result = await window.desktopConsole.auth.getState();
  return result.ok && result.data ? result.data : { ...createUnauthenticatedState(), errorCode: result.error?.code || "AUTH_SERVICE_UNAVAILABLE" };
}

async function confirmedAuthCall(command: Promise<{ ok: boolean; data?: AuthState; error?: { code?: string; message?: string } }>, fallback: string): Promise<AuthState> {
  const result = await command;
  if (!result.ok || !result.data) throw ipcError(result.error, fallback);
  return result.data;
}

export function login(loginName: string, password: string): Promise<AuthState> {
  if (!isElectron() || !window.desktopConsole?.auth) return Promise.reject(unavailable("桌面认证不可用"));
  return confirmedAuthCall(window.desktopConsole.auth.login(loginName, password), "登录失败");
}

export function changeAuthPassword(loginName: string, currentPassword: string, newPassword: string): Promise<AuthState> {
  if (!isElectron() || !window.desktopConsole?.auth) return Promise.reject(unavailable("桌面认证不可用"));
  return confirmedAuthCall(window.desktopConsole.auth.changePassword(loginName, currentPassword, newPassword), "修改密码失败");
}

export async function refreshAuth(): Promise<AuthState> {
  if (!isElectron() || !window.desktopConsole?.auth) return createUnauthenticatedState();
  const result = await window.desktopConsole.auth.refresh();
  return result.ok && result.data ? result.data : createUnauthenticatedState();
}

export async function logout(): Promise<AuthState> {
  if (!isElectron() || !window.desktopConsole?.auth) return createUnauthenticatedState();
  const result = await window.desktopConsole.auth.logout();
  return result.ok && result.data ? result.data : createUnauthenticatedState();
}

export function onAuthStateChanged(listener: (state: AuthState) => void): () => void {
  if (!isElectron() || typeof window.desktopConsole?.auth?.onStateChanged !== "function") return () => {};
  return window.desktopConsole.auth.onStateChanged(listener);
}
