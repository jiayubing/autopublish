const ARTICLE_LIFECYCLE_PROJECTION_VERSION = 1;

const ARTICLE_LIFECYCLE_STAGES = Object.freeze([
  "pending_submission",
  "queued",
  "paid_processing",
  "failed",
  "published",
  "trash",
]);

const STAGE_LABELS = Object.freeze({
  pending_submission: "待投稿",
  queued: "投稿队列",
  paid_processing: "付费处理中",
  failed: "需处理",
  published: "已发布",
  trash: "回收站",
});

const SUMMARY_LABELS = Object.freeze({
  not_submitted: "未投稿",
  queued: "已入队",
  paid_processing: "付费处理中",
  submitting: "投稿中",
  reviewing: "审核中",
  partial: "部分发布",
  published: "已发布",
  uncertain: "待确认",
  failed: "失败",
});

const UNKNOWN_FACT_STATUS = "unknown";
const ACTIVE_PUBLICATION_STATUSES = new Set(["queued", "remote_started", "submitting", "submitted"]);
const ACTIVE_SUBMISSION_STATUSES = new Set(["queued", "claimed", "submitting", "submitted", "reserving"]);
const FAILURE_STATUSES = new Set(["failed", "uncertain", "conflict"]);
const KNOWN_PUBLICATION_STATUSES = new Set([
  "queued",
  "remote_started",
  "submitting",
  "submitted",
  "published",
  "uncertain",
  "failed",
  "cancelled",
]);
const KNOWN_SUBMISSION_STATUSES = new Set([
  "queued",
  "claimed",
  "reserving",
  "submitting",
  "submitted",
  "published",
  "remote_started",
  "uncertain",
  "failed",
  "cancelled",
]);
const SUPPLIER_STATUSES = new Set(["0", "1", "2", "4", "9"]);

const REASON_MESSAGES = Object.freeze({
  ARTICLE_CONTENT_INCOMPLETE: "文章标题和正文必须完整。",
  MEDIA_ORDER_MISSING: "网站媒体订单事实缺失，需要人工核对。",
  ORDER_STATUS_UNKNOWN: "网站媒体订单状态未知，需要人工核对。",
  ORDER_REJECTED: "网站媒体订单已退稿，需要处理。",
  ORDER_AFTER_SALES: "网站媒体订单处于售后状态，需要处理。",
  TRASH_ACTIVE_CONFLICT: "回收站文章仍存在活动投稿事实，需要处理。",
  PUBLICATION_UNCERTAIN: "投稿结果不确定，需要人工核对。",
  PUBLICATION_FAILED: "投稿明确失败，需要处理。",
  REMOVAL_REPAIR_REQUIRED: "文章删除事务需要修复。",
  PUBLISHED_TRASH_CONFLICT: "已发布文章存在回收站冲突，需要人工核对。",
  ARTICLE_ATTENTION: "文章存在需要处理的事项。",
  PUBLICATION_STATUS_UNKNOWN: "投稿事实状态未知，需要人工核对。",
  SUBMISSION_STATUS_UNKNOWN: "投稿队列事实状态未知，需要人工核对。",
  MULTIPLE_ACTIVE_TARGETS: "文章存在多个活动投稿目标，需要人工核对。",
});

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  if (typeof value === "string") return value;
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function rawStatusOf(value) {
  return text(value && value.status).trim() || text(value && value.publicationStatus).trim();
}

function articleIdOf(value) {
  const id = value && value.articleId !== undefined && value.articleId !== null && value.articleId !== ""
    ? value.articleId
    : value && value.id;
  return typeof id === "string" && id ? id : null;
}

function targetKeyOf(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.targetKey === "string" && value.targetKey) return value.targetKey;
  if (typeof value.mediaResourceId === "string" && value.mediaResourceId) return `media-resource:${value.mediaResourceId}`;
  if (typeof value.platformId === "string" && value.platformId) return `platform:${value.platformId}`;
  if (typeof value.targetPlatformId === "string" && value.targetPlatformId) return `platform:${value.targetPlatformId}`;
  return null;
}

function orderIdOf(value) {
  const id = value && (value.orderId || value.orderNid);
  return text(id).trim();
}

function orderStatusOf(value) {
  const code = text(value && (value.supplierStatusCode ?? value.statusCode)).trim();
  return code || (text(value && value.publicationStatus) === "published" ? "2" : UNKNOWN_FACT_STATUS);
}

function isKnownOrder(value) {
  return Boolean(orderIdOf(value));
}

