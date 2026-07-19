import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { getAuthState, login, logout, onAuthStateChanged } from "./electron-api";
import type { AuthState } from "./types";

export interface AuthClientStore {
  getState(): AuthState;
  initialize(): Promise<void>;
  subscribe(listener: () => void): () => void;
  login(loginName: string, password: string): Promise<AuthState>;
  logout(): Promise<AuthState>;
  dispose(): void;
}

export function createAuthClientStore(): AuthClientStore {
  let state: AuthState = { authenticated: false, user: null, entitlements: [], errorCode: null };
  let unsubscribe: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const setState = (next: AuthState) => { state = next; notify(); return state; };
  return {
    getState: () => state,
    async initialize() {
      setState(await getAuthState());
      unsubscribe = onAuthStateChanged((next) => setState(next));
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async login(loginName, password) { return setState(await login(loginName, password)); },
    async logout() { return setState(await logout()); },
    dispose() { if (unsubscribe) unsubscribe(); unsubscribe = null; listeners.clear(); },
  };
}

const AuthContext = createContext<{ store: AuthClientStore; version: number } | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<AuthClientStore | null>(null);
  if (!storeRef.current) storeRef.current = createAuthClientStore();
  const store = storeRef.current;
  const [version, refresh] = useState(0);
  useEffect(() => {
    const unsubscribe = store.subscribe(() => refresh((value) => value + 1));
    void store.initialize();
    return () => { unsubscribe(); store.dispose(); };
  }, [store]);
  return <AuthContext.Provider value={{ store, version }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthClientStore {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is required");
  return value.store;
}
