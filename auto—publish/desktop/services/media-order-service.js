const fs = require("fs");
const path = require("path");
const { MediaClient } = require("../../src/platforms/media/media-client");
const { resolveApiKey } = require("../../src/platforms/media/config");
const { resolveStorePath } = require("../../src/platforms/media/store-paths");

var STATUS_LABELS = {
  "0": "待审核",
  "1": "审核中",
  "2": "已发布",
  "3": "驳回",
  "4": "退款"
};

function createMediaOrderService(opts) {
  var options = opts || {};
  var storePath = options.storePath || (options.paths && options.paths.data
    ? path.join(options.paths.data, "submission-orders.jsonl")
    : resolveStorePath(options, "submission-orders.jsonl"));

  function listOrders() {
    var orders = [];
    if (!fs.existsSync(storePath)) return orders;
    var raw = fs.readFileSync(storePath, "utf-8").trim();
    if (!raw) return orders;
    raw.split("\n").forEach(function(line) {
      try { orders.push(JSON.parse(line)); } catch (_) {}
    });
    return orders;
  }

  function listOrderViews() {
    return listOrders().map(function(record) {
      return toOrderView(record);
    });
  }

  async function syncOrder(orderNid) {
    var client = new MediaClient({ apiKey: resolveApiKey(null) });
    var response = await client.orderInfo(orderNid);
    updateLocalOrderRecord(storePath, orderNid, response);
    return response;
  }

  return { storePath: storePath, listOrders: listOrders, listOrderViews: listOrderViews, syncOrder: syncOrder };
}

function toOrderView(record) {
  var params = record && record.params || {};
  var result = record && record.result || {};
  var data = result.data || {};
  var nested = data.result && data.result.data || {};
  var syncRaw = result.syncRaw || {};
  var syncItem = firstSyncItem(syncRaw) || {};
  var title = params.title || data.title || data.article && data.article.title || syncItem.title || "";
  var filename = fileNameFromPath(params.content_file || data.content_file || data.article && data.article.filePath || "");
  var orderNid = params.order_nid || data.orderNid || data.order_nid || nested.order_nid || syncItem.order_nid || "";
  var statusCode = String(result.syncStatus != null ? result.syncStatus : syncItem.status != null ? syncItem.status : "");
  var submittedAt = formatTimestamp(record.ts || data.submittedAt || data.submitted_at || result.submittedAt || "");
  var publishedAt = formatTimestamp(result.syncedAt || data.publishedAt || data.published_at || syncItem.published_at || "");
  var resourceId = String(params.resource_id || data.resourceId || data.resource_id || data.resource && data.resource.resourceId || syncItem.resource_id || "");
  var resourceName = params.resource_name || data.resourceName || data.resource && data.resource.name || syncItem.resource_name || syncItem.title || "";
  var price = firstDefined(data.price, data.resource && data.resource.price, syncItem.price, "");
  var orderUrl = firstDefined(syncItem.order_url, data.orderUrl, data.order_url, "");

  return {
    title: title,
    filename: filename,
    orderNid: String(orderNid || ""),
    statusCode: statusCode,
    statusLabel: STATUS_LABELS[String(statusCode)] || (statusCode ? "状态码:" + statusCode : "未知"),
    submittedAt: submittedAt,
    publishedAt: publishedAt,
    resourceId: String(resourceId || ""),
    resourceName: resourceName,
    price: price == null ? "" : String(price),
    orderUrl: orderUrl || "",
    raw: record
  };
}

function firstSyncItem(syncRaw) {
  if (!syncRaw || !Array.isArray(syncRaw.data) || !syncRaw.data.length) return null;
  return syncRaw.data[0] || null;
}

function firstDefined() {
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== "") return arguments[i];
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
  var newLines = lines.map(function(line) {
    if (!line.trim()) return line;
    try {
      var record = JSON.parse(line);
      var data = record.result && record.result.data;
      var nested = data && data.result && data.result.data;
      var knownOrderNid = record.orderNid || data && data.orderNid || nested && nested.order_nid;
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

module.exports = { createMediaOrderService };
