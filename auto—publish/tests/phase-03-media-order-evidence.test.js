"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createOperationalStore } = require("../src/infrastructure/operational-store/operational-store");

test("media order evidence is committed with its remote publication outcome", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-media-order-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    store.reservePublicationTarget({ articleId: "article-media", publicationId: "publication-media", attemptId: "attempt-media", target: { kind: "media", mediaResourceId: "resource-1" } });
    store.commitRemoteOutcome({ attemptId: "attempt-media", outcome: { status: "submitted", evidence: { articleId: "article-media", attemptId: "attempt-media", targetKey: "media-resource:resource-1", remoteId: "order-1" } } });
    assert.deepEqual(store.listRemoteOrders().map((order) => [order.orderId, order.publicationId, order.attemptId, order.mediaResourceId, order.status]), [["order-1", "publication-media", "attempt-media", "resource-1", "submitted"]]);
  } finally { store.close(); }
});

test("published order evidence rejects credentials, query, fragment, and non-HTTPS URLs before persistence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-media-order-url-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    store.reservePublicationTarget({ articleId: "article-media", publicationId: "publication-media", attemptId: "attempt-media", target: { kind: "media", mediaResourceId: "resource-1" } });
    store.commitRemoteOutcome({ attemptId: "attempt-media", outcome: { status: "submitted", evidence: { articleId: "article-media", attemptId: "attempt-media", targetKey: "media-resource:resource-1", remoteId: "order-1" } } });
    for (const remoteUrl of ["http://example.test/order", "https://user:password@example.test/order", "https://example.test/order?token=secret", "https://example.test/order#secret"]) {
      assert.throws(() => store.recordRemoteOrderObservation({ orderId: "order-1", observation: { statusCode: "2", remoteUrl } }), { code: "OPERATIONAL_ORDER_EVIDENCE_REQUIRED" });
    }
    assert.equal(store.listRemoteOrders()[0].remoteUrl, null);
  } finally { store.close(); }
});
