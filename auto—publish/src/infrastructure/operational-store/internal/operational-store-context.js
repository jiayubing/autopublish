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
    internalLifecycleProjectionObserver:
      typeof value.internalLifecycleProjectionObserver === "function"
        ? value.internalLifecycleProjectionObserver
        : null,
    internalRegularQueueTransitionFault:
      typeof value.internalRegularQueueTransitionFault === "function"
        ? value.internalRegularQueueTransitionFault
        : null,
    internalRegularOutcomeTransitionFault:
      typeof value.internalRegularOutcomeTransitionFault === "function"
        ? value.internalRegularOutcomeTransitionFault
        : null,
    internalPaidExecutionTransitionFault:
      typeof value.internalPaidExecutionTransitionFault === "function"
        ? value.internalPaidExecutionTransitionFault
        : null,
    internalMigrationImportFault:
      typeof value.internalMigrationImportFault === "function"
        ? value.internalMigrationImportFault
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
