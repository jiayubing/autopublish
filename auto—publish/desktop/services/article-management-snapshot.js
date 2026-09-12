const crypto = require("node:crypto");
const domain = require("../../src/domain");
const { projectArticleSummary } = require("../../src/content/article-summary");
const {
  ARTICLE_LIFECYCLE_PROJECTION_VERSION,
  projectArticleLifecycle,
} = require("../../src/content/article-lifecycle-projection");

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function snapshotError(code, message) {
  const error = new Error(
    message || "Article management snapshot request is invalid",
  );
  error.code = code;
  return error;
}

function assertClientId(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 200 ||
    /[\\/\u0000-\u001F]/.test(value)
  ) {
    throw snapshotError("ARTICLE_MANAGEMENT_CLIENT_INVALID");
  }
  return value.trim();
}

function safeRecord(record, scopedClientId) {
  const value = record && typeof record === "object" ? record : {};
  if (
    value.clientId !== null &&
    value.clientId !== undefined &&
    value.clientId !== scopedClientId
  ) {
    throw snapshotError(
      "ARTICLE_MANAGEMENT_PUBLICATION_CLIENT_MISMATCH",
      "Publication record does not belong to the requested client",
    );
  }
  const attempts = Array.isArray(value.attempts)
    ? value.attempts.map(function (attempt) {
        const failure =
          attempt.status === "failed"
            ? domain.projectRegularPublicationFailure(attempt.reasonCode)
            : null;
        return {
          attemptId:
            typeof attempt.attemptId === "string" ? attempt.attemptId : null,
          status: typeof attempt.status === "string" ? attempt.status : null,
          createdAt: attempt.createdAt || null,
          updatedAt: attempt.updatedAt || null,
          startedAt: attempt.startedAt || null,
          finishedAt: attempt.finishedAt || null,
          remoteId:
            typeof attempt.remoteId === "string" ? attempt.remoteId : null,
          remoteUrl:
            typeof attempt.remoteUrl === "string" ? attempt.remoteUrl : null,
          errorCode:
            typeof attempt.errorCode === "string" ? attempt.errorCode : null,
          ...(failure || {}),
        };
      })
    : [];
  const latest = attempts.length ? attempts[attempts.length - 1] : null;
  return {
    publicationId: value.publicationId,
    clientId: scopedClientId,
    articleId: value.articleId === undefined ? null : value.articleId,
    targetKey: value.targetKey,
    platformId: value.platformId || null,
    mediaResourceId: value.mediaResourceId || null,
    displayName: value.displayName || null,
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    attempts,
    attemptId: latest && latest.attemptId,
    remoteId: latest && latest.remoteId,
    remoteUrl: latest && latest.remoteUrl,
    errorCode: latest && latest.errorCode,
    reasonCode: latest && latest.reasonCode,
    reasonSummary: latest && latest.reasonSummary,
  };
}

function safeOrder(order) {
  const value = order && typeof order === "object" ? order : {};
  return {
    orderId: value.orderId || value.orderNid || null,
    orderNid: value.orderNid || value.orderId || null,
    attemptId: value.attemptId || null,
    publicationId: value.publicationId || null,
    articleId: value.articleId || null,
    mediaResourceId: value.mediaResourceId || null,
    publicationStatus: value.publicationStatus || null,
    supplierStatusCode:
      value.supplierStatusCode === undefined
        ? ""
        : String(value.supplierStatusCode),
    supplierObservedAt: value.supplierObservedAt || null,
    publishedAt: value.publishedAt || null,
    remoteUrl: value.remoteUrl || null,
    titleSnapshot: value.titleSnapshot || null,
    filename: value.filename || null,
    resourceNameSnapshot: value.resourceNameSnapshot || null,
    quotedPrice: value.quotedPrice === undefined ? null : value.quotedPrice,
    submittedAt: value.submittedAt || value.createdAt || null,
  };
}

function safePublishedArchive(entry, scopedClientId) {
  const value = entry && typeof entry === "object" ? entry : {};
  const fields = [
    "publicationId",
    "attemptId",
    "publicationEvidence",
    "publicationLocator",
    "terminalTargetV1",
  ];
  if (
    Object.keys(value).some((field) => !fields.includes(field)) ||
    fields.some((field) => !Object.prototype.hasOwnProperty.call(value, field))
  )
    throw snapshotError("ARTICLE_MANAGEMENT_PUBLICATION_ARCHIVE_INVALID");
  let publicationId;
  let attemptId;
  try {
    publicationId = domain.PublicationId.serialize(
      domain.PublicationId.parse(value.publicationId),
    );
    attemptId = domain.AttemptId.serialize(domain.AttemptId.parse(value.attemptId));
  } catch (_) {
    throw snapshotError("ARTICLE_MANAGEMENT_PUBLICATION_ARCHIVE_INVALID");
  }
  let evidence;
  let terminal;
  try {
    evidence = domain.parsePublicationEvidenceSummary(value.publicationEvidence, {
      allowLegacy: true,
    });
    domain.parsePublicationLocator(value.publicationLocator);
    terminal = domain.parseTerminalTargetV1(value.terminalTargetV1);
  } catch (_) {
    throw snapshotError("ARTICLE_MANAGEMENT_PUBLICATION_ARCHIVE_INVALID");
  }
  if (
    evidence.articleIdentityV1.clientId !== scopedClientId ||
    terminal.articleIdentityV1.clientId !== scopedClientId ||
    terminal.articleIdentityV1.articleId !== evidence.articleIdentityV1.articleId ||
    terminal.attemptId !== attemptId
  )
    throw snapshotError(
      "ARTICLE_MANAGEMENT_PUBLICATION_ARCHIVE_CLIENT_MISMATCH",
      "Publication archive does not belong to the requested client",
    );
  return {
    publicationId,
    attemptId,
    publicationEvidence: evidence,
    publicationLocator: domain.projectPublicationSummaryLocator(evidence),
  };
}

