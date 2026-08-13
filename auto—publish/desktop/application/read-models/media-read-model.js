"use strict";

const MEDIA_RESOURCE_TYPES = Object.freeze([
  "image",
  "video",
  "audio",
  "document",
]);

function finiteMediaPrice(value) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100000000
    ? value
    : undefined;
}

function projectMediaResource(value) {
  const resource = value || {};
  const type = MEDIA_RESOURCE_TYPES.includes(resource.type)
    ? resource.type
    : "image";
  const result = {
    resourceId: String(
      resource.resourceId || resource.id || resource.resource_id || "",
    ),
    name: String(
      resource.name || resource.title || resource.resourceName || "",
    ),
    price:
      finiteMediaPrice(resource.price) === undefined
        ? null
        : finiteMediaPrice(resource.price),
    type,
    createdAt: String(resource.createdAt || resource.updatedAt || ""),
  };
  for (const key of ["url", "duration", "resolution", "size"])
    if (typeof resource[key] === "string") result[key] = resource[key];
  return result;
}

function projectMediaDraft(filename, value) {
  const draft = value || {};
  const result = {
    filename: String(filename || draft.filename || ""),
    title: String(draft.title || ""),
    remark: String(draft.remark || ""),
    ignoreImages: draft.ignoreImages === true,
    selectedResources: Array.isArray(draft.selectedResources)
      ? draft.selectedResources.map(projectMediaResource)
      : [],
  };
  if (typeof draft.updatedAt === "string") result.updatedAt = draft.updatedAt;
  return result;
}

function projectMediaArticleSummary(value) {
  const article = value || {};
  return {
    filename: String(article.filename || ""),
    title: String(article.title || ""),
    autoTitle: String(article.autoTitle || article.title || ""),
    remark: String(article.remark || ""),
    hasImages: article.hasImages === true,
    imageCount:
      Number.isSafeInteger(article.imageCount) && article.imageCount >= 0
        ? article.imageCount
        : 0,
    ignoreImages: article.ignoreImages === true,
    selectedResources: Array.isArray(article.selectedResources)
      ? article.selectedResources.map(projectMediaResource)
      : [],
  };
}

function projectMediaResourcePage(value) {
  const page = value || {};
  return {
    items: Array.isArray(page.items) ? page.items.map(projectMediaResource) : [],
    total: Number.isSafeInteger(page.total) && page.total >= 0 ? page.total : 0,
    page: Number.isSafeInteger(page.page) && page.page > 0 ? page.page : 1,
    pageSize:
      Number.isSafeInteger(page.pageSize) && page.pageSize > 0
        ? page.pageSize
        : 50,
    totalPages:
      Number.isSafeInteger(page.totalPages) && page.totalPages >= 0
        ? page.totalPages
        : 0,
    hasPrev: page.hasPrev === true,
    hasNext: page.hasNext === true,
  };
}

function projectMediaPoolPage(value) {
  const page = projectMediaResourcePage(value);
  page.memberResourceIds = Array.isArray(value && value.memberResourceIds)
    ? value.memberResourceIds
        .filter((resourceId) => typeof resourceId === "string")
        .slice(0, 100)
    : [];
  return page;
}

function projectMediaRefreshResult(value) {
  const result = value || {};
  return {
    status: result.truncated === true ? "truncated" : "complete",
    complete: result.complete === true,
    truncated: result.truncated === true,
    truncationReason:
      typeof result.truncationReason === "string"
        ? result.truncationReason
        : null,
    pageCount:
      Number.isSafeInteger(result.pageCount) && result.pageCount >= 0
        ? result.pageCount
        : 0,
    resourceCount:
      Number.isSafeInteger(result.resourceCount) && result.resourceCount >= 0
        ? result.resourceCount
        : 0,
    diagnostics: (Array.isArray(result.diagnostics)
      ? result.diagnostics
      : []
    ).map((value) => {
      const diagnostic = {
        code: String((value && value.code) || "MEDIA_RESOURCE_DIAGNOSTIC"),
      };
      for (const key of ["page", "count", "loadedCount"])
        if (Number.isSafeInteger(value && value[key]) && value[key] >= 0)
          diagnostic[key] = value[key];
      return diagnostic;
    }),
    refreshedAt: String(result.refreshedAt || new Date().toISOString()),
  };
}

function projectMediaOrder(value) {
  const order = value || {};
  return {
    title: String(order.title || ""),
    orderNid: String(order.orderNid || ""),
    statusCode: String(order.statusCode || ""),
    createdAt: String(order.createdAt || ""),
    submittedAt: String(order.submittedAt || ""),
    publishedAt: String(order.publishedAt || ""),
    resourceName: String(order.resourceName || ""),
    price: String(order.price || ""),
    actualAmount:
      order.actualAmount === null || order.actualAmount === undefined
        ? ""
        : String(order.actualAmount),
    hasPublishedUrl: order.hasPublishedUrl === true,
    anomaly:
      order.anomaly && typeof order.anomaly === "object"
        ? {
            reason: String(order.anomaly.reason || "order-missing"),
            openedAt: String(order.anomaly.openedAt || ""),
          }
        : null,
    cancellation:
      order.cancellation && typeof order.cancellation === "object"
        ? {
            orderId: String(order.cancellation.orderId || order.orderNid || ""),
            state: String(order.cancellation.state || "none"),
            cancellationAttemptId:
              order.cancellation.cancellationAttemptId || null,
            outcome: order.cancellation.outcome || null,
            actionLabel: order.cancellation.actionLabel || null,
            riskCode: order.cancellation.riskCode || null,
            manualResolutionRequired:
              order.cancellation.manualResolutionRequired === true,
          }
        : null,
  };
}

module.exports = {
  MEDIA_RESOURCE_TYPES,
  finiteMediaPrice,
  projectMediaResource,
  projectMediaDraft,
  projectMediaArticleSummary,
  projectMediaResourcePage,
  projectMediaPoolPage,
  projectMediaRefreshResult,
  projectMediaOrder,
};
