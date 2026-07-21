import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { getPlatformQueue } from './bridge/platform';
import { onWorkspaceDataInvalidated } from './bridge/workspace';
import type { PlatformArticle, PlatformQueueData, PlatformQueueSnapshot } from './types';

export const PLATFORM_QUEUE_SCOPE = 'platformQueue' as const;
export type WorkspaceDataScope = typeof PLATFORM_QUEUE_SCOPE;
export type WorkspaceDataListener = () => void;
export type PlatformQueueLoader = () => Promise<PlatformQueueData>;

export interface WorkspaceDataStore {
  getSnapshot(scope: WorkspaceDataScope): PlatformQueueSnapshot;
  refresh(scope: WorkspaceDataScope, reason?: string): Promise<PlatformQueueSnapshot>;
  subscribe(scope: WorkspaceDataScope, listener: WorkspaceDataListener): () => void;
}

const EMPTY_SNAPSHOT: PlatformQueueSnapshot = {
  revision: 0,
  queue: [],
  platforms: [],
  counts: { actionable: 0, attention: 0, total: 0 },
  loading: false,
  error: null,
};

function isAttentionItem(article: PlatformArticle): boolean {
  return Boolean(article.archiveError) || article.sourceArticleState === 'missing' || article.sourceArticleState === 'trashed';
}

function makeSnapshot(
  data: PlatformQueueData,
  revision: number,
  loading: boolean,
  error: string | null,
): PlatformQueueSnapshot {
  const queue = Array.isArray(data.queue) ? data.queue : [];
  const platforms = Array.isArray(data.platforms) ? data.platforms : [];
  const attention = queue.filter(isAttentionItem).length;
  const actionable = queue.filter((article) => !isAttentionItem(article)).length;
  return {
    revision,
    queue,
    platforms,
    counts: { actionable, attention, total: queue.length },
    loading,
    error,
  };
}

export function createWorkspaceDataStore(options: { loadPlatformQueue?: PlatformQueueLoader; initialSnapshot?: PlatformQueueSnapshot } = {}): WorkspaceDataStore {
  const loadPlatformQueue = options.loadPlatformQueue || getPlatformQueue;
  let snapshot = options.initialSnapshot || EMPTY_SNAPSHOT;
  let inFlight: Promise<PlatformQueueSnapshot> | null = null;
  let requestId = 0;
  const listeners = new Set<WorkspaceDataListener>();

  const emit = () => listeners.forEach((listener) => listener());

  const store: WorkspaceDataStore = {
    getSnapshot(scope) {
      if (scope !== PLATFORM_QUEUE_SCOPE) throw new Error(`Unsupported workspace data scope: ${scope}`);
      return snapshot;
    },

    subscribe(scope, listener) {
      if (scope !== PLATFORM_QUEUE_SCOPE) throw new Error(`Unsupported workspace data scope: ${scope}`);
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    refresh(scope, _reason = 'manual') {
      if (scope !== PLATFORM_QUEUE_SCOPE) return Promise.reject(new Error(`Unsupported workspace data scope: ${scope}`));
      if (inFlight) return inFlight;

      const currentRequestId = ++requestId;
      snapshot = { ...snapshot, loading: true, error: null };
      emit();

      const request = loadPlatformQueue().then((data) => {
        // A loader may expose a backend revision. Never let an older response
        // replace a snapshot already accepted at a newer revision.
        const sourceRevision = typeof data.revision === 'number' ? data.revision : null;
        if (currentRequestId !== requestId || (sourceRevision !== null && sourceRevision < snapshot.revision)) {
          snapshot = { ...snapshot, loading: false };
          emit();
          return snapshot;
        }
        const nextRevision = sourceRevision === null ? snapshot.revision + 1 : Math.max(snapshot.revision + 1, sourceRevision);
        snapshot = makeSnapshot(data, nextRevision, false, null);
        emit();
        return snapshot;
      }).catch((error: unknown) => {
        if (currentRequestId === requestId) {
          snapshot = { ...snapshot, loading: false, error: error instanceof Error ? error.message : '无法加载投稿队列' };
          emit();
        }
        throw error;
      });

      let wrappedRequest: Promise<PlatformQueueSnapshot>;
      wrappedRequest = request.finally(() => {
        if (inFlight === wrappedRequest) inFlight = null;
      });
      inFlight = wrappedRequest;
      return wrappedRequest;
    },
  };

  return store;
}

const defaultStore = createWorkspaceDataStore();
const WorkspaceDataStoreContext = createContext<WorkspaceDataStore>(defaultStore);

export function WorkspaceDataProvider({ children, store = defaultStore }: { children: ReactNode; store?: WorkspaceDataStore }) {
  const lastInvalidationRevision = useRef(0);
  useEffect(() => {
    const unsubscribe = onWorkspaceDataInvalidated((event) => {
      if (!event.scopes.includes(PLATFORM_QUEUE_SCOPE) || event.revision <= lastInvalidationRevision.current) return;
      lastInvalidationRevision.current = event.revision;
      void store.refresh(PLATFORM_QUEUE_SCOPE, event.reasonCode || 'workspace-invalidated').catch(() => {});
    });
    const currentSnapshot = store.getSnapshot(PLATFORM_QUEUE_SCOPE);
    if (!currentSnapshot.revision && !currentSnapshot.loading) {
      void store.refresh(PLATFORM_QUEUE_SCOPE, 'initial').catch(() => {});
    }
    return unsubscribe;
  }, [store]);
  return <WorkspaceDataStoreContext.Provider value={store}>{children}</WorkspaceDataStoreContext.Provider>;
}

export function useWorkspaceDataStore(): WorkspaceDataStore {
  return useContext(WorkspaceDataStoreContext);
}

export function usePlatformQueue() {
  const store = useWorkspaceDataStore();
  const subscribe = useCallback((listener: WorkspaceDataListener) => store.subscribe(PLATFORM_QUEUE_SCOPE, listener), [store]);
  const getSnapshot = useCallback(() => store.getSnapshot(PLATFORM_QUEUE_SCOPE), [store]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const refresh = useCallback((reason = 'manual') => store.refresh(PLATFORM_QUEUE_SCOPE, reason), [store]);

  return useMemo(() => ({ snapshot, refresh }), [refresh, snapshot]);
}