function matchesOrderTarget(target, order, targets, orders) {
  if (articleIdOf(target) !== articleIdOf(order)) return false;
  if (target.publicationId && order.publicationId) return target.publicationId === order.publicationId;
  if (target.attemptId && order.attemptId) return target.attemptId === order.attemptId;
  if (target.mediaResourceId && order.mediaResourceId) return target.mediaResourceId === order.mediaResourceId;
  const targetKey = targetKeyOf(target);
  const orderKey = targetKeyOf(order);
  if (targetKey && orderKey) return targetKey === orderKey;
  return !orderKey && targets.length === 1 && orders.length === 1;
}

function isMediaTarget(value) {
  const key = targetKeyOf(value) || "";
  return key.startsWith("media-resource:") || key.startsWith("media:") || Boolean(value && (value.kind === "media" || value.platformId === "media" || value.targetPlatformId === "media"));
}

function isCompleteArticle(article) {
  return Boolean(article && text(article.title).trim() && text(article.content).trim());
}

function publicationLifecycleStatus(value) {
  const status = rawStatusOf(value) || UNKNOWN_FACT_STATUS;
  return status === "submitted" && !isMediaTarget(value) ? "published" : status;
}

function submissionLifecycleStatus(value) {
  const rawStatus = rawStatusOf(value);
  if (rawStatus === "failed-cleaned") return "failed";
  if (rawStatus === "published-cleaned") return "published";
  if (rawStatus === "cancelled-cleaned") return "cancelled";
  if (rawStatus === "completed") {
    const outcome = text(value && (value.publicationStatus || value.outcomeStatus)).trim();
    if (!outcome) return UNKNOWN_FACT_STATUS;
    return outcome === "submitted" && !isMediaTarget(value) ? "published" : outcome;
  }
  const status = rawStatus || UNKNOWN_FACT_STATUS;
  return status === "submitted" && !isMediaTarget(value) ? "published" : status;
}

function activePublicationFact(value) {
  const status = rawStatusOf(value);
  return ACTIVE_PUBLICATION_STATUSES.has(status) && !(status === "submitted" && !isMediaTarget(value));
}

function activeSubmissionFact(value) {
  const status = rawStatusOf(value);
  return ACTIVE_SUBMISSION_STATUSES.has(status) && !(status === "submitted" && !isMediaTarget(value));
}

function publicationSummary(records, orders, submissionItems) {
  const factValues = array(records).map((record) => ({ value: record, status: publicationLifecycleStatus(record) }))
    .concat(array(submissionItems).map((item) => ({ value: item, status: submissionLifecycleStatus(item) })))
    .concat(array(orders).map((order) => ({
      value: order,
      status: text(order.publicationStatus) === "published" ? "published" : orderStatusOf(order),
    })));
  const targetFacts = targetFactsFor(records, submissionItems, orders);
  const keyedTargets = new Set(Object.keys(targetFacts));
  const values = Object.values(targetFacts).map((fact) => fact.status).concat(
    factValues.filter((fact) => !keyedTargets.has(targetKeyOf(fact.value))).map((fact) => fact.status),
  );
  const mediaFacts = array(records).filter(isMediaTarget).concat(array(submissionItems).filter(isMediaTarget)).filter((fact) => ["submitted", "published"].includes(rawStatusOf(fact)));
  const missingMediaOrder = mediaFacts.some((fact) => ["submitted", "published"].includes(rawStatusOf(fact))
    && !array(orders).some((order) => matchesOrderTarget(fact, order, mediaFacts, array(orders))));
  const published = values.filter((status) => status === "published" || status === "2").length;
  const uncertain = values.includes("uncertain") || values.includes(UNKNOWN_FACT_STATUS) || missingMediaOrder;
  const result = (status, isUncertain = false) => ({ status, label: SUMMARY_LABELS[status], records: values.length, published, uncertain: isUncertain });
  if (!values.length) return { status: "not_submitted", label: SUMMARY_LABELS.not_submitted, records: 0, published: 0, uncertain: false };
  if (uncertain) return result("uncertain", true);
  if (published > 0 && published < values.length) return result("partial");
  if (published > 0) return result("published");
  if (values.some((status) => status === "0" || status === "1")) return result("paid_processing");
  if (values.every((status) => status === "failed" || status === "cancelled" || status === "4" || status === "9")) return result("failed");
  if (values.includes("submitting") || values.includes("remote_started")) return result("submitting");
  if (values.includes("submitted")) return result("reviewing");
  if (values.includes("queued")) return result("queued");
  return result("failed");
}

