const crypto = require("node:crypto");
const {
  ARTICLE_LIFECYCLE_PROJECTION_VERSION,
  deriveArticleLifecycle,
  projectArticleLifecycle,
} = require("../../src/content/article-lifecycle-projection");

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function snapshotError(code, message) {
  const error = new Error(message || "Article management snapshot request is invalid");
  error.code = code;
  return error;
}

function assertClientId(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 200 || /[\\/\u0000-\u001F]/.test(value)) {
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
  const attempts = Array.isArray(value.attempts) ? value.attempts.map(function(attempt) {
    return {
      attemptId: typeof attempt.attemptId === "string" ? attempt.attemptId : null,
      status: typeof attempt.status === "string" ? attempt.status : null,
      createdAt: attempt.createdAt || null,
      updatedAt: attempt.updatedAt || null,
      startedAt: attempt.startedAt || null,
      finishedAt: attempt.finishedAt || null,
      remoteId: typeof attempt.remoteId === "string" ? attempt.remoteId : null,
      remoteUrl: typeof attempt.remoteUrl === "string" ? attempt.remoteUrl : null,
      errorCode: typeof attempt.errorCode === "string" ? attempt.errorCode : null,
      reasonCode: typeof attempt.reasonCode === "string" ? attempt.reasonCode : null
    };
  }) : [];
  const latest = attempts.length ? attempts[attempts.length - 1] : null;
  return {
    version: value.version,
    publicationId: value.publicationId,
    clientId: scopedClientId,
    articleId: value.articleId === undefined ? null : value.articleId,
    articleKey: value.articleKey,
    targetKey: value.targetKey,
    platformId: value.platformId || null,
    mediaResourceId: value.mediaResourceId || null,
    displayName: value.displayName || null,
    titleSnapshot: value.titleSnapshot || null,
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    attempts,
    attemptId: latest && latest.attemptId,
    remoteId: latest && latest.remoteId,
    remoteUrl: latest && latest.remoteUrl,
    errorCode: latest && latest.errorCode,
    reasonCode: latest && latest.reasonCode
  };
}

