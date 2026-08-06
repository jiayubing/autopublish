const {
  FAILURE_STATUSES,
  KNOWN_PUBLICATION_STATUSES,
  KNOWN_SUBMISSION_STATUSES,
  SUPPLIER_STATUSES,
  UNKNOWN_FACT_STATUS,
  activeMediaOrderFact,
  activePublicationFact,
  activeSubmissionFact,
  articleIdOf,
  array,
  isCompleteArticle,
  isKnownOrder,
  isMediaTarget,
  matchesOrderTarget,
  orderStatusOf,
  publicationLifecycleStatus,
  publicationSummary,
  rawStatusOf,
  submissionLifecycleStatus,
  targetFactsFor,
  targetKeyOf,
  text,
} = require("./article-lifecycle-facts");

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
  const mediaFacts = publications.filter(isMediaTarget).concat(submissionItems.filter(isMediaTarget));
  const hasPublished = publications.some((record, index) => publicationStatuses[index] === "published" && !isMediaTarget(record))
    || submissionItems.some((item, index) => submissionStatuses[index] === "published" && !isMediaTarget(item))
    || orders.some((order) => isKnownOrder(order) && (orderStatusOf(order) === "2" || text(order.publicationStatus) === "published"))
    || mediaFacts.some((fact) => publicationLifecycleStatus(fact) === "published"
      && orders.some((order) => isKnownOrder(order) && matchesOrderTarget(fact, order, mediaFacts, orders)));
  const hasUncertain = publicationStatuses.includes("uncertain") || submissionStatuses.includes("uncertain");
  const hasActivePublication = publications.some(activePublicationFact);
  const hasActiveSubmission = submissionItems.some(activeSubmissionFact);
  const hasPaidOrder = orders.some((order) => isKnownOrder(order) && ["0", "1"].includes(orderStatusOf(order)));
  const hasUnknownOrder = orders.some((order) => !isKnownOrder(order) || !SUPPLIER_STATUSES.has(orderStatusOf(order)));
  const hasUnknownPublicationStatus = publicationStatuses.some((status) => !KNOWN_PUBLICATION_STATUSES.has(status));
  const hasUnknownSubmissionStatus = submissionStatuses.some((status) => !KNOWN_SUBMISSION_STATUSES.has(status));
  const activeTargetKeys = new Set(
    publications.filter(activePublicationFact)
      .concat(submissionItems.filter(activeSubmissionFact))
      .concat(orders.filter(activeMediaOrderFact))
      .map(targetKeyOf)
      .filter(Boolean),
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
  else if (hasPaidOrder || (mediaFacts.some((fact) => ["submitted", "submitting"].includes(rawStatusOf(fact))) && orders.length > 0)) stage = "paid_processing";
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
  array(value.removalTransactions).forEach((transaction) => {
    const references = [transaction]
      .concat(array(transaction && transaction.selections))
      .concat(array(transaction && transaction.articles));
    const seenReferences = new Set();
    references.forEach((reference) => {
      const id = articleIdOf(reference);
      if (!id) return;
      const clientId = text(reference && reference.clientId);
      const referenceKey = clientId + "\0" + id;
      if (seenReferences.has(referenceKey)) return;
      seenReferences.add(referenceKey);
      const mapKey = referenceKey;
      transactionsByArticle.set(mapKey, [
        ...(transactionsByArticle.get(mapKey) || []),
        transaction,
      ]);
    });
  });
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
      removalTransactions: [...new Set([
        ...(transactionsByArticle.get(text(article && article.clientId) + "\0" + id) || []),
        ...(transactionsByArticle.get("\0" + id) || []),
      ])],
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
