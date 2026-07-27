import type { AuthState } from "../types";
import { authIpcError, isElectron, unavailable } from "./transport";

type LegacyAuthResponse<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

type AuthApi = {
  getState: () => Promise<LegacyAuthResponse<AuthState>>;
  login: (
    loginName: string,
    password: string,
  ) => Promise<LegacyAuthResponse<AuthState>>;
  changePassword: (
    loginName: string,
    currentPassword: string,
    newPassword: string,
  ) => Promise<LegacyAuthResponse<AuthState>>;
  refresh: () => Promise<LegacyAuthResponse<AuthState>>;
  logout: () => Promise<LegacyAuthResponse<AuthState>>;
  onStateChanged: (listener: (state: AuthState) => void) => () => void;
};

function authApi(): AuthApi | undefined {
  return window.desktopConsole?.auth as AuthApi | undefined;
}

export function createUnauthenticatedState(): AuthState {
  return {
    authenticated: false,
    user: null,
    entitlements: [],
    errorCode: null,
  };
}

export async function getAuthState(): Promise<AuthState> {
  const api = authApi();
  if (!isElectron() || !api) return createUnauthenticatedState();
  const result = await api.getState();
  return result.ok && result.data
    ? result.data
    : {
        ...createUnauthenticatedState(),
        errorCode: result.error?.code || "AUTH_SERVICE_UNAVAILABLE",
      };
}

async function confirmedAuthCall(
  command: Promise<{
    ok: boolean;
    data?: AuthState;
    error?: { code?: string; message?: string };
  }>,
  fallback: string,
): Promise<AuthState> {
  const result = await command;
  if (!result.ok || !result.data) throw authIpcError(result.error, fallback);
  return result.data;
}

export function login(loginName: string, password: string): Promise<AuthState> {
  const api = authApi();
  if (!isElectron() || !api)
    return Promise.reject(unavailable("桌面认证不可用"));
  return confirmedAuthCall(api.login(loginName, password), "登录失败");
}

export function changeAuthPassword(
  loginName: string,
  currentPassword: string,
  newPassword: string,
): Promise<AuthState> {
  const api = authApi();
  if (!isElectron() || !api)
    return Promise.reject(unavailable("桌面认证不可用"));
  return confirmedAuthCall(
    api.changePassword(loginName, currentPassword, newPassword),
    "修改密码失败",
  );
}

export async function refreshAuth(): Promise<AuthState> {
  const api = authApi();
  if (!isElectron() || !api) return createUnauthenticatedState();
  const result = await api.refresh();
  return result.ok && result.data ? result.data : createUnauthenticatedState();
}

export async function logout(): Promise<AuthState> {
  const api = authApi();
  if (!isElectron() || !api) return createUnauthenticatedState();
  const result = await api.logout();
  return result.ok && result.data ? result.data : createUnauthenticatedState();
}

export function onAuthStateChanged(
  listener: (state: AuthState) => void,
): () => void {
  const api = authApi();
  if (!isElectron() || typeof api?.onStateChanged !== "function")
    return () => {};
  return api.onStateChanged(listener);
}
