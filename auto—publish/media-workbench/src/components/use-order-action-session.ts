import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CancellationResolutionInput,
  CancellationResolutionPreparation,
  OrderCancellationPreparation,
} from "../bridge/media";

type PendingOperation =
  | { kind: "open_published_url"; orderId: string }
  | { kind: "prepare_cancellation"; orderId: string }
  | { kind: "cancel"; orderId: string }
  | { kind: "prepare_cancellation_resolution"; orderId: string }
  | { kind: "resolve_cancellation"; orderId: string };

type Request = {
  scopeKey: string;
  orderId: string;
  epoch: number;
};

type SessionState = {
  scopeKey: string;
  openingOrderNid: string | null;
  cancellationPreparations: Record<string, OrderCancellationPreparation>;
  cancellationResolutions: Record<string, CancellationResolutionPreparation>;
};

export type OrderActionSessionSnapshot = Omit<SessionState, "scopeKey"> & {
  busy: boolean;
};

export type OrderActionSessionIntents = {
  openPublishedUrl: (orderId: string) => Promise<void>;
  prepareCancellation: (orderId: string) => Promise<void>;
  cancel: (orderId: string) => Promise<void>;
  prepareCancellationResolution: (
    orderId: string,
    cancellationAttemptId: string,
  ) => Promise<void>;
  resolveCancellation: (orderId: string) => Promise<void>;
};

export type OrderActionSession = {
  snapshot: OrderActionSessionSnapshot;
  intents: OrderActionSessionIntents;
};

export type OrderActionSessionOptions = {
  scopeKey: string;
  orderIds: ReadonlyArray<string>;
  prepareOrderCancellation: (
    orderId: string,
  ) => Promise<OrderCancellationPreparation | undefined>;
  cancelOrder: (input: {
    orderId: string;
    confirmationToken: string;
  }) => Promise<unknown>;
  prepareCancellationResolution: (
    cancellationAttemptId: string,
  ) => Promise<CancellationResolutionPreparation | undefined>;
  confirmCancellationSucceeded: (
    input: CancellationResolutionInput,
  ) => Promise<unknown>;
  confirmCancellationNotApplied: (
    input: CancellationResolutionInput,
  ) => Promise<unknown>;
  openPublishedUrl: (orderId: string) => Promise<unknown>;
};

function initialState(scopeKey: string): SessionState {
  return {
    scopeKey,
    openingOrderNid: null,
    cancellationPreparations: {},
    cancellationResolutions: {},
  };
}

function withoutOrder<T>(
  items: Record<string, T>,
  orderId: string,
): Record<string, T> {
  if (!(orderId in items)) return items;
  const next = { ...items };
  delete next[orderId];
  return next;
}

