"use strict";

function cancellationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function createOrderCancellationService(options) {
  const values = options || {};
  const transitions = values.orderCancellationTransitions;
  const supplierProvider = values.supplierProvider;
  for (const method of [
    "prepareOrderCancellation",
    "beginOrderCancellation",
    "recordOrderCancellationOutcome",
    "getOrderCancellationContext",
    "getOrderCancellationView",
    "prepareCancellationResolution",
    "confirmCancellationSucceeded",
    "confirmCancellationNotApplied",
  ])
    if (!transitions || typeof transitions[method] !== "function")
      throw cancellationError("ORDER_CANCELLATION_TRANSITIONS_REQUIRED");
  if (typeof supplierProvider !== "function")
    throw cancellationError("MEDIA_CONFIG_NOT_SET");

  function supplier() {
    const value = supplierProvider();
    if (!value || typeof value.cancelOrder !== "function")
      throw cancellationError("MEDIA_CONFIG_NOT_SET");
    return value;
  }

  async function cancelOrder(input) {
    const value = input || {};
    const prepared = transitions.beginOrderCancellation(value);
    if (prepared.state === "resolved")
      return Object.freeze({
        status: prepared.outcome,
        cancellationAttemptId: prepared.cancellationAttemptId,
        manualCheckRequired: false,
        idempotent: true,
        publishedWins: transitions.getOrderCancellationContext({
          cancellationAttemptId: prepared.cancellationAttemptId,
        }).published,
      });
    let outcome;
    try {
      outcome = await supplier().cancelOrder(prepared.orderId);
    } catch (_) {
      return Object.freeze({
        status: "uncertain",
        cancellationAttemptId: prepared.cancellationAttemptId,
        manualCheckRequired: true,
        idempotent: false,
        publishedWins: false,
      });
    }
    if (!outcome || outcome.kind === "uncertain")
      return Object.freeze({
        status: "uncertain",
        cancellationAttemptId: prepared.cancellationAttemptId,
        manualCheckRequired: true,
        idempotent: false,
        publishedWins: false,
      });
    if (!["order_cancelled", "cancel_rejected"].includes(outcome.kind))
      return Object.freeze({
        status: "uncertain",
        cancellationAttemptId: prepared.cancellationAttemptId,
        manualCheckRequired: true,
        idempotent: false,
        publishedWins: false,
      });
    const recorded = transitions.recordOrderCancellationOutcome({
      cancellationAttemptId: prepared.cancellationAttemptId,
      outcome: outcome.kind === "order_cancelled" ? "cancelled" : "rejected",
    });
    return Object.freeze({
      ...recorded,
      cancellationAttemptId: prepared.cancellationAttemptId,
      manualCheckRequired: false,
    });
  }

  function stableFingerprint(value) {
    return require("node:crypto")
      .createHash("sha256")
      .update(JSON.stringify(value), "utf8")
      .digest("hex");
  }

  async function prepareCancellationResolution(input) {
    const value = input || {};
    const context = transitions.getOrderCancellationContext(value);
    let result = null;
    try {
      const port = supplier();
      if (typeof port.getOrderDetails !== "function")
        throw cancellationError("MEDIA_CONFIG_NOT_SET");
      result = await port.getOrderDetails([context.orderId]);
    } catch (_) {
      result = null;
    }
    const item =
      result && result.kind === "order_details" && Array.isArray(result.orders)
        ? result.orders.find(
            (candidate) =>
              candidate && String(candidate.orderId) === context.orderId,
          )
        : null;
    const status = item && String(item.status || "");
    const classification =
      status === "cancelled"
        ? "verified_cancelled"
        : ["pending", "scheduled", "0", "1"].includes(status)
          ? "verified_active"
          : "inconclusive";
    const evidenceSummary = Object.freeze({
      source: "supplier_query",
      status: status || null,
      observed: Boolean(item),
    });
    const evidenceFingerprint = stableFingerprint({
      cancellationAttemptId: context.cancellationAttemptId,
      orderId: context.orderId,
      classification,
      evidenceSummary,
    });
    return transitions.prepareCancellationResolution({
      cancellationAttemptId: context.cancellationAttemptId,
      classification,
      evidenceFingerprint,
      evidenceSummary,
    });
  }

  return Object.freeze({
    prepareOrderCancellation: transitions.prepareOrderCancellation,
    cancelOrder,
    getOrderCancellationContext: transitions.getOrderCancellationContext,
    getOrderCancellationView: transitions.getOrderCancellationView,
    prepareCancellationResolution,
    confirmCancellationSucceeded: transitions.confirmCancellationSucceeded,
    confirmCancellationNotApplied:
      transitions.confirmCancellationNotApplied,
  });
}

module.exports = { createOrderCancellationService };
