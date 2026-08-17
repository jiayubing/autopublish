"use strict";

const ACTIONS = Object.freeze([
  "bind-paid-order-number",
  "confirm-paid-order-absent",
]);

function projectPaidOrderResolutionAttention(intent) {
  const value = intent && typeof intent === "object" ? intent : {};
  const detail =
    value.detail && typeof value.detail === "object" ? value.detail : {};
  return Object.freeze({
    orderCreationAttemptId:
      typeof value.orderCreationAttemptId === "string"
        ? value.orderCreationAttemptId
        : null,
    resolutionActions: ["order_creation_uncertain", "system_rejected"].includes(
      detail.phase,
    )
      ? ACTIONS
      : Object.freeze([]),
  });
}

module.exports = { projectPaidOrderResolutionAttention };