function mergeTargetStatus(current, next) {
  if (current === UNKNOWN_FACT_STATUS || next === UNKNOWN_FACT_STATUS) return UNKNOWN_FACT_STATUS;
  if (current === "uncertain" || next === "uncertain") return "uncertain";
  if (current === "published" || next === "published") return "published";
  if (current === "2" || next === "2") return "2";
  return next || current || "not_submitted";
}

function targetFactsFor(records, submissionItems, orders) {
  const targetFacts = Object.create(null);
  function add(value, patch) {
    const targetKey = targetKeyOf(value);
    if (!targetKey) return;
    const current = targetFacts[targetKey] || { targetKey, status: "not_submitted", canCancel: false };
    targetFacts[targetKey] = Object.assign({}, current, patch, {
      status: mergeTargetStatus(current.status, patch.status),
      canCancel: current.canCancel === true || patch.canCancel === true,
    });
  }
  array(records).forEach((record) => add(record, {
    status: publicationLifecycleStatus(record),
    publicationId: record.publicationId || null,
    displayName: record.displayName || record.platformId || record.mediaResourceId || null,
  }));
  array(submissionItems).forEach((item) => add(item, {
    status: submissionLifecycleStatus(item),
    batchId: item.batchId || item.submissionBatchId || null,
    canCancel: item.canCancel === true || rawStatusOf(item) === "queued",
  }));
  array(orders).forEach((order) => add(order, {
    status: text(order.publicationStatus) === "published" ? "published" : orderStatusOf(order),
    orderId: order.orderId || order.orderNid || null,
    displayName: order.resourceNameSnapshot || null,
  }));
  Object.values(targetFacts).forEach((fact) => {
    if (["uncertain", "published", "2", "4", "9"].includes(fact.status)) fact.canCancel = false;
    Object.freeze(fact);
  });
  return targetFacts;
}

