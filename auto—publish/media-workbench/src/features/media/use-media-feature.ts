import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  addToPool,
  getBalance,
  getDraft,
  getDrafts,
  getOrders,
  openPublishedUrl,
  getPoolPage,
  getResourcePage,
  previewArticle,
  refreshResources,
  removeFromPool,
  scanArticles,
  searchResourcePage,
  setDraft,
  syncOrder,
  syncAllOrders,
  prepareOrderCancellation,
  cancelOrder,
  prepareCancellationResolution,
  confirmCancellationSucceeded,
  confirmCancellationNotApplied,
  prepareOrderStatusAnomalyResolution,
  resumeOrderTracking,
  confirmOrderPublished,
  confirmOrderNotPublished,
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
      scanArticles,
      previewArticle,
      getOrders,
      syncOrder,
      syncAllOrders,
      prepareOrderCancellation,
      cancelOrder,
      prepareCancellationResolution,
      confirmCancellationSucceeded,
      confirmCancellationNotApplied,
      prepareOrderStatusAnomalyResolution,
      resumeOrderTracking,
      confirmOrderPublished,
      confirmOrderNotPublished,
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
