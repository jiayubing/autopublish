function createMediaOrderService(opts) {
  var options = opts || {};
  var operationalStore = options.operationalStore;
  if (!operationalStore) throw orderError("MEDIA_ORDER_STORE_REQUIRED");
  if (typeof operationalStore.listOrderDisplayViews !== "function")
    throw orderError("MEDIA_ORDER_PROJECTION_REQUIRED");

  var clientProvider =
    typeof options.clientProvider === "function" ? options.clientProvider : null;
  var openExternal =
    typeof options.openExternal === "function" ? options.openExternal : null;

  function listOrderViews() {
    return operationalStore.listOrderDisplayViews().map(toOperationalOrderView);
  }

  async function syncOrder(orderNid) {
    var client = clientProvider ? clientProvider() : null;
    if (!client) throw orderError("MEDIA_CONFIG_NOT_SET", "付费媒体配置未设置");
    try {
      var response = await client.orderInfo(orderNid);
      var item = firstOrderItem(response);
      var statusCode = supplierOrderStatusCode(response);
      if (
        !statusCode ||
        typeof operationalStore.recordRemoteOrderObservation !== "function"
      )
        throw orderError("MEDIA_ORDER_SYNC_FAILED");
      operationalStore.recordRemoteOrderObservation({
        orderId: String(orderNid),
        observation: {
          statusCode: statusCode,
          ...(statusCode === "2"
            ? { remoteUrl: item.order_url || item.orderUrl }
            : {}),
          ...(supplierPublishedAt(response)
            ? { publishedAt: supplierPublishedAt(response) }
            : {}),
        },
      });
    } catch (_) {
      throw orderError("MEDIA_ORDER_SYNC_FAILED");
    }
    return response;
  }

  async function openPublishedUrl(orderNid) {
    if (typeof operationalStore.listRemoteOrders !== "function")
      throw orderError("MEDIA_ORDER_STORE_REQUIRED");
    var order = operationalStore.listRemoteOrders().find(function (item) {
      return String(item && (item.orderNid || item.orderId || "")) === String(orderNid || "");
    });
    if (!order || String(order.status || "") !== "published")
      throw orderError("MEDIA_ORDER_NOT_PUBLISHED");
    var url = publishedUrlForOrder(order);
    if (!url) throw orderError("MEDIA_ORDER_URL_UNAVAILABLE");
    if (!openExternal) throw orderError("MEDIA_ORDER_OPEN_FAILED");
    try {
      await openExternal(url);
    } catch (_) {
      throw orderError("MEDIA_ORDER_OPEN_FAILED");
    }
    return { completed: true };
  }

  return {
    listOrderViews: listOrderViews,
    syncOrder: syncOrder,
    openPublishedUrl: openPublishedUrl,
  };
}

function orderError(code, message) {
  var error = new Error(message || code);
  error.code = code;
  return error;
}

function safePublishedUrl(value) {
  if (typeof value !== "string" || !value || value.length > 2048) return null;
  try {
    var url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    return url.href;
  } catch (_) {
    return null;
  }
}

function publishedUrlForOrder(order) {
  var value = order || {};
  var canonicalStatus = value.status || value.publicationStatus;
  return canonicalStatus === "published"
    ? safePublishedUrl(value.remoteUrl)
    : null;
}

function toOperationalOrderView(order) {
  var value = order || {};
  var quotedPrice =
    typeof value.quotedPrice === "number" &&
    Number.isFinite(value.quotedPrice) &&
    value.quotedPrice >= 0
      ? String(value.quotedPrice)
      : "";
  var statusCode = supplierStatusCode(value.supplierStatusCode);
  return {
    title: typeof value.titleSnapshot === "string" ? value.titleSnapshot : "",
    filename: typeof value.filename === "string" ? value.filename : "",
    orderNid: String(value.orderNid || value.orderId || ""),
    statusCode: statusCode || "",
    submittedAt: isoInstantOrEmpty(value.submittedAt || value.createdAt),
    publishedAt: isoInstantOrEmpty(value.publishedAt),
    resourceName:
      typeof value.resourceNameSnapshot === "string"
        ? value.resourceNameSnapshot
        : "",
    price: quotedPrice,
    hasPublishedUrl: Boolean(publishedUrlForOrder(value)),
  };
}

function supplierStatusCode(value) {
  var code = String(value == null ? "" : value);
  return ["0", "1", "2", "4", "9"].includes(code) ? code : "";
}

function isoInstantOrEmpty(value) {
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    return "";
  var timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function firstOrderItem(response) {
  if (!response) return {};
  if (response.data && Array.isArray(response.data)) return response.data[0] || {};
  if (response.data && Array.isArray(response.data.data))
    return response.data.data[0] || {};
  if (response.data && response.data.data && typeof response.data.data === "object")
    return response.data.data;
  return response.data && typeof response.data === "object" ? response.data : {};
}

function supplierOrderStatusCode(response) {
  var item = firstOrderItem(response);
  var status =
    item.status !== undefined
      ? item.status
      : item.status_code !== undefined
        ? item.status_code
        : response && response.status;
  return supplierStatusCode(status);
}

function supplierPublishedAt(response) {
  var item = firstOrderItem(response);
  var value =
    item.publishedAt || item.published_at || item.publication_published_at;
  if (typeof value !== "string" || value.length > 64) return "";
  var timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

module.exports = { createMediaOrderService };
