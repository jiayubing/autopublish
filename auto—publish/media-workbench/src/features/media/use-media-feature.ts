import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  addToPool,
  buildConfirmation,
  getBalance,
  getDraft,
  getDrafts,
  getOrders,
  openPublishedUrl,
  getPoolPage,
  getResourcePage,
  previewArticle,
  refreshResources,
  removeDraft,
  removeFromPool,
  scanArticles,
  searchResourcePage,
  setDraft,
  stopSubmit,
  submitSelected,
  syncOrder,
} from "../../bridge/media";
import { useWorkspaceScope } from "../workspace/workspace-coordinator-context";
import { createMediaFeature } from "./media-feature.js";

export function useMediaFeature() {
  const featureRef = useRef<ReturnType<typeof createMediaFeature> | null>(null);
  if (!featureRef.current) {
    featureRef.current = createMediaFeature({
      getResourcePage,
      searchResourcePage,
      refreshResources,
      getPoolPage,
      addToPool,
      removeFromPool,
      getBalance,
      getDrafts,
      getDraft,
      setDraft,
      removeDraft,
      scanArticles,
      previewArticle,
      buildConfirmation,
      submitSelected,
      stopSubmit,
      getOrders,
      syncOrder,
      openPublishedUrl,
    });
  }
  const feature = featureRef.current;
  useWorkspaceScope("mediaWorkbench", (event) => {
    if (!event.workspaceRuntimeId) return;
    feature.setScope({ workspaceRuntimeId: event.workspaceRuntimeId });
    if (
      event.kind === "initial" ||
      event.kind === "identity" ||
      event.kind === "runtime-switch"
    ) {
      void feature.refresh(event.kind);
      return;
    }
    void feature.refreshWorkbench(event.kind);
  });
  useWorkspaceScope("orders", (event) => {
    if (!event.workspaceRuntimeId) return;
    feature.setScope({ workspaceRuntimeId: event.workspaceRuntimeId });
    if (
      event.kind === "initial" ||
      event.kind === "identity" ||
      event.kind === "runtime-switch"
    )
      return;
    void feature.refreshOrders(event.kind);
  });
  useEffect(() => () => feature.dispose(), [feature]);
  return {
    snapshot: useSyncExternalStore(
      feature.subscribe,
      feature.getSnapshot,
      feature.getSnapshot,
    ),
    feature,
  };
}
