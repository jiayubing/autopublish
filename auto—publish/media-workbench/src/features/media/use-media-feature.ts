import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  addToPool,
  getBalance,
  getOrders,
  openPublishedUrl,
  getPoolPage,
  getResourcePage,
  refreshResources,
  removeFromPool,
  searchResourcePage,
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

export type MediaFeatureSurface = "resources" | "orders";

export function useMediaFeature(options?: { surface?: MediaFeatureSurface }) {
  const surface = options?.surface || "resources";
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
    if (surface !== "resources" || !event.workspaceRuntimeId) return;
    feature.setScope({ workspaceRuntimeId: event.workspaceRuntimeId });
    void feature.refreshWorkbench(event.kind);
  });
  useWorkspaceScope("orders", (event) => {
    if (surface !== "orders" || !event.workspaceRuntimeId) return;
    feature.setScope({ workspaceRuntimeId: event.workspaceRuntimeId });
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
