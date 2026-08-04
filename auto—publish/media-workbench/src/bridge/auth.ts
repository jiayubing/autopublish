import type { AuthState } from "../types/auth";
import {
  authIpcError,
  isElectron,
  requireAuthApi,
  requireBridgeMethod,
  unavailable,
} from "./transport";

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
  try {
    return requireAuthApi<AuthApi>();
  } catch {
    return undefined;
  }
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
  const result = await requireBridgeMethod(api.getState)();
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
  return confirmedAuthCall(
    requireBridgeMethod(api.login)(loginName, password),
    "登录失败",
  );
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
    requireBridgeMethod(api.changePassword)(
      loginName,
      currentPassword,
      newPassword,
    ),
    "修改密码失败",
  );
}

export async function refreshAuth(): Promise<AuthState> {
  const api = authApi();
  if (!isElectron() || !api) return createUnauthenticatedState();
  const result = await requireBridgeMethod(api.refresh)();
  return result.ok && result.data ? result.data : createUnauthenticatedState();
}

export async function logout(): Promise<AuthState> {
  const api = authApi();
  if (!isElectron() || !api) return createUnauthenticatedState();
  const result = await requireBridgeMethod(api.logout)();
  return result.ok && result.data ? result.data : createUnauthenticatedState();
}

export function onAuthStateChanged(
  listener: (state: AuthState) => void,
): () => void {
  const api = authApi();
  if (!isElectron() || !api || typeof api.onStateChanged !== "function")
    return () => {};
  return requireBridgeMethod(api.onStateChanged)(listener);
}
