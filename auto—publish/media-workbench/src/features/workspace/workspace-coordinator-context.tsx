import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { getWorkspaceRuntimeIdentity, onWorkspaceDataInvalidated } from '../../bridge/workspace';
import { createWorkspaceCoordinator } from './workspace-coordinator.js';

type ScopeRefresh = (input: { kind: string; workspaceRuntimeId: string | null; revision: number; reasonCode: string; scope: string }) => void;
type Coordinator = ReturnType<typeof createWorkspaceCoordinator>;

const WorkspaceCoordinatorContext = createContext<Coordinator | null>(null);

export function WorkspaceCoordinatorProvider({ children }: { children: ReactNode }) {
  const coordinatorRef = useRef<Coordinator | null>(null);
  if (!coordinatorRef.current) {
    const diagnostics: Array<{ code: string; category: string }> = [];
    coordinatorRef.current = createWorkspaceCoordinator({
      subscribe: onWorkspaceDataInvalidated,
      diagnose: (item: { code: string; category: string }) => {
        diagnostics.push(item);
        if (diagnostics.length > 100) diagnostics.shift();
      },
    });
  }
  useEffect(() => {
    const coordinator = coordinatorRef.current!;
    coordinator.start();
    let cancelled = false;
    getWorkspaceRuntimeIdentity()
      .then((identity) => { if (!cancelled) coordinator.initialize(identity); })
      .catch(() => undefined);
    return () => { cancelled = true; coordinator.dispose(); };
  }, []);
  return <WorkspaceCoordinatorContext.Provider value={coordinatorRef.current}>{children}</WorkspaceCoordinatorContext.Provider>;
}

export function useWorkspaceRuntimeIdentity() {
  const coordinator = useContext(WorkspaceCoordinatorContext);
  if (!coordinator) throw new Error('WorkspaceCoordinatorProvider is required');
  return useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, coordinator.getSnapshot);
}

export function useWorkspaceScope(scope: string, refresh: ScopeRefresh) {
  const coordinator = useContext(WorkspaceCoordinatorContext);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!coordinator) throw new Error('WorkspaceCoordinatorProvider is required');
    return coordinator.register(scope, (input) => refreshRef.current(input));
  }, [coordinator, scope]);
}
