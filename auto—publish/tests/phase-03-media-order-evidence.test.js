"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createOperationalStore } = require("../src/infrastructure/operational-store/operational-store");

test("legacy generic media outcome writer rejects submitted success", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-media-order-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    store.reservePublicationTarget({ articleId: "article-media", publicationId: "publication-media", attemptId: "attempt-media", target: { kind: "media", mediaResourceId: "resource-1" } });
    assert.throws(
      () => store.commitRemoteOutcome({ attemptId: "attempt-media", outcome: { status: "submitted", evidence: { articleId: "article-media", attemptId: "attempt-media", targetKey: "media-resource:resource-1", remoteId: "order-1" } } }),
      { code: "OPERATIONAL_OUTCOME_INVALID" },
    );
    assert.deepEqual(store.listRemoteOrders(), []);
  } finally { store.close(); }
});

test("legacy generic media success does not create an order fact", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-media-order-url-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    store.reservePublicationTarget({ articleId: "article-media", publicationId: "publication-media", attemptId: "attempt-media", target: { kind: "media", mediaResourceId: "resource-1" } });
    assert.throws(
      () => store.commitRemoteOutcome({ attemptId: "attempt-media", outcome: { status: "submitted", evidence: { articleId: "article-media", attemptId: "attempt-media", targetKey: "media-resource:resource-1", remoteId: "order-1" } } }),
      { code: "OPERATIONAL_OUTCOME_INVALID" },
    );
    assert.equal(typeof store.recordRemoteOrderObservation, "undefined");
    assert.deepEqual(store.listRemoteOrders(), []);
    assert.equal(store.listPublicationRecords({ publicationIds: ["publication-media"] })[0].status, "queued");
  } finally { store.close(); }
});