function deriveArticleLifecycle(input) {
  const value = input || {};
  const article = value.article || {};
  const articleId = articleIdOf(article);
  const publications = array(value.publications).filter((record) => articleIdOf(record) === articleId);
  const submissionItems = array(value.submissionItems).filter((item) => articleIdOf(item) === articleId);
  const orders = array(value.orders).filter((order) => articleIdOf(order) === articleId);
  const attentionItems = array(value.attentionItems).filter((item) => !item.articleId || item.articleId === articleId || item.archiveErrorCode);
  const removalTransactions = array(value.removalTransactions).filter((transaction) => !transaction.articleId || transaction.articleId === articleId);
  const targetFacts = targetFactsFor(publications, submissionItems, orders);
  const publicationStatuses = publications.map(publicationLifecycleStatus);
  const submissionStatuses = submissionItems.map(submissionLifecycleStatus);
  const orderStatuses = orders.map(orderStatusOf);
  const mediaPublications = publications.filter(isMediaTarget);
  const mediaSubmissions = submissionItems.filter(isMediaTarget);
  const mediaFacts = mediaPublications.concat(mediaSubmissions);
  const hasPublished = publications.some((record, index) => publicationStatuses[index] === "published" && !isMediaTarget(record))
    || submissionItems.some((item, index) => submissionStatuses[index] === "published" && !isMediaTarget(item))
    || orders.some((order) => isKnownOrder(order) && (orderStatusOf(order) === "2" || text(order.publicationStatus) === "published"))
    || mediaFacts.some((fact) => publicationLifecycleStatus(fact) === "published"
      && orders.some((order) => isKnownOrder(order) && matchesOrderTarget(fact, order, mediaFacts, orders)));
  const hasUncertain = publicationStatuses.includes("uncertain") || submissionStatuses.includes("uncertain");
  const hasActivePublication = publications.some(activePublicationFact);
  const hasActiveSubmission = submissionItems.some(activeSubmissionFact);
  const hasPaidOrder = orders.some((order) => isKnownOrder(order) && (orderStatusOf(order) === "0" || orderStatusOf(order) === "1"));
  const hasUnknownOrder = orders.some((order) => !isKnownOrder(order) || !SUPPLIER_STATUSES.has(orderStatusOf(order)));
  const hasUnknownPublicationStatus = publicationStatuses.some((status) => !KNOWN_PUBLICATION_STATUSES.has(status));
  const hasUnknownSubmissionStatus = submissionStatuses.some((status) => !KNOWN_SUBMISSION_STATUSES.has(status));
  const activeTargetKeys = new Set(
    publications.filter(activePublicationFact).concat(submissionItems.filter(activeSubmissionFact)).map(targetKeyOf).filter(Boolean),
  );
  const hasMultipleActiveTargets = activeTargetKeys.size > 1;
  const hasRejectedOrder = orderStatuses.includes("4");
  const hasAfterSalesOrder = orderStatuses.includes("9");
  const hasMissingMediaOrder = mediaFacts.some((fact) => ["submitted", "published"].includes(rawStatusOf(fact))
    && !orders.some((order) => matchesOrderTarget(fact, order, mediaFacts, orders)));
  const hasRepair = removalTransactions.some((transaction) => transaction.status === "needs_repair" || transaction.phase === "needs_repair");
  const explicitFailure = text(article.status) === "failed" || publicationStatuses.includes("failed") || submissionStatuses.some((status) => FAILURE_STATUSES.has(status));
  const hasAttention = attentionItems.length > 0 || hasRepair || hasUncertain || hasUnknownOrder || hasUnknownPublicationStatus || hasUnknownSubmissionStatus || hasMissingMediaOrder || hasMultipleActiveTargets || (!hasPublished && (explicitFailure || hasRejectedOrder || hasAfterSalesOrder));
  const isTrash = ["trash", "trashed"].includes(text(article.status)) || value.deleted === true;
  const reasonCodes = [];
  if (!isTrash && !isCompleteArticle(article)) reasonCodes.push("ARTICLE_CONTENT_INCOMPLETE");
  if (hasMissingMediaOrder) reasonCodes.push("MEDIA_ORDER_MISSING");
  if (hasUnknownOrder) reasonCodes.push("ORDER_STATUS_UNKNOWN");
  if (hasUnknownPublicationStatus) reasonCodes.push("PUBLICATION_STATUS_UNKNOWN");
  if (hasUnknownSubmissionStatus) reasonCodes.push("SUBMISSION_STATUS_UNKNOWN");
  if (hasMultipleActiveTargets) reasonCodes.push("MULTIPLE_ACTIVE_TARGETS");
  if (hasRejectedOrder && !hasPublished) reasonCodes.push("ORDER_REJECTED");
  if (hasAfterSalesOrder && !hasPublished) reasonCodes.push("ORDER_AFTER_SALES");
  if (hasUncertain) reasonCodes.push("PUBLICATION_UNCERTAIN");
  if (explicitFailure && !hasRejectedOrder && !hasPublished) reasonCodes.push("PUBLICATION_FAILED");
  if (hasRepair) reasonCodes.push("REMOVAL_REPAIR_REQUIRED");
  const trashConflict = isTrash && hasPublished;
  const trashActivityConflict = isTrash && (hasActivePublication || hasActiveSubmission || hasPaidOrder || hasUncertain || hasUnknownOrder || hasMissingMediaOrder);
  if (trashConflict) reasonCodes.push("PUBLISHED_TRASH_CONFLICT");
  if (trashActivityConflict && !trashConflict) reasonCodes.push("TRASH_ACTIVE_CONFLICT");
  if (attentionItems.length > 0 && !reasonCodes.length) reasonCodes.push("ARTICLE_ATTENTION");
  const frozenAttention = hasUncertain || hasUnknownOrder || hasUnknownPublicationStatus || hasUnknownSubmissionStatus || hasRepair || hasMissingMediaOrder || hasMultipleActiveTargets || hasActivePublication || hasActiveSubmission || hasPaidOrder || trashConflict || trashActivityConflict;
  let stage = "pending_submission";
  if (trashConflict) stage = "failed";
  else if (hasUncertain || hasUnknownOrder || hasUnknownPublicationStatus || hasUnknownSubmissionStatus || hasMissingMediaOrder || hasMultipleActiveTargets || hasRepair || trashActivityConflict) stage = "failed";
  else if (hasPublished) stage = "published";
  else if (isTrash && !trashActivityConflict) stage = "trash";
  else if (hasAttention || trashActivityConflict || (!isCompleteArticle(article) && !hasPaidOrder && !hasActivePublication && !hasActiveSubmission)) stage = "failed";
  else if (hasPaidOrder || (mediaPublications.concat(mediaSubmissions).some((fact) => ["submitted", "submitting"].includes(rawStatusOf(fact))) && orders.length > 0)) stage = "paid_processing";
  else if (hasActivePublication || hasActiveSubmission) stage = "queued";

  let primaryAction = "queue";
  let allowedBulkActions = ["queue"];
  let locks = { canEdit: true, canQueue: true, canCancel: false, canTrash: true };
  if (stage === "queued") {
    primaryAction = "view_progress";
    allowedBulkActions = ["view_progress"];
    locks = { canEdit: false, canQueue: false, canCancel: Object.values(targetFacts).some((fact) => fact.canCancel === true), canTrash: false };
  } else if (stage === "paid_processing") {
    primaryAction = "view_order";
    allowedBulkActions = ["view_order"];
    locks = { canEdit: false, canQueue: false, canCancel: false, canTrash: false };
  } else if (stage === "failed") {
    primaryAction = "open_attention";
    allowedBulkActions = frozenAttention ? ["open_attention"] : ["open_attention", "trash"];
    locks = { canEdit: !frozenAttention, canQueue: !frozenAttention && isCompleteArticle(article), canCancel: false, canTrash: !frozenAttention };
  } else if (stage === "published") {
    primaryAction = "view_publication";
    allowedBulkActions = ["view_publication"];
    locks = { canEdit: false, canQueue: false, canCancel: false, canTrash: false };
  } else if (stage === "trash") {
    primaryAction = "restore";
    allowedBulkActions = ["restore"];
    locks = { canEdit: false, canQueue: false, canCancel: false, canTrash: false };
  }

  return Object.freeze({
    version: ARTICLE_LIFECYCLE_PROJECTION_VERSION,
    stage,
    label: STAGE_LABELS[stage],
    primaryAction,
    allowedBulkActions: Object.freeze(allowedBulkActions),
    locks: Object.freeze(locks),
    reasonCodes: Object.freeze([...new Set(reasonCodes)]),
    reasonMessage: REASON_MESSAGES[reasonCodes[0]] || null,
    publicationSummary: Object.freeze(publicationSummary(publications, orders, submissionItems)),
    targetFacts: Object.freeze(targetFacts),
  });
}

