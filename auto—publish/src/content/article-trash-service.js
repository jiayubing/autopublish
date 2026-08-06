const crypto = require("crypto");
const { createArticleRemovalService } = require("./article-removal-service");
const { createArticleTrashConfirmation } = require("./article-trash-confirmation");
const {
  deriveArticleLifecycle,
  removalTransactionMatchesArticle,
  trashedArticleMutationBlockReason,
} = require("./article-lifecycle-projection");

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
  const operationalStore = opts.operationalStore || null;
  const transactionStore = opts.transactionStore || null;
  const now = opts.now || function() { return new Date().toISOString(); };
  const confirmations = createArticleTrashConfirmation({
    now: now,
    ttlMs: opts.permanentDeleteTokenTtlMs,
    tokenGenerator: opts.permanentDeleteTokenGenerator,
  });
  const removalService = opts.articleRemovalService || (opts.submissionService && opts.workspaceRoot
    ? createArticleRemovalService({
      workspaceRoot: opts.workspaceRoot,
      contentStore: contentStore,
      mutationCoordinator: opts.mutationCoordinator,
      articleRemovalTransitionPort: opts.articleRemovalTransitionPort,
      submissionService: opts.submissionService,
      transactionStore: opts.transactionStore,
      transactionDirectory: opts.transactionDirectory,
      now: opts.now,
      tokenTtlMs: opts.tokenTtlMs,
      tokenGenerator: opts.tokenGenerator,
      afterQueueAction: opts.afterQueueAction,
      afterArticleMove: opts.afterArticleMove,
      onTransactionStatus: opts.onTransactionStatus
    }) : null);

  function removalTransactionsForArticleRef(item) {
    if (!transactionStore || typeof transactionStore.list !== "function") return [];
    try {
      return transactionStore.list().filter(function (transaction) {
        return removalTransactionMatchesArticle(transaction, item);
      });
    } catch (_) {
      throw trashError("ARTICLE_LIFECYCLE_FACTS_UNAVAILABLE", "文章删除事实不可用，操作已停止");
    }
  }

  function lifecycleForArticleRef(item) {
    if (!operationalStore || typeof operationalStore.listArticleLifecycleFacts !== "function") return null;
    let facts;
    try {
      facts = operationalStore.listArticleLifecycleFacts({ articleIds: [item.articleId] });
    } catch (_) {
      throw trashError("ARTICLE_LIFECYCLE_FACTS_UNAVAILABLE", "文章生命周期事实不可用，操作已停止");
    }
    if (!facts || !Array.isArray(facts.publications) || !Array.isArray(facts.submissionItems) || !Array.isArray(facts.orders) || !Array.isArray(facts.attentionItems)) {
      throw trashError("ARTICLE_LIFECYCLE_FACTS_UNAVAILABLE", "文章生命周期事实不可用，操作已停止");
    }
    const removalTransactions = removalTransactionsForArticleRef(item);
    return deriveArticleLifecycle({
      article: {
        id: item.articleId,
        clientId: item.clientId,
        title: "trashed article",
        content: "trashed article",
        status: "trashed",
      },
      publications: facts.publications,
      submissionItems: facts.submissionItems,
      orders: facts.orders,
      attentionItems: facts.attentionItems,
      removalTransactions,
    });
  }

  function assertLifecycleSafe(item, operation) {
    if (mutationCoordinator && typeof mutationCoordinator.assertTrashedArticleMutationAllowed === "function") {
      mutationCoordinator.assertTrashedArticleMutationAllowed({ articleRef: item, operation });
      return;
    }
    const lifecycle = lifecycleForArticleRef(item);
    if (!lifecycle) return;
    const transactions = removalTransactionsForArticleRef(item);
    const code = trashedArticleMutationBlockReason(lifecycle, transactions);
    if (code) {
      const error = trashError(code, operation === "restore"
        ? "文章存在未结束的发布事实，不能恢复"
        : "文章存在未结束的发布事实，不能永久删除");
      Object.defineProperty(error, "safeMetadata", {
        value: Object.freeze({ operation, articleId: item.articleId }),
        enumerable: false,
      });
      throw error;
    }
  }

  function uncertainAfterLifecycleChange(operation, cause) {
    const error = trashError("ARTICLE_MUTATION_RESULT_UNCERTAIN", operation + "结果需要人工核对");
    Object.defineProperty(error, "safeMetadata", {
      value: Object.freeze({ operation, causeCode: cause && cause.code || "ARTICLE_LIFECYCLE_CHANGED" }),
      enumerable: false,
    });
    return error;
  }

  function buildTombstone(article) {
    const references = [];
    if (typeof article.generationBatchId === "string" && article.generationBatchId.trim()) {
      references.push({ type: "generation-batch", id: article.generationBatchId });
    }
    if (typeof article.generationTaskId === "string" && article.generationTaskId.trim()) {
      references.push({ type: "generation-task", id: article.generationTaskId });
    }
    return {
      version: 1,
      deletedAt: now(),
      clientId: article.clientId,
      articleId: article.id,
      status: article.status,
      references: references,
      titleSnapshot: typeof article.title === "string" && article.title.trim() ? article.title.trim().slice(0, 200) : null,
      contentFingerprint: typeof contentStore.fingerprintArticle === "function" ? contentStore.fingerprintArticle(article) : undefined
    };
  }

  function tombstoneFingerprint(tombstone) {
    return crypto.createHash("sha256").update(JSON.stringify({
      version: tombstone.version, deletedAt: tombstone.deletedAt, clientId: tombstone.clientId,
      articleId: tombstone.articleId, status: tombstone.status, references: tombstone.references,
      contentFingerprint: tombstone.contentFingerprint || null
    })).digest("hex");
  }

  function listTrashedArticles(clientId) {
    assertId(clientId, "Client id");
    return contentStore.listTrashedArticles(clientId);
  }

  function trashArticles(input) {
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        (!removalService && (!Array.isArray(input.articles) || input.articles.length < 1)) ||
        (removalService && (!Array.isArray(input.selections || input.articles) || !(input.selections || input.articles).length))) {
      throw trashError("CONTENT_INPUT_INVALID", "At least one article is required");
    }
    if (removalService) {
      return removalService.applyArticleRemovalImpact({
        selections: input.selections || input.articles,
        token: input.token,
        confirmed: input.confirmed
      });
    }
    if (input.confirmed !== true) throw trashError("ARTICLE_TRASH_CONFIRMATION_REQUIRED", "Article trash confirmation is required");
    const moved = [];
    const skipped = [];
    const rejected = [];
    input.articles.forEach(function(rawSelection) {
      const item = selection(rawSelection);
      try {
        const article = contentStore.getArticle(item.clientId, item.articleId);
        const tombstone = contentStore.moveArticleToTrash(item.clientId, item.articleId, buildTombstone(article));
        moved.push(tombstone);
      } catch (error) {
        if (error && error.code === "ARTICLE_NOT_FOUND") {
          const existing = contentStore.listTrashedArticles(item.clientId).find(function(value) { return value.articleId === item.articleId; });
          if (existing) {
            skipped.push(existing);
            return;
          }
        }
        rejected.push({ clientId: item.clientId, articleId: item.articleId, code: error.code || "ARTICLE_TRASH_FAILED" });
      }
    });
    return { moved: moved, skipped: skipped, rejected: rejected };
  }

  function previewTrashArticles(input) {
    if (!removalService) throw trashError("ARTICLE_REMOVAL_UNAVAILABLE", "Article removal preview is unavailable");
    return removalService.previewArticleRemovalImpact(input);
  }

  function restoreArticle(input) {
    const item = selection(input);
    assertLifecycleSafe(item, "restore");
    let restored;
    if (mutationCoordinator && typeof mutationCoordinator.restoreTrashedArticle === "function") {
      restored = mutationCoordinator.restoreTrashedArticle({ articleRef: item }).article;
    } else {
      restored = contentStore.restoreTrashedArticle(item.clientId, item.articleId);
      try { assertLifecycleSafe(item, "restore"); }
      catch (error) { throw uncertainAfterLifecycleChange("restore", error); }
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
    let tombstone;
    if (mutationCoordinator && typeof mutationCoordinator.permanentlyDeleteTrashedArticle === "function") {
      tombstone = mutationCoordinator.permanentlyDeleteTrashedArticle({ articleRef: item, purgedAt: now() }).tombstone;
    } else {
      tombstone = contentStore.permanentlyDeleteTrashedArticle(item.clientId, item.articleId, now());
      try { assertLifecycleSafe(item, "permanent-delete"); }
      catch (error) { throw uncertainAfterLifecycleChange("permanent-delete", error); }
    }
    confirmations.invalidateBinding(item);
    return { clientId: item.clientId, articleId: item.articleId, deleted: true, deletedAt: tombstone.deletedAt };
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
