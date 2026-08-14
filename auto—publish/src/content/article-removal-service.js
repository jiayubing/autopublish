const crypto = require("node:crypto");
const domain = require("../domain");
const {
  createArticleRemovalTransactionStore,
} = require("./article-removal-transaction-store");
const { createArticleRemovalCursor } = require("./article-removal-cursor");
const { createArticleRemovalStateMachine } = require("./article-removal-state");
const {
  removalError,
  clone,
  selections,
  fingerprint,
  transactionFingerprint,
  isOpenStatus,
  isRepairableError,
  titleSnapshot,
  tombstoneReferences,
} = require("./article-removal-plan");
const { reportDiagnostic } = require("../diagnostics/diagnostic-producer");

const LEGACY_QUEUE_ACTION_FIELD = "queueActions";
const LEGACY_QUEUE_CURSOR_FIELD = "queueCursor";
const LEGACY_QUEUE_RESULT_FIELD = "queueResults";

function createArticleRemovalService(options) {
  const opts = options || {};
  if (!opts.contentStore)
    throw removalError(
      "ARTICLE_REMOVAL_SERVICE_INVALID",
      "Content store is required",
    );
  if (!opts.submissionService)
    throw removalError(
      "ARTICLE_REMOVAL_SERVICE_INVALID",
      "Content submission service is required",
    );
  const contentStore = opts.contentStore;
  const submissionService = opts.submissionService;
  const mutationCoordinator = opts.mutationCoordinator || null;
  const transactionStore =
    opts.transactionStore ||
    createArticleRemovalTransactionStore({
      workspaceRoot: opts.workspaceRoot,
      directory: opts.transactionDirectory,
      createId: opts.createTransactionId,
      now: opts.now,
    });
  const clock = opts.now || function () {
    return new Date().toISOString();
  };
  const ttlMs = Number.isFinite(opts.tokenTtlMs)
    ? Math.max(1000, opts.tokenTtlMs)
    : 5 * 60 * 1000;
  const maxRecoveryAttempts = Number.isFinite(opts.maxRecoveryAttempts)
    ? Math.max(1, opts.maxRecoveryAttempts)
    : 5;
  const recoveryBackoffMs = Number.isFinite(opts.recoveryBackoffMs)
    ? Math.max(1, opts.recoveryBackoffMs)
    : 1000;
  const makeToken =
    opts.tokenGenerator || function () {
      return crypto.randomUUID();
    };
  const runnerId = String(opts.runnerId || makeToken());
  const tokens = new Map();
  const completedTransactions = new Map();

  function nowIso() {
    const value = typeof clock === "function" ? clock() : clock;
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime()))
      throw removalError(
        "ARTICLE_REMOVAL_CLOCK_INVALID",
        "Removal clock is invalid",
      );
    return date.toISOString();
  }

  function persist(transaction) {
    let saved;
    if (transaction && transaction.claimToken && transactionStore.compareAndUpdate) {
      const now = Date.parse(nowIso());
      saved = transactionStore.compareAndUpdate(
        transaction.id,
        transaction.revision || 0,
        function (current) {
          const lease = Date.parse(current.claimLeaseExpiresAt || 0);
          if (
            current.claimOwner !== runnerId ||
            current.claimToken !== transaction.claimToken ||
            !Number.isFinite(lease) ||
            lease <= now
          )
            return null;
          const next = clone(transaction);
          next.claimOwner = runnerId;
          next.claimToken = transaction.claimToken;
          next.claimLeaseExpiresAt = new Date(now + ttlMs).toISOString();
          next.updatedAt = nowIso();
          return next;
        },
      );
      if (!saved)
        throw removalError(
          "ARTICLE_REMOVAL_CLAIM_LOST",
          "Removal transaction claim was lost",
        );
      Object.assign(transaction, clone(saved));
    } else saved = transactionStore.save(transaction);
    if (typeof opts.onTransactionStatus === "function") {
      try {
        opts.onTransactionStatus(clone(saved));
      } catch (error) {
        reportDiagnostic({
          code: "ARTICLE_REMOVAL_STATUS_LISTENER_FAILED",
          module: "article-removal-service",
          category: "internal",
          operationId: "article-removal-status-notify",
          metadata: {
            operation: "transaction-status-listener",
            phase: "notify",
            outcome: "listener-isolated",
            status:
              saved &&
              typeof saved.status === "string" &&
              /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(saved.status)
                ? saved.status
                : "unknown",
            errorCode:
              error && /^[A-Z][A-Z0-9_]{1,127}$/.test(error.code || "")
                ? error.code
                : "LISTENER_FAILED",
          },
        });
      }
    }
    return saved;
  }

  const removalCursor = createArticleRemovalCursor({
    runnerId,
    persist,
    error: removalError,
  });
  const removalState = createArticleRemovalStateMachine({
    nowIso,
    persist,
    maxRecoveryAttempts,
    recoveryBackoffMs,
    isRepairableError,
    error: removalError,
  });
  const validAutomaticState = removalState.validAutomaticState;
  const transitionToRepair = removalState.transitionToRepair;
  const recordRetry = removalState.recordRetry;

  function contentIdentity(article) {
    if (!article || article.missing)
      return {
        missing: true,
        clientId: article && article.clientId,
        articleId: article && article.articleId,
      };
    if (contentStore && typeof contentStore.snapshotArticle === "function")
      return contentStore.snapshotArticle(article);
    return {
      clientId: article.clientId,
      articleId: article.id || article.articleId,
      title: article.title || null,
      content: article.content || article.markdown || article.body || null,
      status: article.status || null,
      generationBatchId: article.generationBatchId || null,
      generationTaskId: article.generationTaskId || null,
      ...(Object.prototype.hasOwnProperty.call(article, "remark")
        ? { remark: article.remark }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(article, "ignoreImages")
        ? { ignoreImages: article.ignoreImages }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(article, "source")
        ? { source: article.source }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(article, "materialSnapshots")
        ? { materialSnapshots: article.materialSnapshots }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(article, "researchSnapshots")
        ? { researchSnapshots: article.researchSnapshots }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(article, "templateSnapshot")
        ? { templateSnapshot: article.templateSnapshot }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(article, "updatedAt")
        ? { updatedAt: article.updatedAt }
        : {}),
    };
  }

  function articleFingerprint(article) {
    if (
      contentStore &&
      typeof contentStore.fingerprintArticle === "function"
    )
      return contentStore.fingerprintArticle(article);
    return fingerprint(contentIdentity(article));
  }

  function claim(transaction) {
    if (!transactionStore.compareAndUpdate) return transaction;
    const now = Date.parse(nowIso());
    const leaseExpiresAt = new Date(now + ttlMs).toISOString();
    return transactionStore.compareAndUpdate(
      transaction.id,
      transaction.revision || 0,
      function (current) {
        const owner = current.claimOwner || null;
        const lease = Date.parse(current.claimLeaseExpiresAt || 0);
        if (owner && owner !== runnerId && Number.isFinite(lease) && lease > now)
          return null;
        current.claimToken = String(makeToken());
        current.claimOwner = runnerId;
        current.claimLeaseExpiresAt = leaseExpiresAt;
        current.claimedAt = nowIso();
        return current;
      },
    );
  }

  function transactionDto(transaction) {
    if (!transaction) return null;
    const selectionRefs = Array.isArray(transaction.selections)
      ? transaction.selections
      : [];
    const state =
      transaction.phase === "needs_repair" || transaction.status === "needs_repair"
        ? "NEEDS_REPAIR"
        : transaction.status === "committed"
          ? "COMMITTED"
          : transaction.status === "superseded" || transaction.phase === "superseded"
            ? "SUPERSEDED"
            : "PENDING";
    const deletionTransactionIdentityV1 = domain.parseDeletionTransactionIdentityV1({
      version: 1,
      transactionId: transaction.id,
      articleIdentitiesV1: selectionRefs.map(function (item) {
        return {
          version: 1,
          clientId: item.clientId,
          articleId: item.articleId,
        };
      }),
      state,
      reasonCode: transaction.reasonCode || transaction.errorCode || null,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt || transaction.createdAt,
      selectionFingerprint:
        transaction.fingerprint || transactionFingerprint(selectionRefs),
    });
    return {
      id: transaction.id,
      transactionId: transaction.id,
      status: transaction.status,
      phase: transaction.phase || null,
      errorCode: transaction.errorCode || null,
      reasonCode: transaction.reasonCode || null,
      resolutionCode: transaction.resolutionCode || null,
      createdAt: transaction.createdAt || null,
      updatedAt: transaction.updatedAt || null,
      articleCount: Array.isArray(transaction.articles)
        ? transaction.articles.length
        : selectionRefs.length,
      articleCursor: Number(transaction.articleCursor || 0),
      deletionTransactionIdentityV1,
    };
  }

  function articleFor(item, mutationPort) {
    try {
      if (mutationPort && typeof mutationPort.readArticle === "function")
        return mutationPort.readArticle({
          clientId: item.clientId,
          articleId: item.articleId,
        });
      if (
        mutationCoordinator &&
        typeof mutationCoordinator.readArticleForRemoval === "function"
      )
        return mutationCoordinator.readArticleForRemoval({
          articleRef: { clientId: item.clientId, articleId: item.articleId },
        });
      return contentStore.getArticle(item.clientId, item.articleId);
    } catch (error) {
      if (error && error.code === "ARTICLE_NOT_FOUND")
        return {
          missing: true,
          clientId: item.clientId,
          articleId: item.articleId,
          code: "ARTICLE_NOT_FOUND",
        };
      throw error;
    }
  }

  function articleForRequired(item, mutationPort) {
    if (mutationPort && typeof mutationPort.readArticle === "function")
      return mutationPort.readArticle({
        clientId: item.clientId,
        articleId: item.articleId,
      });
    if (
      mutationCoordinator &&
      typeof mutationCoordinator.readArticleForRemoval === "function"
    )
      return mutationCoordinator.readArticleForRemoval({
        articleRef: { clientId: item.clientId, articleId: item.articleId },
      });
    return contentStore.getArticle(item.clientId, item.articleId);
  }

  function articleIsTrashed(item, mutationPort) {
    if (mutationPort && typeof mutationPort.isArticleTrashed === "function")
      return mutationPort.isArticleTrashed({
        clientId: item.clientId,
        articleId: item.articleId,
      });
    return (
      contentStore.isArticleTrashed &&
      contentStore.isArticleTrashed(item.clientId, item.articleId)
    );
  }

  function trashedTombstoneFor(item, mutationPort) {
    if (
      mutationPort &&
      typeof mutationPort.getTrashedTombstone === "function"
    )
      return mutationPort.getTrashedTombstone({
        clientId: item.clientId,
        articleId: item.articleId,
      });
    return contentStore.getTrashedTombstone(item.clientId, item.articleId);
  }

  function safeImpactItem(item) {
    const value = item && typeof item === "object" ? item : {};
    const output = {};
    [
      "clientId",
      "articleId",
      "batchId",
      "publicationId",
      "attemptId",
      "itemId",
      "platformId",
      "targetPlatformId",
      "targetKey",
      "displayName",
      "reasonCode",
      "status",
      "titleSnapshot",
      "source",
      "mediaResourceId",
      "orderId",
      "orderNid",
    ].forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(value, field))
        output[field] = value[field];
    });
    return output;
  }

  function buildImpact(items) {
    if (typeof submissionService.previewArticleRemovalImpact !== "function")
      throw removalError(
        "ARTICLE_REMOVAL_PREVIEW_UNAVAILABLE",
        "Article removal preview is unavailable",
      );
    const impact = submissionService.previewArticleRemovalImpact({
      selections: items,
    });
    if (!impact || !Array.isArray(impact.blockedItems))
      throw removalError(
        "ARTICLE_REMOVAL_PREVIEW_UNAVAILABLE",
        "Article removal preview is unavailable",
      );
    return {
      blockedItems: impact.blockedItems.map(safeImpactItem),
    };
  }

  function legacyQueueMigration(transaction) {
    if (!transaction || transaction.legacyQueueMigration) return transaction;
    const activeOperation = transaction.activeOperation;
    const hasLegacyFields =
      Object.prototype.hasOwnProperty.call(transaction, LEGACY_QUEUE_ACTION_FIELD) ||
      Object.prototype.hasOwnProperty.call(transaction, LEGACY_QUEUE_CURSOR_FIELD) ||
      Object.prototype.hasOwnProperty.call(transaction, LEGACY_QUEUE_RESULT_FIELD) ||
      transaction.phase === "queue-actions" ||
      (activeOperation && activeOperation.kind === "queue");
    if (!hasLegacyFields) return transaction;

    const actions = Array.isArray(transaction[LEGACY_QUEUE_ACTION_FIELD])
      ? transaction[LEGACY_QUEUE_ACTION_FIELD]
      : [];
    const cursor = Number(transaction[LEGACY_QUEUE_CURSOR_FIELD] || 0);
    const activeIndex =
      activeOperation && activeOperation.kind === "queue"
        ? Number(activeOperation.cursor)
        : -1;
    const results = transaction[LEGACY_QUEUE_RESULT_FIELD];
    const activeProof =
      activeIndex >= 0 &&
      cursor > activeIndex &&
      Array.isArray(results) &&
      results[activeIndex] !== undefined;
    const safeToContinue =
      !activeOperation || activeOperation.kind !== "queue"
        ? cursor >= actions.length
        : activeProof && cursor >= actions.length;

    delete transaction[LEGACY_QUEUE_ACTION_FIELD];
    delete transaction[LEGACY_QUEUE_CURSOR_FIELD];
    delete transaction[LEGACY_QUEUE_RESULT_FIELD];
    if (activeOperation && activeOperation.kind === "queue")
      delete transaction.activeOperation;
    transaction.fingerprint = transactionFingerprint(
      Array.isArray(transaction.selections) ? transaction.selections : [],
    );
    transaction.legacyQueueMigration = safeToContinue ? "completed" : "needs_repair";
    transaction.legacyQueueMigrationCode = safeToContinue
      ? "LEGACY_QUEUE_ACTIONS_RETIRED"
      : "LEGACY_QUEUE_ACTIONS_REQUIRE_MANUAL_REPAIR";
    transaction.updatedAt = nowIso();
    if (safeToContinue) {
      if (transaction.phase === "queue-actions" || transaction.phase === "intent")
        transaction.phase = "articles";
      if (transaction.status === "pending_recovery")
        transaction.status = "pending_auto_recovery";
      transaction.resolutionCode = "LEGACY_QUEUE_ACTIONS_RETIRED";
    } else {
      transaction.status = "needs_repair";
      transaction.phase = "needs_repair";
      transaction.resumePhase = "articles";
      transaction.errorCode = "ARTICLE_REMOVAL_LEGACY_QUEUE_ACTION";
      transaction.resolutionCode = "LEGACY_QUEUE_ACTIONS_REQUIRE_MANUAL_REPAIR";
    }
    persist(transaction);
    return transaction;
  }

  function canonicalizeOpenTransactions() {
    const groups = new Map();
    transactionStore
      .list()
      .filter(function (transaction) {
        return isOpenStatus(transaction.status);
      })
      .map(legacyQueueMigration)
      .filter(function (transaction) {
        return isOpenStatus(transaction.status);
      })
      .forEach(function (transaction) {
        const value =
          transaction.fingerprint ||
          transactionFingerprint(
            Array.isArray(transaction.selections) ? transaction.selections : [],
          );
        if (!transaction.fingerprint) {
          transaction.fingerprint = value;
          persist(transaction);
        }
        if (!groups.has(value)) groups.set(value, []);
        groups.get(value).push(transaction);
      });
    groups.forEach(function (values) {
      values
        .sort(
          (left, right) =>
            String(left.createdAt || "").localeCompare(String(right.createdAt || "")) ||
            String(left.id).localeCompare(String(right.id)),
        )
        .slice(1)
        .forEach(function (transaction) {
          transaction.status = "superseded";
          transaction.phase = "superseded";
          transaction.errorCode = "DUPLICATE_REMOVAL_TRANSACTION";
          transaction.updatedAt = nowIso();
          persist(transaction);
          transactionStore.remove(transaction.id);
        });
    });
    return transactionStore.list().filter(function (transaction) {
      return isOpenStatus(transaction.status);
    });
  }

  function findOpenTransaction(items, excludedTransactionId) {
    const targetFingerprint = transactionFingerprint(items);
    return (
      canonicalizeOpenTransactions()
        .filter(function (transaction) {
          return (
            isOpenStatus(transaction.status) &&
            transaction.fingerprint === targetFingerprint &&
            transaction.id !== excludedTransactionId
          );
        })
        .sort(
          (left, right) =>
            String(left.createdAt || "").localeCompare(String(right.createdAt || "")),
        )[0] || null
    );
  }

  function removalImpact(items, excludedTransactionId) {
    const impact = buildImpact(items);
    const openTransaction = findOpenTransaction(items, excludedTransactionId);
    const blockedItems = impact.blockedItems.slice();
    if (openTransaction) {
      blockedItems.push({
        clientId: items[0] && items[0].clientId,
        articleId: items[0] && items[0].articleId,
        reasonCode:
          openTransaction.status === "needs_repair"
            ? "REMOVAL_REPAIR_REQUIRED"
            : "ARTICLE_REMOVAL_OPERATION_IN_FLIGHT",
        source: "removal_transaction",
        status: openTransaction.status,
      });
    }
    return { blockedItems, openTransaction };
  }

  function previewArticleRemovalImpact(input) {
    const items = selections(input);
    const blockedItems = [];
    const articles = items.map(function (item) {
      const article = articleFor(item);
      if (article.missing) {
        blockedItems.push({
          clientId: item.clientId,
          articleId: item.articleId,
          reasonCode: article.code,
          source: "article",
        });
        return {
          clientId: item.clientId,
          articleId: item.articleId,
          titleSnapshot: null,
          state: "missing",
        };
      }
      return {
        clientId: item.clientId,
        articleId: item.articleId,
        titleSnapshot: titleSnapshot(article),
        state: "available",
      };
    });
    const impact = removalImpact(items);
    blockedItems.push(...impact.blockedItems);
    const binding = {
      selections: items,
      articles,
      blockedItems: blockedItems.map(safeImpactItem),
    };
    const token = String(makeToken());
    const createdAt = nowIso();
    tokens.set(token, {
      token,
      createdAt,
      expiresAt: Date.parse(createdAt) + ttlMs,
      fingerprint: fingerprint(binding),
      binding,
    });
    const result = {
      token,
      createdAt,
      expiresAt: new Date(Date.parse(createdAt) + ttlMs).toISOString(),
      articleCount: items.length,
      selections: items,
      articles,
      blockedItems,
      canCommit: blockedItems.length === 0,
      selectionFingerprint: fingerprint(binding),
    };
    if (impact.openTransaction) {
      result.openTransactionId = impact.openTransaction.id;
      result.openTransaction = transactionDto(impact.openTransaction);
      result.transactionId = impact.openTransaction.id;
      result.transaction = transactionDto(impact.openTransaction);
    }
    return result;
  }

  function tokenValue(input) {
    if (!input || typeof input.token !== "string" || !input.token.trim())
      throw removalError(
        "ARTICLE_TRASH_CONFIRMATION_REQUIRED",
        "Article trash confirmation is required",
      );
    const value = tokens.get(input.token);
    let currentTime;
    try {
      currentTime = Date.parse(nowIso());
    } catch (error) {
      currentTime = Date.now();
    }
    if (!value || currentTime >= value.expiresAt) {
      tokens.delete(input.token);
      throw removalError(
        "ARTICLE_TRASH_PREVIEW_EXPIRED",
        "Article trash preview has expired",
      );
    }
    return value;
  }

  function verifyFresh(value) {
    const currentArticles = value.binding.selections.map(function (item) {
      const article = articleFor(item);
      return {
        clientId: item.clientId,
        articleId: item.articleId,
        titleSnapshot: article.missing ? null : titleSnapshot(article),
        state: article.missing ? "missing" : "available",
      };
    });
    const currentImpact = removalImpact(value.binding.selections);
    const currentBinding = {
      selections: value.binding.selections,
      articles: currentArticles,
      blockedItems: currentImpact.blockedItems.map(safeImpactItem),
    };
    if (
      currentImpact.blockedItems.length ||
      fingerprint(currentBinding) !== value.fingerprint
    )
      throw removalError(
        "ARTICLE_TRASH_PREVIEW_STALE",
        "Article trash preview is stale",
      );
    return { blockedItems: currentImpact.blockedItems, openTransaction: currentImpact.openTransaction, articles: currentArticles };
  }

  function tombstoneFor(article, operationId) {
    return {
      version: 1,
      deletedAt: nowIso(),
      clientId: article.clientId,
      articleId: article.id,
      status: article.status,
      references: tombstoneReferences(article),
      titleSnapshot: titleSnapshot(article),
      contentFingerprint: articleFingerprint(article),
      operationId,
    };
  }

  function operationItem(transaction, operation) {
    const located = removalCursorLocate(transaction, operation);
    if (located.error)
      return {
        error: transitionToRepair(
          transaction,
          "ARTICLE_REMOVAL_OPERATION_CONFLICT",
          "REMOVAL_OPERATION_ID_CONFLICT",
        ),
      };
    return located;
  }

  const removalCursorLocate = function (transaction, operation) {
    return removalCursor.locate(transaction, operation);
  };

  function matchingTombstone(transaction, item, tombstone, expected) {
    const index = Number(transaction.activeOperation.cursor);
    return matchingTombstoneAt(transaction, index, item, tombstone, expected);
  }

  function matchingTombstoneAt(transaction, index, item, tombstone, expected) {
    const expectedFingerprint = Array.isArray(
      transaction.contentArticleFingerprints,
    )
      ? transaction.contentArticleFingerprints[index]
      : null;
    return Boolean(
      tombstone &&
        tombstone.clientId === item.clientId &&
        tombstone.articleId === item.articleId &&
        tombstone.operationId === expected &&
        (!transaction.articles[index] ||
          transaction.articles[index].titleSnapshot === undefined ||
          tombstone.titleSnapshot === transaction.articles[index].titleSnapshot) &&
        (!expectedFingerprint || tombstone.contentFingerprint === expectedFingerprint),
    );
  }

  function finishOperation(transaction) {
    removalCursor.finish(transaction);
  }

  function reconcileActiveOperation(transaction, mutationPort) {
    const operation = transaction && transaction.activeOperation;
    if (!operation) return { status: "none", transaction };
    if (operation.kind !== "article")
      return {
        status: "repair",
        transaction: transitionToRepair(
          transaction,
          "ARTICLE_REMOVAL_LEGACY_QUEUE_ACTION",
          "LEGACY_QUEUE_ACTIONS_REQUIRE_MANUAL_REPAIR",
        ),
      };
    const located = operationItem(transaction, operation);
    if (located.error) return { status: "repair", transaction: located.error };
    const expected = located.expected;
    const item = located.item;
    let tombstone = null;
    let tombstoneMissing = false;
    try {
      tombstone = trashedTombstoneFor(item, mutationPort);
      tombstoneMissing = !tombstone;
    } catch (error) {
      if (error && error.code === "ARTICLE_NOT_FOUND") tombstoneMissing = true;
      else return { status: "retry", error };
    }
    if (tombstone && !matchingTombstone(transaction, item, tombstone, expected))
      return {
        status: "repair",
        transaction: transitionToRepair(
          transaction,
          "ARTICLE_REMOVAL_OPERATION_CONFLICT",
          "REMOVAL_OPERATION_RESULT_UNPROVABLE",
        ),
      };
    if (tombstone && !tombstoneMissing) {
      try {
        articleForRequired(item, mutationPort);
        return {
          status: "repair",
          transaction: transitionToRepair(
            transaction,
            "ARTICLE_REMOVAL_OPERATION_CONFLICT",
            "REMOVAL_SOURCE_AND_TRASH_BOTH_EXIST",
          ),
        };
      } catch (error) {
        if (!error || error.code !== "ARTICLE_NOT_FOUND")
          return { status: "retry", error };
      }
      transaction.articleCursor = Number(operation.cursor) + 1;
      finishOperation(transaction);
      transaction.resolutionCode = "ARTICLE_OPERATION_RECONCILED";
      persist(transaction);
      return { status: "resolved", transaction };
    }
    if (
      !tombstoneMissing ||
      typeof contentStore.getTrashedTombstone !== "function" ||
      contentStore.supportsIdempotentRemovalOperation !== true
    )
      return {
        status: "repair",
        transaction: transitionToRepair(
          transaction,
          "ARTICLE_REMOVAL_OPERATION_RESULT_UNPROVABLE",
          "REMOVAL_OPERATION_RESULT_UNPROVABLE",
        ),
      };
    let article;
    try {
      article = articleFor(item, mutationPort);
    } catch (error) {
      return { status: "retry", error };
    }
    const expectedFingerprint = Array.isArray(
      transaction.contentArticleFingerprints,
    )
      ? transaction.contentArticleFingerprints[Number(operation.cursor)]
      : null;
    if (!expectedFingerprint || articleFingerprint(article) !== expectedFingerprint)
      return {
        status: "repair",
        transaction: transitionToRepair(
          transaction,
          "ARTICLE_REMOVAL_CONTENT_CHANGED",
          "CONTENT_IDENTITY_REVALIDATION_FAILED",
        ),
      };
    transaction.activeOperation.owner = runnerId;
    persist(transaction);
    try {
      if (mutationPort && typeof mutationPort.moveArticleToTrash === "function") {
        mutationPort.moveArticleToTrash(
          { clientId: item.clientId, articleId: item.articleId },
          tombstoneFor(article, expected),
          expected,
          expectedFingerprint,
        );
      } else if (
        mutationCoordinator &&
        typeof mutationCoordinator.executeArticleRemovalTransaction === "function"
      ) {
        mutationCoordinator.executeArticleRemovalTransaction({
          selections: transaction.selections,
          selection: item,
          transactionId: transaction.id,
          operationId: expected,
          tombstone: tombstoneFor(article, expected),
          expectedFingerprint,
        });
      } else {
        contentStore.moveArticleToTrash(
          item.clientId,
          item.articleId,
          tombstoneFor(article, expected),
          expected,
          expectedFingerprint,
        );
      }
    } catch (error) {
      return { status: "retry", error };
    }
    let completedTombstone;
    try {
      completedTombstone = trashedTombstoneFor(item, mutationPort);
    } catch (error) {
      return { status: "retry", error };
    }
    if (!matchingTombstone(transaction, item, completedTombstone, expected))
      return {
        status: "repair",
        transaction: transitionToRepair(
          transaction,
          "ARTICLE_REMOVAL_OPERATION_CONFLICT",
          "REMOVAL_OPERATION_RESULT_UNPROVABLE",
        ),
      };
    transaction.articleCursor = Number(operation.cursor) + 1;
    finishOperation(transaction);
    transaction.resolutionCode = "ARTICLE_OPERATION_RECONCILED_AFTER_RETRY";
    persist(transaction);
    return { status: "resolved", transaction };
  }

  function revalidate(transaction, mutationPort) {
    if (
      !transaction.contentFingerprint ||
      !Array.isArray(transaction.contentArticleFingerprints)
    )
      return {
        ok: false,
        transaction: transitionToRepair(
          transaction,
          "ARTICLE_REMOVAL_CONTENT_FINGERPRINT_MISSING",
          "LEGACY_CONTENT_FINGERPRINT_REQUIRED",
        ),
      };
    const impact = removalImpact(transaction.selections, transaction.id);
    if (impact.blockedItems.length)
      return {
        ok: false,
        transaction: transitionToRepair(
          transaction,
          "ARTICLE_REMOVAL_BLOCKED",
          "REMOVAL_BLOCKED_REVALIDATION",
        ),
      };
    const start = Number(transaction.articleCursor || 0);
    for (let index = start; index < transaction.selections.length; index += 1) {
      const item = transaction.selections[index];
      const article = articleFor(item, mutationPort);
      if (article.missing && article.code && article.code !== "ARTICLE_NOT_FOUND")
        throw removalError(article.code, "Article content could not be revalidated");
      if (
        article.missing &&
        !articleIsTrashed(item, mutationPort)
      )
        return {
          ok: false,
          transaction: transitionToRepair(
            transaction,
            "ARTICLE_REMOVAL_CONTENT_CHANGED",
            "CONTENT_IDENTITY_REVALIDATION_FAILED",
          ),
        };
      if (article.missing) {
        const tombstone = trashedTombstoneFor(item, mutationPort);
        const expectedOperationId = removalCursor.operationId(
          transaction,
          "article",
          index,
        );
        if (
          !matchingTombstoneAt(
            transaction,
            index,
            item,
            tombstone,
            expectedOperationId,
          )
        )
          return {
            ok: false,
            transaction: transitionToRepair(
              transaction,
              "ARTICLE_REMOVAL_OPERATION_CONFLICT",
              "REMOVAL_OPERATION_RESULT_UNPROVABLE",
            ),
          };
        continue;
      }
      if (
        articleFingerprint(article) !== transaction.contentArticleFingerprints[index]
      )
        return {
          ok: false,
          transaction: transitionToRepair(
            transaction,
            "ARTICLE_REMOVAL_CONTENT_CHANGED",
            "CONTENT_IDENTITY_REVALIDATION_FAILED",
          ),
        };
    }
    if (start === 0 && transaction.selections.every(function (item) {
      const article = articleFor(item, mutationPort);
      return !article.missing;
    })) {
      const currentArticles = transaction.selections.map(function (item) {
        return articleFor(item, mutationPort);
      });
      if (
        fingerprint(currentArticles.map(contentIdentity)) !==
        transaction.contentFingerprint
      )
        return {
          ok: false,
          transaction: transitionToRepair(
            transaction,
            "ARTICLE_REMOVAL_CONTENT_CHANGED",
            "CONTENT_IDENTITY_REVALIDATION_FAILED",
          ),
        };
    }
    return { ok: true, transaction };
  }

  function performSteps(transaction, requireRevalidation, mutationPort) {
    let current = legacyQueueMigration(transaction);
    if (current.legacyQueueMigration === "needs_repair") return current;
    if (current.phase === "committed") {
      current.status = "committed";
      current.resolutionCode = "ARTICLE_REMOVAL_COMMITTED";
      current.errorCode = null;
      delete current.nextAttemptAt;
      current.updatedAt = nowIso();
      persist(current);
      completedTransactions.set(current.id, clone(current));
      return current;
    }
    if (current.activeOperation) {
      const reconciliation = reconcileActiveOperation(current, mutationPort);
      if (reconciliation.status === "retry") throw reconciliation.error;
      current = reconciliation.transaction;
      if (reconciliation.status === "repair") return current;
      if (reconciliation.status === "resolved") {
        const validation = revalidate(current, mutationPort);
        current = validation.transaction;
        if (!validation.ok) return current;
      }
    }
    if (current.phase === "needs_repair") {
      const validation = revalidate(current, mutationPort);
      current = validation.transaction;
      if (!validation.ok) return current;
      current.status = "pending_auto_recovery";
      current.phase = current.resumePhase || "articles";
      delete current.resumePhase;
      current.errorCode = null;
      current.resolutionCode = "REMOVAL_REVALIDATED";
      current.updatedAt = nowIso();
      persist(current);
    } else if (current.status === "pending_recovery") {
      current.status = "pending_auto_recovery";
      persist(current);
    }
    if (requireRevalidation || current.phase === "intent") {
      const validation = revalidate(current, mutationPort);
      current = validation.transaction;
      if (!validation.ok) return current;
    }
    if (current.phase === "intent") {
      current.phase = "articles";
      current.status = "pending_auto_recovery";
      persist(current);
    }
    if (current.phase !== "articles") return current;
    for (
      let index = current.articleCursor || 0;
      index < current.articles.length;
      index += 1
    ) {
      const item = current.articles[index];
      let article;
      try {
        article = articleFor(item, mutationPort);
      } catch (error) {
        if (error && error.code === "ARTICLE_NOT_FOUND" && articleIsTrashed(item, mutationPort)) {
          current.articleCursor = index + 1;
          persist(current);
          continue;
        }
        return recordRetry(current, error, "ARTICLE_READ_RETRY_REQUIRED");
      }
      try {
        if (articleIsTrashed(item, mutationPort)) {
          current.articleCursor = index + 1;
          persist(current);
          continue;
        }
        const expectedFingerprint = Array.isArray(
          current.contentArticleFingerprints,
        )
          ? current.contentArticleFingerprints[index]
          : null;
        if (!expectedFingerprint || articleFingerprint(article) !== expectedFingerprint)
          return transitionToRepair(
            current,
            expectedFingerprint
              ? "ARTICLE_REMOVAL_CONTENT_CHANGED"
              : "ARTICLE_REMOVAL_CONTENT_FINGERPRINT_MISSING",
            "CONTENT_IDENTITY_REVALIDATION_FAILED",
          );
        persist(current);
        removalCursor.begin(current, "article", index, item);
        const moveOperationId = removalCursor.operationId(
          current,
          "article",
          index,
        );
        if (mutationPort && typeof mutationPort.moveArticleToTrash === "function") {
          mutationPort.moveArticleToTrash(
            { clientId: item.clientId, articleId: item.articleId },
            tombstoneFor(article, moveOperationId),
            moveOperationId,
            expectedFingerprint,
          );
        } else if (
          mutationCoordinator &&
          typeof mutationCoordinator.executeArticleRemovalTransaction === "function"
        ) {
          mutationCoordinator.executeArticleRemovalTransaction({
            selections: current.selections,
            selection: item,
            transactionId: current.id,
            operationId: moveOperationId,
            tombstone: tombstoneFor(article, moveOperationId),
            expectedFingerprint,
          });
        } else {
          contentStore.moveArticleToTrash(
            item.clientId,
            item.articleId,
            tombstoneFor(article, moveOperationId),
            moveOperationId,
            expectedFingerprint,
          );
        }
      } catch (error) {
        if (error && error.code === "ARTICLE_REMOVAL_CONTENT_CHANGED") {
          finishOperation(current);
          return transitionToRepair(
            current,
            error.code,
            "CONTENT_IDENTITY_REVALIDATION_FAILED",
          );
        }
        if (!error || error.code !== "ARTICLE_REMOVAL_CLAIM_LOST")
          finishOperation(current);
        return recordRetry(current, error, "ARTICLE_MOVE_RETRY_REQUIRED");
      }
      current.articleCursor = index + 1;
      current.status = "pending_auto_recovery";
      finishOperation(current);
      persist(current);
      if (typeof opts.afterArticleMove === "function")
        opts.afterArticleMove(clone(item), index, clone(current));
    }
    current.phase = "committed";
    current.status = "committed";
    current.resolutionCode = "ARTICLE_REMOVAL_COMMITTED";
    current.errorCode = null;
    delete current.nextAttemptAt;
    current.updatedAt = nowIso();
    persist(current);
    completedTransactions.set(current.id, clone(current));
    return current;
  }

  function perform(transaction, requireRevalidation, mutationPort) {
    try {
      return performSteps(transaction, requireRevalidation, mutationPort);
    } catch (error) {
      if (transaction && transaction.phase === "needs_repair") return transaction;
      return recordRetry(transaction, error, "PERSISTENCE_RETRY_REQUIRED");
    }
  }

  function performThroughCoordinator(transaction, requireRevalidation) {
    if (
      mutationCoordinator &&
      typeof mutationCoordinator.supportsArticleRemovalTransaction === "function" &&
      mutationCoordinator.supportsArticleRemovalTransaction() &&
      typeof mutationCoordinator.executeArticleRemovalTransaction === "function"
    )
      return mutationCoordinator.executeArticleRemovalTransaction({
        selections: transaction.selections,
        transaction,
        requireRevalidation: requireRevalidation === true,
      });
    return perform(transaction, requireRevalidation);
  }

  if (
    opts.articleRemovalTransitionPort &&
    typeof opts.articleRemovalTransitionPort === "object"
  )
    opts.articleRemovalTransitionPort.execute = function (input) {
      const value = input || {};
      return perform(value.transaction, value.requireRevalidation === true, value.mutation);
    };

  function applyArticleRemovalImpact(input) {
    const value = input || {};
    if (value.confirmed !== true)
      throw removalError(
        "ARTICLE_TRASH_CONFIRMATION_REQUIRED",
        "Article trash confirmation is required",
      );
    const token = tokenValue(value);
    if (value.selections) {
      const requested = selections(value);
      if (
        fingerprint(requested) !== fingerprint(token.binding.selections)
      )
        throw removalError(
          "ARTICLE_TRASH_PREVIEW_STALE",
          "Article trash preview is stale",
        );
    }
    const fresh = verifyFresh(token);
    if (fresh.blockedItems.length)
      throw removalError(
        "ARTICLE_TRASH_BLOCKED",
        "Article trash is blocked by an active submission",
      );
    tokens.delete(value.token);
    const createdAt = nowIso();
    const existing = findOpenTransaction(token.binding.selections);
    if (existing)
      return {
        transactionId: existing.id,
        status: existing.status,
        articleCount: existing.articles
          ? existing.articles.length
          : token.binding.selections.length,
        reused: true,
        errorCode: existing.errorCode || null,
      };
    const transaction = {
      version: 2,
      id: String(transactionStore.createId()),
      kind: "article-removal",
      status: "pending_auto_recovery",
      phase: "intent",
      createdAt,
      updatedAt: createdAt,
      selections: clone(token.binding.selections),
      articles: clone(token.binding.articles),
      contentArticleFingerprints: token.binding.selections
        .map(articleFor)
        .map(articleFingerprint),
      fingerprint: transactionFingerprint(token.binding.selections),
      contentFingerprint: fingerprint(
        token.binding.selections.map(articleFor).map(contentIdentity),
      ),
      revision: 0,
    };
    persist(transaction);
    const claimed = claim(transaction);
    if (!claimed) {
      const persisted = transactionStore.get(transaction.id);
      return {
        transactionId: transaction.id,
        status: persisted.status,
        articleCount: transaction.articles.length,
        errorCode:
          persisted.errorCode || "ARTICLE_REMOVAL_CLAIM_UNAVAILABLE",
      };
    }
    const result = performThroughCoordinator(claimed, false);
    return {
      transactionId: result.id,
      status: result.status,
      articleCount: result.articles.length,
      errorCode: result.errorCode || null,
    };
  }

  function recoverPendingRemovals(lifecycle) {
    if (lifecycle && lifecycle.isDisposed && lifecycle.isDisposed()) return [];
    const now = Date.parse(nowIso());
    return canonicalizeOpenTransactions()
      .filter(function (transaction) {
        return (
          validAutomaticState(transaction) &&
          (!transaction.nextAttemptAt || Date.parse(transaction.nextAttemptAt) <= now)
        );
      })
      .map(function (transaction) {
        if (lifecycle && lifecycle.isDisposed && lifecycle.isDisposed())
          return transaction;
        const claimed = claim(transaction);
        if (!claimed) return transaction;
        try {
          return performThroughCoordinator(claimed, true);
        } catch (error) {
          return recordRetry(claimed, error, "RECOVERY_IO_RETRY_REQUIRED");
        }
      });
  }

  function getArticleRemovalTransaction(transactionId) {
    return transactionDto(transactionStore.get(transactionId));
  }

  function listArticleRemovalTransactions() {
    return canonicalizeOpenTransactions().map(transactionDto);
  }

  function retryArticleRemovalTransaction(input) {
    if (
      !input ||
      typeof input.transactionId !== "string" ||
      !input.transactionId.trim()
    )
      throw removalError(
        "ARTICLE_REMOVAL_TRANSACTION_ID_INVALID",
        "Removal transaction id is invalid",
      );
    if (input.confirmed !== true)
      throw removalError(
        "ARTICLE_TRASH_CONFIRMATION_REQUIRED",
        "Article trash confirmation is required",
      );
    let transaction;
    try {
      transaction = transactionStore.get(input.transactionId);
    } catch (error) {
      const completed = completedTransactions.get(input.transactionId);
      if (completed) return transactionDto(completed);
      throw error;
    }
    transaction = legacyQueueMigration(transaction);
    if (transaction.status === "superseded" || transaction.phase === "superseded")
      return transactionDto(transaction);
    if (transaction.status === "committed" && transaction.phase === "committed")
      return transactionDto(transaction);
    const claimed = claim(transaction);
    if (!claimed) return transactionDto(transaction);
    try {
      return transactionDto(performThroughCoordinator(claimed, true));
    } catch (error) {
      reportDiagnostic({
        code: "ARTICLE_REMOVAL_RETRY_FAILED",
        module: "article-removal-service",
        category: "storage",
        operationId: transaction.id,
        metadata: {
          operation: "removal-retry",
          phase: "recover",
          outcome: "failed",
          errorCode:
            error && /^[A-Z][A-Z0-9_]{1,127}$/.test(error.code || "")
              ? error.code
              : "ARTICLE_REMOVAL_RETRY_FAILED",
        },
      });
      throw error;
    }
  }

  return {
    previewArticleRemovalImpact,
    applyArticleRemovalImpact,
    recoverPendingRemovals,
    recover: recoverPendingRemovals,
    getArticleRemovalTransaction,
    listArticleRemovalTransactions,
    retryArticleRemovalTransaction,
    transactionStore,
  };
}

module.exports = { createArticleRemovalService };
