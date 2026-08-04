import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  changeAuthPassword,
  getAuthState,
  login,
  logout,
  onAuthStateChanged,
} from "./bridge/auth";
import type { AuthState } from "./types/auth";
import authContract from "../../src/contracts/auth-contract.json";

const AUTH_ERROR_MESSAGES: Record<string, string> = authContract.messages;

type AuthCommandName = "login" | "changePassword" | "logout";
type AuthCommandState = {
  busy: boolean;
  error: AuthCommandError | null;
  result: AuthState | null;
};

export interface AuthCommandError {
  code: string;
  userMessage: string;
}

export interface AuthClientSnapshot {
  state: AuthState;
  query: {
    loading: boolean;
    error: AuthCommandError | null;
  };
  commands: Readonly<
    Record<
      AuthCommandName,
      {
        busy: boolean;
        error: AuthCommandError | null;
        result: AuthState | null;
      }
    >
  >;
}

export interface AuthClientStore {
  getState(): AuthState;
  getSnapshot(): AuthClientSnapshot;
  initialize(): Promise<void>;
  subscribe(listener: () => void): () => void;
  login(loginName: string, password: string): Promise<AuthState>;
  changePassword(
    loginName: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<AuthState>;
  logout(): Promise<AuthState>;
  dispose(): void;
}

const COMMAND_NAMES: readonly AuthCommandName[] = [
  "login",
  "changePassword",
  "logout",
];

function initialState(): AuthState {
  return {
    authenticated: false,
    user: null,
    entitlements: [],
    errorCode: null,
    sessionStatus: "signed_out",
  };
}

function safeError(value: unknown, fallbackCode: string, fallbackMessage: string): AuthCommandError {
  const candidate = value && typeof value === "object" ? value as {
    code?: unknown;
  } : null;
  const code = typeof candidate?.code === "string" && candidate.code
    ? candidate.code
    : fallbackCode;
  return Object.freeze({
    code,
    userMessage: AUTH_ERROR_MESSAGES[code] || fallbackMessage,
  });
}

function commandState(): AuthCommandState {
  return { busy: false, error: null, result: null };
}

export function createAuthClientStore(): AuthClientStore {
  let state = initialState();
  let query = { loading: true, error: null as AuthCommandError | null };
  const commands = Object.fromEntries(
    COMMAND_NAMES.map((name) => [name, commandState()]),
  ) as Record<AuthCommandName, AuthCommandState>;
  const activeCommands = new Map<AuthCommandName, number>();
  const listeners = new Set<() => void>();
  let snapshot: AuthClientSnapshot;
  let unsubscribe: (() => void) | null = null;
  let initializePromise: Promise<void> | null = null;
  let lifecycle = 0;
  let requestSequence = 0;
  let latestStateRequest = 0;
  let disposed = false;

  const notify = () => listeners.forEach((listener) => listener());
  const publish = () => {
    const commandSnapshot = Object.fromEntries(
      COMMAND_NAMES.map((name) => [
        name,
        Object.freeze({ ...commands[name] }),
      ]),
    ) as AuthClientSnapshot["commands"];
    snapshot = Object.freeze({
      state,
      query: Object.freeze({ ...query }),
      commands: Object.freeze(commandSnapshot),
    });
    notify();
  };

  const applyState = (next: AuthState, request: number) => {
    if (disposed || request < latestStateRequest) return false;
    latestStateRequest = request;
    state = next;
    query = { loading: false, error: null };
    publish();
    return true;
  };

  const beginCommand = (name: AuthCommandName) => {
    if (disposed) {
      throw Object.assign(new Error("认证状态已释放"), {
        code: "AUTH_STORE_DISPOSED",
      });
    }
    const request = ++requestSequence;
    latestStateRequest = request;
    activeCommands.set(name, request);
    commands[name] = { busy: true, error: null, result: null };
    query = { ...query, loading: false };
    publish();
    return request;
  };

  async function executeCommand(
    name: AuthCommandName,
    operation: () => Promise<AuthState>,
    fallbackCode: string,
    fallbackMessage: string,
  ): Promise<AuthState> {
    const request = beginCommand(name);
    try {
      const next = await operation();
      if (disposed || activeCommands.get(name) !== request) return next;
      if (request >= latestStateRequest) applyState(next, request);
      commands[name] = { busy: false, error: null, result: next };
      publish();
      return next;
    } catch (value) {
      if (!disposed && activeCommands.get(name) === request) {
        commands[name] = {
          busy: false,
          error: safeError(value, fallbackCode, fallbackMessage),
          result: null,
        };
        publish();
      }
      throw value;
    }
  }

  publish();

  return {
    getState: () => state,
    getSnapshot: () => snapshot,
    async initialize() {
      if (initializePromise) return initializePromise;
      disposed = false;
      const currentLifecycle = lifecycle;
      const request = ++requestSequence;
      latestStateRequest = request;
      query = { loading: true, error: null };
      publish();
      const pending = (async () => {
        try {
          const next = await getAuthState();
          if (disposed || currentLifecycle !== lifecycle) return;
          if (request >= latestStateRequest) applyState(next, request);
          if (!unsubscribe) {
            unsubscribe = onAuthStateChanged((changed) => {
              if (disposed || currentLifecycle !== lifecycle) return;
              const eventRequest = ++requestSequence;
              latestStateRequest = eventRequest;
              state = changed;
              query = { loading: false, error: null };
              publish();
            });
          }
        } catch (value) {
          if (!disposed && currentLifecycle === lifecycle && request >= latestStateRequest) {
            const error = safeError(
              value,
              "AUTH_SERVICE_UNAVAILABLE",
              "认证服务暂时不可用，请稍后重试",
            );
            state = { ...initialState(), errorCode: error.code };
            query = { loading: false, error };
            publish();
          }
          throw value;
        }
      })();
      initializePromise = pending;
      try {
        await pending;
      } finally {
        if (initializePromise === pending) initializePromise = null;
      }
    },
    subscribe(listener) {
      disposed = false;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    login(loginName, password) {
      return executeCommand(
        "login",
        () => login(loginName, password),
        "AUTH_LOGIN_FAILED",
        "登录失败，请重试",
      );
    },
    changePassword(loginName, currentPassword, newPassword) {
      return executeCommand(
        "changePassword",
        () => changeAuthPassword(loginName, currentPassword, newPassword),
        "AUTH_PASSWORD_CHANGE_FAILED",
        "修改密码失败，请重试",
      );
    },
    logout() {
      return executeCommand(
        "logout",
        () => logout(),
        "AUTH_LOGOUT_FAILED",
        "退出登录失败，请重试",
      );
    },
    dispose() {
      lifecycle += 1;
      disposed = true;
      requestSequence += 1;
      latestStateRequest = requestSequence;
      activeCommands.clear();
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
      initializePromise = null;
      query = { loading: false, error: null };
      COMMAND_NAMES.forEach((name) => {
        commands[name] = commandState();
      });
      publish();
      listeners.clear();
    },
  };
}

const AuthContext = createContext<AuthClientStore | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<AuthClientStore | null>(null);
  if (!storeRef.current) storeRef.current = createAuthClientStore();
  const store = storeRef.current;
  useEffect(() => {
    void store.initialize();
    return () => store.dispose();
  }, [store]);
  return <AuthContext.Provider value={store}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthClientStore {
  const store = useContext(AuthContext);
  if (!store) throw new Error("AuthProvider is required");
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return store;
}
