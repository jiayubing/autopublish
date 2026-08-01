import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import {
  getWorkspaceRuntimeIdentity,
  onWorkspaceDataInvalidated,
  onWorkspaceInvalidationDiagnostic,
} from "../../bridge/workspace";
import { createWorkspaceCoordinator } from "./workspace-coordinator.js";
import { reportRuntimeDiagnostic } from "./runtime-diagnostic-sink";

type ScopeRefresh = (input: {
  kind: string;
  workspaceRuntimeId: string | null;
  revision: number;
  reasonCode: string;
  scope: string;
}) => void;
type Coordinator = ReturnType<typeof createWorkspaceCoordinator>;

const WorkspaceCoordinatorContext = createContext<Coordinator | null>(null);

export function WorkspaceCoordinatorProvider({
  children,
}: {
  children: ReactNode;
}) {
  const coordinatorRef = useRef<Coordinator | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = createWorkspaceCoordinator({
      subscribe: onWorkspaceDataInvalidated,
      diagnose: (item: { code: string; category: string }) => {
        reportRuntimeDiagnostic(item.code, "workspace-invalidation");
      },
    });
  }
  useEffect(() => {
    const coordinator = coordinatorRef.current!;
    coordinator.start();
    const disposeDiagnostic = onWorkspaceInvalidationDiagnostic(() =>
      reportRuntimeDiagnostic(
        "WORKSPACE_INVALIDATION_TRANSPORT_REJECTED",
        "workspace-invalidation",
      ),
    );
    let cancelled = false;
    getWorkspaceRuntimeIdentity()
      .then((identity) => {
        if (!cancelled) coordinator.initialize(identity);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      disposeDiagnostic();
      coordinator.stop();
    };
  }, []);
  return (
    <WorkspaceCoordinatorContext.Provider value={coordinatorRef.current}>
      {children}
    </WorkspaceCoordinatorContext.Provider>
  );
}

export function useWorkspaceRuntimeIdentity() {
  const coordinator = useContext(WorkspaceCoordinatorContext);
  if (!coordinator) throw new Error("WorkspaceCoordinatorProvider is required");
  return useSyncExternalStore(
    coordinator.subscribe,
    coordinator.getSnapshot,
    coordinator.getSnapshot,
  );
}

export function useWorkspaceScope(scope: string, refresh: ScopeRefresh) {
  const coordinator = useContext(WorkspaceCoordinatorContext);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!coordinator)
      throw new Error("WorkspaceCoordinatorProvider is required");
    return coordinator.register(scope, (input) => refreshRef.current(input));
  }, [coordinator, scope]);
}