function projectArticleLifecycle(input) {
  const value = input || {};
  const articles = array(value.articles);
  const trash = array(value.trash);
  const publicationByArticle = new Map();
  const itemsByArticle = new Map();
  const ordersByArticle = new Map();
  const attentionByArticle = new Map();
  const transactionsByArticle = new Map();
  const add = (map, item) => {
    const id = articleIdOf(item);
    if (!id) return;
    map.set(id, [...(map.get(id) || []), item]);
  };
  array(value.publications).forEach((item) => add(publicationByArticle, item));
  const submissionItems = array(value.submissionItems).length
    ? array(value.submissionItems)
    : array(value.submissionBatches).flatMap((batch) => array(batch.items).map((item) => Object.assign({ batchId: batch.id }, item)));
  submissionItems.forEach((item) => add(itemsByArticle, item));
  array(value.orders).forEach((item) => add(ordersByArticle, item));
  array(value.attentionItems).forEach((item) => add(attentionByArticle, item));
  array(value.removalTransactions).forEach((item) => add(transactionsByArticle, item));
  const byArticle = Object.create(null);
  const counts = Object.fromEntries(ARTICLE_LIFECYCLE_STAGES.map((stage) => [stage, 0]));
  const seen = new Set();
  function addArticle(article, deleted) {
    const id = articleIdOf(article);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const workflow = deriveArticleLifecycle({
      article: deleted ? Object.assign({ status: "trashed" }, article) : article,
      deleted,
      publications: publicationByArticle.get(id),
      submissionItems: itemsByArticle.get(id),
      orders: ordersByArticle.get(id),
      attentionItems: attentionByArticle.get(id),
      removalTransactions: transactionsByArticle.get(id),
    });
    byArticle[id] = workflow;
    counts[workflow.stage] += 1;
  }
  trash.forEach((record) => addArticle(record, true));
  articles.forEach((article) => addArticle(article, false));
  counts.total = seen.size;
  return Object.freeze({
    version: ARTICLE_LIFECYCLE_PROJECTION_VERSION,
    byArticle: Object.freeze(byArticle),
    counts: Object.freeze(counts),
  });
}

module.exports = {
  ARTICLE_LIFECYCLE_PROJECTION_VERSION,
  ARTICLE_LIFECYCLE_STAGES,
  REASON_MESSAGES,
  STAGE_LABELS,
  deriveArticleLifecycle,
  projectArticleLifecycle,
  targetKeyOf,
};
