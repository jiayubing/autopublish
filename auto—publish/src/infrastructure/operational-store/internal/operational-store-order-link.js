const { text } = require("./operational-store-utils");

function createOperationalStoreOrderLink(context) {
  const { db, fail } = context;

  // This is the single internal order-creation guard.  It checks both
  // identities before any order fact is written so Ticket 14 can reuse the
  // same attempt/order priority without depending on the public facade.
  function orderCreationAttemptGuard(input) {
    const value = input || {};
    const attemptOrder = db
      .prepare(
        "SELECT order_id,attempt_id,remote_id,payload_json,created_at FROM remote_orders WHERE attempt_id=? ORDER BY created_at,order_id LIMIT 1",
      )
      .get(value.attemptId);
    const order = db
      .prepare(
        "SELECT order_id,attempt_id,remote_id,payload_json,created_at FROM remote_orders WHERE order_id=?",
      )
      .get(value.orderId);
    if (attemptOrder) {
      return Object.freeze({
        kind:
          attemptOrder.order_id === value.orderId &&
          attemptOrder.remote_id === value.remoteId
            ? "attempt_bound"
            : "attempt_conflict",
        existing: Object.freeze(attemptOrder),
        order: order && Object.freeze(order),
      });
    }
    if (order)
      return Object.freeze({
        kind: "order_conflict",
        existing: Object.freeze(order),
      });
    return Object.freeze({ kind: "available" });
  }

  function ensure(input) {
    const value = input || {};
    const guarded = orderCreationAttemptGuard(value);
    if (guarded.kind === "attempt_bound") {
      if (
        guarded.existing.attempt_id !== value.attemptId ||
        guarded.existing.remote_id !== value.remoteId
      )
        throw fail("OPERATIONAL_ORDER_CONFLICT");
      return { idempotent: true };
    }
    if (guarded.kind !== "available")
      throw fail("OPERATIONAL_ORDER_CONFLICT");
    try {
      db.prepare("INSERT INTO remote_orders VALUES(?,?,?,?,?)").run(
        value.orderId,
        value.attemptId,
        value.remoteId,
        text(value.evidence || {}),
        value.createdAt,
      );
    } catch (error) {
      if (String((error && error.code) || "").startsWith("SQLITE_CONSTRAINT"))
        throw fail("OPERATIONAL_ORDER_CONFLICT");
      throw error;
    }
    return { idempotent: false };
  }

  return Object.freeze({
    ensure,
    orderCreationAttemptGuard,
  });
}

module.exports = { createOperationalStoreOrderLink };
