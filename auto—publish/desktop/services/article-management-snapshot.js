const crypto = require("node:crypto");

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

const ACTIVE_PUBLICATIONS = new Set(["queued", "submitting", "submitted"]);
const FAILED_PUBLICATIONS = new Set(["failed", "uncertain"]);
const TERMINAL_PUBLICATIONS = new Set(["published", "cancelled"]);
const ACTIVE_BATCHES = new Set(["queued", "submitting", "submitted", "reserving"]);
const FAILED_BATCHES = new Set(["failed", "conflict", "uncertain"]);

const STAGE_POLICY = Object.freeze({
  trash: { primaryAction: "restore", allowedBulkActions: ["restore"], locks: { canEdit: false, canQueue: false, canCancel: false, canTrash: false } },
  failed: { primaryAction: "open_attention", allowedBulkActions: ["open_attention", "trash"], locks: { canEdit: false, canQueue: false, canCancel: false, canTrash: true } },
  queued: { primaryAction: "view_progress", allowedBulkActions: ["view_progress"], locks: { canEdit: false, canQueue: false, canCancel: false, canTrash: false } },
  published: { primaryAction: "view_publication", allowedBulkActions: ["view_publication", "trash"], locks: { canEdit: false, canQueue: false, canCancel: false, canTrash: true } },
  pending_submission: { primaryAction: "queue", allowedBulkActions: ["queue"], locks: { canEdit: true, canQueue: true, canCancel: false, canTrash: true } }
});

function targetKeyFor(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.targetKey === "string" && value.targetKey) return value.targetKey;
  if (value.mediaResourceId) return "media-resource:" + value.mediaResourceId;
  if (value.platformId) return "platform:" + value.platformId;
  if (value.targetPlatformId) return "platform:" + value.targetPlatformId;
  return null;
}

function publicationSummary(records) {
  const values = records.map(function(record) { return String(record.status || ""); });
  const published = values.filter(function(status) { return status === "published"; }).length;
  if (!values.length) return { status: "not_submitted", records: 0, published, uncertain: false };
  if (values.includes("uncertain")) return { status: "uncertain", records: values.length, published, uncertain: true };
  if (published > 0 && published < values.length) return { status: "partial", records: values.length, published, uncertain: false };
  if (published === values.length) return { status: "published", records: values.length, published, uncertain: false };
  if (values.every(function(status) { return status === "failed" || status === "cancelled"; })) return { status: "failed", records: values.length, published, uncertain: false };
  if (values.includes("submitting")) return { status: "submitting", records: values.length, published, uncertain: false };
  if (values.includes("submitted")) return { status: "reviewing", records: values.length, published, uncertain: false };
  if (values.includes("queued")) return { status: "queued", records: values.length, published, uncertain: false };
  return { status: "failed", records: values.length, published, uncertain: false };
}

