const {
  reportDiagnostic,
} = require("../../../diagnostics/diagnostic-producer");

function runTransaction(db, callback, beforeCommit) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    if (beforeCommit) beforeCommit();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch (_) {
      const cleanupCode = "OPERATIONAL_TRANSACTION_ROLLBACK_FAILED";
      if (error && !error.cleanupCode) error.cleanupCode = cleanupCode;
      reportDiagnostic({
        code: cleanupCode,
        module: "operational-store-transaction",
        category: "storage",
        metadata: { operation: "transaction", phase: "rollback" },
      });
    }
    throw error;
  }
}

function createTransactionContext({ db, beforeCommit }) {
  return Object.freeze({
    run(callback) {
      return runTransaction(db, callback, beforeCommit);
    },
  });
}

module.exports = { runTransaction, createTransactionContext };
