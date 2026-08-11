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
const { canonicalArticleRefKey } = require("./article-ref");

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
  ARTICLE_PUBLISHED_IMMUTABLE: "文章已有发布成功事实，已永久只读。",
  ARTICLE_OPERATION_FROZEN: "文章当前存在未结束的投稿事实，暂不能修改。",
  ARTICLE_IN_TRASH: "回收站文章不能直接执行当前操作。",
  ARTICLE_RETARGET_NO_TARGET: "文章没有可结束后改投的目标。",
});
const TRASH_MUTATION_UNKNOWN_REASON_CODES = new Set([
  "ORDER_STATUS_UNKNOWN",
  "PUBLICATION_STATUS_UNKNOWN",
  "SUBMISSION_STATUS_UNKNOWN",
  "MEDIA_ORDER_MISSING",
]);

function articleRefKey(value) {
  const clientId = text(value && value.clientId);
  const articleId = articleIdOf(value);
  if (!clientId || !articleId) return null;
  try {
    return canonicalArticleRefKey({ clientId, articleId });
  } catch (_) {
    return clientId + "\u0000" + articleId;
  }
}

function removalTransactionMatchesArticle(transaction, article) {
  const articleId = articleIdOf(article);
  if (!articleId) return false;
  const targetKey = articleRefKey(article);
  const references = [transaction]
    .concat(array(transaction && transaction.selections))
    .concat(array(transaction && transaction.articles));
  return references.some((reference) => {
    if (articleIdOf(reference) !== articleId) return false;
    const referenceKey = articleRefKey(reference);
    if (targetKey && referenceKey) return targetKey === referenceKey;
    return !text(reference && reference.clientId) || !text(article && article.clientId);
  });
}

function removalTransactionsForArticle(transactions, article) {
  return array(transactions).filter((transaction) => removalTransactionMatchesArticle(transaction, article));
}

