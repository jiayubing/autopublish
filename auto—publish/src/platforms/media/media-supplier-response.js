"use strict";

const ORDER_STATUS_BY_CODE = Object.freeze({
  0: "pending",
  1: "scheduled",
  2: "published",
  4: "rejected",
  9: "aftercare",
});

const SUPPLIER_SCOPES = new Set([
  "article",
  "resource",
  "account",
  "service",
  "order",
]);

class MediaSupplierProtocolError extends Error {
  constructor(message) {
    super(message || "媒体服务响应格式无效");
    this.name = "MediaSupplierProtocolError";
    this.code = "MEDIA_SUPPLIER_PROTOCOL_ERROR";
  }
}

class MediaSupplierRejectedError extends Error {
  constructor(scope) {
    super("媒体服务拒绝了请求");
    this.name = "MediaSupplierRejectedError";
    this.code = "MEDIA_SUPPLIER_REJECTED";
    this.scope = normalizeScope(scope);
  }
}

function parseResourceResponse(response, request) {
  const payload = isResourcePageEnvelope(response)
    ? response
    : requireSuccess(response);
  const values = request || {};
  const entries = extractItems(payload);
  const resources = entries
    .map(normalizeResource)
    .filter((resource) => resource !== null);
  const page = positiveInteger(values.page, 1);
  const pageSize = positiveInteger(values.pageSize, resources.length || 20);
  const result = {
    resources,
    page,
    pageSize,
    total: nonNegativeInteger(
      firstValue(payload, ["total", "total_count", "totalCount"]),
      resources.length,
    ),
  };
  const hasNext =
    firstValue(response, ["hasNext", "has_next", "hasMore", "has_more"]) ??
    firstValue(payload, ["hasNext", "has_next", "hasMore", "has_more"]);
  if (typeof hasNext === "boolean") result.hasNext = hasNext;
  return result;
}

function isResourcePageEnvelope(response) {
  return Boolean(
    response &&
    typeof response === "object" &&
    !Array.isArray(response) &&
    Array.isArray(response.data) &&
    !hasExplicitFailure(response) &&
    [
      "total",
      "total_count",
      "totalCount",
      "hasNext",
      "has_next",
      "hasMore",
      "has_more",
    ].some((key) => Object.prototype.hasOwnProperty.call(response, key)),
  );
}

function parseCreatedOrderResponse(response) {
  const payload = requireSuccess(response);
  const orderId = findOrderId(payload);
  return orderId ? { orderId } : null;
}

function parseOrderDetailsResponse(response) {
  const payload = requireSuccess(response);
  return extractItems(payload)
    .map(normalizeOrder)
    .filter((order) => order !== null);
}

function parseCancelledOrderResponse(response) {
  const payload = requireSuccess(response, "order");
  const data = unwrapData(payload);
  if (
    data &&
    (data.cancelled === false ||
      data.cancel_success === false ||
      data.cancelSuccess === false)
  ) {
    throw new MediaSupplierRejectedError("order");
  }
  return true;
}

function requireSuccess(response, defaultScope) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new MediaSupplierProtocolError();
  }
  if (hasExplicitFailure(response)) {
    throw new MediaSupplierRejectedError(responseScope(response, defaultScope));
  }
  if (!hasExplicitSuccess(response)) {
    throw new MediaSupplierProtocolError();
  }
  return unwrapData(response);
}

function hasExplicitSuccess(response) {
  if (response.success === true || response.ok === true) return true;
  return isSuccessCode(response.code) || isSuccessCode(response.status);
}

function hasExplicitFailure(response) {
  if (response.success === false || response.ok === false) return true;
  if (response.data && typeof response.data === "object") {
    if (response.data.success === false || response.data.ok === false)
      return true;
  }
  if (response.code !== undefined && !isSuccessCode(response.code)) return true;
  if (
    response.status !== undefined &&
    isResponseStatus(response.status) &&
    !isSuccessCode(response.status)
  )
    return true;
  return false;
}

function isSuccessCode(value) {
  return value === 0 || value === "0" || value === 200 || value === "200";
}

function isResponseStatus(value) {
  return (
    typeof value === "number" ||
    (typeof value === "string" && /^\d+$/.test(value))
  );
}

function unwrapData(response) {
  let value =
    response && response.data !== undefined ? response.data : response;
  if (
    value &&
    !Array.isArray(value) &&
    typeof value === "object" &&
    value.data !== undefined
  ) {
    value = value.data;
  }
  return value && typeof value === "object" ? value : {};
}

function extractItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const key of ["list", "items", "orders", "resources", "data"]) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  if (payload.data && typeof payload.data === "object")
    return extractItems(payload.data);
  if (
    firstValue(payload, [
      "orderId",
      "order_nid",
      "orderNid",
      "nid",
      "order_id",
      "resourceId",
      "resource_id",
      "media_id",
    ]) !== undefined
  ) {
    return [payload];
  }
  return [];
}

function normalizeResource(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const resourceId = text(
    firstValue(value, ["resourceId", "resource_id", "media_id", "nid", "id"]),
  );
  if (!resourceId) return null;
  const resource = {
    resourceId,
    name: text(
      firstValue(value, ["name", "title", "resource_name", "resourceName"]),
    ),
    price: price(firstValue(value, ["price", "unit_price", "unitPrice"])),
    available: availability(value),
    remarks: text(
      firstValue(value, ["remarks", "remark", "note", "description"]),
    ),
  };
  return resource;
}

function normalizeOrder(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const orderId = text(
    firstValue(value, [
      "orderId",
      "order_nid",
      "orderNid",
      "nid",
      "order_id",
      "id",
    ]),
  );
  if (!orderId) return null;
  const order = {
    orderId,
    status:
      ORDER_STATUS_BY_CODE[
        String(
          firstValue(value, [
            "status",
            "status_code",
            "statusCode",
            "order_status",
          ]),
        )
      ] || "unknown",
  };
  const resourceId = text(
    firstValue(value, [
      "resourceId",
      "resource_id",
      "media_id",
      "mediaResourceId",
    ]),
  );
  const title = text(
    firstValue(value, ["title", "title_snapshot", "titleSnapshot"]),
  );
  const systemSubmissionId = text(
    firstValue(value, [
      "systemSubmissionId",
      "system_submission_id",
      "third_id",
      "thirdId",
    ]),
  );
  const remoteUrl = text(
    firstValue(value, ["remoteUrl", "order_url", "orderUrl"]),
  );
  const publishedAt = text(firstValue(value, ["publishedAt", "published_at"]));
  const actualAmount = price(
    firstValue(value, [
      "actualAmount",
      "actual_amount",
      "paid_amount",
      "settled_amount",
    ]),
  );
  if (resourceId) order.resourceId = resourceId;
  if (title) order.title = title;
  if (systemSubmissionId) order.systemSubmissionId = systemSubmissionId;
  if (remoteUrl) order.remoteUrl = remoteUrl;
  if (publishedAt) order.publishedAt = publishedAt;
  if (actualAmount !== null) order.actualAmount = actualAmount;
  return order;
}

function findOrderId(value) {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const orderId = findOrderId(item);
      if (orderId) return orderId;
    }
    return "";
  }
  const direct = text(
    firstValue(value, ["orderId", "order_nid", "orderNid", "nid", "order_id"]),
  );
  if (direct) return direct;
  if (value.data && typeof value.data === "object")
    return findOrderId(value.data);
  return "";
}

function availability(value) {
  const candidate = firstValue(value, [
    "available",
    "is_available",
    "isAvailable",
    "is_open",
    "isOpen",
    "accepting_orders",
    "acceptingOrders",
    "enabled",
  ]);
  if (candidate === undefined) return true;
  if (candidate === true || candidate === 1 || candidate === "1") return true;
  if (candidate === false || candidate === 0 || candidate === "0") return false;
  return /^(?:true|open|available|accepting|enabled)$/iu.test(
    String(candidate).trim(),
  );
}

function price(value) {
  if (typeof value === "number")
    return Number.isFinite(value) && value >= 0 ? value : null;
  if (
    typeof value !== "string" ||
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.trim())
  )
    return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function firstValue(value, keys) {
  for (const key of keys) {
    if (value && value[key] !== undefined && value[key] !== null)
      return value[key];
  }
  return undefined;
}

function text(value) {
  if (value === undefined || value === null) return "";
  const normalized = String(value)
    .replace(/[\u0000-\u001f\u007f]/gu, "")
    .trim();
  return normalized.length <= 4096 ? normalized : normalized.slice(0, 4096);
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function nonNegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function responseScope(response, fallback) {
  const value =
    response &&
    (response.scope ||
      response.error_scope ||
      response.errorScope ||
      response.error_type);
  return normalizeScope(value, fallback);
}

function normalizeScope(value, fallback) {
  const normalized = String(value == null ? "" : value)
    .trim()
    .toLowerCase();
  return SUPPLIER_SCOPES.has(normalized) ? normalized : fallback || "service";
}

module.exports = {
  ORDER_STATUS_BY_CODE,
  MediaSupplierProtocolError,
  MediaSupplierRejectedError,
  parseResourceResponse,
  parseCreatedOrderResponse,
  parseOrderDetailsResponse,
  parseCancelledOrderResponse,
};
