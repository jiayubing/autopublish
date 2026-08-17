"use strict";

const TRANSITION_METHODS = Object.freeze([
  "bindVerifiedOrder",
  "confirmNoOrder",
  "prepareOrderCreationResolution",
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function validateTransitions(value) {
  if (
    !value ||
    Object.keys(value).sort().join("\u0000") !==
      [...TRANSITION_METHODS].sort().join("\u0000") ||
    TRANSITION_METHODS.some((method) => typeof value[method] !== "function")
  )
    throw fail("PAID_ORDER_RESOLUTION_TRANSITIONS_INVALID");
  return value;
}

function validateOrderDetailsPort(value) {
  if (
    !value ||
    Object.keys(value).join("\u0000") !== "getOrderDetails" ||
    typeof value.getOrderDetails !== "function"
  )
    throw fail("PAID_ORDER_DETAILS_PORT_INVALID");
  return value;
}

function safeId(value, code) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)
  )
    throw fail(code);
  return value;
}

function createPaidOrderCreationResolutionService(options) {
  const value = options || {};
  const transitions = validateTransitions(
    value.orderCreationResolutionTransitions,
  );
  const orderDetails = validateOrderDetailsPort(value.orderDetailsQueryPort);

  async function prepareBindOrderNumber(input) {
    const command = input || {};
    const orderCreationAttemptId = safeId(
      command.orderCreationAttemptId,
      "PAID_ORDER_ATTEMPT_INVALID",
    );
    const orderId = safeId(command.orderId, "PAID_ORDER_ID_INVALID");
    let result;
    try {
      result = await orderDetails.getOrderDetails([orderId]);
    } catch (_) {
      throw fail("PAID_ORDER_RESOLUTION_QUERY_FAILED");
    }
    if (!result || result.kind !== "order_details")
      throw fail("PAID_ORDER_RESOLUTION_QUERY_FAILED");
    const matches = (Array.isArray(result.orders) ? result.orders : []).filter(
      (order) => order && String(order.orderId || "") === orderId,
    );
    if (matches.length !== 1)
      throw fail("PAID_ORDER_RESOLUTION_EVIDENCE_INSUFFICIENT");
    const order = matches[0];
    return transitions.prepareOrderCreationResolution({
      orderCreationAttemptId,
      action: "bind_verified_order",
      orderObservation: {
        orderId,
        resourceId: order.resourceId,
        title: order.title,
        ...(typeof order.systemSubmissionId === "string" &&
        order.systemSubmissionId
          ? { systemSubmissionId: order.systemSubmissionId }
          : {}),
        status: order.status,
      },
    });
  }

  function bindOrderNumber(input) {
    const command = input || {};
    return transitions.bindVerifiedOrder({
      orderCreationAttemptId: safeId(
        command.orderCreationAttemptId,
        "PAID_ORDER_ATTEMPT_INVALID",
      ),
      orderId: safeId(command.orderId, "PAID_ORDER_ID_INVALID"),
      confirmationToken: command.confirmationToken,
    });
  }

  function prepareConfirmNoOrder(input) {
    const command = input || {};
    return transitions.prepareOrderCreationResolution({
      orderCreationAttemptId: safeId(
        command.orderCreationAttemptId,
        "PAID_ORDER_ATTEMPT_INVALID",
      ),
      action: "confirm_no_order",
    });
  }

  function confirmNoOrder(input) {
    const command = input || {};
    return transitions.confirmNoOrder({
      orderCreationAttemptId: safeId(
        command.orderCreationAttemptId,
        "PAID_ORDER_ATTEMPT_INVALID",
      ),
      confirmationToken: command.confirmationToken,
    });
  }

  return Object.freeze({
    prepareBindOrderNumber,
    bindOrderNumber,
    prepareConfirmNoOrder,
    confirmNoOrder,
  });
}

module.exports = { createPaidOrderCreationResolutionService };
