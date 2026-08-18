import { useEffect } from "react";
import type {
  CancellationResolutionPreparation,
  OrderAnomalyPreparation,
  OrderCancellationPreparation,
} from "../bridge/media";
import type { useMediaFeature } from "../features/media/use-media-feature";
import OrdersView from "./OrdersView";
import { useOrderActionSession } from "./use-order-action-session";

type MediaFeatureState = ReturnType<typeof useMediaFeature>;

type OrdersPageProps = {
  snapshot: MediaFeatureState["snapshot"];
  feature: MediaFeatureState["feature"];
};

function isCancellationPreparation(
  value: unknown,
): value is OrderCancellationPreparation {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { orderId?: unknown }).orderId === "string" &&
    typeof (value as { confirmationToken?: unknown }).confirmationToken ===
      "string",
  );
}

function isCancellationResolutionPreparation(
  value: unknown,
): value is CancellationResolutionPreparation {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { cancellationAttemptId?: unknown })
      .cancellationAttemptId === "string" &&
    typeof (value as { confirmationToken?: unknown }).confirmationToken ===
      "string" &&
    typeof (value as { evidenceFingerprint?: unknown }).evidenceFingerprint ===
      "string",
  );
}

export default function OrdersPage({ snapshot, feature }: OrdersPageProps) {
  const scopeKey = snapshot.scope?.workspaceRuntimeId || "";

  useEffect(() => {
    if (scopeKey) void feature.openOrders();
  }, [feature, scopeKey]);

  const orderActions = useOrderActionSession({
    scopeKey,
    orderIds: snapshot.orders.items.map((order) => order.orderNid),
    prepareOrderCancellation: async (orderId) => {
      const result = await feature.prepareOrderCancellation(orderId);
      return isCancellationPreparation(result) && result.orderId === orderId
        ? result
        : undefined;
    },
    cancelOrder: (input) => feature.cancelOrder(input),
    prepareCancellationResolution: async (cancellationAttemptId) => {
      const result = await feature.prepareCancellationResolution(
        cancellationAttemptId,
      );
      return isCancellationResolutionPreparation(result) &&
        result.cancellationAttemptId === cancellationAttemptId
        ? result
        : undefined;
    },
    confirmCancellationSucceeded: (input) =>
      feature.confirmCancellationSucceeded(input),
    confirmCancellationNotApplied: (input) =>
      feature.confirmCancellationNotApplied(input),
    openPublishedUrl: (orderNid) => feature.openPublishedUrl(orderNid),
  });

  const errorMessage =
    snapshot.commands.openPublishedUrl.error?.userMessage ||
    snapshot.commands.syncOrder.error?.userMessage ||
    snapshot.commands.syncAllOrders.error?.userMessage ||
    snapshot.commands.prepareOrderCancellation.error?.userMessage ||
    snapshot.commands.cancelOrder.error?.userMessage ||
    snapshot.commands.prepareCancellationResolution.error?.userMessage ||
    snapshot.commands.confirmCancellationSucceeded.error?.userMessage ||
    snapshot.commands.confirmCancellationNotApplied.error?.userMessage ||
    snapshot.commands.prepareOrderStatusAnomalyResolution.error?.userMessage ||
    snapshot.commands.resumeOrderTracking.error?.userMessage ||
    snapshot.commands.confirmOrderPublished.error?.userMessage ||
    snapshot.commands.confirmOrderNotPublished.error?.userMessage ||
    snapshot.orders.query.error?.userMessage;

  return (
    <OrdersView
      orders={snapshot.orders.items}
      onSyncOrder={(orderNid) => feature.syncOrder(orderNid)}
      onSyncAllOrders={() => feature.syncAllOrders()}
      onPrepareAnomaly={(orderNid) =>
        feature.prepareOrderStatusAnomalyResolution(orderNid)
      }
      onResolveAnomaly={(orderNid, action) =>
        action === "resumeOrderTracking"
          ? feature.resumeOrderTracking(orderNid)
          : action === "confirmOrderPublished"
            ? feature.confirmOrderPublished(orderNid)
            : feature.confirmOrderNotPublished(orderNid)
      }
      orderActions={orderActions}
      syncingOrderNid={snapshot.orders.syncingOrderNid}
      syncingAll={snapshot.commands.syncAllOrders.busy}
      orderActionsBusy={
        snapshot.orders.mutationBusy || orderActions.snapshot.busy
      }
      syncFailures={snapshot.orders.syncFailures}
      anomalyPreparations={
        snapshot.orders.anomalyPreparations as Record<
          string,
          OrderAnomalyPreparation
        >
      }
      errorMessage={errorMessage}
    />
  );
}
