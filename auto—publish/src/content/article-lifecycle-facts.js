const UNKNOWN_FACT_STATUS = "unknown";
const ACTIVE_PUBLICATION_STATUSES = new Set([
  "queued",
  "remote_started",
  "paid_processing",
]);
const ACTIVE_SUBMISSION_STATUSES = new Set([
  "queued",
  "claimed",
  "remote_started",
  "reserving",
  "paid_processing",
]);
const FAILURE_STATUSES = new Set(["failed", "uncertain", "conflict"]);
const KNOWN_PUBLICATION_STATUSES = new Set([
  "queued",
  "remote_started",
  "published",
  "paid_processing",
  "uncertain",
  "failed",
  "cancelled",
]);
const KNOWN_SUBMISSION_STATUSES = new Set([
  "queued",
  "claimed",
  "reserving",
  "published",
  "remote_started",
  "paid_processing",
  "uncertain",
  "failed",
  "cancelled",
]);
const SUPPLIER_STATUSES = new Set(["0", "1", "2", "4", "9"]);
const SUMMARY_LABELS = Object.freeze({
  not_submitted: "未投稿",
  queued: "已入队",
  paid_processing: "付费处理中",
  partial: "部分发布",
  published: "已发布",
  uncertain: "待确认",
  failed: "失败",
});
const ORDER_SUMMARY_LABELS = Object.freeze({
  none: "无订单",
  processing: "付费处理中",
  published: "已发布",
  rejected: "已退稿",
  after_sales: "售后中",
  cancelled: "已取消",
  terminal: "订单已结束",
  unknown: "待核对",
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
  return text(value && (value.orderId || value.orderNid)).trim();
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
  return KNOWN_PUBLICATION_STATUSES.has(status) ? status : UNKNOWN_FACT_STATUS;
}

function submissionLifecycleStatus(value) {
  const rawStatus = rawStatusOf(value);
  if (rawStatus === "failed-cleaned") return "failed";
  if (rawStatus === "published-cleaned") return "published";
  if (rawStatus === "cancelled-cleaned") return "cancelled";
  if (rawStatus === "completed") {
    const outcome = text(value && (value.publicationStatus || value.outcomeStatus)).trim();
    if (!outcome) return UNKNOWN_FACT_STATUS;
    return KNOWN_SUBMISSION_STATUSES.has(outcome) ? outcome : UNKNOWN_FACT_STATUS;
  }
  const status = rawStatus || UNKNOWN_FACT_STATUS;
  return KNOWN_SUBMISSION_STATUSES.has(status) ? status : UNKNOWN_FACT_STATUS;
}

function activePublicationFact(value) {
  const status = rawStatusOf(value);
  return ACTIVE_PUBLICATION_STATUSES.has(status);
}

function activeSubmissionFact(value) {
  const status = rawStatusOf(value);
  return ACTIVE_SUBMISSION_STATUSES.has(status);
}

function activeMediaOrderFact(value) {
  return isKnownOrder(value) && isMediaTarget(value) && ["0", "1"].includes(orderStatusOf(value));
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
  const mediaFacts = array(records).filter(isMediaTarget).concat(array(submissionItems).filter(isMediaTarget)).filter((fact) => ["queued", "remote_started", "paid_processing", "published"].includes(rawStatusOf(fact)));
  const missingMediaOrder = mediaFacts.some((fact) => ["queued", "remote_started", "paid_processing", "published"].includes(rawStatusOf(fact))
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
  if (values.includes("remote_started")) return result("queued");
  if (values.includes("queued")) return result("queued");
  if (values.includes("claimed")) return result("queued");
  return result("failed");
}

function orderSummary(orders) {
  const values = array(orders);
  if (!values.length) {
    return {
      status: "none",
      label: ORDER_SUMMARY_LABELS.none,
      records: 0,
      active: 0,
      published: 0,
      attention: 0,
    };
  }
  const statuses = values.map(orderStatusOf);
  const active = statuses.filter((status) => ["0", "1"].includes(status)).length;
  const published = values.filter(
    (order) =>
      orderStatusOf(order) === "2" || text(order.publicationStatus) === "published",
  ).length;
  const unknown = values.filter((order, index) => {
    const status = statuses[index];
    return (
      !isKnownOrder(order) ||
      (!SUPPLIER_STATUSES.has(status) && status !== "cancelled")
    );
  }).length;
  const rejected = statuses.filter((status) => status === "4").length;
  const afterSales = statuses.filter((status) => status === "9").length;
  const cancelled = statuses.filter((status) => status === "cancelled").length;
  let status = "terminal";
  if (unknown > 0) status = "unknown";
  else if (published > 0) status = "published";
  else if (active > 0) status = "processing";
  else if (afterSales > 0) status = "after_sales";
  else if (rejected > 0) status = "rejected";
  else if (cancelled === values.length) status = "cancelled";
  return {
    status,
    label: ORDER_SUMMARY_LABELS[status],
    records: values.length,
    active,
    published,
    attention: unknown + rejected + afterSales,
  };
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

module.exports = {
  ACTIVE_PUBLICATION_STATUSES,
  ACTIVE_SUBMISSION_STATUSES,
  FAILURE_STATUSES,
  KNOWN_PUBLICATION_STATUSES,
  KNOWN_SUBMISSION_STATUSES,
  SUPPLIER_STATUSES,
  SUMMARY_LABELS,
  UNKNOWN_FACT_STATUS,
  ORDER_SUMMARY_LABELS,
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
};
