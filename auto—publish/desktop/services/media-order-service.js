const fs = require("fs");
const path = require("path");
const { resolveStorePath } = require("../../src/platforms/media/store-paths");

var STATUS_LABELS = {
  0: "待安排",
  1: "已安排",
  2: "已发布",
  4: "已退稿",
  9: "售后中",
  queued: "排队中",
  submitting: "提交中",
  submitted: "已提交",
  published: "已发布",
  uncertain: "待确认",
  failed: "失败",
};

function resolveWorkspaceRoot(options) {
  var paths = options.paths || {};
  return (
    options.workspaceRoot ||
    paths.workspaceRoot ||
    paths.contentLibrary ||
    paths.root ||
    (paths.data ? path.resolve(paths.data, "..", "..") : null) ||
    (paths.submissionRecords
      ? path.resolve(paths.submissionRecords, "..", "..")
      : null) ||
    null
  );
}

function createMediaOrderService(opts) {
  var options = opts || {};
  var operationalStore = options.operationalStore || null;
  var storePath =
    options.storePath ||
    (options.paths && options.paths.data
      ? path.join(options.paths.data, "submission-orders.jsonl")
      : resolveStorePath(options, "submission-orders.jsonl"));
  var clientProvider =
    typeof options.clientProvider === "function"
      ? options.clientProvider
      : null;
  var workspaceRoot = resolveWorkspaceRoot(options);
  var publicationLedger = options.publicationLedger || null;
  var openExternal =
    typeof options.openExternal === "function" ? options.openExternal : null;

  function listOrders() {
    if (
      operationalStore &&
      typeof operationalStore.listRemoteOrders === "function"
    )
      return operationalStore.listRemoteOrders();
    var orders = [];
    if (!fs.existsSync(storePath)) return orders;
    var raw = fs.readFileSync(storePath, "utf-8").trim();
    if (!raw) return orders;
    raw.split("\n").forEach(function (line) {
      try {
        orders.push(JSON.parse(line));
      } catch (_) {}
    });
    return orders;
  }

  function listOrderViews() {
    if (
      operationalStore &&
      typeof operationalStore.listRemoteOrders === "function"
    ) {
      var snapshots = submissionSnapshotsByAttempt(operationalStore);
      return listOrders().map(function (order) {
        return toOperationalOrderView(
          order,
          snapshots.get(String(order.attemptId || "")),
        );
      });
    }
    return listOrders().map(function (record) {
      return toOrderView(record, publicationLedger);
    });
  }

  async function syncOrder(orderNid) {
    var client = clientProvider ? clientProvider() : null;
    if (!client) {
      var configError = new Error("付费媒体配置未设置");
      configError.code = "MEDIA_CONFIG_NOT_SET";
      throw configError;
    }
    var response = await client.orderInfo(orderNid);
    // The phase-3 production path owns order state in OperationalStore. A
    // later reconciliation command will turn this remote observation into a
    // durable outcome; never mutate the retired JSONL history here.
    if (operationalStore) {
      var item = firstOrderItem(response);
      var status = mapOrderStatus(response);
      var remoteStatusCode = supplierOrderStatusCode(response);
      var outcome =
        status === "published"
          ? {
              status,
              remoteUrl: item.order_url || item.orderUrl,
              ...(remoteStatusCode ? { remoteStatusCode } : {}),
            }
          : status === "failed"
            ? {
                status,
                error: { code: "MEDIA_ORDER_REJECTED" },
                ...(remoteStatusCode ? { remoteStatusCode } : {}),
              }
            : status === "submitted"
              ? {
                  status,
                  ...(remoteStatusCode ? { remoteStatusCode } : {}),
                }
              : {
                  status: "uncertain",
                  error: { code: "MEDIA_ORDER_STATUS_UNKNOWN" },
                  ...(remoteStatusCode ? { remoteStatusCode } : {}),
                };
      try {
        operationalStore.reconcileRemoteOrder({
          orderId: String(orderNid),
          outcome,
        });
      } catch (_) {
        /* evidence gaps remain safely visible in existing state */
      }
      return response;
    }
    updateLocalOrderRecord(storePath, orderNid, response);
    var localRecord = findOrderRecord(storePath, orderNid);
    if (publicationLedger && localRecord) {
      syncPublicationFromOrder(publicationLedger, localRecord, response);
      updateLocalOrderPublication(
        storePath,
        orderNid,
        publicationLedger,
        localRecord,
      );
    }
    return response;
  }

  async function openPublishedUrl(orderNid) {
    var order = listOrders().find(function (item) {
      return (
        String(item && (item.orderNid || item.orderId || "")) ===
        String(orderNid || "")
      );
    });
    if (
      !order ||
      supplierStatusOrFallback(order.remoteStatusCode, order.status) !== "2"
    )
      throw orderError("MEDIA_ORDER_NOT_PUBLISHED");
    var url = safePublishedUrl(order.remoteUrl);
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
    storePath: storePath,
    listOrders: listOrders,
    listOrderViews: listOrderViews,
    syncOrder: syncOrder,
    openPublishedUrl: openPublishedUrl,
  };
}

