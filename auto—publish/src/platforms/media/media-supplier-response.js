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

const MEDIA_RESPONSE_DIAGNOSTICS = Symbol("mediaResponseDiagnostics");
const RESOURCE_LIST_PATH = "/api/media/media_list";
const SAFE_FIELD = /^[A-Za-z0-9_.:-]{1,64}$/u;
const LIST_FIELD_NAMES = new Set([
  "data",
  "list",
  "rows",
  "items",
  "resources",
  "records",
  "result",
]);
const PAGINATION_FIELD_NAMES = new Set([
  "page",
  "page_size",
  "pageSize",
  "total",
  "total_count",
  "totalCount",
  "hasNext",
  "has_next",
  "hasMore",
  "has_more",
]);

class MediaSupplierProtocolError extends Error {
  constructor(message, response) {
    super(message || "媒体服务响应格式无效");
    this.name = "MediaSupplierProtocolError";
    this.code = "MEDIA_SUPPLIER_PROTOCOL_ERROR";
    if (response !== undefined) this.diagnostics = summarizeResourceResponse(response);
  }
}

class MediaSupplierRejectedError extends Error {
  constructor(scope, response) {
    super("媒体服务拒绝了请求");
    this.name = "MediaSupplierRejectedError";
    this.code = "MEDIA_SUPPLIER_REJECTED";
    this.scope = normalizeScope(scope);
    if (response !== undefined) this.diagnostics = summarizeResourceResponse(response);
  }
}

class MediaResourceNormalizationError extends Error {
  constructor(response) {
    super("媒体资源数据无法归一化");
    this.name = "MediaResourceNormalizationError";
    this.code = "MEDIA_RESOURCE_NORMALIZATION_FAILED";
    this.diagnostics = summarizeResourceResponse(response);
  }
}

function parseResourceResponse(response, request) {
  const entries = requireResourceSuccess(response);
  const values = request || {};
  const resources = entries
    .map((value) => normalizeResource(value, response));
  const page = positiveInteger(values.page, 1);
  const pageSize = positiveInteger(values.pageSize, resources.length || 20);
  const result = {
    resources,
    page,
    pageSize,
  };
  const total = firstValue(response, ["total", "total_count", "totalCount"]);
  if (total !== undefined)
    result.total = nonNegativeInteger(total, resources.length);
  const hasNext =
    firstValue(response, ["hasNext", "has_next", "hasMore", "has_more"]) ??
    firstValue(response && response.data, ["hasNext", "has_next", "hasMore", "has_more"]);
  if (typeof hasNext === "boolean") result.hasNext = hasNext;
  return result;
}

function requireResourceSuccess(response) {
  if (!response || typeof response !== "object" || Array.isArray(response))
    throw new MediaSupplierProtocolError(undefined, response);
  if (
    response.success === false ||
    response.ok === false ||
    isResourceFailureCode(response.code)
  )
    throw new MediaSupplierRejectedError(responseScope(response), response);
  if (response.code === undefined || !isResourceSuccessCode(response.code))
    throw new MediaSupplierProtocolError(undefined, response);
  if (!Array.isArray(response.data))
    throw new MediaSupplierProtocolError(undefined, response);
  return response.data;
}

function isResourceSuccessCode(value) {
  return value === 1 || value === "1";
}

function isResourceFailureCode(value) {
  return value === 0 || value === "0";
}

function parseCreatedOrderResponse(response) {
  const payload = requireSuccess(response, undefined, isOrderCreationSuccessCode);
  const orderId = findOrderId(payload);
  return orderId ? { orderId } : null;
}

function parseOrderDetailsResponse(response) {
  const payload = requireSuccess(response, undefined, isOrderDetailsSuccessCode);
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

function requireSuccess(response, defaultScope, successCode) {
  const accepts = successCode || isSuccessCode;
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new MediaSupplierProtocolError();
  }
  if (hasExplicitFailure(response, accepts)) {
    throw new MediaSupplierRejectedError(responseScope(response, defaultScope));
  }
  if (!hasExplicitSuccess(response, accepts)) {
    throw new MediaSupplierProtocolError();
  }
  return unwrapData(response);
}

function hasExplicitSuccess(response, successCode) {
  const accepts = successCode || isSuccessCode;
  if (response.success === true || response.ok === true) return true;
  return accepts(response.code) || accepts(response.status);
}

function hasExplicitFailure(response, successCode) {
  const accepts = successCode || isSuccessCode;
  if (response.success === false || response.ok === false) return true;
  if (response.data && typeof response.data === "object") {
    if (response.data.success === false || response.data.ok === false)
      return true;
  }
  if (response.code !== undefined && !accepts(response.code)) return true;
  if (
    response.status !== undefined &&
    isResponseStatus(response.status) &&
    !accepts(response.status)
  )
    return true;
  return false;
}

function isSuccessCode(value) {
  return value === 0 || value === "0" || value === 200 || value === "200";
}

function isOrderCreationSuccessCode(value) {
  return value === 1 || value === "1" || isSuccessCode(value);
}

