const { text } = require("./operational-store-utils");

function createOperationalStoreOrderLink(context) {
  const { db, fail } = context;

  function ensure(input) {
    const value = input || {};
    const existing = db
      .prepare(
        "SELECT attempt_id,remote_id FROM remote_orders WHERE order_id=?",
      )
      .get(value.orderId);
    if (existing) {
      if (
        existing.attempt_id !== value.attemptId ||
        existing.remote_id !== value.remoteId
      )
        throw fail("OPERATIONAL_ORDER_CONFLICT");
      return { idempotent: true };
    }
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

  return Object.freeze({ ensure });
}

module.exports = { createOperationalStoreOrderLink };