function deriveArticleLifecycle(input) {
  const value = input || {};
  const article = value.article || {};
  const articleId = articleIdOf(article);
  const publications = array(value.publications).filter((record) => articleIdOf(record) === articleId);
  const submissionItems = array(value.submissionItems).filter((item) => articleIdOf(item) === articleId);
  const orders = array(value.orders).filter((order) => articleIdOf(order) === articleId);
  const attentionItems = array(value.attentionItems).filter((item) => !item.articleId || item.articleId === articleId || item.archiveErrorCode);
  const removalTransactions = removalTransactionsForArticle(value.removalTransactions, article);
  const targetFacts = targetFactsFor(publications, submissionItems, orders);
  const publicationStatuses = publications.map(publicationLifecycleStatus);
  const submissionStatuses = submissionItems.map(submissionLifecycleStatus);
  const orderStatuses = orders.map(orderStatusOf);
  const cancelledTargetKeys = new Set(
    Object.entries(targetFacts)
      .filter(([, fact]) => fact.status === "cancelled")
      .map(([targetKey]) => targetKey),
  );
  const failureBelongsToCancelledTarget = (fact) => {
    const targetKey = targetKeyOf(fact);
    return targetKey !== null && cancelledTargetKeys.has(targetKey);
  };
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
  const hasUnknownOrder = orders.some((order) => {
    const status = orderStatusOf(order);
    return !isKnownOrder(order) || (!SUPPLIER_STATUSES.has(status) && status !== "cancelled");
  });
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
  const hasMissingMediaOrder = mediaFacts.some((fact) => ["queued", "remote_started", "paid_processing", "published"].includes(rawStatusOf(fact))
    && !orders.some((order) => matchesOrderTarget(fact, order, mediaFacts, orders)));
  const hasRepair = removalTransactions.some((transaction) => transaction.status === "needs_repair" || transaction.phase === "needs_repair");
  const explicitFailure = text(article.status) === "failed"
    || publications.some((record, index) => publicationStatuses[index] === "failed" && !failureBelongsToCancelledTarget(record))
    || submissionItems.some((item, index) => FAILURE_STATUSES.has(submissionStatuses[index]) && !failureBelongsToCancelledTarget(item));
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
  else if (hasPaidOrder) stage = "paid_processing";
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
  const targetKeys = Object.keys(targetFacts).sort();
  const safeMetadata = Object.freeze({
    articleId,
    stage,
    targetKeys: Object.freeze(targetKeys),
    hasPublished,
    hasActiveTarget: hasActivePublication || hasActiveSubmission || hasPaidOrder,
    hasUncertain,
    isTrash,
  });
  const operationReasons = function (action, allowed) {
    if (allowed) {
      if (action === "queue" && !isCompleteArticle(article)) return ["ARTICLE_CONTENT_INCOMPLETE"];
      return [];
    }
    if (hasPublished) return ["ARTICLE_PUBLISHED_IMMUTABLE"];
    if (isTrash) return ["ARTICLE_IN_TRASH"];
    if (action === "retarget" && !targetKeys.length) return ["ARTICLE_RETARGET_NO_TARGET"];
    if (reasonCodes.length) return [...new Set(reasonCodes)];
    return ["ARTICLE_OPERATION_FROZEN"];
  };
  const retargetAllowed = Boolean(
    !hasPublished &&
    !isTrash &&
    !frozenAttention &&
    isCompleteArticle(article) &&
    targetKeys.length,
  );
  const operations = Object.freeze({
    edit: Object.freeze({
      allowed: locks.canEdit === true,
      reasonCodes: Object.freeze(operationReasons("edit", locks.canEdit === true)),
      safeMetadata,
    }),
    queue: Object.freeze({
      allowed: locks.canQueue === true,
      reasonCodes: Object.freeze(operationReasons("queue", locks.canQueue === true && isCompleteArticle(article))),
      safeMetadata,
    }),
    retarget: Object.freeze({
      allowed: retargetAllowed,
      reasonCodes: Object.freeze(operationReasons("retarget", retargetAllowed)),
      safeMetadata,
    }),
    trash: Object.freeze({
      allowed: locks.canTrash === true,
      reasonCodes: Object.freeze(operationReasons("trash", locks.canTrash === true)),
      safeMetadata,
    }),
  });
  locks = Object.freeze({
    canEdit: operations.edit.allowed,
    canQueue: operations.queue.allowed,
    canCancel: locks.canCancel === true,
    canTrash: operations.trash.allowed,
  });
  return Object.freeze({
    version: ARTICLE_LIFECYCLE_PROJECTION_VERSION,
    stage,
    label: STAGE_LABELS[stage],
    primaryAction,
    allowedBulkActions: Object.freeze(allowedBulkActions),
    locks,
    operations,
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
      const referenceKey = clientId
        ? canonicalArticleRefKey({ clientId, articleId: id })
        : "\0" + id;
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
        ...(text(article && article.clientId)
          ? transactionsByArticle.get(canonicalArticleRefKey({ clientId: text(article && article.clientId), articleId: id })) || []
          : []),
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

function trashedArticleMutationBlockReason(workflow, removalTransactions) {
  const metadata = workflow && workflow.operations && workflow.operations.edit && workflow.operations.edit.safeMetadata || {};
  const unknownReason = array(workflow && workflow.reasonCodes).find(function (code) {
    return TRASH_MUTATION_UNKNOWN_REASON_CODES.has(code);
  });
  const openRemoval = array(removalTransactions).some(function (transaction) {
    return !["committed", "superseded"].includes(transaction.status) && transaction.phase !== "committed";
  });
  return metadata.hasPublished
    ? "ARTICLE_PUBLISHED_IMMUTABLE"
    : metadata.hasActiveTarget
      ? "ARTICLE_OPERATION_FROZEN"
      : metadata.hasUncertain
        ? "PUBLICATION_UNCERTAIN"
        : unknownReason
          ? unknownReason
          : openRemoval
            ? "ARTICLE_OPERATION_FROZEN"
            : null;
}

module.exports = {
  ARTICLE_LIFECYCLE_PROJECTION_VERSION,
  ARTICLE_LIFECYCLE_STAGES,
  REASON_MESSAGES,
  STAGE_LABELS,
  deriveArticleLifecycle,
  projectArticleLifecycle,
  removalTransactionMatchesArticle,
  removalTransactionsForArticle,
  trashedArticleMutationBlockReason,
  targetKeyOf,
};
