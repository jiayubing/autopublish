function cursorError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function createArticleRemovalCursor(options) {
  const opts = options || {};
  const runnerId = String(opts.runnerId || "removal-runner");
  const persist =
    typeof opts.persist === "function" ? opts.persist : function () {};
  const makeError = typeof opts.error === "function" ? opts.error : cursorError;

  function operationId(transaction, kind, index) {
    if (kind !== "article")
      throw makeError(
        "ARTICLE_REMOVAL_OPERATION_KIND_RETIRED",
        "Only article removal operations are supported",
      );
    return transaction.id + ":" + kind + ":" + index;
  }

  function begin(transaction, kind, index, item) {
    if (kind !== "article")
      throw makeError(
        "ARTICLE_REMOVAL_OPERATION_KIND_RETIRED",
        "Only article removal operations are supported",
      );
    const expected = operationId(transaction, kind, index);
    if (transaction.activeOperation) {
      if (
        transaction.activeOperation.operationId === expected &&
        transaction.activeOperation.owner === runnerId
      )
        return transaction;
      throw makeError(
        "ARTICLE_REMOVAL_OPERATION_IN_FLIGHT",
        "Removal operation is already in flight",
      );
    }
    transaction.activeOperation = {
      operationId: expected,
      kind: kind,
      cursor: index,
      owner: runnerId,
      clientId: (item && item.clientId) || null,
      articleId: (item && (item.articleId || item.id)) || null,
    };
    persist(transaction);
    return transaction;
  }

  function finish(transaction) {
    delete transaction.activeOperation;
    return transaction;
  }

  function locate(transaction, operation) {
    if (!operation || operation.kind !== "article") {
      return {
        error: makeError(
          "ARTICLE_REMOVAL_OPERATION_CONFLICT",
          "Removal operation identity is invalid",
        ),
      };
    }
    const expected = operationId(transaction, "article", operation.cursor);
    const items = transaction.articles;
    const item = Array.isArray(items) ? items[Number(operation.cursor)] : null;
    if (
      !item ||
      operation.operationId !== expected ||
      Number(operation.cursor) < 0 ||
      operation.clientId !== item.clientId ||
      operation.articleId !== (item.articleId || item.id)
    ) {
      return {
        error: makeError(
          "ARTICLE_REMOVAL_OPERATION_CONFLICT",
          "Removal operation identity is invalid",
        ),
      };
    }
    return { expected, item };
  }

  return { operationId, begin, finish, locate, runnerId };
}

module.exports = { createArticleRemovalCursor };
