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
    } catch (_) {}
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
