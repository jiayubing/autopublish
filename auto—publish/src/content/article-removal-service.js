const crypto = require("node:crypto");
const domain = require("../domain");
const {
  createArticleRemovalTransactionStore,
} = require("./article-removal-transaction-store");
const { canonicalArticleRefKey } = require("./article-ref");
const {
  removalError,
  clone,
  selections,
  fingerprint,
  transactionFingerprint,
} = require("./article-removal-plan");
const { reportDiagnostic } = require("../diagnostics/diagnostic-producer");

function createArticleRemovalService(options) {
  const opts = options || {};
  const coordinator = opts.mutationCoordinator;
  if (
    !opts.contentStore ||
    !coordinator ||
    typeof coordinator.previewTrashEligibility !== "function"
  )
    throw removalError(
      "ARTICLE_MUTATION_COORDINATOR_REQUIRED",
      "Article removal requires the workspace mutation owner",
    );
  const transactionStore =
    opts.transactionStore || createArticleRemovalTransactionStore(opts);
  const tokens = new Map();
  const completed = new Map();
  const ttl = Number.isFinite(opts.tokenTtlMs)
    ? Math.max(1000, opts.tokenTtlMs)
    : 300000;
  const makeToken = opts.tokenGenerator || crypto.randomUUID;
  function nowIso() {
    const date = new Date(opts.now ? opts.now() : Date.now());
    if (!Number.isFinite(date.getTime()))
      throw removalError("ARTICLE_REMOVAL_CLOCK_INVALID");
    return date.toISOString();
  }
  function notify(transaction) {
    if (typeof opts.onTransactionStatus !== "function") return;
    try {
      opts.onTransactionStatus(dto(transaction));
    } catch (_) {
      reportDiagnostic({
        code: "ARTICLE_REMOVAL_STATUS_LISTENER_FAILED",
        module: "article-removal-service",
        category: "internal",
        operationId: "article-removal-notify",
        metadata: { outcome: "listener-isolated" },
      });
    }
  }
  function dto(value) {
    return {
      id: value.id,
      transactionId: value.id,
      status: value.status,
      errorCode: value.errorCode || null,
      createdAt: value.createdAt,
      updatedAt: value.createdAt,
      articleCount: value.selections.length,
      deletionTransactionIdentityV1: domain.parseDeletionTransactionIdentityV1({
        version: 1,
        transactionId: value.id,
        articleIdentitiesV1: value.selections.map((ref) => ({
          version: 1,
          ...ref,
        })),
        state: value.status === "committed" ? "COMMITTED" : "NEEDS_REPAIR",
        reasonCode: value.errorCode || null,
        createdAt: value.createdAt,
        updatedAt: value.createdAt,
        selectionFingerprint: transactionFingerprint(value.selections),
      }),
    };
  }
  function overlaps(left, right) {
    const keys = new Set(left.map(canonicalArticleRefKey));
    return right.some((ref) => keys.has(canonicalArticleRefKey(ref)));
  }
  function openFor(refs, excludedId) {
    return transactionStore
      .list()
      .filter(
        (value) => value.id !== excludedId && overlaps(value.selections, refs),
      );
  }
  function previewArticleRemovalImpact(input) {
    const refs = selections(input);
    const eligibility = coordinator.previewTrashEligibility({
      articleRefs: refs,
    });
    const blockedItems = [];
    eligibility.items.forEach((item) => {
      if (!item.allowed)
        item.reasonCodes.forEach((reasonCode) =>
          blockedItems.push({
            ...item.articleRef,
            reasonCode,
            source: "article_lifecycle",
            status: item.safeMetadata && item.safeMetadata.stage,
          }),
        );
    });
    const open = openFor(refs);
    open.forEach((value) =>
      value.selections
        .filter((ref) => overlaps([ref], refs))
        .forEach((ref) =>
          blockedItems.push({
            ...ref,
            reasonCode: "REMOVAL_REPAIR_REQUIRED",
            source: "removal_transaction",
          }),
        ),
    );
    const createdAt = nowIso();
    const time = Date.parse(createdAt);
    tokens.forEach((value, key) => {
      if (value.expiresAt <= time) tokens.delete(key);
    });
    const token = String(makeToken());
    const binding = {
      selections: refs,
      articles: refs
        .map((ref) =>
          eligibility.items.find(
            (item) =>
              canonicalArticleRefKey(item.articleRef) ===
              canonicalArticleRefKey(ref),
          ),
        )
        .map((item) => ({
          ...item.articleRef,
          contentFingerprint: item.contentFingerprint,
          titleSnapshot: item.titleSnapshot,
          trashed: item.trashed,
          operationId: item.operationId,
        })),
      blocked: blockedItems.length > 0,
    };
    tokens.set(token, { binding, expiresAt: time + ttl });
    const exact = open.find(
      (value) =>
        transactionFingerprint(value.selections) ===
        transactionFingerprint(refs),
    );
    return {
      token,
      createdAt,
      expiresAt: new Date(time + ttl).toISOString(),
      selections: refs,
      articleCount: refs.length,
      blockedItems,
      canCommit: blockedItems.length === 0,
      ...(exact
        ? { openTransactionId: exact.id, openTransaction: dto(exact) }
        : {}),
    };
  }

  function perform(transaction) {
    let result;
    try {
      result = coordinator.executeArticleRemovalTransaction({
        selections: transaction.selections,
        transaction,
      });
    } catch (error) {
      // An existing intent is sufficient for retry. Never rewrite it outside
      // article locks, including after a lock-release failure.
      const pending = transactionStore.get(transaction.id);
      if (!pending) throw error;
      result = {
        ...pending,
        errorCode:
          error && /^[A-Z][A-Z0-9_]{1,127}$/.test(error.code || "")
            ? error.code
            : "ARTICLE_REMOVAL_FAILED",
      };
    }
    if (result.status === "committed") {
      completed.set(result.id, result);
      if (completed.size > 100) completed.delete(completed.keys().next().value);
    }
    notify(result);
    return dto(result);
  }
  function applyArticleRemovalImpact(input) {
    const request = input || {};
    if (request.confirmed !== true || !request.token)
      throw removalError("ARTICLE_TRASH_CONFIRMATION_REQUIRED");
    const token = tokens.get(request.token);
    if (!token || Date.parse(nowIso()) >= token.expiresAt) {
      tokens.delete(request.token);
      throw removalError("ARTICLE_TRASH_PREVIEW_EXPIRED");
    }
    const refs = request.selections
      ? selections(request)
      : token.binding.selections;
    if (
      fingerprint(refs) !== fingerprint(token.binding.selections) ||
      token.binding.blocked
    )
      throw removalError("ARTICLE_TRASH_PREVIEW_STALE");
    tokens.delete(request.token);
    const id = transactionStore.createId();
    const transaction = {
      version: 3,
      id,
      createdAt: nowIso(),
      status: "needs_repair",
      selections: clone(refs),
      articles: token.binding.articles.map((item, index) => ({
        contentFingerprint: item.contentFingerprint,
        operationId: item.trashed ? item.operationId : id + "-" + index,
      })),
    };
    return perform(transaction);
  }
  function getArticleRemovalTransaction(id) {
    const value = transactionStore.get(id) || completed.get(id);
    if (!value) throw removalError("ARTICLE_REMOVAL_TRANSACTION_NOT_FOUND");
    return dto(value);
  }
  function listArticleRemovalTransactions() {
    return transactionStore.list().map(dto);
  }
  function retryArticleRemovalTransaction(input) {
    if (!input || input.confirmed !== true)
      throw removalError("ARTICLE_TRASH_CONFIRMATION_REQUIRED");
    const value = transactionStore.get(input.transactionId);
    if (!value) return getArticleRemovalTransaction(input.transactionId);
    return perform({ ...value, resume: true });
  }
  function recoverPendingRemovals(lifecycle) {
    const results = [];
    for (const value of transactionStore.list()) {
      if (lifecycle && lifecycle.isDisposed && lifecycle.isDisposed()) break;
      results.push(perform({ ...value, resume: true }));
    }
    return results;
  }
  return {
    previewArticleRemovalImpact,
    applyArticleRemovalImpact,
    getArticleRemovalTransaction,
    listArticleRemovalTransactions,
    retryArticleRemovalTransaction,
    recoverPendingRemovals,
  };
}
module.exports = { createArticleRemovalService };
