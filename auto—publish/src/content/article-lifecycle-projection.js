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
  orderSummary,
  publicationLifecycleStatus,
  publicationSummary,
  rawStatusOf,
  submissionLifecycleStatus,
  targetFactsFor,
  targetKeyOf,
  text,
} = require("./article-lifecycle-facts");
const { canonicalArticleRefKey } = require("./article-ref");

const ARTICLE_LIFECYCLE_PROJECTION_VERSION = 2;
const ARTICLE_LIFECYCLE_STAGES = Object.freeze([
  "pending_submission",
  "needs_completion",
  "in_submission",
  "published",
  "trash",
]);
const STAGE_LABELS = Object.freeze({
  pending_submission: "待投稿",
  needs_completion: "待完善",
  in_submission: "投稿中",
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
  PUBLISHED_TRASH_CONFLICT: "已发布文章存在回收站冲突，需要人工核对。",
  PUBLICATION_UNCERTAIN: "投稿结果不确定，需要人工核对。",
  PUBLICATION_FAILED: "投稿明确失败，需要处理。",
  REMOVAL_REPAIR_REQUIRED: "文章删除事务需要修复。",
  ARTICLE_ATTENTION: "文章存在需要处理的事项。",
  PUBLICATION_STATUS_UNKNOWN: "投稿事实状态未知，需要人工核对。",
  SUBMISSION_STATUS_UNKNOWN: "投稿队列事实状态未知，需要人工核对。",
  MULTIPLE_ACTIVE_TARGETS: "文章存在多个活动投稿目标，需要人工核对。",
  ARTICLE_PUBLISHED_IMMUTABLE: "文章已有发布成功事实，已永久只读。",
  ARTICLE_OPERATION_FROZEN: "文章当前存在未结束的投稿事实，暂不能修改。",
  ARTICLE_IN_TRASH: "回收站文章不能直接执行当前操作。",
  ARTICLE_NOT_IN_TRASH: "文章当前不在回收站。",
  ARTICLE_RETARGET_NO_TARGET: "文章没有可结束后改投的目标。",
});
const TRASH_MUTATION_UNKNOWN_REASON_CODES = new Set([
  "ORDER_STATUS_UNKNOWN",
  "PUBLICATION_STATUS_UNKNOWN",
  "SUBMISSION_STATUS_UNKNOWN",
  "MEDIA_ORDER_MISSING",
]);

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

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
  return array(transactions).filter((transaction) =>
    removalTransactionMatchesArticle(transaction, article),
  );
}

function lifecycleStatusIsFrozen(status) {
  return status === UNKNOWN_FACT_STATUS || status === "uncertain";
}