function createArticleManagementSnapshot(options) {
  const opts = options || {};
  const cache = new Map();
  const latestCacheKeyByClient = new Map();
  const inFlight = new Map();
  let generation = 0;
  const workspaceIdentity = String(
    opts.workspaceIdentity || opts.workspaceRoot || "workspace",
  );
  const getRevision =
    typeof opts.getRevision === "function"
      ? opts.getRevision
      : function () {
          return 0;
        };
  const ai = opts.aiContentService || {};
  const submissionPlatformDirectory = opts.submissionPlatformDirectory || null;
  const operationalStore = opts.operationalStore || null;
  const publishedArchiveQueries = opts.publishedArchiveQueries || null;
  const attention = opts.articleAttentionQuery || null;

  function key(clientId, revision) {
    return crypto
      .createHash("sha256")
      .update(
        workspaceIdentity + "\u0000" + clientId + "\u0000" + String(revision),
      )
      .digest("hex");
  }

  async function read(name, fallback, clientId) {
    const source = opts[name];
    if (typeof source === "function") return source(clientId);
    if (typeof fallback === "function") return fallback();
    return fallback;
  }

  function cacheRevision() {
    return typeof opts.getCacheRevision === "function"
      ? opts.getCacheRevision()
      : Number(getRevision()) || 0;
  }

  async function get(input) {
    const clientId = assertClientId(
      typeof input === "string" ? input : input && input.clientId,
    );
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const version = cacheRevision();
      const cacheKey = key(clientId, version);
      const startedGeneration = generation;
      let serialized = cache.get(cacheKey);
      if (serialized === undefined) {
        let pending = inFlight.get(cacheKey);
        if (!pending) {
          pending = Promise.resolve()
            .then(() => build(clientId, cacheKey, version, startedGeneration))
            .finally(() => {
              if (inFlight.get(cacheKey) === pending) inFlight.delete(cacheKey);
            });
          inFlight.set(cacheKey, pending);
        }
        serialized = await pending;
      }
      if (serialized !== null && startedGeneration === generation && version === cacheRevision()) {
        return { ...JSON.parse(serialized), revision: Number(getRevision()) || 0 };
      }
    }
    throw snapshotError(
      "ARTICLE_MANAGEMENT_SNAPSHOT_STALE",
      "Article management data changed while loading",
    );
  }

  async function build(clientId, cacheKey, version, startedGeneration) {
    const revision = Number(getRevision()) || 0;
    const articles = await read(
      "listArticles",
      function () {
        return typeof ai.listGeneratedArticles === "function"
          ? ai.listGeneratedArticles(clientId)
          : [];
      },
      clientId,
    );
    const trash = await read(
      "listTrash",
      function () {
        return typeof ai.listTrashedArticles === "function"
          ? ai.listTrashedArticles(clientId)
          : [];
      },
      clientId,
    );
    const articleList = Array.isArray(articles) ? articles.map(projectArticleSummary) : [];
    const trashList = Array.isArray(trash) ? clone(trash) : [];
    const articleIds = [...articleList, ...trashList]
      .map(function (article) {
        return article && (article.id || article.articleId);
      })
      .filter(Boolean);
    const articleIdSet = new Set(articleIds);
    let publishedArchives = [];
    if (
      publishedArchiveQueries &&
      typeof publishedArchiveQueries.listPublishedArchiveSummaries === "function"
    ) {
      const archiveResult =
        await publishedArchiveQueries.listPublishedArchiveSummaries({ articleIds });
      if (!Array.isArray(archiveResult))
        throw snapshotError("ARTICLE_MANAGEMENT_PUBLICATION_ARCHIVE_INVALID");
      publishedArchives = archiveResult
        .filter(function (entry) {
          return (
            entry &&
            entry.publicationEvidence &&
            articleIdSet.has(
              entry.publicationEvidence.articleIdentityV1.articleId,
            )
          );
        })
        .map(function (entry) {
          return safePublishedArchive(entry, clientId);
        });
    }
    const lifecycleFactsRaw = await read(
      "listLifecycleFacts",
      function () {
        if (
          operationalStore &&
          typeof operationalStore.listArticleLifecycleFacts === "function"
        )
          return operationalStore.listArticleLifecycleFacts({ articleIds });
        return null;
      },
      clientId,
    );
    const lifecycleFacts =
      lifecycleFactsRaw && typeof lifecycleFactsRaw === "object"
        ? lifecycleFactsRaw
        : null;
    const batchesRaw =
      lifecycleFacts && Array.isArray(lifecycleFacts.submissionItems)
        ? []
        : await read("listBatches", [], clientId);
    const batches = Array.isArray(batchesRaw) ? clone(batchesRaw) : [];
    const recordsRaw =
      lifecycleFacts && Array.isArray(lifecycleFacts.publications)
        ? lifecycleFacts.publications
        : await read(
            "listPublications",
            function () {
              if (
                operationalStore &&
                typeof operationalStore.listPublicationRecords === "function"
              )
                return operationalStore.listPublicationRecords({ articleIds });
              return [];
            },
            clientId,
          );
    const publicationRecords = (Array.isArray(recordsRaw) ? recordsRaw : [])
      .filter(function (record) {
        return record && articleIdSet.has(record.articleId);
      })
      .map(function (record) {
        return safeRecord(record, clientId);
      });
    const ordersRaw =
      lifecycleFacts && Array.isArray(lifecycleFacts.orders)
        ? lifecycleFacts.orders
        : await read("listOrders", [], clientId);
    const orders = (Array.isArray(ordersRaw) ? ordersRaw : [])
      .filter(function (order) {
        return order && articleIdSet.has(order.articleId);
      })
      .map(safeOrder);
    const attentionList = await read(
      "listAttention",
      function () {
        return attention && typeof attention.list === "function"
          ? attention.list({ clientId })
          : { revision, items: [], counts: { total: 0, actionable: 0 } };
      },
      clientId,
    );
    const attentionItems = Array.isArray(attentionList && attentionList.items)
      ? clone(attentionList.items)
      : [];
    const transactionsRaw = await read(
      "listTransactions",
      function () {
        return typeof ai.listArticleRemovalTransactions === "function"
          ? ai.listArticleRemovalTransactions()
          : [];
      },
      clientId,
    );
    const transactions = (
      Array.isArray(transactionsRaw) ? transactionsRaw : []
    ).filter(function (item) {
      return item && (!item.clientId || item.clientId === clientId);
    });
    const platforms =
      submissionPlatformDirectory &&
      typeof submissionPlatformDirectory.list === "function"
        ? clone(submissionPlatformDirectory.list())
        : [];
    const lifecycle = projectArticleLifecycle({
      articles: articleList,
      trash: trashList,
      submissionBatches: batches,
      submissionItems:
        lifecycleFacts && Array.isArray(lifecycleFacts.submissionItems)
          ? lifecycleFacts.submissionItems
          : undefined,
      publications: publicationRecords,
      orders,
      attentionItems,
      removalTransactions: transactions,
    });
    const workflowByArticle = Object.fromEntries(
      Object.entries(lifecycle.byArticle).map(([articleId, workflow]) => [articleId, {
        version: workflow.version,
        stage: workflow.stage,
        label: workflow.label,
        primaryAction: workflow.primaryAction,
        allowedBulkActions: workflow.allowedBulkActions,
        locks: {
          canEdit: workflow.locks.canEdit,
          canSubmit: workflow.locks.canSubmit,
          canCancel: workflow.locks.canCancel,
          canTrash: workflow.locks.canTrash,
        },
        operations: Object.fromEntries(["edit", "submit", "trash", "restore", "purge"].map(action => [action, {
          allowed: workflow.operations[action].allowed,
          reasonCodes: workflow.operations[action].reasonCodes,
        }])),
        reasonCodes: workflow.reasonCodes,
        reasonMessage: workflow.reasonMessage,
        attentionCount: workflow.attentionCount,
        orderSummary: workflow.orderSummary,
        publicationSummary: workflow.publicationSummary,
      }]),
    );
    const snapshot = {
      clientId,
      revision,
      articles: articleList,
      trash: trashList,
      publicationRecords,
      publishedArchives,
      submissionPlatforms: platforms,
      workflowByArticle,
      lifecycleVersion: ARTICLE_LIFECYCLE_PROJECTION_VERSION,
      lifecycleCounts: lifecycle.counts,
    };
    if (generation !== startedGeneration || version !== cacheRevision()) return null;
    const serialized = JSON.stringify(snapshot);
    // Cache one completed version per client; callers parse independent copies.
    const previousKey = latestCacheKeyByClient.get(clientId);
    if (previousKey) cache.delete(previousKey);
    cache.set(cacheKey, serialized);
    latestCacheKeyByClient.set(clientId, cacheKey);
    return serialized;
  }

  function invalidate() {
    generation += 1;
    inFlight.clear();
    cache.clear();
    latestCacheKeyByClient.clear();
  }
  function cacheSize() {
    return cache.size;
  }
  return { get, invalidate, cacheSize };
}

module.exports = { createArticleManagementSnapshot };
