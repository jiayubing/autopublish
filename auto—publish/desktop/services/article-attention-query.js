const crypto = require("node:crypto");
const {
  deriveAttentionPolicy,
  MESSAGES,
  ATTENTION_KINDS,
} = require("./article-attention-policy");
const {
  evaluateArticleSubmissionEligibility,
} = require("../../src/content/article-submission-eligibility");
const { reportDiagnostic } = require("../../src/diagnostics/diagnostic-producer");

function stableId(kind, value) {
  const source = value || {};
  const identityParts = {
    [ATTENTION_KINDS.REGULAR_PLATFORM_FAILED]: [
      source.publicationId,
      source.attemptId,
    ],
    [ATTENTION_KINDS.REGULAR_PLATFORM_UNCERTAIN]: [
      source.publicationId,
      source.attemptId,
    ],
    [ATTENTION_KINDS.PAID_ORDER_CREATION_UNCERTAIN]: [
      source.orderCreationAttemptId,
    ],
    [ATTENTION_KINDS.ORDER_STATUS_ANOMALY]: [
      source.orderId || source.orderNid,
    ],
    [ATTENTION_KINDS.REMOVAL_NEEDS_REPAIR]: [
      source.transactionId || source.id,
    ],
    [ATTENTION_KINDS.PUBLISHED_ARCHIVE_FAILED]: source.jobId
      ? [source.jobId]
      : [source.publicationId, source.attemptId, source.filename],
  }[kind];
  if (!identityParts || identityParts.some((part) => !safeText(part, 512)))
    return null;
  const identity = [kind, ...identityParts.map((part) => safeText(part, 512))].join(
    "\u0000",
  );
  return `${kind}:${crypto.createHash("sha256").update(identity, "utf8").digest("hex").slice(0, 24)}`;
}

function safeText(value, maxLength) {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().slice(0, maxLength || 200);
}

function diagnosticErrorCode(error, fallback) {
  return error && typeof error.code === "string" && /^[A-Z][A-Z0-9_]{1,127}$/.test(error.code)
    ? error.code
    : fallback;
}

function normalizeRevision(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : fallback;
}

