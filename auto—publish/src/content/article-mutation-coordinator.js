"use strict";

const crypto = require("node:crypto");
const domain = require("../domain");
const { fingerprintArticle, snapshotArticle } = require("./content-store");
const {
  deriveArticleLifecycle,
  removalTransactionMatchesArticle,
  trashedArticleMutationBlockReason,
} = require("./article-lifecycle-projection");
const {
  articleRefOf,
  canonicalArticleRefKey,
  canonicalArticleRefs,
  normalizeArticleRef,
} = require("./article-ref");

function mutationError(code, message, metadata) {
  const error = new Error(message || code);
  error.code = code;
  if (metadata && typeof metadata === "object") {
    Object.defineProperty(error, "safeMetadata", {
      value: Object.freeze(Object.assign({}, metadata)),
      enumerable: false,
    });
  }
  return error;
}

function nowIso(clock) {
  const value = typeof clock === "function" ? clock() : new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw mutationError("ARTICLE_MUTATION_CLOCK_INVALID");
  return date.toISOString();
}

function validFingerprint(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function safeErrorCode(error) {
  return error && typeof error.code === "string" ? error.code : "ARTICLE_MUTATION_FAILED";
}

function createArticleMutationCoordinator(options) {
  const value = options || {};
  if (!value.articleStore || typeof value.articleStore.openMutationSession !== "function") {
    throw mutationError("ARTICLE_MUTATION_COORDINATOR_INVALID", "Article mutation store is required");
  }
  if (!value.contentStore) throw mutationError("ARTICLE_MUTATION_COORDINATOR_INVALID", "Content store is required");
  const articleStore = value.articleStore;
  const contentStore = value.contentStore;
  // Production composition supplies named transition capabilities.  The
  // legacy aggregate option remains only for isolated pre-ticket callers;
  // regular admission/removal never closes over it.
  const legacyOperationalStore = value.operationalStore || null;
  const publicationTransitions = value.publicationTransitions || legacyOperationalStore;
  const lifecycleFacts = value.lifecycleFacts || publicationTransitions || value.paidAdmissionTransitions;
  const regularQueueTransitions = value.regularQueueTransitions || null;
  const paidAdmissionTransitions = value.paidAdmissionTransitions || null;
  const systemSubmissionCodeProvider =
    typeof value.systemSubmissionCodeProvider === "function"
      ? value.systemSubmissionCodeProvider
      : null;
  const removalTransactionStore = value.removalTransactionStore || null;
  const articleRemovalTransitionPort = value.articleRemovalTransitionPort || null;
  const clock = value.clock || function () { return new Date().toISOString(); };

  function diagnosticId(prefix) {
    return String(prefix || "article-mutation") + "-" + crypto.randomUUID();
  }

  function busyError(cause) {
    return mutationError("ARTICLE_MUTATION_BUSY", "文章正在被其他操作修改，请稍后重试", {
      causeCode: safeErrorCode(cause),
      retryability: "safe",
    });
  }

  function uncertainError(cause) {
    const error = mutationError("ARTICLE_MUTATION_RESULT_UNCERTAIN", "文章操作结果需要人工核对", {
      diagnosticId: diagnosticId("article-mutation"),
      retryability: "manual-check",
      causeCode: safeErrorCode(cause),
    });
    error.diagnosticId = error.safeMetadata.diagnosticId;
    error.retryability = "manual-check";
    return error;
  }

  function mapLockError(error, sideEffect) {
    if (error && error.code === "ARTICLE_MUTATION_RESULT_UNCERTAIN") return error;
    if (sideEffect) return uncertainError(error);
    if (error && ["ARTICLE_STORE_BUSY", "ARTICLE_LOCK_BUSY", "ARTICLE_MUTATION_BUSY"].includes(error.code)) return busyError(error);
    return error;
  }

  function withArticleSet(refs, operation) {
    const ordered = canonicalArticleRefs(refs);
    let session;
    try {
      session = articleStore.openMutationSession(ordered);
    } catch (error) {
      throw mapLockError(error, false);
    }
    let sideEffect = false;
    const markSideEffect = function () { sideEffect = true; };
    let result;
    try {
      result = operation(session, markSideEffect);
    } catch (error) {
      try { session.release(); }
      catch (releaseError) {
        if (sideEffect) throw uncertainError(releaseError);
        throw mapLockError(error, false);
      }
      throw error;
    }
    try {
      session.release();
    } catch (error) {
      throw sideEffect ? uncertainError(error) : busyError(error);
    }
    return result;
  }

  function refFromArticle(article) {
    return articleRefOf(article);
  }

  function factsFrom(port, refs) {
    if (!port || typeof port.listArticleLifecycleFacts !== "function") {
      return { publications: [], submissionItems: [], orders: [], attentionItems: [] };
    }
    return port.listArticleLifecycleFacts({
      articleIds: [...new Set(refs.map(function (ref) { return ref.articleId; }))],
    }) || { publications: [], submissionItems: [], orders: [], attentionItems: [] };
  }

  function factsFor(refs, sourcePort) {
    const allRemovalTransactions = removalTransactionStore && typeof removalTransactionStore.list === "function"
      ? removalTransactionStore.list()
      : [];
    const removalTransactions = allRemovalTransactions.filter(function (transaction) {
      return refs.some(function (ref) { return removalTransactionMatchesArticle(transaction, ref); });
    });
    const facts = factsFrom(sourcePort || lifecycleFacts, refs);
    const operationalRemovalTransactions = Array.isArray(facts.removalTransactions)
      ? facts.removalTransactions
      : [];
    return Object.assign({}, facts, {
      removalTransactions: operationalRemovalTransactions.filter(function (transaction) {
        return refs.some(function (ref) { return removalTransactionMatchesArticle(transaction, ref); });
      }).concat(removalTransactions),
    });
  }

  function regularFactsFor(refs) {
    const facts = factsFrom(regularQueueTransitions, refs);
    const allRemovalTransactions = removalTransactionStore && typeof removalTransactionStore.list === "function"
      ? removalTransactionStore.list()
      : [];
    return Object.assign({}, facts, {
      removalTransactions: allRemovalTransactions.filter(function (transaction) {
        return refs.some(function (ref) { return removalTransactionMatchesArticle(transaction, ref); });
      }),
    });
  }

  function workflowFor(article, refs, extraFacts) {
    const facts = extraFacts || factsFor(refs);
    return deriveArticleLifecycle({
      article,
      publications: facts.publications,
      submissionItems: facts.submissionItems,
      orders: facts.orders,
      attentionItems: facts.attentionItems,
      removalTransactions: facts.removalTransactions || [],
    });
  }

  function assertAllowed(workflow, action) {
    const operation = workflow && workflow.operations && workflow.operations[action];
    if (!operation || operation.allowed !== true) {
      const reasons = operation && Array.isArray(operation.reasonCodes) && operation.reasonCodes.length
        ? operation.reasonCodes
        : ["ARTICLE_OPERATION_FROZEN"];
      const primary = reasons[0];
      throw mutationError(primary, "文章当前不允许执行此操作", Object.assign({
        action,
        reasonCodes: reasons.slice(),
      }, operation && operation.safeMetadata || {}));
    }
    return operation;
  }

  function readArticleForEdit(input) {
    const ref = normalizeArticleRef(input && input.articleRef ? input.articleRef : input);
    return withArticleSet([ref], function (session) {
      const article = session.readArticle(ref);
      return Object.freeze({
        article: snapshotArticle(article),
        editFingerprint: fingerprintArticle(article),
        articleRef: ref,
      });
    });
  }

  function readArticleForRemoval(input) {
    const ref = normalizeArticleRef(input && input.articleRef ? input.articleRef : input);
    return withArticleSet([ref], function (session) {
      return snapshotArticle(session.readArticle(ref));
    });
  }

  function readArticleForPublication(input) {
    const ref = normalizeArticleRef(input && input.articleRef ? input.articleRef : input);
    return withArticleSet([ref], function (session) {
      const article = session.readArticle(ref);
      return Object.freeze({
        articleRef: ref,
        publicationSnapshot: Object.freeze({
          title: article.title,
          body: article.content,
          articleId: article.id,
          fingerprint: fingerprintArticle(article),
        }),
      });
    });
  }

  function createArticle(article) {
    if (typeof articleStore.createArticle !== "function") {
      throw mutationError("ARTICLE_CREATION_PORT_UNAVAILABLE");
    }
    return articleStore.createArticle(article);
  }

  function saveExistingArticle(input) {
    const request = input || {};
    const article = request.article;
    if (!article || typeof article !== "object" || Array.isArray(article)) {
      throw mutationError("CONTENT_INPUT_INVALID", "Article is required");
    }
    if (!validFingerprint(request.expectedFingerprint)) {
      throw mutationError("ARTICLE_EDIT_FINGERPRINT_REQUIRED", "Article edit fingerprint is required");
    }
    const ref = refFromArticle(article);
    return withArticleSet([ref], function (session, markSideEffect) {
      const current = session.readArticle(ref);
      const workflow = workflowFor(current, [ref]);
      assertAllowed(workflow, "edit");
      const currentFingerprint = fingerprintArticle(current);
      if (currentFingerprint !== request.expectedFingerprint) {
        return Object.freeze({
          outcome: "conflict",
          code: "ARTICLE_EDIT_CONFLICT",
          articleId: ref.articleId,
          refreshRequired: true,
        });
      }
      const next = Object.assign({}, current, article, {
        clientId: ref.clientId,
        id: ref.articleId,
        status: "saved",
        updatedAt: nowIso(clock),
      });
      delete next.editFingerprint;
      const saved = session.replaceArticle(ref, next, request.expectedFingerprint);
      markSideEffect();
      return Object.freeze({
        outcome: "saved",
        article: snapshotArticle(saved),
        editFingerprint: fingerprintArticle(saved),
      });
    });
  }

  function resolveTrustedArticleRef(input) {
    if (input && input.articleRef) return normalizeArticleRef(input.articleRef, "ARTICLE_IDENTITY_UNRESOLVED");
    const articleId = input && input.articleId;
    if (typeof articleId !== "string" || !articleId.trim()) {
      throw mutationError("ARTICLE_IDENTITY_UNRESOLVED", "Article identity could not be resolved");
    }
    if (typeof contentStore.findByArticleId !== "function") {
      throw mutationError("ARTICLE_IDENTITY_UNRESOLVED", "Article identity could not be resolved");
    }
    const result = contentStore.findByArticleId(articleId);
    if (!result || result.kind !== "one" || !result.article) {
      throw mutationError(result && result.kind === "many" ? "ARTICLE_IDENTITY_CONFLICT" : "ARTICLE_IDENTITY_UNRESOLVED", "Article identity could not be resolved");
    }
    return refFromArticle(result.article);
  }

  function targetFactsFor(workflow) {
    return workflow && workflow.targetFacts && typeof workflow.targetFacts === "object"
      ? workflow.targetFacts
      : {};
  }

  function reservePublicationTarget(input) {
    if (!publicationTransitions || typeof publicationTransitions.reservePublicationTarget !== "function") {
      throw mutationError("PUBLICATION_RESERVATION_UNAVAILABLE");
    }
    const request = input || {};
    const ref = resolveTrustedArticleRef(request);
    if (!validFingerprint(request.expectedFingerprint)) {
      throw mutationError("ARTICLE_EDIT_FINGERPRINT_REQUIRED", "Article edit fingerprint is required");
    }
    const target = domain.parsePublicationTarget(request.target);
    const action = request.retryFailed === true || request.operation === "retarget" ? "retarget" : "queue";
    return withArticleSet([ref], function (session, markSideEffect) {
      const article = session.readArticle(ref);
      const workflow = workflowFor(article, [ref]);
      assertAllowed(workflow, action);
      const currentFingerprint = fingerprintArticle(article);
      if (currentFingerprint !== request.expectedFingerprint) {
        throw mutationError("ARTICLE_EDIT_CONFLICT", "Article changed before publication was reserved", {
          action,
          articleId: ref.articleId,
          refreshRequired: true,
        });
      }
      const currentTargetKeys = Object.keys(targetFactsFor(workflow));
      if (action === "retarget" && typeof request.expectedCurrentTargetKey !== "string") {
        throw mutationError("ARTICLE_ACTIVE_TARGET_CONFLICT", "Article publication target must be confirmed before retargeting");
      }
      if (request.expectedCurrentTargetKey !== undefined &&
          (typeof request.expectedCurrentTargetKey !== "string" || !currentTargetKeys.includes(request.expectedCurrentTargetKey))) {
        throw mutationError("ARTICLE_ACTIVE_TARGET_CONFLICT", "Article publication target changed");
      }
      const publicationSnapshot = Object.freeze({
        title: article.title,
        body: article.content,
        articleId: article.id,
        fingerprint: currentFingerprint,
      });
      const postProcessingPayload = Object.assign({}, request.postProcessingPayload || {}, {
        articleRef: ref,
        publicationSnapshot: Object.freeze({
          articleId: publicationSnapshot.articleId,
          title: publicationSnapshot.title,
          body: publicationSnapshot.body,
          fingerprint: publicationSnapshot.fingerprint,
        }),
      });
      let reserved;
      try {
        reserved = publicationTransitions.reservePublicationTarget(Object.assign({}, request, {
          articleId: ref.articleId,
          target,
          postProcessingPayload,
        }));
      } catch (error) {
        if (error && ["PUBLICATION_DUPLICATE", "PUBLICATION_TARGET_CONFLICT"].includes(error.code)) {
          throw mutationError("ARTICLE_ACTIVE_TARGET_CONFLICT", "Article already has an active publication target");
        }
        throw error;
      }
      markSideEffect();
      return Object.freeze(Object.assign({}, reserved, {
        articleRef: ref,
        publicationSnapshot,
        postProcessingPayload,
      }));
    });
  }

  function commitPublicationOutcome(input) {
    if (!publicationTransitions || typeof publicationTransitions.commitRemoteOutcome !== "function") {
      throw mutationError("PUBLICATION_OUTCOME_UNAVAILABLE");
    }
    const request = input || {};
    const ref = resolveTrustedArticleRef(request);
    return withArticleSet([ref], function (session, markSideEffect) {
      session.readArticle(ref);
      const committed = publicationTransitions.commitRemoteOutcome(Object.assign({}, request, { articleId: ref.articleId }));
      markSideEffect();
      return committed;
    });
  }

  function markRecoveryUncertain(input) {
    if (!publicationTransitions || typeof publicationTransitions.markRecoveryUncertain !== "function") {
      throw mutationError("PUBLICATION_RECOVERY_UNAVAILABLE");
    }
    const request = input || {};
    const ref = resolveTrustedArticleRef(request);
    return withArticleSet([ref], function (session, markSideEffect) {
      session.readArticle(ref);
      const result = publicationTransitions.markRecoveryUncertain(Object.assign({}, request, { articleId: ref.articleId }));
      markSideEffect();
      return result;
    });
  }

  function regularErrorCode(error) {
    const code = safeErrorCode(error);
    if (["PUBLICATION_DUPLICATE", "PUBLICATION_TARGET_CONFLICT"].includes(code))
      return "ARTICLE_ACTIVE_TARGET_CONFLICT";
    if (code === "PUBLICATION_UNCERTAIN") return "PUBLICATION_UNCERTAIN";
    if (code === "ARTICLE_NOT_FOUND" || code === "REGULAR_QUEUE_ITEM_NOT_FOUND")
      return code;
    return code;
  }

  function regularAdmissionRefs(input) {
    const request = input || {};
    const refs = Array.isArray(request.articleRefs)
      ? request.articleRefs
      : Array.isArray(request.selections)
        ? request.selections.map(function (selection) {
          return selection && selection.articleRef ? selection.articleRef : selection;
        })
        : [];
    if (!refs.length) throw mutationError("REGULAR_QUEUE_ARTICLES_REQUIRED");
    const ordered = canonicalArticleRefs(refs);
    if (new Set(ordered.map(function (ref) { return ref.clientId; })).size > 1)
      throw mutationError("REGULAR_QUEUE_SINGLE_CLIENT_REQUIRED");
    return ordered;
  }

  function paidAdmissionRefs(input) {
    const request = input || {};
    const refs = Array.isArray(request.articleRefs)
      ? request.articleRefs
      : Array.isArray(request.selections)
        ? request.selections.map(function (selection) {
          return selection && selection.articleRef ? selection.articleRef : selection;
        })
        : [];
    if (!refs.length) throw mutationError("PAID_ADMISSION_ARTICLES_REQUIRED");
    return canonicalArticleRefs(refs);
  }

  function paidFingerprintFor(request, ref) {
    const entries = request && request.articleFingerprints;
    if (Array.isArray(entries)) {
      const match = entries.find(function (entry) {
        return entry && entry.articleRef &&
          canonicalArticleRefKey(entry.articleRef) === canonicalArticleRefKey(ref);
      });
      return match && match.fingerprint;
    }
    if (entries && typeof entries === "object" && !Array.isArray(entries)) {
      return entries[canonicalArticleRefKey(ref)] || entries[ref.articleId];
    }
    return undefined;
  }

  function currentSystemSubmissionCode(request) {
    let value = request && request.systemSubmissionCode;
    if (systemSubmissionCodeProvider) {
      const provided = systemSubmissionCodeProvider();
      value = provided && typeof provided === "object"
        ? provided.systemSubmissionCode || provided.thirdPartyId
        : provided;
    }
    return typeof value === "string" ? value.trim() : "";
  }

  function paidAdmissionTarget(input) {
    let target;
    try {
      target = domain.parsePublicationTarget(input && input.target
        ? input.target
        : { kind: "media", mediaResourceId: input && input.mediaResourceId });
    } catch (_) {
      throw mutationError("PAID_ADMISSION_TARGET_INVALID");
    }
    if (target.kind !== "media") throw mutationError("PAID_ADMISSION_MEDIA_REQUIRED");
    return target;
  }

  function regularRemovalSelections(input, ordered) {
    const request = input || {};
    const entries = Array.isArray(request.items)
      ? request.items
      : Array.isArray(request.selections)
        ? request.selections
        : request.item || request.selection
          ? [request.item || request.selection]
          : [];
    if (!entries.length) throw mutationError("REGULAR_QUEUE_ITEMS_REQUIRED");
    const byKey = new Map();
    entries.forEach(function (entry) {
      const value = entry || {};
      const articleRef = normalizeArticleRef(value.articleRef || value);
      const key = canonicalArticleRefKey(articleRef);
      if (!byKey.has(key)) byKey.set(key, Object.freeze({
        articleRef,
        itemId: value.itemId,
        batchId: value.batchId,
        targetKey: value.targetKey,
      }));
    });
    return ordered.map(function (ref) { return byKey.get(canonicalArticleRefKey(ref)); }).filter(Boolean);
  }

  function admitRegularQueueItems(input) {
    if (!regularQueueTransitions || typeof regularQueueTransitions.admitRegularQueueItem !== "function")
      throw mutationError("REGULAR_QUEUE_TRANSITION_UNAVAILABLE");
    const request = input || {};
    if (Object.prototype.hasOwnProperty.call(request, "batchId"))
      throw mutationError("REGULAR_QUEUE_INPUT_INVALID");
    let target;
    try { target = domain.parsePublicationTarget(request.target); }
    catch (_) { throw mutationError("REGULAR_QUEUE_TARGET_INVALID"); }
    if (target.kind !== "platform") throw mutationError("REGULAR_QUEUE_PLATFORM_REQUIRED");
    const ordered = regularAdmissionRefs(request);
    const batchId = `regular-batch-${crypto.randomUUID()}`;
    return withArticleSet(ordered, function (session, markSideEffect) {
      const facts = regularFactsFor(ordered);
      const items = ordered.map(function (ref) {
        let article;
        try { article = session.readArticle(ref); }
        catch (error) {
          if (error && error.code === "ARTICLE_NOT_FOUND")
            return Object.freeze({ articleRef: ref, articleId: ref.articleId, status: "missing", reasonCode: "ARTICLE_NOT_FOUND" });
          throw error;
        }
        try {
          const workflow = workflowFor(article, [ref], facts);
          const targetKey = domain.publicationTargetKey(target);
          const existing = facts.submissionItems.find(function (candidate) {
            return candidate.articleId === ref.articleId &&
              candidate.targetKey === targetKey &&
              candidate.status === "queued" &&
              candidate.queueGroupId;
          });
          const activeTargetKeys = Object.keys(workflow.targetFacts || {});
          if (activeTargetKeys.some(function (activeTargetKey) { return activeTargetKey !== targetKey; }))
            throw mutationError("ARTICLE_ACTIVE_TARGET_CONFLICT", "Article already has another active publication target");
          if (!existing) assertAllowed(workflow, "queue");
          const fingerprint = fingerprintArticle(article);
          const result = regularQueueTransitions.admitRegularQueueItem({
            clientId: ref.clientId,
            articleRef: ref,
            articleId: ref.articleId,
            batchId,
            itemId: `regular-item-${crypto.randomUUID()}`,
            publicationId: `publication-${crypto.randomUUID()}`,
            attemptId: `attempt-${crypto.randomUUID()}`,
            target,
            publicationSnapshot: Object.freeze({
              articleId: ref.articleId,
              title: article.title,
              body: article.content,
              fingerprint,
            }),
            queueConfig: request.queueConfig,
            payload: { clientId: ref.clientId },
          });
          if (!result.idempotent) markSideEffect();
          return Object.freeze(Object.assign({}, result, {
            articleRef: ref,
            status: result.idempotent ? "idempotent" : "queued",
          }));
        } catch (error) {
          const code = regularErrorCode(error);
          if (code === "ARTICLE_MUTATION_RESULT_UNCERTAIN") throw error;
          return Object.freeze({
            articleRef: ref,
            articleId: ref.articleId,
            status: "conflict",
            reasonCode: code,
            reasonCodes: Object.freeze([code]),
          });
        }
      });
      return Object.freeze({
        batchId,
        target,
        items: Object.freeze(items),
        admittedCount: items.filter(function (item) { return item.status === "queued"; }).length,
        idempotentCount: items.filter(function (item) { return item.status === "idempotent"; }).length,
        missingCount: items.filter(function (item) { return item.status === "missing"; }).length,
        conflictCount: items.filter(function (item) { return item.status === "conflict"; }).length,
      });
    });
  }

  function admitPaidBatch(input) {
    if (!paidAdmissionTransitions || typeof paidAdmissionTransitions.admitPaidBatch !== "function")
      throw mutationError("PAID_ADMISSION_TRANSITION_UNAVAILABLE");
    const request = input || {};
    const target = paidAdmissionTarget(request);
    const ordered = paidAdmissionRefs(request);
    const batchId = request.batchId || `paid-batch-${crypto.randomUUID()}`;
    const confirmationFingerprint = request.confirmationFingerprint;
    if (typeof confirmationFingerprint !== "string" || !confirmationFingerprint.trim())
      throw mutationError("PAID_ADMISSION_CONFIRMATION_FINGERPRINT_REQUIRED");
    const resourceSnapshot = request.resourceSnapshot || {};
    if (
      resourceSnapshot.resourceId !== target.mediaResourceId ||
      resourceSnapshot.available !== true ||
      typeof resourceSnapshot.fingerprint !== "string" ||
      !resourceSnapshot.fingerprint.trim() ||
      typeof resourceSnapshot.price !== "number" ||
      !Number.isFinite(resourceSnapshot.price) ||
      resourceSnapshot.price < 0
    )
      throw mutationError("PAID_MEDIA_CONFIRMATION_STALE");
    if (
      typeof request.quotedPrice !== "number" ||
      !Number.isFinite(request.quotedPrice) ||
      request.quotedPrice !== resourceSnapshot.price ||
      typeof request.estimatedTotal !== "number" ||
      !Number.isFinite(request.estimatedTotal) ||
      request.estimatedTotal < 0
    )
      throw mutationError("PAID_MEDIA_CONFIRMATION_STALE");
    if (!request.confirmation || typeof request.confirmation !== "object" || Array.isArray(request.confirmation))
      throw mutationError("PAID_ADMISSION_CONFIRMATION_INVALID");

    return withArticleSet(ordered, function (session, markSideEffect) {
      const systemSubmissionCode = currentSystemSubmissionCode(request);
      if (!systemSubmissionCode || systemSubmissionCode !== String(request.systemSubmissionCode || "").trim())
        throw mutationError("PAID_MEDIA_SYSTEM_SUBMISSION_CODE_CHANGED");
      if (request.confirmation.systemSubmissionCode !== undefined &&
          request.confirmation.systemSubmissionCode !== systemSubmissionCode)
        throw mutationError("PAID_MEDIA_CONFIRMATION_STALE");
      const facts = factsFor(ordered, paidAdmissionTransitions);
      const items = ordered.map(function (ref) {
        const article = session.readArticle(ref);
        const workflow = workflowFor(article, [ref], facts);
        assertAllowed(workflow, "queue");
        const fingerprint = fingerprintArticle(article);
        const expectedFingerprint = paidFingerprintFor(request, ref);
        if (typeof expectedFingerprint !== "string" || expectedFingerprint !== fingerprint)
          throw mutationError("PAID_MEDIA_CONFIRMATION_STALE", "Article changed after paid-media preflight", {
            articleId: ref.articleId,
            refreshRequired: true,
          });
        const title = typeof article.title === "string" ? article.title : "";
        const body = typeof article.content === "string" ? article.content : "";
        if (Array.from(title.trim()).length > 30)
          throw mutationError("PAID_MEDIA_TITLE_TOO_LONG");
        if (!title.trim() || !body.trim())
          throw mutationError("PAID_MEDIA_ARTICLE_CONTENT_REQUIRED");
        return Object.freeze({
          clientId: ref.clientId,
          articleRef: ref,
          articleId: ref.articleId,
          itemId: `paid-item-${crypto.randomUUID()}`,
          publicationId: `paid-publication-${crypto.randomUUID()}`,
          attemptId: `paid-attempt-${crypto.randomUUID()}`,
          target,
          publicationSnapshot: Object.freeze({
            articleId: ref.articleId,
            title: title.trim(),
            body,
            fingerprint,
          }),
          resourceNameSnapshot: typeof resourceSnapshot.name === "string" ? resourceSnapshot.name : "",
          payload: {
            sourcePlatformId: "media",
            filename: typeof request.confirmation.filename === "string" ? request.confirmation.filename : undefined,
          },
        });
      });
      const result = paidAdmissionTransitions.admitPaidBatch({
        batchId,
        target,
        mediaResourceId: target.mediaResourceId,
        confirmationFingerprint: confirmationFingerprint.trim(),
        confirmation: request.confirmation,
        systemSubmissionCode,
        quotedPrice: request.quotedPrice,
        estimatedTotal: request.estimatedTotal,
        articleCount: items.length,
        items,
      });
      if (!result || typeof result !== "object")
        throw mutationError("PAID_ADMISSION_FAILED");
      if (result.idempotent !== true) markSideEffect();
      const resultItems = Array.isArray(result.items)
        ? result.items.map(function (item) {
          const ref = ordered.find(function (candidate) { return candidate.articleId === item.articleId; });
          return Object.freeze(Object.assign({}, item, ref ? { articleRef: ref } : {}));
        })
        : [];
      return Object.freeze(Object.assign({}, result, {
        target,
        articleRefs: Object.freeze(ordered),
        confirmationFingerprint: confirmationFingerprint.trim(),
        items: Object.freeze(resultItems),
      }));
    });
  }

  function removePendingQueueItems(input) {
    if (!regularQueueTransitions || typeof regularQueueTransitions.removePendingQueueItem !== "function")
      throw mutationError("REGULAR_QUEUE_TRANSITION_UNAVAILABLE");
    const request = input || {};
    const rawEntries = Array.isArray(request.items)
      ? request.items
      : Array.isArray(request.selections)
        ? request.selections
        : request.item || request.selection
          ? [request.item || request.selection]
          : [];
    if (!rawEntries.length) throw mutationError("REGULAR_QUEUE_ITEMS_REQUIRED");
    const refs = canonicalArticleRefs(rawEntries.map(function (entry) {
      return entry && entry.articleRef ? entry.articleRef : entry;
    }));
    const selections = regularRemovalSelections(request, refs);
    return withArticleSet(refs, function (session, markSideEffect) {
      const facts = regularFactsFor(refs);
      const items = selections.map(function (selection) {
        const ref = selection.articleRef;
        let article;
        try { article = session.readArticle(ref); }
        catch (error) {
          if (error && error.code === "ARTICLE_NOT_FOUND")
            return Object.freeze({ articleRef: ref, articleId: ref.articleId, status: "conflict", reasonCode: "ARTICLE_NOT_FOUND" });
          throw error;
        }
        const fact = facts.submissionItems.find(function (candidate) {
          return candidate.articleId === ref.articleId &&
            (selection.itemId ? candidate.itemId === selection.itemId : candidate.status === "queued") &&
            candidate.batchId === selection.batchId &&
            (!selection.targetKey || candidate.targetKey === selection.targetKey);
        });
        if (!fact || !fact.itemId || !fact.batchId)
          return Object.freeze({ articleRef: ref, articleId: ref.articleId, status: "conflict", reasonCode: "REGULAR_QUEUE_ITEM_NOT_FOUND" });
        if (fact.status === "cancelled") {
          try {
            const result = regularQueueTransitions.removePendingQueueItem({
              articleRef: ref,
              clientId: ref.clientId,
              articleId: ref.articleId,
              itemId: fact.itemId,
              batchId: fact.batchId,
              targetKey: fact.targetKey,
              operationId: request.operationId,
            });
            if (result.idempotent) return Object.freeze(Object.assign({}, result, { articleRef: ref }));
          } catch (error) {
            const code = regularErrorCode(error);
            if (code === "ARTICLE_MUTATION_RESULT_UNCERTAIN") throw error;
            return Object.freeze({ articleRef: ref, articleId: ref.articleId, itemId: fact.itemId, batchId: fact.batchId, status: "conflict", reasonCode: code });
          }
        }
        if (fact.status !== "queued")
          return Object.freeze({ articleRef: ref, articleId: ref.articleId, itemId: fact.itemId, batchId: fact.batchId, status: "conflict", reasonCode: "REGULAR_QUEUE_ITEM_NOT_REMOVABLE" });
        try {
          const workflow = workflowFor(article, [ref], facts);
          if (workflow.operations.edit.allowed === true && workflow.operations.queue.allowed === true)
            return Object.freeze({ articleRef: ref, articleId: ref.articleId, itemId: fact.itemId, batchId: fact.batchId, status: "conflict", reasonCode: "REGULAR_QUEUE_ITEM_NOT_FOUND" });
          const result = regularQueueTransitions.removePendingQueueItem({
            articleRef: ref,
            clientId: ref.clientId,
            articleId: ref.articleId,
            itemId: fact.itemId,
            batchId: fact.batchId,
            targetKey: fact.targetKey,
            operationId: request.operationId,
          });
          if (!result.idempotent) markSideEffect();
          return Object.freeze(Object.assign({}, result, { articleRef: ref }));
        } catch (error) {
          const code = regularErrorCode(error);
          if (code === "ARTICLE_MUTATION_RESULT_UNCERTAIN") throw error;
          return Object.freeze({ articleRef: ref, articleId: ref.articleId, itemId: fact.itemId, batchId: fact.batchId, status: "conflict", reasonCode: code });
        }
      });
      return Object.freeze({
        items: Object.freeze(items),
        removedCount: items.filter(function (item) { return item.status === "cancelled" && item.idempotent !== true; }).length,
        idempotentCount: items.filter(function (item) { return item.idempotent === true; }).length,
        conflictCount: items.filter(function (item) { return item.status === "conflict"; }).length,
      });
    });
  }

  function executeArticleRemovalTransaction(input) {
    const request = input || {};
    const selections = request.selections || (request.selection ? [request.selection] : []);
    const ordered = canonicalArticleRefs(selections);
    if (request.transaction && articleRemovalTransitionPort && typeof articleRemovalTransitionPort.execute === "function") {
      return withArticleSet(ordered, function (session, markSideEffect) {
        const articles = ordered.map(function (ref) {
          try { return session.readArticle(ref); }
          catch (error) {
            if (error && error.code === "ARTICLE_NOT_FOUND") return null;
            throw error;
          }
        });
        const facts = factsFor(ordered);
        articles.forEach(function (article, index) {
          if (!article) {
            const ref = ordered[index];
            if (session.isArticleTrashed(ref)) return;
            throw mutationError("ARTICLE_NOT_FOUND", "Article was not found");
          }
          assertAllowed(workflowFor(article, [ordered[index]], facts), "trash");
        });
        const mutationPort = Object.freeze({
          refs: Object.freeze(ordered.slice()),
          readArticle: function (ref) { return session.readArticle(ref); },
          isArticleTrashed: function (ref) { return session.isArticleTrashed(ref); },
          getTrashedTombstone: function (ref) { return session.getTrashedTombstone(ref); },
          moveArticleToTrash: function (ref, tombstone, operationId, expectedFingerprint) {
            markSideEffect();
            return session.moveArticleToTrash(ref, tombstone, operationId, expectedFingerprint);
          },
          markSideEffect: markSideEffect,
        });
        return articleRemovalTransitionPort.execute({
          transaction: request.transaction,
          requireRevalidation: request.requireRevalidation === true,
          articles: Object.freeze(articles),
          facts,
          mutation: mutationPort,
        });
      });
    }
    const selected = normalizeArticleRef(request.selection || selections[0]);
    return withArticleSet(ordered, function (session, markSideEffect) {
      const articles = ordered.map(function (ref) {
        try { return session.readArticle(ref); }
        catch (error) {
          if (error && error.code === "ARTICLE_NOT_FOUND") return null;
          throw error;
        }
      });
      const current = articles.find(function (article) {
        return article && article.clientId === selected.clientId && article.id === selected.articleId;
      });
      if (!current) {
        if (typeof session.isArticleTrashed === "function" && session.isArticleTrashed(selected)) {
          return Object.freeze({ idempotent: true, articleRef: selected });
        }
        throw mutationError("ARTICLE_NOT_FOUND", "Article was not found");
      }
      const facts = factsFor(ordered);
      articles.forEach(function (article, index) {
        if (!article) {
          const ref = ordered[index];
          if (typeof session.isArticleTrashed === "function" && session.isArticleTrashed(ref)) return;
          throw mutationError("ARTICLE_NOT_FOUND", "Article was not found");
        }
        assertAllowed(workflowFor(article, [ordered[index]], facts), "trash");
      });
      const workflow = workflowFor(current, [selected], facts);
      assertAllowed(workflow, "trash");
      const moved = session.moveArticleToTrash(
        selected,
        request.tombstone,
        request.operationId,
        request.expectedFingerprint,
      );
      markSideEffect();
      return Object.freeze({
        articleRef: selected,
        tombstone: moved,
      });
    });
  }

  function assertTrashedMutationAllowed(ref, session, operation, tombstone) {
    const currentTombstone = tombstone || session.getTrashedTombstone(ref);
    const facts = factsFor([ref]);
    const workflow = workflowFor({
      id: ref.articleId,
      clientId: ref.clientId,
      title: currentTombstone.titleSnapshot || "trashed article",
      content: "trashed article",
      status: "trashed",
    }, [ref], facts);
    const reason = trashedArticleMutationBlockReason(workflow, facts.removalTransactions);
    if (reason) {
      throw mutationError(reason, operation === "restore"
        ? "文章存在未结束的发布事实，不能恢复"
        : "文章存在未结束的发布事实，不能永久删除", {
        action: operation,
        articleId: ref.articleId,
      });
    }
    return currentTombstone;
  }

  function assertTrashedArticleMutationAllowed(input) {
    const request = input || {};
    const ref = normalizeArticleRef(request.articleRef || request);
    return withArticleSet([ref], function (session) {
      const tombstone = assertTrashedMutationAllowed(ref, session, request.operation || "restore");
      return Object.freeze({ articleRef: ref, tombstone: snapshotArticle(tombstone) });
    });
  }

  function restoreTrashedArticle(input) {
    const ref = normalizeArticleRef(input && input.articleRef ? input.articleRef : input);
    return withArticleSet([ref], function (session, markSideEffect) {
      const tombstone = assertTrashedMutationAllowed(ref, session, "restore");
      markSideEffect();
      const article = session.restoreTrashedArticle(ref);
      assertTrashedMutationAllowed(ref, session, "restore", tombstone);
      return Object.freeze({
        article: snapshotArticle(article),
        tombstone: snapshotArticle(tombstone),
        articleRef: ref,
      });
    });
  }

  function permanentlyDeleteTrashedArticle(input) {
    const request = input || {};
    const ref = normalizeArticleRef(request.articleRef || request);
    return withArticleSet([ref], function (session, markSideEffect) {
      const tombstone = assertTrashedMutationAllowed(ref, session, "permanent-delete");
      markSideEffect();
      const terminal = session.permanentlyDeleteTrashedArticle(ref, request.purgedAt);
      assertTrashedMutationAllowed(ref, session, "permanent-delete", terminal);
      return Object.freeze({
        tombstone: snapshotArticle(terminal),
        articleRef: ref,
      });
    });
  }

  return Object.freeze({
    canonicalArticleRefKey,
    readArticleForEdit,
    readArticleForRemoval,
    readArticleForPublication,
    createArticle,
    saveExistingArticle,
    resolveTrustedArticleRef,
    reservePublicationTarget,
    commitPublicationOutcome,
    markRecoveryUncertain,
    admitRegularQueueItems,
    admitPaidBatch,
    removePendingQueueItems,
    executeArticleRemovalTransaction,
    assertTrashedArticleMutationAllowed,
    restoreTrashedArticle,
    permanentlyDeleteTrashedArticle,
    supportsArticleRemovalTransaction: function () {
      return Boolean(articleRemovalTransitionPort && typeof articleRemovalTransitionPort.execute === "function");
    },
  });
}

module.exports = {
  createArticleMutationCoordinator,
  canonicalArticleRefKey,
  normalizeArticleRef,
};
