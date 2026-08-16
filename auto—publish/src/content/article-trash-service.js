const crypto = require("crypto");
const domain = require("../domain");
const { createArticleRemovalService } = require("./article-removal-service");
const { createArticleTrashConfirmation } = require("./article-trash-confirmation");

function trashError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertId(value, label) {
  if (typeof value !== "string" || !value.trim() || value.includes("/") || value.includes("\\")) {
    throw trashError("CONTENT_INPUT_INVALID", label + " is required");
  }
}

function selection(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw trashError("CONTENT_INPUT_INVALID", "Article selection is required");
  }
  assertId(input.clientId, "Client id");
  assertId(input.articleId, "Article id");
  return { clientId: input.clientId, articleId: input.articleId };
}

function createArticleTrashService(options) {
  const opts = options || {};
  if (!opts.contentStore) throw trashError("ARTICLE_TRASH_SERVICE_INVALID", "Content store is required");
  const contentStore = opts.contentStore;
  const mutationCoordinator = opts.mutationCoordinator || null;
  const now = opts.now || function() { return new Date().toISOString(); };
  const confirmations = createArticleTrashConfirmation({
    now: now,
    ttlMs: opts.permanentDeleteTokenTtlMs,
    tokenGenerator: opts.permanentDeleteTokenGenerator,
  });
  const removalService = opts.articleRemovalService || (opts.articleRemovalImpactQuery && opts.workspaceRoot
    ? createArticleRemovalService({
      workspaceRoot: opts.workspaceRoot,
      contentStore: contentStore,
      mutationCoordinator: opts.mutationCoordinator,
      articleRemovalTransitionPort: opts.articleRemovalTransitionPort,
      articleRemovalImpactQuery: opts.articleRemovalImpactQuery,
      transactionStore: opts.transactionStore,
      transactionDirectory: opts.transactionDirectory,
      now: opts.now,
      tokenTtlMs: opts.tokenTtlMs,
      tokenGenerator: opts.tokenGenerator,
      afterArticleMove: opts.afterArticleMove,
      onTransactionStatus: opts.onTransactionStatus
    }) : null);

  function nowIso() {
    const value = typeof now === "function" ? now() : now;
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime()))
      throw trashError("ARTICLE_PERMANENT_DELETE_CLOCK_INVALID", "Permanent deletion clock is invalid");
    return date.toISOString();
  }

  function assertLifecycleSafe(item, operation) {
    if (!mutationCoordinator || typeof mutationCoordinator.assertTrashedArticleMutationAllowed !== "function")
      throw trashError("ARTICLE_MUTATION_COORDINATOR_REQUIRED", "文章恢复或永久删除必须通过文章变更协调器");
    mutationCoordinator.assertTrashedArticleMutationAllowed({ articleRef: item, operation });
  }

  function tombstoneFingerprint(tombstone) {
    return crypto.createHash("sha256").update(JSON.stringify({
      version: tombstone.version, deletedAt: tombstone.deletedAt, clientId: tombstone.clientId,
      articleId: tombstone.articleId, status: tombstone.status, references: tombstone.references,
      contentFingerprint: tombstone.contentFingerprint || null
    })).digest("hex");
  }

  function tombstoneIdentityV1(tombstone, fallbackPurgedAt) {
    return domain.parseTombstoneIdentityV1({
      version: 1,
      articleIdentityV1: {
        version: 1,
        clientId: tombstone.clientId,
        articleId: tombstone.articleId,
      },
      state: tombstone.permanentlyDeleted === true
        ? "PERMANENTLY_DELETED"
        : "TRASHED",
      deletedAt: tombstone.deletedAt,
      purgedAt: tombstone.permanentlyDeleted === true
        ? tombstone.purgedAt || fallbackPurgedAt || nowIso()
        : null,
      reasonCode: tombstone.permanentlyDeleted === true
        ? "ARTICLE_PERMANENTLY_DELETED"
        : "ARTICLE_TRASHED",
      contentFingerprint: tombstone.contentFingerprint || null,
    });
  }

  function publicTombstone(tombstone) {
    return Object.assign({}, tombstone, {
      tombstoneIdentityV1: tombstoneIdentityV1(tombstone),
    });
  }

  function listTrashedArticles(clientId) {
    assertId(clientId, "Client id");
    return contentStore.listTrashedArticles(clientId).map(publicTombstone);
  }

  function trashArticles(input) {
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        !Array.isArray(input.selections) || !input.selections.length) {
      throw trashError("CONTENT_INPUT_INVALID", "At least one article is required");
    }
    if (removalService) {
      return removalService.applyArticleRemovalImpact({
        selections: input.selections,
        token: input.token,
        confirmed: input.confirmed
      });
    }
    throw trashError("ARTICLE_REMOVAL_UNAVAILABLE", "Article removal coordinator is unavailable");
  }

  function previewTrashArticles(input) {
    if (!removalService) throw trashError("ARTICLE_REMOVAL_UNAVAILABLE", "Article removal preview is unavailable");
    return removalService.previewArticleRemovalImpact(input);
  }

  function restoreArticle(input) {
    const item = selection(input);
    assertLifecycleSafe(item, "restore");
    let restored;
    if (mutationCoordinator && typeof mutationCoordinator.restoreArticles === "function") {
      restored = mutationCoordinator.restoreArticles({ articleRefs: [item] }).items[0].article;
    } else if (mutationCoordinator && typeof mutationCoordinator.restoreTrashedArticle === "function") {
      restored = mutationCoordinator.restoreTrashedArticle({ articleRef: item }).article;
    } else {
      throw trashError("ARTICLE_MUTATION_COORDINATOR_REQUIRED", "文章恢复必须通过文章变更协调器");
    }
    confirmations.invalidateBinding(item);
    return removalService ? { article: restored, restored: true, queueRestored: false, message: "文章已恢复，投稿队列不会自动恢复" } : restored;
  }

  function preparePermanentDelete(input) {
    const item = selection(input);
    const tombstone = contentStore.getTrashedTombstone(item.clientId, item.articleId);
    if (!tombstone) throw trashError("ARTICLE_NOT_FOUND", "Trashed article was not found");
    assertLifecycleSafe(item, "permanent-delete");
    const fingerprint = tombstoneFingerprint(tombstone);
    const confirmation = confirmations.issue({ clientId: item.clientId, articleId: item.articleId }, fingerprint);
    try { assertLifecycleSafe(item, "permanent-delete"); }
    catch (error) {
      confirmations.remove(confirmation.token);
      throw error;
    }
    return { token: confirmation.token, clientId: item.clientId, articleId: item.articleId, deletedAt: tombstone.deletedAt, version: tombstone.version, fingerprint, issuedAt: confirmation.issuedAt, expiresAt: confirmation.expiresAt, status: tombstone.status, permanentlyDeleted: tombstone.permanentlyDeleted === true };
  }

  function permanentlyDeleteArticle(input) {
    const item = selection(input);
    if (typeof input.token !== "string" || !input.token.trim()) {
      throw trashError("ARTICLE_PERMANENT_DELETE_CONFIRMATION_REQUIRED", "Permanent deletion confirmation is required");
    }
    const confirmed = confirmations.get(input.token);
    if (!confirmed || confirmed.clientId !== item.clientId || confirmed.articleId !== item.articleId) {
      throw trashError("ARTICLE_PERMANENT_DELETE_CONFIRMATION_INVALID", "Permanent deletion confirmation is invalid");
    }
    confirmations.assertLive(confirmed);
    const current = contentStore.getTrashedTombstone(item.clientId, item.articleId);
    const fingerprint = tombstoneFingerprint(current);
    if (fingerprint !== confirmed.fingerprint) {
      confirmations.remove(input.token);
      throw trashError("ARTICLE_PERMANENT_DELETE_CONFIRMATION_STALE", "Permanent deletion confirmation is stale");
    }
    assertLifecycleSafe(item, "permanent-delete");
    const requestedPurgedAt = nowIso();
    let tombstone;
    try {
      if (mutationCoordinator && typeof mutationCoordinator.permanentlyDeleteArticles === "function") {
        tombstone = mutationCoordinator.permanentlyDeleteArticles({
          articleRefs: [item],
          purgedAt: requestedPurgedAt,
          expectedTombstone: current,
        }).items[0].tombstone;
      } else if (mutationCoordinator && typeof mutationCoordinator.permanentlyDeleteTrashedArticle === "function") {
        tombstone = mutationCoordinator.permanentlyDeleteTrashedArticle({
          articleRef: item,
          purgedAt: requestedPurgedAt,
          expectedTombstone: current,
        }).tombstone;
      } else {
        throw trashError("ARTICLE_MUTATION_COORDINATOR_REQUIRED", "文章永久删除必须通过文章变更协调器");
      }
    } catch (error) {
      if (error && error.code === "ARTICLE_TOMBSTONE_CHANGED") {
        confirmations.remove(input.token);
        throw trashError("ARTICLE_PERMANENT_DELETE_CONFIRMATION_STALE", "Permanent deletion confirmation is stale");
      }
      throw error;
    }
    confirmations.invalidateBinding(item);
    return {
      clientId: item.clientId,
      articleId: item.articleId,
      deleted: true,
      deletedAt: tombstone.deletedAt,
      tombstoneIdentityV1: tombstoneIdentityV1(tombstone, requestedPurgedAt),
    };
  }

  return {
    listTrashedArticles,
    trashArticles,
    previewTrashArticles,
    previewArticleRemovalImpact: previewTrashArticles,
    restoreArticle,
    preparePermanentDelete,
    permanentlyDeleteArticle,
    recoverPendingRemovals: removalService && removalService.recoverPendingRemovals,
    getArticleRemovalTransaction: removalService && removalService.getArticleRemovalTransaction,
    listArticleRemovalTransactions: removalService && removalService.listArticleRemovalTransactions,
    retryArticleRemovalTransaction: removalService && removalService.retryArticleRemovalTransaction
  };
}

module.exports = { createArticleTrashService };