function deriveWorkflow(article, records, batches, transactions, attentionItems, indexedFacts) {
  const articleId = article.id;
  const targetFacts = indexedFacts && indexedFacts.targetFacts ? indexedFacts.targetFacts : {};
  const facts = Object.values(targetFacts);
  const publicationStatuses = records.map(function(record) { return String(record.status || ""); });
  const batchStatuses = indexedFacts && indexedFacts.batchStatuses ? indexedFacts.batchStatuses : batches.flatMap(function(batch) { return (batch.items || []).filter(function(item) { return item.articleId === articleId; }).map(function(item) { return String(item.status || ""); }); });
  const relevantAttentionItems = indexedFacts && indexedFacts.attentionItems ? indexedFacts.attentionItems : attentionItems;
  const isTrash = ["trashed", "trash"].includes(String(article.status || ""));
  const effectiveStatuses = facts.length ? facts.map(function(fact) { return fact.status; }) : publicationStatuses.concat(batchStatuses);
  const hasActive = effectiveStatuses.some(function(status) { return ACTIVE_PUBLICATIONS.has(status) || ACTIVE_BATCHES.has(status); });
  const hasUncertain = publicationStatuses.includes("uncertain") || batchStatuses.includes("uncertain");
  const hasRepairTransaction = indexedFacts && indexedFacts.hasRepairTransaction !== undefined ? indexedFacts.hasRepairTransaction : transactions.some(function(item) { return item.status === "needs_repair" || item.phase === "needs_repair"; });
  const hasFailure = ["failed", "uncertain"].includes(String(article.status || "")) || relevantAttentionItems.some(function(item) { return item.articleId === articleId; }) || hasRepairTransaction || effectiveStatuses.some(function(status) { return FAILED_PUBLICATIONS.has(status) || FAILED_BATCHES.has(status); });
  const hasPublished = effectiveStatuses.includes("published");
  const allTargetsTerminal = effectiveStatuses.length > 0 && effectiveStatuses.every(function(status) { return TERMINAL_PUBLICATIONS.has(status) || status === "failed"; });
  let stage = "pending_submission";
  if (isTrash) stage = "trash";
  else if (hasFailure) stage = "failed";
  else if (hasActive) stage = "queued";
  else if (hasPublished && allTargetsTerminal) stage = "published";
  const policy = STAGE_POLICY[stage];
  const locks = Object.assign({}, policy.locks, { canCancel: facts.some(function(fact) { return fact.canCancel; }) });
  return {
    stage,
    primaryAction: policy.primaryAction,
    allowedBulkActions: stage === "failed" && hasUncertain ? ["open_attention"] : policy.allowedBulkActions.slice(),
    locks,
    publicationSummary: publicationSummary(records),
    targetFacts
  };
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
    const articleIds = articleList.map(function(article) { return article.id; }).filter(Boolean);
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
    const attentionList = await read("listAttention", function() { return attention && typeof attention.list === "function" ? attention.list({ clientId }) : { revision, items: [], counts: { total: 0, actionable: 0 } }; }, clientId);
    const attentionItems = Array.isArray(attentionList && attentionList.items) ? clone(attentionList.items) : [];
    const transactionsRaw = await read("listTransactions", function() { return typeof ai.listArticleRemovalTransactions === "function" ? ai.listArticleRemovalTransactions() : []; }, clientId);
    const transactions = (Array.isArray(transactionsRaw) ? transactionsRaw : []).filter(function(item) { return item && (!item.clientId || item.clientId === clientId); });
    const plans = batches.map(function(batch) { return batch.actionPlan || null; }).filter(Boolean);
    const platforms = typeof submission.listPlatforms === "function" ? clone(submission.listPlatforms()) : [];
    const recordsByArticle = new Map();
    publicationRecords.forEach(function(record) { if (record.articleId) recordsByArticle.set(record.articleId, (recordsByArticle.get(record.articleId) || []).concat(record)); });
    const batchStatusesByArticle = new Map();
    const targetFactsByArticle = new Map();
    function addTarget(articleId, targetKey, patch) {
      if (!articleId || !targetKey) return;
      const byTarget = targetFactsByArticle.get(articleId) || {};
      byTarget[targetKey] = Object.assign({ targetKey, status: "not_submitted", canCancel: false }, byTarget[targetKey] || {}, patch);
      targetFactsByArticle.set(articleId, byTarget);
    }
    platforms.forEach(function(platform) {
      if (platform && platform.contentQueueImport && platform.id !== "media") articleIds.forEach(function(articleId) { addTarget(articleId, "platform:" + platform.id, { displayName: platform.displayName || platform.id }); });
    });
    publicationRecords.forEach(function(record) { addTarget(record.articleId, targetKeyFor(record), { status: String(record.status || ""), publicationId: record.publicationId || null, displayName: record.displayName || record.platformId || record.mediaResourceId || null }); });
    batches.forEach(function(batch) { (batch.items || []).forEach(function(item) {
      if (!item.articleId) return;
      batchStatusesByArticle.set(item.articleId, (batchStatusesByArticle.get(item.articleId) || []).concat(String(item.status || "")));
      const targetKey = targetKeyFor(item);
      if (!targetKey) return;
      const existing = (targetFactsByArticle.get(item.articleId) || {})[targetKey];
      const publicationTerminal = existing && ["published", "submitted", "submitting", "uncertain"].includes(existing.status);
      addTarget(item.articleId, targetKey, {
        status: publicationTerminal ? existing.status : String(item.publicationStatus || item.status || ""),
        batchId: batch.id,
        canCancel: !publicationTerminal && String(item.status || "") === "queued" && String(batch.status || "") === "queued"
      });
    }); });
    const attentionByArticle = new Map();
    attentionItems.forEach(function(item) { if (item.articleId) attentionByArticle.set(item.articleId, (attentionByArticle.get(item.articleId) || []).concat(item)); });
    const workflowByArticle = {};
    const publicationSummaries = {};
    articleList.forEach(function(article) {
      const records = recordsByArticle.get(article.id) || [];
      workflowByArticle[article.id] = deriveWorkflow(article, records, batches, transactions, attentionItems, {
        batchStatuses: batchStatusesByArticle.get(article.id) || [],
        attentionItems: attentionByArticle.get(article.id) || [],
        hasRepairTransaction: transactions.some(function(item) { return item.articleId === article.id && (item.status === "needs_repair" || item.phase === "needs_repair"); }),
        targetFacts: targetFactsByArticle.get(article.id) || {}
      });
      publicationSummaries[article.id] = workflowByArticle[article.id].publicationSummary;
    });
    const snapshot = {
      clientId,
      revision,
      articles: articleList,
      trash: Array.isArray(trash) ? clone(trash) : [],
      submissionBatches: batches,
      cancellationPlans: plans,
      publicationRecords,
      attention: { revision: Number(attentionList && attentionList.revision) || revision, items: attentionItems, counts: attentionList && attentionList.counts || { total: attentionItems.length, actionable: 0 } },
      submissionPlatforms: platforms,
      workflowByArticle,
      publicationSummaries
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