function orderError(code) {
  var error = new Error(code);
  error.code = code;
  return error;
}

function safePublishedUrl(value) {
  if (typeof value !== "string" || !value || value.length > 2048) return null;
  try {
    var url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch (_) {
    return null;
  }
}

function submissionSnapshotsByAttempt(operationalStore) {
  var snapshots = new Map();
  if (
    !operationalStore ||
    typeof operationalStore.listSubmissionBatches !== "function"
  )
    return snapshots;
  var batches;
  try {
    batches = operationalStore.listSubmissionBatches();
  } catch (_) {
    return snapshots;
  }
  (batches || []).forEach(function (batch) {
    ((batch && batch.items) || []).forEach(function (item) {
      var payload = (item && item.payload) || {};
      if (typeof payload.attemptId === "string" && payload.attemptId)
        snapshots.set(payload.attemptId, payload);
    });
  });
  return snapshots;
}

function toOperationalOrderView(order, snapshot) {
  var value = order || {};
  var display = snapshot || {};
  var quotedPrice =
    typeof display.quotedPrice === "number" &&
    Number.isFinite(display.quotedPrice) &&
    display.quotedPrice >= 0
      ? String(display.quotedPrice)
      : "";
  var statusCode = supplierStatusOrFallback(
    value.remoteStatusCode,
    value.status,
  );
  return {
    title:
      typeof display.titleSnapshot === "string" ? display.titleSnapshot : "",
    filename: typeof display.filename === "string" ? display.filename : "",
    orderNid: String(value.orderNid || value.orderId || ""),
    statusCode: statusCode,
    statusLabel: STATUS_LABELS[statusCode] || "未知",
    submittedAt: formatTimestamp(value.createdAt),
    publishedAt:
      value.status === "published" ? formatTimestamp(value.createdAt) : "",
    resourceId: String(value.mediaResourceId || ""),
    resourceName:
      typeof display.resourceNameSnapshot === "string"
        ? display.resourceNameSnapshot
        : "",
    price: quotedPrice,
    orderUrl: value.remoteUrl || "",
    publicationId: value.publicationId || "",
    attemptId: value.attemptId || "",
    publicationStatus: value.status || "",
    raw: value,
  };
}

function supplierStatusOrFallback(remoteStatusCode, publicationStatus) {
  var code = String(remoteStatusCode == null ? "" : remoteStatusCode);
  if (["0", "1", "2", "4", "9"].includes(code)) return code;
  if (publicationStatus === "published") return "2";
  if (publicationStatus === "failed") return "4";
  if (publicationStatus === "uncertain") return "9";
  return "0";
}

function toOrderView(record, publicationLedger) {
  var params = (record && record.params) || {};
  var result = (record && record.result) || {};
  var data = result.data || {};
  var nested = (data.result && data.result.data) || {};
  var syncRaw = result.syncRaw || {};
  var syncItem = firstSyncItem(syncRaw) || {};
  var title =
    params.title ||
    data.title ||
    (data.article && data.article.title) ||
    syncItem.title ||
    "";
  var filename = fileNameFromPath(
    params.content_file ||
      data.content_file ||
      (data.article && data.article.filePath) ||
      "",
  );
  var orderNid =
    params.order_nid ||
    data.orderNid ||
    data.order_nid ||
    nested.order_nid ||
    syncItem.order_nid ||
    "";
  var statusCode = String(
    result.syncStatus != null
      ? result.syncStatus
      : syncItem.status != null
        ? syncItem.status
        : "",
  );
  var submittedAt = formatTimestamp(
    record.ts ||
      data.submittedAt ||
      data.submitted_at ||
      result.submittedAt ||
      "",
  );
  var publishedAt = formatTimestamp(
    result.syncedAt ||
      data.publishedAt ||
      data.published_at ||
      syncItem.published_at ||
      "",
  );
  var resourceId = String(
    params.resource_id ||
      data.resourceId ||
      data.resource_id ||
      (data.resource && data.resource.resourceId) ||
      syncItem.resource_id ||
      "",
  );
  var resourceName =
    params.resource_name ||
    data.resourceName ||
    (data.resource && data.resource.name) ||
    syncItem.resource_name ||
    syncItem.title ||
    "";
  var price = firstDefined(
    data.price,
    data.resource && data.resource.price,
    syncItem.price,
    "",
  );
  var orderUrl = firstDefined(
    syncItem.order_url,
    data.orderUrl,
    data.order_url,
    "",
  );
  var publicationId = String(
    (record && record.publicationId) ||
      data.publicationId ||
      params.publication_id ||
      "",
  );
  var attemptId = String(
    (record && record.attemptId) || data.attemptId || params.attempt_id || "",
  );
  var publicationStatus =
    result.publicationStatus || data.publicationStatus || "";
  if (publicationLedger && publicationId) {
    try {
      publicationStatus = publicationLedger.get(publicationId).status;
    } catch (_) {}
  }
  if (!statusCode && publicationStatus) statusCode = publicationStatus;

  return {
    title: title,
    filename: filename,
    orderNid: String(orderNid || ""),
    statusCode: statusCode,
    statusLabel:
      STATUS_LABELS[String(statusCode)] ||
      (statusCode ? "状态码:" + statusCode : "未知"),
    submittedAt: submittedAt,
    publishedAt: publishedAt,
    resourceId: String(resourceId || ""),
    resourceName: resourceName,
    price: price == null ? "" : String(price),
    orderUrl: orderUrl || "",
    publicationId: publicationId,
    attemptId: attemptId,
    publicationStatus: publicationStatus,
    raw: record,
  };
}

function firstSyncItem(syncRaw) {
  if (!syncRaw || !Array.isArray(syncRaw.data) || !syncRaw.data.length)
    return null;
  return syncRaw.data[0] || null;
}

function firstDefined() {
  for (var i = 0; i < arguments.length; i++) {
    if (
      arguments[i] !== undefined &&
      arguments[i] !== null &&
      arguments[i] !== ""
    )
      return arguments[i];
  }
  return "";
}

function fileNameFromPath(filePath) {
  if (!filePath) return "";
  return path.basename(String(filePath).replace(/\//g, path.sep));
}

function formatTimestamp(value) {
  if (!value) return "";
  var text = String(value).replace("T", " ");
  text = text.replace(/\.\d{3}Z$/, "");
  text = text.replace(/Z$/, "");
  return text;
}

function updateLocalOrderRecord(storePath, orderNid, response) {
  if (!fs.existsSync(storePath)) return;
  var raw = fs.readFileSync(storePath, "utf-8");
  var lines = raw.trim().split("\n");
  var updated = false;
  var newLines = lines.map(function (line) {
    if (!line.trim()) return line;
    try {
      var record = JSON.parse(line);
      var data = record.result && record.result.data;
      var nested = data && data.result && data.result.data;
      var knownOrderNid =
        record.orderNid ||
        (record.params &&
          (record.params.order_nid || record.params.orderNid)) ||
        (data && (data.orderNid || data.order_nid)) ||
        (nested && nested.order_nid);
      if (String(knownOrderNid) === String(orderNid)) {
        record.result = record.result || {};
        record.result.syncedAt = new Date().toISOString();
        record.result.syncRaw = response;
        updated = true;
        return JSON.stringify(record);
      }
    } catch (_) {}
    return line;
  });
  if (updated) fs.writeFileSync(storePath, newLines.join("\n") + "\n", "utf-8");
}

function findOrderRecord(storePath, orderNid) {
  if (!fs.existsSync(storePath)) return null;
  var lines = fs.readFileSync(storePath, "utf-8").split("\n");
  for (var i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].trim()) continue;
    try {
      var record = JSON.parse(lines[i]);
      var data = (record.result && record.result.data) || {};
      var nested = (data.result && data.result.data) || {};
      var knownOrderNid =
        record.orderNid ||
        (record.params &&
          (record.params.order_nid || record.params.orderNid)) ||
        data.orderNid ||
        data.order_nid ||
        nested.order_nid;
      if (String(knownOrderNid || "") === String(orderNid)) return record;
    } catch (_) {}
  }
  return null;
}

function firstOrderItem(response) {
  if (!response) return {};
  if (response.data && Array.isArray(response.data))
    return response.data[0] || {};
  if (response.data && Array.isArray(response.data.data))
    return response.data.data[0] || {};
  if (
    response.data &&
    response.data.data &&
    typeof response.data.data === "object"
  )
    return response.data.data;
  return response.data && typeof response.data === "object"
    ? response.data
    : {};
}

function mapOrderStatus(response) {
  var status = supplierOrderStatusCode(response);
  if (status === "2") return "published";
  if (status === "4") return "failed";
  if (status === "0" || status === "1") return "submitted";
  return "uncertain";
}

function supplierOrderStatusCode(response) {
  var item = firstOrderItem(response);
  var status =
    item.status !== undefined
      ? item.status
      : item.status_code !== undefined
        ? item.status_code
        : response && response.status;
  var code = String(status == null ? "" : status);
  return ["0", "1", "2", "4", "9"].includes(code) ? code : "";
}

function syncPublicationFromOrder(ledger, record, response) {
  var data = (record.result && record.result.data) || {};
  var publicationId =
    record.publicationId ||
    data.publicationId ||
    (record.params && record.params.publication_id);
  var attemptId =
    record.attemptId ||
    data.attemptId ||
    (record.params && record.params.attempt_id);
  if (!publicationId || !attemptId) return null;
  var current;
  try {
    current = ledger.get(String(publicationId));
  } catch (_) {
    return null;
  }
  var next = mapOrderStatus(response);
  if (
    current.status === next ||
    current.status === "published" ||
    current.status === "failed"
  )
    return current;
  var item = firstOrderItem(response);
  try {
    if (
      current.status === "uncertain" &&
      typeof ledger.reconcile === "function"
    ) {
      return ledger.reconcile(String(publicationId), {
        status: next,
        reasonCode:
          next === "published"
            ? "MEDIA_ORDER_CONFIRMED_PUBLISHED"
            : "MEDIA_ORDER_CONFIRMED_FAILED",
        remoteId: item.order_nid || item.orderNid || null,
        remoteUrl: item.order_url || item.orderUrl || null,
      });
    }
    return ledger.recordOutcome(String(publicationId), String(attemptId), {
      status: next,
      remoteId: item.order_nid || item.orderNid || null,
      remoteUrl: item.order_url || item.orderUrl || null,
      errorCode:
        next === "failed"
          ? "MEDIA_ORDER_REJECTED"
          : next === "uncertain"
            ? "MEDIA_ORDER_STATUS_UNKNOWN"
            : null,
    });
  } catch (_) {
    return current;
  }
}

function updateLocalOrderPublication(
  storePath,
  orderNid,
  ledger,
  originalRecord,
) {
  if (!fs.existsSync(storePath)) return;
  var raw = fs.readFileSync(storePath, "utf-8");
  var lines = raw.trim().split("\n");
  var updated = false;
  var data = (originalRecord.result && originalRecord.result.data) || {};
  var publicationId =
    originalRecord.publicationId ||
    data.publicationId ||
    (originalRecord.params && originalRecord.params.publication_id);
  var publication;
  try {
    publication = publicationId ? ledger.get(String(publicationId)) : null;
  } catch (_) {
    publication = null;
  }
  if (!publication) return;
  var nextLines = lines.map(function (line) {
    if (!line.trim()) return line;
    try {
      var record = JSON.parse(line);
      var recordData = (record.result && record.result.data) || {};
      var known =
        record.orderNid ||
        (record.params &&
          (record.params.order_nid || record.params.orderNid)) ||
        recordData.orderNid ||
        recordData.order_nid;
      if (String(known || "") !== String(orderNid)) return line;
      record.result = record.result || {};
      record.result.publicationStatus = publication.status;
      if (publication.status === "published")
        record.result.publishedAt = new Date().toISOString();
      updated = true;
      return JSON.stringify(record);
    } catch (_) {
      return line;
    }
  });
  if (updated)
    fs.writeFileSync(storePath, nextLines.join("\n") + "\n", "utf-8");
}

module.exports = { createMediaOrderService };