function safeBatch(batch) {
  const value = clone(batch || {});
  ["filePath", "sidecarPath", "path", "sourceFile"].forEach(function(key) { delete value[key]; });
  if (Array.isArray(value.items)) value.items.forEach(function(item) {
    ["filePath", "sidecarPath", "path", "sourceFile"].forEach(function(key) { delete item[key]; });
  });
  return value;
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
    supplierStatusCode: value.supplierStatusCode === undefined ? "" : String(value.supplierStatusCode),
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

// Kept as a compatibility adapter for older callers.  The classification
// itself belongs to the shared projection module above.
function deriveWorkflow(article, records, batches, transactions, attentionItems, indexedFacts) {
  const facts = indexedFacts || {};
  const submissionItems = Array.isArray(facts.submissionItems)
    ? facts.submissionItems.slice()
    : (Array.isArray(batches) ? batches.flatMap(function(batch) {
    return (batch.items || []).filter(function(item) { return item.articleId === article.id; }).map(function(item) {
      return Object.assign({ batchId: batch.id }, item);
    });
  }) : []);
  const publicationRecords = Array.isArray(records) ? records.slice() : [];
  const syntheticFacts = Array.isArray(facts.targetFacts)
    ? facts.targetFacts
    : facts.targetFacts && typeof facts.targetFacts === "object"
      ? Object.values(facts.targetFacts)
      : [];
  syntheticFacts.forEach(function(fact) {
    if (fact.status === "published") publicationRecords.push({ articleId: article.id, status: "published", targetKey: fact.targetKey });
    else if (["queued", "claimed", "reserving", "remote_started", "submitting", "submitted", "uncertain", "failed", "cancelled"].includes(fact.status)) submissionItems.push({ articleId: article.id, status: fact.status, targetKey: fact.targetKey, canCancel: fact.canCancel });
  });
  return deriveArticleLifecycle({
    article,
    publications: publicationRecords,
    submissionItems,
    orders: facts.orders || [],
    attentionItems: facts.attentionItems || attentionItems || [],
    removalTransactions: transactions || [],
  });
}

function createArticleManagementSnapshot(options) {
  const opts = options || {};
  const cache = new Map();
  const workspaceIdentity = String(opts.workspaceIdentity || opts.workspaceRoot || "workspace");
  const getRevision = typeof opts.getRevision === "function" ? opts.getRevision : function() { return 0; };
  const ai = opts.aiContentService || {};
  const submission = opts.contentSubmissionService || {};
  const operationalStore = opts.operationalStore || null;
  const attention = opts.articleAttentionQuery || null;

  function key(clientId, revision) {
    return crypto.createHash("sha256").update(workspaceIdentity + "\u0000" + clientId + "\u0000" + String(revision)).digest("hex");
  }

  async function read(name, fallback, clientId) {
    const source = opts[name];
    if (typeof source === "function") return source(clientId);
    if (typeof fallback === "function") return fallback();
    return fallback;
  }

  async function get(input, retry) {
    const clientId = assertClientId(typeof input === "string" ? input : input && input.clientId);
    const revision = Number(getRevision()) || 0;
    const cacheKey = key(clientId, revision);
    if (cache.has(cacheKey)) return clone(cache.get(cacheKey));

    const articles = await read("listArticles", function() { return typeof ai.listGeneratedArticles === "function" ? ai.listGeneratedArticles(clientId) : []; }, clientId);
    const trash = await read("listTrash", function() { return typeof ai.listTrashedArticles === "function" ? ai.listTrashedArticles(clientId) : []; }, clientId);
    const batchesRaw = await read("listBatches", function() { return typeof submission.listBatches === "function" ? submission.listBatches(clientId) : []; }, clientId);
    const batches = (Array.isArray(batchesRaw) ? batchesRaw : []).map(safeBatch);
    const articleList = Array.isArray(articles) ? clone(articles) : [];
    const trashList = Array.isArray(trash) ? clone(trash) : [];
    const articleIds = [...articleList, ...trashList]
      .map(function(article) { return article && (article.id || article.articleId); })
      .filter(Boolean);
    const recordsRaw = await read("listPublications", function() {
      if (operationalStore && typeof operationalStore.listPublicationRecords === "function") return operationalStore.listPublicationRecords({ articleIds });
      return [];
    }, clientId);
    const articleIdSet = new Set(articleIds);
    const publicationRecords = (Array.isArray(recordsRaw) ? recordsRaw : [])
      .filter(function(record) {
        return record && articleIdSet.has(record.articleId);
      })
      .map(function(record) {
        return safeRecord(record, clientId);
      });
    const ordersRaw = await read("listOrders", function() {
      if (operationalStore && typeof operationalStore.listOrderDisplayViews === "function") return operationalStore.listOrderDisplayViews();
      return [];
    }, clientId);
    const orders = (Array.isArray(ordersRaw) ? ordersRaw : [])
      .filter(function(order) { return order && articleIdSet.has(order.articleId); })
      .map(safeOrder);
    const attentionList = await read("listAttention", function() { return attention && typeof attention.list === "function" ? attention.list({ clientId }) : { revision, items: [], counts: { total: 0, actionable: 0 } }; }, clientId);
    const attentionItems = Array.isArray(attentionList && attentionList.items) ? clone(attentionList.items) : [];
    const transactionsRaw = await read("listTransactions", function() { return typeof ai.listArticleRemovalTransactions === "function" ? ai.listArticleRemovalTransactions() : []; }, clientId);
    const transactions = (Array.isArray(transactionsRaw) ? transactionsRaw : []).filter(function(item) { return item && (!item.clientId || item.clientId === clientId); });
    const plans = batches.map(function(batch) { return batch.actionPlan || null; }).filter(Boolean);
    const platforms = typeof submission.listPlatforms === "function" ? clone(submission.listPlatforms()) : [];
    const lifecycle = projectArticleLifecycle({
      articles: articleList,
      trash: trashList,
      submissionBatches: batches,
      publications: publicationRecords,
      orders,
      attentionItems,
      removalTransactions: transactions,
    });
    const workflowByArticle = lifecycle.byArticle;
    const publicationSummaries = Object.fromEntries(Object.entries(workflowByArticle).map(function(entry) {
      return [entry[0], entry[1].publicationSummary];
    }));
    const snapshot = {
      clientId,
      revision,
      articles: articleList,
      trash: trashList,
      submissionBatches: batches,
      cancellationPlans: plans,
      publicationRecords,
      orders,
      attention: { revision: Number(attentionList && attentionList.revision) || revision, items: attentionItems, counts: attentionList && attentionList.counts || { total: attentionItems.length, actionable: 0 } },
      submissionPlatforms: platforms,
      workflowByArticle,
      publicationSummaries,
      lifecycleVersion: ARTICLE_LIFECYCLE_PROJECTION_VERSION,
      lifecycleCounts: lifecycle.counts,
    };
    const finalRevision = Number(getRevision()) || 0;
    if (finalRevision !== revision) {
      if (retry) throw snapshotError("ARTICLE_MANAGEMENT_SNAPSHOT_STALE", "Article management data changed while loading");
      return get(input, true);
    }
    cache.set(cacheKey, snapshot);
    return clone(snapshot);
  }

  function invalidate() { cache.clear(); }
  function cacheSize() { return cache.size; }
  return { get, invalidate, cacheSize };
}

module.exports = { createArticleManagementSnapshot, deriveWorkflow };
