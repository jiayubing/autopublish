const fs = require("fs");
const path = require("path");
const { MediaClient } = require("../../src/platforms/media/media-client");
const { resolveApiKey } = require("../../src/platforms/media/config");

function createMediaOrderService(opts) {
  var options = opts || {};
  var storePath = options.storePath || path.resolve(__dirname, "..", "..", "data", "submission-orders.jsonl");

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

  async function syncOrder(orderNid) {
    var client = new MediaClient({ apiKey: resolveApiKey(null) });
    var response = await client.orderInfo(orderNid);
    updateLocalOrderRecord(storePath, orderNid, response);
    return response;
  }

  return { listOrders: listOrders, syncOrder: syncOrder };
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
