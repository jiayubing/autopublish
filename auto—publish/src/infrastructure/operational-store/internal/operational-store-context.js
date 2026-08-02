const crypto = require("node:crypto");

const { createTransactionContext } = require("./operational-store-transaction");
const { fail, iso } = require("./operational-store-utils");

function createOperationalStoreContext(runtime, options) {
  const value = options || {};
  const transaction = createTransactionContext({
    db: runtime.db,
    beforeCommit:
      typeof value.internalBeforeCommit === "function"
        ? value.internalBeforeCommit
        : null,
  });
  let closed = false;
  const open = () => {
    if (closed) throw fail("OPERATIONAL_STORE_CLOSED");
  };
  const context = {
    db: runtime.db,
    filename: runtime.filename,
    clock: value.clock || (() => new Date()),
    randomUUID: crypto.randomUUID,
    internalOrderProjectionObserver:
      typeof value.internalOrderProjectionObserver === "function"
        ? value.internalOrderProjectionObserver
        : null,
    open,
    transaction: transaction.run,
    fail,
    iso,
    close() {
      if (closed) return;
      runtime.close();
      closed = true;
    },
  };
  return Object.freeze(context);
}

module.exports = { createOperationalStoreContext };
