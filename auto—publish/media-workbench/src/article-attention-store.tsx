import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { listArticleAttentionSnapshot } from './bridge/publication';
import { onWorkspaceDataInvalidated } from './bridge/workspace';
import type { ArticleAttentionItem, ArticleAttentionList, WorkspaceDataInvalidatedEvent } from './types';

export interface ArticleAttentionSnapshot {
  revision: number;
  items: ArticleAttentionItem[];
  counts: { total: number; actionable: number };
  loading: boolean;
  error: string | null;
}

export interface ArticleAttentionStore {
  getSnapshot(): ArticleAttentionSnapshot;
  refresh(reason?: string): Promise<ArticleAttentionSnapshot>;
  subscribe(listener: () => void): () => void;
}

const EMPTY_SNAPSHOT: ArticleAttentionSnapshot = { revision: 0, items: [], counts: { total: 0, actionable: 0 }, loading: false, error: null };

function snapshotFrom(data: ArticleAttentionList, loading: boolean, error: string | null): ArticleAttentionSnapshot {
  return {
    revision: Number.isSafeInteger(data.revision) ? data.revision : 0,
    items: Array.isArray(data.items) ? data.items : [],
    counts: data.counts || { total: Array.isArray(data.items) ? data.items.length : 0, actionable: 0 },
    loading,
    error,
  };
}

export function createArticleAttentionStore(clientId: string, loader = listArticleAttentionSnapshot): ArticleAttentionStore {
  let snapshot = EMPTY_SNAPSHOT;
  let inFlight: Promise<ArticleAttentionSnapshot> | null = null;
  let requestId = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());

  const store: ArticleAttentionStore = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    refresh: (_reason = 'manual') => {
      if (!clientId) return Promise.resolve(snapshot);
      if (inFlight) return inFlight;
      const currentRequestId = ++requestId;
      snapshot = { ...snapshot, loading: true, error: null };
      emit();
      const request = loader(clientId).then((data) => {
        if (currentRequestId !== requestId || data.revision < snapshot.revision) {
          snapshot = { ...snapshot, loading: false };
          emit();
          return snapshot;
        }
        snapshot = snapshotFrom(data, false, null);
        emit();
        return snapshot;
      }).catch((error: unknown) => {
        if (currentRequestId === requestId) {
          snapshot = { ...snapshot, loading: false, error: error instanceof Error ? error.message : '无法加载需处理项' };
          emit();
        }
        throw error;
      });
      let wrapped: Promise<ArticleAttentionSnapshot>;
      wrapped = request.finally(() => { if (inFlight === wrapped) inFlight = null; });
      inFlight = wrapped;
      return wrapped;
    },
  };
  return store;
}

const AttentionStoreContext = createContext<ArticleAttentionStore | null>(null);

export function ArticleAttentionProvider({ clientId, children }: { clientId: string; children: ReactNode }) {
  const store = useMemo(() => createArticleAttentionStore(clientId), [clientId]);
  const lastInvalidationRevision = useRef(0);
  useEffect(() => {
    lastInvalidationRevision.current = 0;
    if (clientId) void store.refresh('mount').catch(() => {});
    return onWorkspaceDataInvalidated((event: WorkspaceDataInvalidatedEvent) => {
      if (!event.scopes.includes('articleAttention') || event.revision <= lastInvalidationRevision.current) return;
      lastInvalidationRevision.current = event.revision;
      void store.refresh(event.reasonCode || 'workspace-invalidated').catch(() => {});
    });
  }, [clientId, store]);
  return <AttentionStoreContext.Provider value={store}>{children}</AttentionStoreContext.Provider>;
}

export function useArticleAttention(clientId?: string) {
  const store = useContext(AttentionStoreContext);
  const fallback = useMemo(() => createArticleAttentionStore(''), []);
  const activeStore = store && clientId ? store : fallback;
  const snapshot = useSyncExternalStore(activeStore.subscribe, activeStore.getSnapshot, activeStore.getSnapshot);
  const refresh = useMemo(() => (reason = 'manual') => activeStore.refresh(reason), [activeStore]);
  return { snapshot, refresh };
}
