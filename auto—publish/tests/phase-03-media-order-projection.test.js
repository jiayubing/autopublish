"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createMediaOrderService } = require("../desktop/services/media-order-service");

test("media order service has no implicit legacy publication ledger factory", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "desktop", "services", "media-order-service.js"), "utf8");
  assert.doesNotMatch(source, /createPublicationLedger/);
});

test("media order views use OperationalStore order projections when supplied", () => {
  let readLegacy = false;
  const service = createMediaOrderService({
    storePath: "Z:\\must-not-be-read.jsonl",
    operationalStore: { listRemoteOrders: () => [{ orderId: "order-1", orderNid: "order-1", publicationId: "publication-1", attemptId: "attempt-1", mediaResourceId: "resource-1", status: "submitted", createdAt: "2026-07-25T00:00:00.000Z" }] },
  });
  const view = service.listOrderViews()[0];
  assert.equal(readLegacy, false);
  assert.deepEqual([view.orderNid, view.publicationId, view.resourceId, view.statusCode], ["order-1", "publication-1", "resource-1", "submitted"]);
});

test("OperationalStore media order sync never writes the retired JSONL history", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-order-sync-"));
  const storePath = path.join(root, "submission-orders.jsonl");
  fs.writeFileSync(storePath, '{"legacy":true}\n');
  const service = createMediaOrderService({ storePath, operationalStore: { listRemoteOrders: () => [] }, clientProvider: () => ({ orderInfo: async () => ({ data: [] }) }) });
  await service.syncOrder("order-1");
  assert.equal(fs.readFileSync(storePath, "utf8"), '{"legacy":true}\n');
});
