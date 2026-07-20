import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { getPlatformState, onPlatformState } from "./bridge/platform";
import type { PlatformTaskSnapshot, PlatformSubmitState } from "./types";

export const IDLE_PLATFORM_TASK_SNAPSHOT: PlatformTaskSnapshot = {
  runId: null,
  phase: "idle",
  total: 0,
  processed: 0,
  succeeded: 0,
  failed: 0,
  skipped: 0,
  uncertain: 0,
  currentTask: null,
  startedAt: null,
  updatedAt: null,
  terminalResult: null,
  isBatchRunning: false,
  isStopPending: false,
  isPlatformRunning: false,
  waitRemainingMs: 0,
};

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function timestamp(value?: string | null): number {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface PlatformTaskStore {
  getSnapshot(): PlatformTaskSnapshot;
  apply(next: PlatformSubmitState | PlatformTaskSnapshot): boolean;
  initialize(): Promise<void>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export function createPlatformTaskStore(api: {
  getState?: typeof getPlatformState;
  onState?: typeof onPlatformState;
} = {}): PlatformTaskStore {
  const getState = api.getState || getPlatformState;
  const subscribePlatformState = api.onState || onPlatformState;
  let snapshot = copy(IDLE_PLATFORM_TASK_SNAPSHOT);
  let unsubscribe: (() => void) | null = null;
  let listeners = new Set<() => void>();

  function notify() {
    listeners.forEach((listener) => listener());
  }

  function apply(next: PlatformSubmitState | PlatformTaskSnapshot): boolean {
    if (!next || typeof next !== "object") return false;
    const incoming = next as PlatformTaskSnapshot;
    if (snapshot.runId && incoming.runId && snapshot.runId !== incoming.runId) {
      const currentIsActive = ["running", "waiting-interval", "stopping"].includes(snapshot.phase) || snapshot.isPlatformRunning;
      if (currentIsActive && timestamp(incoming.updatedAt) <= timestamp(snapshot.updatedAt)) return false;
    } else if (snapshot.runId && incoming.runId === snapshot.runId && timestamp(incoming.updatedAt) < timestamp(snapshot.updatedAt)) {
      return false;
    }
    if (snapshot.runId === incoming.runId && timestamp(incoming.updatedAt) === timestamp(snapshot.updatedAt) && incoming.phase === "heartbeat") return false;
    snapshot = copy({ ...IDLE_PLATFORM_TASK_SNAPSHOT, ...snapshot, ...incoming });
    notify();
    return true;
  }

  async function initialize() {
    const initial = await getState();
    apply(initial);
    unsubscribe = subscribePlatformState((next) => apply(next));
  }

  return {
    getSnapshot: () => copy(snapshot),
    apply,
    initialize,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
      listeners.clear();
    },
  };
}

const PlatformTaskContext = createContext<PlatformTaskSnapshot>(IDLE_PLATFORM_TASK_SNAPSHOT);

export function PlatformTaskProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<PlatformTaskStore | null>(null);
  if (!storeRef.current) storeRef.current = createPlatformTaskStore();
  const store = storeRef.current;
  const [, refresh] = useState(0);

  useEffect(() => {
    let active = true;
    const unsubscribe = store.subscribe(() => { if (active) refresh((value) => value + 1); });
    void store.initialize();
    return () => {
      active = false;
      unsubscribe();
      store.dispose();
    };
  }, [store]);

  return <PlatformTaskContext.Provider value={store.getSnapshot()}>{children}</PlatformTaskContext.Provider>;
}

export function usePlatformTask(): PlatformTaskSnapshot {
  return useContext(PlatformTaskContext);
}