export function useOrderActionSession({
  scopeKey,
  orderIds,
  prepareOrderCancellation,
  cancelOrder,
  prepareCancellationResolution,
  confirmCancellationSucceeded,
  confirmCancellationNotApplied,
  openPublishedUrl,
}: OrderActionSessionOptions): OrderActionSession {
  const [state, setState] = useState<SessionState>(() =>
    initialState(scopeKey),
  );
  const mountedRef = useRef(true);
  const scopeKeyRef = useRef(scopeKey);
  const orderIdsRef = useRef(new Set(orderIds));
  const requestEpochRef = useRef(0);
  const pendingRef = useRef<PendingOperation | null>(null);
  const orderIdsKey = useMemo(
    () => [...new Set(orderIds)].sort().join("\u0000"),
    [orderIds],
  );

  scopeKeyRef.current = scopeKey;
  orderIdsRef.current = new Set(orderIds);

  const isCurrent = useCallback((request: Request): boolean => {
    return (
      mountedRef.current &&
      scopeKeyRef.current === request.scopeKey &&
      requestEpochRef.current === request.epoch &&
      orderIdsRef.current.has(request.orderId)
    );
  }, []);

  const begin = useCallback(
    (pending: PendingOperation): Request | null => {
      if (!pending.orderId || pendingRef.current !== null) return null;
      const request = {
        scopeKey,
        orderId: pending.orderId,
        epoch: requestEpochRef.current + 1,
      };
      requestEpochRef.current = request.epoch;
      pendingRef.current = pending;
      return request;
    },
    [scopeKey],
  );

  const complete = useCallback(
    (
      request: Request,
      update: (current: SessionState) => SessionState = (current) => current,
    ): boolean => {
      if (!isCurrent(request)) return false;
      pendingRef.current = null;
      setState(update);
      return true;
    },
    [isCurrent],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestEpochRef.current += 1;
      pendingRef.current = null;
    };
  }, []);

  useEffect(() => {
    requestEpochRef.current += 1;
    pendingRef.current = null;
    setState(initialState(scopeKey));
  }, [scopeKey]);

  useEffect(() => {
    const availableOrderIds = new Set(
      orderIdsKey ? orderIdsKey.split("\u0000") : [],
    );
    if (
      pendingRef.current &&
      !availableOrderIds.has(pendingRef.current.orderId)
    ) {
      requestEpochRef.current += 1;
      pendingRef.current = null;
    }
    setState((current) => ({
      ...current,
      openingOrderNid:
        current.openingOrderNid &&
        availableOrderIds.has(current.openingOrderNid)
          ? current.openingOrderNid
          : null,
      cancellationPreparations: Object.fromEntries(
        Object.entries(current.cancellationPreparations).filter(([orderId]) =>
          availableOrderIds.has(orderId),
        ),
      ),
      cancellationResolutions: Object.fromEntries(
        Object.entries(current.cancellationResolutions).filter(([orderId]) =>
          availableOrderIds.has(orderId),
        ),
      ),
    }));
  }, [orderIdsKey]);

  const open = useCallback(
    async (orderId: string) => {
      const request = begin({ kind: "open_published_url", orderId });
      if (!request) return;
      setState((current) => ({ ...current, openingOrderNid: orderId }));
      try {
        await openPublishedUrl(orderId);
      } finally {
        complete(request, (current) => ({
          ...current,
          openingOrderNid:
            current.openingOrderNid === orderId
              ? null
              : current.openingOrderNid,
        }));
      }
    },
    [begin, complete, openPublishedUrl],
  );

  const prepareCancellation = useCallback(
    async (orderId: string) => {
      const request = begin({ kind: "prepare_cancellation", orderId });
      if (!request) return;
      try {
        const preparation = await prepareOrderCancellation(orderId);
        complete(request, (current) => ({
          ...current,
          cancellationPreparations: preparation
            ? {
                ...current.cancellationPreparations,
                [orderId]: preparation,
              }
            : withoutOrder(current.cancellationPreparations, orderId),
          cancellationResolutions: withoutOrder(
            current.cancellationResolutions,
            orderId,
          ),
        }));
      } catch (_) {
        complete(request, (current) => ({
          ...current,
          cancellationPreparations: withoutOrder(
            current.cancellationPreparations,
            orderId,
          ),
        }));
      }
    },
    [begin, complete, prepareOrderCancellation],
  );

  const cancel = useCallback(
    async (orderId: string) => {
      if (state.scopeKey !== scopeKey) return;
      const preparation = state.cancellationPreparations[orderId];
      if (!preparation) return;
      const request = begin({ kind: "cancel", orderId });
      if (!request) return;
      try {
        await cancelOrder({
          orderId,
          confirmationToken: preparation.confirmationToken,
        });
      } finally {
        complete(request, (current) => ({
          ...current,
          cancellationPreparations: withoutOrder(
            current.cancellationPreparations,
            orderId,
          ),
          cancellationResolutions: withoutOrder(
            current.cancellationResolutions,
            orderId,
          ),
        }));
      }
    },
    [begin, cancelOrder, complete, scopeKey, state],
  );

  const prepareResolution = useCallback(
    async (orderId: string, cancellationAttemptId: string) => {
      if (!cancellationAttemptId) return;
      const request = begin({
        kind: "prepare_cancellation_resolution",
        orderId,
      });
      if (!request) return;
      try {
        const preparation = await prepareCancellationResolution(
          cancellationAttemptId,
        );
        complete(request, (current) => ({
          ...current,
          cancellationResolutions: preparation
            ? {
                ...current.cancellationResolutions,
                [orderId]: preparation,
              }
            : withoutOrder(current.cancellationResolutions, orderId),
        }));
      } catch (_) {
        complete(request, (current) => ({
          ...current,
          cancellationResolutions: withoutOrder(
            current.cancellationResolutions,
            orderId,
          ),
        }));
      }
    },
    [begin, complete, prepareCancellationResolution],
  );

  const resolveCancellation = useCallback(
    async (orderId: string) => {
      if (state.scopeKey !== scopeKey) return;
      const preparation = state.cancellationResolutions[orderId];
      if (!preparation || preparation.classification === "inconclusive") return;
      const request = begin({ kind: "resolve_cancellation", orderId });
      if (!request) return;
      const input: CancellationResolutionInput = {
        cancellationAttemptId: preparation.cancellationAttemptId,
        confirmationToken: preparation.confirmationToken,
        evidenceFingerprint: preparation.evidenceFingerprint,
      };
      try {
        if (preparation.classification === "verified_cancelled") {
          await confirmCancellationSucceeded(input);
        } else {
          await confirmCancellationNotApplied(input);
        }
      } finally {
        complete(request, (current) => ({
          ...current,
          cancellationPreparations: withoutOrder(
            current.cancellationPreparations,
            orderId,
          ),
          cancellationResolutions: withoutOrder(
            current.cancellationResolutions,
            orderId,
          ),
        }));
      }
    },
    [
      begin,
      complete,
      confirmCancellationNotApplied,
      confirmCancellationSucceeded,
      scopeKey,
      state,
    ],
  );

  const visibleState =
    state.scopeKey === scopeKey ? state : initialState(scopeKey);

  return {
    snapshot: {
      openingOrderNid: visibleState.openingOrderNid,
      cancellationPreparations: visibleState.cancellationPreparations,
      cancellationResolutions: visibleState.cancellationResolutions,
      busy: visibleState === state && pendingRef.current !== null,
    },
    intents: {
      openPublishedUrl: open,
      prepareCancellation,
      cancel,
      prepareCancellationResolution: prepareResolution,
      resolveCancellation,
    },
  };
}