function isOrderDetailsSuccessCode(value) {
  return value === 1 || value === "1" || isSuccessCode(value);
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

function normalizeResource(value, response) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new MediaResourceNormalizationError(response);
  const resourceId = text(
    firstValue(value, ["resourceId", "resource_id", "media_id", "nid", "id"]),
  );
  if (!resourceId) throw new MediaResourceNormalizationError(response);
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
    "status",
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

function attachResponseDiagnostics(response, diagnostics) {
  if (
    !response ||
    (typeof response !== "object" && typeof response !== "function")
  )
    return response;
  try {
    Object.defineProperty(response, MEDIA_RESPONSE_DIAGNOSTICS, {
      configurable: false,
      enumerable: false,
      value: Object.freeze({ ...(diagnostics || {}) }),
      writable: false,
    });
  } catch (_) {
    // A response returned by JSON.parse is extensible; this is only a
    // defensive fallback for injected transports and does not affect parsing.
  }
  return response;
}

function summarizeResourceResponse(response) {
  const transport =
    response && response[MEDIA_RESPONSE_DIAGNOSTICS] &&
    typeof response[MEDIA_RESPONSE_DIAGNOSTICS] === "object"
      ? response[MEDIA_RESPONSE_DIAGNOSTICS]
      : {};
  const root =
    response && typeof response === "object" && !Array.isArray(response)
      ? response
      : null;
  const data = root && Object.prototype.hasOwnProperty.call(root, "data")
    ? root.data
    : undefined;
  const summary = {};
  if (Number.isInteger(transport.status)) summary.httpStatus = transport.status;
  summary.endpointPath =
    typeof transport.path === "string" ? transport.path : RESOURCE_LIST_PATH;
  if (root) {
    const topLevelFields = fieldList(Object.keys(root));
    if (topLevelFields) summary.topLevelFields = topLevelFields;
    addControl(summary, "supplierCode", root.code);
    addControl(summary, "supplierStatus", root.status);
    addControl(summary, "supplierSuccess", root.success);
    addControl(summary, "supplierOk", root.ok);
  }
  summary.dataType = dataType(data);
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const dataFields = fieldList(Object.keys(data));
    if (dataFields) summary.dataFields = dataFields;
  }
  const candidateFields = candidateListFields(root, data);
  if (candidateFields) summary.candidateListFields = candidateFields;
  const paginationFields = fieldList(
    collectFieldNames([root, data]),
    PAGINATION_FIELD_NAMES,
  );
  if (paginationFields) summary.paginationFields = paginationFields;
  const itemCount = itemCountFor(data);
  if (itemCount !== null) summary.itemCount = itemCount;
  return Object.freeze(summary);
}

function dataType(value) {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return "other";
}

function fieldList(fields, allowed) {
  const result = [];
  const seen = new Set();
  let length = 0;
  for (const field of fields || []) {
    if (
      typeof field !== "string" ||
      !SAFE_FIELD.test(field) ||
      (allowed && !allowed.has(field)) ||
      seen.has(field)
    ) continue;
    const nextLength = length + (result.length ? 1 : 0) + field.length;
    if (nextLength > 128) break;
    seen.add(field);
    result.push(field);
    length = nextLength;
  }
  return result.length ? result.join(".") : null;
}

function collectFieldNames(values) {
  return (values || []).flatMap((value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.keys(value)
      : [],
  );
}

function candidateListFields(root, data) {
  const candidates = [];
  if (root && Array.isArray(root.data)) candidates.push("data");
  if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const key of Object.keys(data))
      if (LIST_FIELD_NAMES.has(key) && Array.isArray(data[key]))
        candidates.push("data." + key);
  }
  if (root) {
    for (const key of Object.keys(root))
      if (LIST_FIELD_NAMES.has(key) && Array.isArray(root[key]))
        candidates.push(key);
  }
  return fieldList(candidates);
}

function itemCountFor(data) {
  if (Array.isArray(data)) return data.length;
  if (!data || typeof data !== "object") return null;
  for (const key of LIST_FIELD_NAMES)
    if (Array.isArray(data[key])) return data[key].length;
  return null;
}

function addControl(summary, key, value) {
  if (value === undefined || value === null) return;
  if (typeof value === "boolean") {
    summary[key] = value ? "true" : "false";
    return;
  }
  const normalized = String(value).trim();
  if (/^[A-Za-z0-9._:-]{1,64}$/u.test(normalized)) summary[key] = normalized;
}

module.exports = {
  ORDER_STATUS_BY_CODE,
  MediaSupplierProtocolError,
  MediaSupplierRejectedError,
  MediaResourceNormalizationError,
  MEDIA_RESPONSE_DIAGNOSTICS,
  RESOURCE_LIST_PATH,
  attachResponseDiagnostics,
  summarizeResourceResponse,
  parseResourceResponse,
  parseCreatedOrderResponse,
  parseOrderDetailsResponse,
  parseCancelledOrderResponse,
  hasExplicitFailure,
};
