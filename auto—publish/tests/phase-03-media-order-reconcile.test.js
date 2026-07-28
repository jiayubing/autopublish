"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");

test("media order reconciliation commits verified published evidence and rejects weak URLs", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-03-order-reconcile-"),
  );
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    store.reservePublicationTarget({
      articleId: "article-1",
      publicationId: "publication-1",
      attemptId: "attempt-1",
      target: { kind: "media", mediaResourceId: "resource-1" },
    });
    store.commitRemoteOutcome({
      attemptId: "attempt-1",
      outcome: {
        status: "submitted",
        evidence: {
          articleId: "article-1",
          attemptId: "attempt-1",
          targetKey: "media-resource:resource-1",
          remoteId: "order-1",
        },
      },
    });
    assert.throws(
      () =>
        store.reconcileRemoteOrder({
          orderId: "order-1",
          outcome: { status: "published", remoteUrl: "http://weak.test" },
        }),
      { code: "OPERATIONAL_ORDER_EVIDENCE_REQUIRED" },
    );
    assert.equal(
      store.reconcileRemoteOrder({
        orderId: "order-1",
        outcome: {
          status: "published",
          remoteUrl: "https://proof.test/order-1",
          remoteStatusCode: "2",
        },
      }).status,
      "published",
    );
    assert.equal(store.listRemoteOrders()[0].status, "published");
    assert.equal(
      store.listRemoteOrders()[0].remoteUrl,
      "https://proof.test/order-1",
    );
    assert.equal(store.listRemoteOrders()[0].remoteStatusCode, "2");
  } finally {
    store.close();
  }
});
