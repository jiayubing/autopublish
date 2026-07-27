import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import {
  cancelWorkspaceSelection,
  chooseWorkspaceDirectory,
  confirmWorkspaceSelection,
  getCurrentWorkspace,
  getWorkspaceBootstrapState,
  openCurrentWorkspace,
  requestWorkspaceSwitch,
} from "../../bridge/workspace";
import { createWorkspaceFeature } from "./workspace-feature.js";

function createProductionWorkspaceFeature() {
  return createWorkspaceFeature({
    getBootstrapState: getWorkspaceBootstrapState,
    getCurrent: getCurrentWorkspace,
    chooseDirectory: chooseWorkspaceDirectory,
    confirmSelection: confirmWorkspaceSelection,
    cancelSelection: cancelWorkspaceSelection,
    openCurrent: openCurrentWorkspace,
    requestSwitch: requestWorkspaceSwitch,
  });
}

type WorkspaceFeature = ReturnType<typeof createProductionWorkspaceFeature>;
const WorkspaceFeatureContext = createContext<WorkspaceFeature | null>(null);

export function WorkspaceFeatureProvider({
  children,
}: {
  children: ReactNode;
}) {
  const featureRef = useRef<WorkspaceFeature | null>(null);
  const initializedRef = useRef(false);
  const disposeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (!featureRef.current)
    featureRef.current = createProductionWorkspaceFeature();
  const feature = featureRef.current;
  useEffect(() => {
    if (disposeTimerRef.current) {
      clearTimeout(disposeTimerRef.current);
      disposeTimerRef.current = null;
    }
    if (!initializedRef.current) {
      initializedRef.current = true;
      void feature.initialize();
    }
    return () => {
      disposeTimerRef.current = setTimeout(() => feature.dispose(), 0);
    };
  }, [feature]);
  return (
    <WorkspaceFeatureContext.Provider value={feature}>
      {children}
    </WorkspaceFeatureContext.Provider>
  );
}

export function useWorkspaceFeature() {
  const feature = useContext(WorkspaceFeatureContext);
  if (!feature) throw new Error("WorkspaceFeatureProvider is required");
  const snapshot = useSyncExternalStore(
    feature.subscribe,
    feature.getSnapshot,
    feature.getSnapshot,
  );
  return { feature, snapshot };
}
