function stateError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function createArticleRemovalStateMachine(options) {
  const opts = options || {};
  const nowIso = opts.nowIso;
  const persist =
    typeof opts.persist === "function"
      ? opts.persist
      : function (value) {
          return value;
        };
  const maxRecoveryAttempts = Number.isFinite(opts.maxRecoveryAttempts)
    ? Math.max(1, opts.maxRecoveryAttempts)
    : 5;
  const recoveryBackoffMs = Number.isFinite(opts.recoveryBackoffMs)
    ? Math.max(1, opts.recoveryBackoffMs)
    : 1000;
  const isRepairableError =
    typeof opts.isRepairableError === "function"
      ? opts.isRepairableError
      : function () {
          return false;
        };
  const makeError = typeof opts.error === "function" ? opts.error : stateError;

  function validAutomaticState(transaction) {
    return (
      !!transaction &&
      ((transaction.status === "pending_auto_recovery" &&
        ["intent", "queue-actions", "articles", "committed"].includes(
          transaction.phase,
        )) ||
        (transaction.status === "pending_recovery" &&
          ["intent", "queue-actions", "articles", "committed"].includes(
            transaction.phase,
          )))
    );
  }

  function transitionToRepair(transaction, code, resolutionCode) {
    if (transaction.phase !== "needs_repair")
      transaction.resumePhase = transaction.phase;
    if (
      transaction.resumePhase === "needs_repair" ||
      !["intent", "queue-actions", "articles", "committed"].includes(
        transaction.resumePhase,
      )
    )
      transaction.resumePhase = "articles";
    transaction.status = "needs_repair";
    transaction.phase = "needs_repair";
    transaction.errorCode = code || "ARTICLE_REMOVAL_RECOVERY_REQUIRED";
    transaction.resolutionCode =
      resolutionCode || "REMOVAL_REVALIDATION_FAILED";
    transaction.updatedAt = nowIso();
    persist(transaction);
    return transaction;
  }

  function recordRetry(transaction, error, resolutionCode) {
    if (isRepairableError(error))
      return transitionToRepair(
        transaction,
        error && error.code,
        "REMOVAL_MANUAL_REPAIR_REQUIRED",
      );
    transaction.updatedAt = nowIso();
    transaction.errorCode =
      (error && error.code) || "ARTICLE_REMOVAL_RECOVERY_REQUIRED";
    transaction.resolutionCode = resolutionCode || "RECOVERY_RETRY_REQUIRED";
    transaction.retryCount = Number(transaction.retryCount || 0) + 1;
    transaction.attempt = transaction.retryCount;
    if (transaction.retryCount >= maxRecoveryAttempts) {
      if (transaction.phase !== "needs_repair")
        transaction.resumePhase = transaction.phase;
      transaction.status = "needs_repair";
      transaction.phase = "needs_repair";
      transaction.resolutionCode = "RECOVERY_ATTEMPTS_EXHAUSTED";
    } else {
      transaction.status = "pending_auto_recovery";
      if (transaction.phase === "committed") transaction.phase = "articles";
      transaction.nextAttemptAt = new Date(
        Date.parse(transaction.updatedAt) +
          recoveryBackoffMs * Math.pow(2, transaction.retryCount - 1),
      ).toISOString();
    }
    try {
      persist(transaction);
    } catch (_) {}
    return transaction;
  }

  return {
    validAutomaticState,
    transitionToRepair,
    recordRetry,
    error: makeError,
  };
}

module.exports = { createArticleRemovalStateMachine };