function deriveArticleLifecycle(input) {
  const value = input || {};
  const article = value.article || {};
  const articleId = articleIdOf(article);
  const publications = array(value.publications).filter(
    (record) => articleIdOf(record) === articleId,
  );
  const submissionItems = array(value.submissionItems).filter(
    (item) => articleIdOf(item) === articleId,
  );
  const orders = array(value.orders).filter(
    (order) => articleIdOf(order) === articleId,
  );
  const attentionItems = array(value.attentionItems).filter(
    (item) => item && item.articleId === articleId,
  );
  const removalTransactions = removalTransactionsForArticle(
    value.removalTransactions,
    article,
  );
  const targetFacts = targetFactsFor(publications, submissionItems, orders);
  const publicationStatuses = publications.map(publicationLifecycleStatus);
  const submissionStatuses = submissionItems.map(submissionLifecycleStatus);
  const orderStatuses = orders.map(orderStatusOf);
  const attentionCount = attentionItems.length;
  const currentOrderSummary = orderSummary(orders);
  const cancelledTargetKeys = new Set(
    Object.entries(targetFacts)
      .filter(([, fact]) => fact.status === "cancelled")
      .map(([targetKey]) => targetKey),
  );
  const failureBelongsToCancelledTarget = (fact) => {
    const targetKey = targetKeyOf(fact);
    return targetKey !== null && cancelledTargetKeys.has(targetKey);
  };
  const mediaFacts = publications
    .filter(isMediaTarget)
    .concat(submissionItems.filter(isMediaTarget));
  const hasPublished =
    publications.some(
      (record, index) =>
        publicationStatuses[index] === "published" && !isMediaTarget(record),
    ) ||
    submissionItems.some(
      (item, index) =>
        submissionStatuses[index] === "published" && !isMediaTarget(item),
    ) ||
    orders.some(
      (order) =>
        isKnownOrder(order) &&
        (orderStatusOf(order) === "2" || text(order.publicationStatus) === "published"),
    ) ||
    mediaFacts.some(
      (fact) =>
        publicationLifecycleStatus(fact) === "published" &&
        orders.some((order) =>
          isKnownOrder(order) &&
          matchesOrderTarget(fact, order, mediaFacts, orders),
        ),
    );
  const hasUncertain =
    publicationStatuses.includes("uncertain") ||
    submissionStatuses.includes("uncertain");
  const hasActivePublication = publications.some(activePublicationFact);
  const hasActiveSubmission = submissionItems.some(activeSubmissionFact);
  // Orders in this projection are website-media lifecycle facts. Keep the
  // freeze keyed by the order's trusted identity and supplier state even when
  // a legacy/malformed observation lost its target fields; otherwise the
  // article could be edited and submitted again while an order is active.
  const hasActiveOrder = orders.some(
    (order) => isKnownOrder(order) && ["0", "1"].includes(orderStatusOf(order)),
  );
  const hasUnknownOrderFor = (order) => {
    const status = orderStatusOf(order);
    return (
      !isKnownOrder(order) ||
      (!SUPPLIER_STATUSES.has(status) && status !== "cancelled")
    );
  };
  const hasUnknownOrder = orders.some(hasUnknownOrderFor);
  const hasUnknownPublicationStatus = publicationStatuses.some(
    (status) => !KNOWN_PUBLICATION_STATUSES.has(status),
  );
  const hasUnknownSubmissionStatus = submissionStatuses.some(
    (status) => !KNOWN_SUBMISSION_STATUSES.has(status),
  );
  const activeTargetKeys = new Set(
    publications
      .filter((record, index) =>
        activePublicationFact(record) ||
        lifecycleStatusIsFrozen(publicationStatuses[index]),
      )
      .concat(
        submissionItems.filter((item, index) =>
          activeSubmissionFact(item) ||
          lifecycleStatusIsFrozen(submissionStatuses[index]),
        ),
      )
      .concat(
        orders.filter(
          (order) => activeMediaOrderFact(order) || !isKnownOrder(order) || hasUnknownOrderFor(order),
        ),
      )
      .map(targetKeyOf)
      .filter(Boolean),
  );
  const hasMultipleActiveTargets = activeTargetKeys.size > 1;
  const hasMissingMediaOrder = mediaFacts.some(
    (fact) =>
      ["queued", "remote_started", "paid_processing", "published"].includes(
        rawStatusOf(fact),
      ) &&
      !orders.some((order) =>
        matchesOrderTarget(fact, order, mediaFacts, orders),
      ),
  );
  const hasRepair = removalTransactions.some(
    (transaction) =>
      transaction.status === "needs_repair" || transaction.phase === "needs_repair",
  );
  const explicitFailure =
    publications.some(
      (record, index) =>
        FAILURE_STATUSES.has(publicationStatuses[index]) &&
        publicationStatuses[index] !== "uncertain" &&
        !failureBelongsToCancelledTarget(record),
    ) ||
    submissionItems.some(
      (item, index) =>
        FAILURE_STATUSES.has(submissionStatuses[index]) &&
        submissionStatuses[index] !== "uncertain" &&
        !failureBelongsToCancelledTarget(item),
    );
  const hasRejectedOrder = orderStatuses.includes("4");
  const hasAfterSalesOrder = orderStatuses.includes("9");
  const hasFrozenFacts =
    hasUncertain ||
    hasUnknownOrder ||
    hasUnknownPublicationStatus ||
    hasUnknownSubmissionStatus ||
    hasMissingMediaOrder ||
    hasMultipleActiveTargets ||
    hasRepair ||
    hasActivePublication ||
    hasActiveSubmission ||
    hasActiveOrder;
  const isTrash = ["trash", "trashed"].includes(text(article.status)) || value.deleted === true;
  const trashConflict = isTrash && (hasPublished || hasFrozenFacts);
  const reasonCodes = [];

  if (!isTrash && !isCompleteArticle(article))
    reasonCodes.push("ARTICLE_CONTENT_INCOMPLETE");
  if (hasMissingMediaOrder) reasonCodes.push("MEDIA_ORDER_MISSING");
  if (hasUnknownOrder) reasonCodes.push("ORDER_STATUS_UNKNOWN");
  if (hasUnknownPublicationStatus)
    reasonCodes.push("PUBLICATION_STATUS_UNKNOWN");
  if (hasUnknownSubmissionStatus)
    reasonCodes.push("SUBMISSION_STATUS_UNKNOWN");
  if (hasMultipleActiveTargets) reasonCodes.push("MULTIPLE_ACTIVE_TARGETS");
  if (hasRejectedOrder && !hasPublished) reasonCodes.push("ORDER_REJECTED");
  if (hasAfterSalesOrder && !hasPublished)
    reasonCodes.push("ORDER_AFTER_SALES");
  if (hasUncertain) reasonCodes.push("PUBLICATION_UNCERTAIN");
  if (explicitFailure && !hasRejectedOrder && !hasPublished)
    reasonCodes.push("PUBLICATION_FAILED");
  if (hasRepair) reasonCodes.push("REMOVAL_REPAIR_REQUIRED");
  if (trashConflict) {
    reasonCodes.push(
      hasPublished ? "PUBLISHED_TRASH_CONFLICT" : "TRASH_ACTIVE_CONFLICT",
    );
  }
  if (attentionCount > 0) reasonCodes.push("ARTICLE_ATTENTION");

  const frozen = hasFrozenFacts || trashConflict;
  const complete = isCompleteArticle(article);
  const canEdit = !isTrash && !hasPublished && !frozen;
  const canSubmit = !isTrash && !hasPublished && !frozen && complete;
  const canTrash = !isTrash && !hasPublished && !frozen;
  const canRestore = isTrash && !trashConflict;
  const canPurge = isTrash && !trashConflict;
  const canCancel =
    !isTrash &&
    !hasPublished &&
    Object.values(targetFacts).some((fact) => fact.canCancel === true);
  let stage = "pending_submission";
  if (isTrash) stage = "trash";
  else if (hasPublished) stage = "published";
  else if (frozen) stage = "in_submission";
  else if (!complete) stage = "needs_completion";
  const safeMetadata = Object.freeze({
    articleId,
    stage,
    targetKeys: Object.freeze(Object.keys(targetFacts).sort()),
    hasPublished,
    hasActiveTarget: hasActivePublication || hasActiveSubmission || hasActiveOrder,
    hasUncertain,
    isTrash,
    attentionCount,
    orderStatus: currentOrderSummary.status,
  });

  const operationReasons = (action, allowed) => {
    if (allowed) return [];
    if (hasPublished) return ["ARTICLE_PUBLISHED_IMMUTABLE"];
    if (action === "restore" || action === "purge") {
      if (!isTrash) return ["ARTICLE_NOT_IN_TRASH"];
      if (trashConflict) return unique(reasonCodes);
      return ["ARTICLE_OPERATION_FROZEN"];
    }
    if (isTrash) return ["ARTICLE_IN_TRASH"];
    if (reasonCodes.length) return unique(reasonCodes);
    return ["ARTICLE_OPERATION_FROZEN"];
  };

  const operation = (action, allowed) =>
    Object.freeze({
      allowed,
      reasonCodes: Object.freeze(operationReasons(action, allowed)),
      safeMetadata,
    });
  const submitOperation = operation("submit", canSubmit);
  const retargetAllowed = Boolean(
    !hasPublished &&
    !isTrash &&
    !frozen &&
    complete &&
    Object.keys(targetFacts).length,
  );
  const retargetOperation = Object.freeze({
    allowed: retargetAllowed,
    reasonCodes: Object.freeze(
      retargetAllowed
        ? []
        : !Object.keys(targetFacts).length
          ? ["ARTICLE_RETARGET_NO_TARGET"]
          : operationReasons("retarget", false),
    ),
    safeMetadata,
  });
  const primaryAction =
    stage === "trash"
      ? "restore"
      : stage === "published"
        ? "view_publication"
        : stage === "in_submission"
          ? "view_submission"
          : stage === "needs_completion"
            ? "edit"
            : "submit";
  const allowedBulkActions =
    stage === "trash"
      ? ["restore"]
      : stage === "published"
        ? ["view_publication"]
        : stage === "in_submission"
          ? ["view_submission"]
          : stage === "needs_completion"
            ? ["edit"]
            : ["submit"];
  const operations = Object.freeze({
    edit: operation("edit", canEdit),
    submit: submitOperation,
    // These two fields are a bounded migration seam for the existing regular
    // admission and retry callers. They are derived from the same submit and
    // target policy, and are removed with the old article-management UI in
    // 26-H; no caller may make an independent decision from them.
    queue: submitOperation,
    retarget: retargetOperation,
    trash: operation("trash", canTrash),
    restore: operation("restore", canRestore),
    purge: operation("purge", canPurge),
  });
  const locks = Object.freeze({
    canEdit,
    canSubmit,
    // Short-term derived field for direct pre-26-H consumers. It is exactly
    // the submit decision and is not a second lifecycle state.
    canQueue: canSubmit,
    canCancel,
    canTrash,
  });
  return Object.freeze({
    version: ARTICLE_LIFECYCLE_PROJECTION_VERSION,
    stage,
    label: STAGE_LABELS[stage],
    primaryAction,
    allowedBulkActions: Object.freeze(allowedBulkActions),
    locks,
    operations,
    reasonCodes: Object.freeze(unique(reasonCodes)),
    reasonMessage: REASON_MESSAGES[reasonCodes[0]] || null,
    attentionCount,
    orderSummary: Object.freeze(currentOrderSummary),
    publicationSummary: Object.freeze(
      publicationSummary(publications, orders, submissionItems),
    ),
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
    : array(value.submissionBatches).flatMap((batch) =>
        array(batch.items).map((item) => Object.assign({ batchId: batch.id }, item)),
      );
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
      transactionsByArticle.set(referenceKey, [
        ...(transactionsByArticle.get(referenceKey) || []),
        transaction,
      ]);
    });
  });
  const byArticle = Object.create(null);
  const attentionCounts = Object.create(null);
  const orderSummaries = Object.create(null);
  const counts = Object.fromEntries(
    ARTICLE_LIFECYCLE_STAGES.map((stage) => [stage, 0]),
  );
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
      removalTransactions: [
        ...new Set([
          ...(text(article && article.clientId)
            ? transactionsByArticle.get(
                canonicalArticleRefKey({
                  clientId: text(article && article.clientId),
                  articleId: id,
                }),
              ) || []
            : []),
          ...(transactionsByArticle.get("\0" + id) || []),
        ]),
      ],
    });
    byArticle[id] = workflow;
    attentionCounts[id] = workflow.attentionCount;
    orderSummaries[id] = workflow.orderSummary;
    counts[workflow.stage] += 1;
  }
  trash.forEach((record) => addArticle(record, true));
  articles.forEach((article) => addArticle(article, false));
  counts.total = seen.size;
  return Object.freeze({
    version: ARTICLE_LIFECYCLE_PROJECTION_VERSION,
    byArticle: Object.freeze(byArticle),
    counts: Object.freeze(counts),
    attentionCounts: Object.freeze(attentionCounts),
    orderSummaries: Object.freeze(orderSummaries),
  });
}

function trashedArticleMutationBlockReason(workflow, removalTransactions) {
  const metadata =
    (workflow && workflow.operations && workflow.operations.edit &&
      workflow.operations.edit.safeMetadata) || {};
  const unknownReason = array(workflow && workflow.reasonCodes).find((code) =>
    TRASH_MUTATION_UNKNOWN_REASON_CODES.has(code),
  );
  const openRemoval = array(removalTransactions).some(
    (transaction) =>
      !["committed", "superseded"].includes(transaction.status) &&
      transaction.phase !== "committed",
  );
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
