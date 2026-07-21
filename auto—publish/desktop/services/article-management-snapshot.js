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

function safeRecord(record) {
  const value = record && typeof record === "object" ? record : {};
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
    clientId: value.clientId,
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
  const publicationStatuses = records.map(function(record) { return String(record.status || ""); });
  const batchStatuses = indexedFacts && indexedFacts.batchStatuses ? indexedFacts.batchStatuses : batches.flatMap(function(batch) { return (batch.items || []).filter(function(item) { return item.articleId === articleId; }).map(function(item) { return String(item.status || ""); }); });
  const relevantAttentionItems = indexedFacts && indexedFacts.attentionItems ? indexedFacts.attentionItems : attentionItems;
  const isTrash = ["trashed", "trash"].includes(String(article.status || ""));
  const hasActive = publicationStatuses.some(function(status) { return ACTIVE_PUBLICATIONS.has(status); }) || batchStatuses.some(function(status) { return ACTIVE_BATCHES.has(status); });
  const hasUncertain = publicationStatuses.includes("uncertain") || batchStatuses.includes("uncertain");
  const hasRepairTransaction = indexedFacts && indexedFacts.hasRepairTransaction !== undefined ? indexedFacts.hasRepairTransaction : transactions.some(function(item) { return item.status === "needs_repair" || item.phase === "needs_repair"; });
  const hasFailure = ["failed", "uncertain"].includes(String(article.status || "")) || relevantAttentionItems.some(function(item) { return item.articleId === articleId || item.archiveError != null; }) || hasRepairTransaction || publicationStatuses.some(function(status) { return FAILED_PUBLICATIONS.has(status); }) || batchStatuses.some(function(status) { return FAILED_BATCHES.has(status); });
  const combined = publicationStatuses.concat(batchStatuses.filter(function(status) { return TERMINAL_PUBLICATIONS.has(status); }));
  const hasPublished = combined.includes("published");
  const allTargetsTerminal = combined.length > 0 && combined.every(function(status) { return TERMINAL_PUBLICATIONS.has(status); });
  let stage = "pending_submission";
  if (isTrash) stage = "trash";
  else if (hasFailure) stage = "failed";
  else if (hasActive) stage = "queued";
  else if (hasPublished && allTargetsTerminal) stage = "published";
  const locks = stage === "trash"
    ? { canEdit: false, canQueue: false, canCancel: false, canTrash: false }
    : stage === "failed"
      ? { canEdit: false, canQueue: false, canCancel: false, canTrash: !hasActive && !hasUncertain }
      : stage === "queued"
        ? { canEdit: false, canQueue: false, canCancel: batchStatuses.includes("queued"), canTrash: false }
        : stage === "published"
          ? { canEdit: false, canQueue: false, canCancel: false, canTrash: true }
          : { canEdit: true, canQueue: true, canCancel: false, canTrash: true };
  const allowedBulkActions = stage === "trash" ? ["restore"] : stage === "failed" ? (hasUncertain ? ["open_attention"] : ["open_attention", "trash"]) : stage === "queued" ? ["view_progress"] : stage === "published" ? ["view_publication", "trash"] : ["queue"];
  return {
    stage,
    primaryAction: stage === "trash" ? "restore" : stage === "failed" ? "open_attention" : stage === "queued" ? "view_progress" : stage === "published" ? "view_publication" : "queue",
    allowedBulkActions,
    locks,
    publicationSummary: publicationSummary(records)
  };
}

function createArticleManagementSnapshot(options) {
  const opts = options || {};
  const cache = new Map();
  const workspaceIdentity = String(opts.workspaceIdentity || opts.workspaceRoot || "workspace");
  const getRevision = typeof opts.getRevision === "function" ? opts.getRevision : function() { return 0; };
  const ai = opts.aiContentService || {};
  const submission = opts.contentSubmissionService || {};
  const ledger = opts.publicationLedger || {};
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

  async function get(input) {
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
    const recordsRaw = await read("listPublications", function() { return typeof ledger.listForArticles === "function" ? ledger.listForArticles(clientId, articleIds) : []; }, clientId);
    const publicationRecords = (Array.isArray(recordsRaw) ? recordsRaw : []).map(safeRecord);
    const attentionList = await read("listAttention", function() { return attention && typeof attention.list === "function" ? attention.list({ clientId }) : { revision, items: [], counts: { total: 0, actionable: 0 } }; }, clientId);
    const attentionItems = Array.isArray(attentionList && attentionList.items) ? clone(attentionList.items) : [];
    const transactionsRaw = await read("listTransactions", function() { return typeof ai.listArticleRemovalTransactions === "function" ? ai.listArticleRemovalTransactions() : []; }, clientId);
    const transactions = (Array.isArray(transactionsRaw) ? transactionsRaw : []).filter(function(item) { return item && (!item.clientId || item.clientId === clientId); });
    const plans = batches.map(function(batch) { return batch.actionPlan || null; }).filter(Boolean);
    const platforms = typeof submission.listPlatforms === "function" ? clone(submission.listPlatforms()) : [];
    const recordsByArticle = new Map();
    publicationRecords.forEach(function(record) { if (record.articleId) recordsByArticle.set(record.articleId, (recordsByArticle.get(record.articleId) || []).concat(record)); });
    const batchStatusesByArticle = new Map();
    batches.forEach(function(batch) { (batch.items || []).forEach(function(item) {
      if (!item.articleId) return;
      batchStatusesByArticle.set(item.articleId, (batchStatusesByArticle.get(item.articleId) || []).concat(String(item.status || "")));
    }); });
    const attentionByArticle = new Map();
    const globalAttention = attentionItems.filter(function(item) { return item.archiveError != null; });
    attentionItems.forEach(function(item) { if (item.articleId) attentionByArticle.set(item.articleId, (attentionByArticle.get(item.articleId) || []).concat(item)); });
    const hasRepairTransaction = transactions.some(function(item) { return item.status === "needs_repair" || item.phase === "needs_repair"; });
    const workflowByArticle = {};
    const publicationSummaries = {};
    articleList.forEach(function(article) {
      const records = recordsByArticle.get(article.id) || [];
      workflowByArticle[article.id] = deriveWorkflow(article, records, batches, transactions, attentionItems, {
        batchStatuses: batchStatusesByArticle.get(article.id) || [],
        attentionItems: (attentionByArticle.get(article.id) || []).concat(globalAttention),
        hasRepairTransaction
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
    cache.set(cacheKey, snapshot);
    return clone(snapshot);
  }

  function invalidate() { cache.clear(); }
  function cacheSize() { return cache.size; }
  return { get, invalidate, cacheSize };
}

module.exports = { createArticleManagementSnapshot, deriveWorkflow };
