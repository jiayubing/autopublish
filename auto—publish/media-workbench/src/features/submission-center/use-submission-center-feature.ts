import { useEffect, useRef, useSyncExternalStore } from "react";
import { getSubmissionCenterSnapshot } from "../../bridge/content";
import { useWorkspaceScope } from "../workspace/workspace-coordinator-context";
import { createSubmissionCenterFeature } from "./submission-center-feature.js";

export function useSubmissionCenterFeature(clientId: string) {
  const clientIdRef = useRef(clientId);
  clientIdRef.current = clientId;
  const workspaceRuntimeIdRef = useRef("");
  const featureRef = useRef<ReturnType<typeof createSubmissionCenterFeature> | null>(null);
  if (!featureRef.current)
    featureRef.current = createSubmissionCenterFeature({ getSnapshot: getSubmissionCenterSnapshot });
  const feature = featureRef.current;

  useEffect(() => {
    const current = feature.getSnapshot().scope;
    const workspaceRuntimeId = current?.workspaceRuntimeId || workspaceRuntimeIdRef.current;
    if (!workspaceRuntimeId || !clientId) {
      feature.clearScope();
      return;
    }
    if (current?.clientId === clientId) return;
    feature.setScope({ workspaceRuntimeId, clientId });
    void feature.refresh("scope-change");
  }, [clientId, feature]);

  useWorkspaceScope("submissionCenter", (event) => {
    if (!event.workspaceRuntimeId) return;
    workspaceRuntimeIdRef.current = event.workspaceRuntimeId;
    if (!clientIdRef.current) {
      feature.clearScope();
      return;
    }
    feature.setScope({ workspaceRuntimeId: event.workspaceRuntimeId, clientId: clientIdRef.current });
    void feature.refresh(event.kind);
  });

  useEffect(() => () => feature.dispose(), [feature]);
  return {
    snapshot: useSyncExternalStore(feature.subscribe, feature.getSnapshot, feature.getSnapshot),
    feature,
  };
}