function createArticleAttentionQuery(options) {
  const opts = options || {};
  const readers = opts.readers || {};
  const hasAuthoritativeRevision = typeof opts.getRevision === "function";
  let fallbackRevision = 1;
  const cachedSnapshots = new Map();
  let cachedRevision = null;

  function reader(name, fallback) {
    return typeof readers[name] === "function" ? readers[name] : fallback;
  }

  function readTransactions() {
    const value = reader("listTransactions", function () {
      if (
        opts.articleRemovalService &&
        typeof opts.articleRemovalService.listArticleRemovalTransactions ===
          "function"
      ) {
        return opts.articleRemovalService.listArticleRemovalTransactions();
      }
      return [];
    })();
    return Array.isArray(value) ? value : [];
  }

  function readOperationalPublications() {
    if (
      opts.operationalStore &&
      typeof opts.operationalStore.listPublicationAttention === "function"
    )
      return opts.operationalStore.listPublicationAttention();
    return [];
  }

  function readOperationalPostProcessing() {
    if (
      opts.operationalStore &&
      typeof opts.operationalStore.listPostProcessingAttention === "function"
    )
      return opts.operationalStore.listPostProcessingAttention();
    return [];
  }

  function readArchiveFailures() {
    const value = reader("listArchiveFailures", function () {
      if (
        opts.submissionMaintenance &&
        typeof opts.submissionMaintenance.listArchiveFailures === "function"
      )
        return opts.submissionMaintenance.listArchiveFailures();
      return [];
    })();
    return Array.isArray(value) ? value : [];
  }

  function readOrderAttention() {
    try {
      let value = null;
      const explicitReader = reader("listOrderAttention", null);
      if (explicitReader) value = explicitReader();
      if (!value && opts.orderReconciliationPort) {
        const port = opts.orderReconciliationPort;
        if (typeof port.listOrders === "function") value = port.listOrders();
        else if (typeof port.listOrderViews === "function")
          value = port.listOrderViews();
      }
      if (value && !Array.isArray(value) && Array.isArray(value.items))
        value = value.items;
      return Array.isArray(value) ? value : [];
    } catch (error) {
      reportDiagnostic({
        code: "ARTICLE_ATTENTION_ORDER_READ_FAILED",
        module: "article-attention-query",
        category: "storage",
        operationId: "article-attention-order-read",
        metadata: {
          operation: "order-attention-read",
          phase: "read",
          outcome: "fail-closed",
          errorCode: diagnosticErrorCode(error, "ORDER_ATTENTION_READ_FAILED"),
        },
      });
      return [];
    }
  }

  function articleLookup(item) {
    const value = item || {};
    const getArticle = reader("getArticle", null);
    if (getArticle && value.clientId && value.articleId) {
      try {
        const article = getArticle(value.clientId, value.articleId);
        if (article && typeof article === "object")
          return {
            exists: true,
            status: article.status || null,
            title: article.title || null,
            submissionEligible:
              evaluateArticleSubmissionEligibility(article).eligible,
            lookupStatus: "available",
          };
      } catch (error) {
        if (!error || error.code !== "ARTICLE_NOT_FOUND") {
          reportDiagnostic({
            code: "ARTICLE_ATTENTION_LOOKUP_FAILED",
            module: "article-attention-query",
            category: "storage",
            operationId: "article-attention-article-read",
            metadata: {
              operation: "article-read",
              phase: "read",
              outcome: "unavailable",
              errorCode: diagnosticErrorCode(error, "ARTICLE_READ_FAILED")
            }
          });
          return {
            exists: null,
            status: value.articleStatus || null,
            title: null,
            lookupStatus: "unavailable",
          };
        }
      }
    }
    const getTrashedArticle = reader("getTrashedArticle", null);
    if (getTrashedArticle && value.clientId && value.articleId) {
      try {
        const trashed = getTrashedArticle(value.clientId, value.articleId);
        const tombstone =
          trashed && trashed.tombstone ? trashed.tombstone : trashed;
        if (tombstone && typeof tombstone === "object") {
          return {
            exists: false,
            removed: true,
            status: "removed",
            title:
              (tombstone.titleSnapshot || tombstone.title) || null,
            lookupStatus: "available",
          };
        }
      } catch (error) {
        if (!error || error.code !== "ARTICLE_NOT_FOUND") {
          reportDiagnostic({
            code: "ARTICLE_ATTENTION_LOOKUP_FAILED",
            module: "article-attention-query",
            category: "storage",
            operationId: "article-attention-trash-read",
            metadata: {
              operation: "trashed-article-read",
              phase: "read",
              outcome: "unavailable",
              errorCode: diagnosticErrorCode(error, "ARTICLE_TRASH_READ_FAILED")
            }
          });
          return {
            exists: null,
            status: value.articleStatus || null,
            title: null,
            lookupStatus: "unavailable",
          };
        }
      }
    }
    const getTrashedTombstone = reader("getTrashedTombstone", null);
    if (getTrashedTombstone && value.clientId && value.articleId) {
      try {
        const tombstone = getTrashedTombstone(value.clientId, value.articleId);
        if (tombstone && typeof tombstone === "object") {
          return {
            exists: false,
            removed: true,
            status: "removed",
            title: (tombstone.titleSnapshot || tombstone.title) || null,
            lookupStatus: "available",
          };
        }
      } catch (error) {
        if (!error || error.code !== "ARTICLE_NOT_FOUND") {
          reportDiagnostic({
            code: "ARTICLE_ATTENTION_LOOKUP_FAILED",
            module: "article-attention-query",
            category: "storage",
            operationId: "article-attention-tombstone-read",
            metadata: {
              operation: "trashed-tombstone-read",
              phase: "read",
              outcome: "unavailable",
              errorCode: diagnosticErrorCode(error, "ARTICLE_TOMBSTONE_READ_FAILED")
            }
          });
          return {
            exists: null,
            status: value.articleStatus || null,
            title: null,
            lookupStatus: "unavailable",
          };
        }
      }
    }
    return {
      exists: getArticle && value.clientId && value.articleId ? false : value.articleExists === true,
      status: value.articleStatus || null,
      title: null,
      lookupStatus: getArticle && value.clientId && value.articleId ? "not_found" : "available",
    };
  }

  function batchArticleLookup(clientId) {
    const listArticles = reader("listArticles", null);
    const listTrashedArticles = reader("listTrashedArticles", null);
    if (!clientId || (!listArticles && !listTrashedArticles)) return null;
    const active = new Map();
    const trashed = new Map();
    let unavailable = false;

    function readBatch(source, target, operation, fallbackCode) {
      if (!source) return;
      try {
        const items = source(clientId);
        if (!Array.isArray(items)) throw Object.assign(new Error("Invalid article batch"), { code: fallbackCode });
        items.forEach(function (item) {
          if (!item || typeof item !== "object") return;
          const value = item.tombstone && typeof item.tombstone === "object"
            ? item.tombstone
            : item;
          const articleId = safeText(value.articleId || value.id, 200);
          if (articleId) target.set(articleId, value);
        });
      } catch (error) {
        unavailable = true;
        reportDiagnostic({
          code: "ARTICLE_ATTENTION_LOOKUP_FAILED",
          module: "article-attention-query",
          category: "storage",
          operationId: `article-attention-${operation}`,
          metadata: {
            operation,
            phase: "read",
            outcome: "unavailable",
            errorCode: diagnosticErrorCode(error, fallbackCode),
          },
        });
      }
    }

    readBatch(listArticles, active, "article-batch-read", "ARTICLE_BATCH_READ_FAILED");
    readBatch(
      listTrashedArticles,
      trashed,
      "trashed-article-batch-read",
      "ARTICLE_TRASH_BATCH_READ_FAILED",
    );

    return function resolve(item) {
      const value = item || {};
      const articleId = safeText(value.articleId, 200);
      if (unavailable)
        return {
          exists: null,
          status: value.articleStatus || null,
          title: null,
          lookupStatus: "unavailable",
        };
      if (articleId && active.has(articleId)) {
        const article = active.get(articleId);
        return {
          exists: true,
          status: article.status || null,
          title: article.title || null,
          submissionEligible: evaluateArticleSubmissionEligibility(article).eligible,
          lookupStatus: "available",
        };
      }
      if (articleId && trashed.has(articleId)) {
        const tombstone = trashed.get(articleId);
        return {
          exists: false,
          removed: true,
          status: "removed",
          title: tombstone.titleSnapshot || tombstone.title || null,
          lookupStatus: "available",
        };
      }
      return {
        exists: false,
        status: value.articleStatus || null,
        title: null,
        lookupStatus: "not_found",
      };
    };
  }

  function titleFor(item, articleState) {
    const snapshot = safeText(item && (item.titleSnapshot || item.title), 200);
    return snapshot || safeText(articleState && articleState.title, 200);
  }

  function domainCapabilities(kind) {
    const removal = opts.articleRemovalService;
    const archive =
      opts.archiveActionPort || opts.archiveService || opts.postProcessingPort;
    const regular = opts.regularPlatformOutcomeService;
    const paid = opts.paidOrderCreationResolutionService;
    const order = opts.orderReconciliationPort;
    return Object.assign(
      {
        canRetryRemoval: !!(
          removal &&
          typeof removal.retryArticleRemovalTransaction === "function"
        ),
        canRetryArchive: !!(
          archive &&
          (typeof archive.retryArchive === "function" ||
            typeof archive.retry === "function")
        ),
        canResolveRegularUncertain: !!(
          regular &&
          typeof regular.prepareRegularUncertainResolution === "function" &&
          typeof regular.confirmRegularAccepted === "function" &&
          typeof regular.confirmRegularNotAccepted === "function"
        ),
        canResolvePaidOrderCreation: !!(
          paid &&
          typeof paid.prepareBindOrderNumber === "function" &&
          typeof paid.bindOrderNumber === "function" &&
          typeof paid.prepareConfirmNoOrder === "function" &&
          typeof paid.confirmNoOrder === "function"
        ),
        canResolveOrderStatusAnomaly: !!(
          order &&
          typeof order.prepareOrderStatusAnomalyResolution === "function" &&
          typeof order.resumeOrderTracking === "function" &&
          typeof order.confirmOrderPublished === "function" &&
          typeof order.confirmOrderNotPublished === "function"
        ),
        canOpenSubmission: true,
        canOpenPublication: true,
        canInspect: true,
        canOpenArticle: true,
      },
      (opts.capabilities && opts.capabilities[kind]) || {},
    );
  }

  function makeEntry(kind, item, facts, resolveArticle) {
    const value = item || {};
    const articleState =
      facts.articleState ||
      (resolveArticle ? resolveArticle(value) : articleLookup(value));
    const normalizedFacts = Object.assign({}, facts, {
      kind,
      articleStatus: facts.articleStatus || articleState.status || null,
      articleExists:
        facts.articleExists !== undefined
          ? facts.articleExists
          : articleState.exists,
      articleSubmissionEligible:
        facts.articleSubmissionEligible !== undefined
          ? facts.articleSubmissionEligible
          : articleState.submissionEligible,
      articleLookupStatus: facts.articleLookupStatus || articleState.lookupStatus || "available",
      resolutionPriority:
        facts.resolutionPriority !== undefined
          ? facts.resolutionPriority
          : value.resolutionPriority,
      articleState,
    });
    const policy = deriveAttentionPolicy(
      normalizedFacts,
      domainCapabilities(kind),
    );
    const attentionId = stableId(kind, value);
    if (!attentionId) {
      reportDiagnostic({
        code: "ARTICLE_ATTENTION_IDENTITY_UNAVAILABLE",
        module: "article-attention-query",
        category: "storage",
        operationId: "article-attention-identity",
        metadata: {
          operation: "attention-identity",
          phase: "project",
          outcome: "drop",
          attentionKind: kind,
        },
      });
    }
    const safeFacts = {
      articleId: safeText(value.articleId, 200),
      clientId: safeText(value.clientId, 100),
      platformId: safeText(value.platformId || value.targetPlatformId, 100),
      targetKey: safeText(value.targetKey, 512),
      publicationId: safeText(value.publicationId, 160),
      attemptId: safeText(value.attemptId, 160),
      orderCreationAttemptId: safeText(value.orderCreationAttemptId, 160),
      orderId: safeText(value.orderId || value.orderNid, 160),
      transactionId: safeText(value.transactionId || value.id, 160),
      jobId: safeText(value.jobId, 160),
      status: safeText(value.status || value.statusCode, 80),
      reasonCode: safeText(value.reasonCode || value.errorCode, 128),
      updatedAt: safeText(value.updatedAt || value.observedAt, 64),
      articleStatus: safeText(normalizedFacts.articleStatus, 80),
    };
    const copy = {
      kind,
      attentionId,
      owner: policy.owner,
      freeze: policy.freeze,
      resolutionPriority: policy.resolutionPriority,
      safeFacts,
      articleId: safeText(value.articleId, 200),
      titleSnapshot: titleFor(value, articleState),
      clientId: safeText(value.clientId, 100),
      platformId: safeText(value.platformId || value.targetPlatformId, 100),
      accountProfileId: safeText(value.accountProfileId, 160),
      displayName: safeText(value.displayName || value.platformName, 100),
      batchId: safeText(value.batchId, 160),
      publicationId: safeText(value.publicationId, 160),
      attemptId: safeText(value.attemptId, 160),
      orderCreationAttemptId: safeText(value.orderCreationAttemptId, 160),
      targetKey: safeText(value.targetKey, 512),
      jobId: safeText(value.jobId, 160),
      transactionId: safeText(value.transactionId || value.id, 160),
      status: safeText(value.status, 80),
      reasonCode: safeText(value.reasonCode || value.errorCode, 128),
      orderId: safeText(value.orderId || value.orderNid, 160),
      remoteId: safeText(value.remoteId, 512),
      remoteUrl: safeText(value.remoteUrl, 2048),
      pairState: safeText(value.pairState, 64),
      updatedAt: safeText(value.updatedAt, 64),
      message: policy.message || MESSAGES[kind] || "需处理项需要进一步核对",
      recommendedAction: policy.recommendedAction,
      allowedActions: policy.allowedActions.slice(),
    };
    return {
      item: copy,
      policy: attentionId
        ? policy
        : Object.assign({}, policy, {
            included: false,
            exclusionReason: "identity_unavailable",
          }),
      facts: normalizedFacts,
    };
  }

  function inClientScope(item, clientId) {
    return !clientId || (item && item.clientId === clientId);
  }

  function transactionEntries(clientId, resolveArticle) {
    return readTransactions()
      .filter(function (item) {
        return (
          item &&
          inClientScope(item, clientId) &&
          (item.status === "needs_repair" || item.phase === "needs_repair")
        );
      })
      .map(function (item) {
        return makeEntry(
          ATTENTION_KINDS.REMOVAL_NEEDS_REPAIR,
          item,
          {
            hasRemovalTransaction: true,
            canRetryRemoval: true,
            freezeArticle: true,
            freezeReasonCode: "REMOVAL_NEEDS_REPAIR",
          },
          resolveArticle,
        );
      });
  }

  function publicationEntries(clientId, resolveArticle) {
    return readOperationalPublications()
      .filter(function (item) {
        return item && inClientScope(item, clientId) && ["uncertain", "failed"].includes(item.status);
      })
      .map(function (item) {
        const latest =
          Array.isArray(item.attempts) && item.attempts.length
            ? item.attempts[item.attempts.length - 1]
            : null;
        const articleState = resolveArticle
          ? resolveArticle(item)
          : articleLookup(item);
        const paidOrderCreation = Boolean(item.orderCreationAttemptId);
        const kind =
          item.status === "uncertain"
            ? paidOrderCreation
              ? ATTENTION_KINDS.PAID_ORDER_CREATION_UNCERTAIN
              : ATTENTION_KINDS.REGULAR_PLATFORM_UNCERTAIN
            : ATTENTION_KINDS.REGULAR_PLATFORM_FAILED;
        return makeEntry(
          kind,
          Object.assign({}, item, {
            platformId: item.platformId,
            targetPlatformId: item.platformId,
            attemptId: item.attemptId || (latest && latest.attemptId),
            reasonCode:
              item.reasonCode ||
              (latest && (latest.reasonCode || latest.errorCode)),
            updatedAt: item.updatedAt || (latest && latest.updatedAt),
          }),
          {
            articleState: articleState,
            articleExists: articleState.exists,
            articleStatus: articleState.status,
            hasQueueBinding: false,
            hasResidue: false,
            hasRemovalTransaction: false,
            freezeArticle: item.status === "uncertain",
            freezeReasonCode:
              item.status === "uncertain"
                ? paidOrderCreation
                  ? "PAID_ORDER_CREATION_UNCERTAIN"
                  : "REGULAR_PLATFORM_UNCERTAIN"
                : null,
            hasPublishedEvidence: Boolean(item.remoteId && item.remoteUrl),
          },
          resolveArticle,
        );
      });
  }

  function orderEntries(clientId, resolveArticle) {
    return readOrderAttention()
      .filter(function (item) {
        return item && inClientScope(item, clientId) && item.anomaly && (item.orderNid || item.orderId);
      })
      .map(function (item) {
        const anomaly = item.anomaly || {};
        return makeEntry(
          ATTENTION_KINDS.ORDER_STATUS_ANOMALY,
          Object.assign({}, item, {
            orderId: item.orderId || item.orderNid,
            reasonCode: anomaly.reason || item.reasonCode,
            updatedAt:
              anomaly.openedAt || item.updatedAt || item.observedAt,
            status: item.statusCode || item.status,
          }),
          {
            articleExists: item.articleExists,
            articleStatus: item.articleStatus,
            freezeArticle: true,
            freezeReasonCode: "ORDER_STATUS_ANOMALY",
          },
          resolveArticle,
        );
      });
  }

  function archiveEntries(clientId, resolveArticle) {
    const operational = readOperationalPostProcessing().filter(function (item) {
      return inClientScope(item, clientId);
    }).map(function (item) {
      return makeEntry(
        ATTENTION_KINDS.PUBLISHED_ARCHIVE_FAILED,
        Object.assign({}, item, {
          platformId: item.payload && item.payload.sourcePlatformId,
          filename: item.payload && item.payload.filename,
          batchId: item.payload && item.payload.batchId,
        }),
        {
          hasQueueBinding: !!(item.jobId && item.attemptId),
          canRetryArchive: true,
        },
        resolveArticle,
      );
    });
    return operational.concat(
      readArchiveFailures().filter(function (item) {
        return inClientScope(item, clientId);
      }).map(function (item) {
        return makeEntry(ATTENTION_KINDS.PUBLISHED_ARCHIVE_FAILED, item, {
          hasQueueBinding: !!(
            item.batchId &&
            item.publicationId &&
            item.attemptId &&
            item.targetPlatformId
          ),
          canRetryArchive: true,
        }, resolveArticle);
      }),
    );
  }

  function entries(clientId) {
    const resolveArticle = batchArticleLookup(clientId);
    const transactions = transactionEntries(clientId, resolveArticle);
    const all = transactions.concat(
      publicationEntries(clientId, resolveArticle),
      orderEntries(clientId, resolveArticle),
      archiveEntries(clientId, resolveArticle),
    );
    const unique = new Map();
    all.forEach(function (entry) {
      if (!entry.policy.included || unique.has(entry.item.attentionId)) return;
      unique.set(entry.item.attentionId, entry);
    });
    return [...unique.values()].sort(function (left, right) {
      const priorityDelta =
        right.item.resolutionPriority - left.item.resolutionPriority;
      return priorityDelta || left.item.attentionId.localeCompare(right.item.attentionId);
    });
  }

  function currentRevision() {
    return normalizeRevision(
      opts.getRevision ? opts.getRevision() : null,
      hasAuthoritativeRevision ? 0 : fallbackRevision,
    );
  }

  function snapshot(clientId) {
    const revision = currentRevision();
    if (cachedRevision !== revision) {
      cachedSnapshots.clear();
      cachedRevision = revision;
    }
    const cacheKey = `${revision}\u0000${clientId || ""}`;
    if (!cachedSnapshots.has(cacheKey))
      cachedSnapshots.set(cacheKey, { revision: revision, entries: entries(clientId) });
    return cachedSnapshots.get(cacheKey);
  }

  function list(input) {
    const value = input || {};
    const current = snapshot(value.clientId);
    const filtered = current.entries.filter(function (entry) {
      return !value.clientId || entry.item.clientId === value.clientId;
    });
    return {
      revision: current.revision,
      items: filtered.map(function (entry) {
        return entry.item;
      }),
      counts: {
        total: filtered.length,
        actionable: filtered.filter(function (entry) {
          return entry.item.allowedActions.some(function (action) {
            return ![
              "inspect",
              "open-publication",
              "open-article",
            ].includes(action);
          });
        }).length,
      },
    };
  }

  function get(input) {
    const attentionId = input && input.attentionId;
    if (typeof attentionId !== "string" || !attentionId.trim()) return null;
    const entry = snapshot(input.clientId).entries.find(function (candidate) {
      return (
        candidate.item.attentionId === attentionId &&
        (!input.clientId || candidate.item.clientId === input.clientId)
      );
    });
    return entry ? entry.item : null;
  }

  function getPolicy(input) {
    const attentionId = input && input.attentionId;
    if (typeof attentionId !== "string" || !attentionId.trim()) return null;
    const entry = snapshot(input.clientId).entries.find(function (candidate) {
      return (
        candidate.item.attentionId === attentionId &&
        (!input.clientId || candidate.item.clientId === input.clientId)
      );
    });
    return entry ? entry.policy : null;
  }

  function invalidate() {
    if (!hasAuthoritativeRevision) fallbackRevision += 1;
    cachedSnapshots.clear();
    cachedRevision = null;
    return currentRevision();
  }

  return {
    list,
    get,
    getPolicy,
    getRevision: currentRevision,
    invalidate,
    kinds: ATTENTION_KINDS,
  };
}

module.exports = { createArticleAttentionQuery, ATTENTION_KINDS };
