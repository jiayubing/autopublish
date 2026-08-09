"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  verifyTicket24EAbsence,
} = require("../scripts/verify-ticket-24-e-absence");

test("normal publication writer rejects retired runtime statuses", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ticket-24-g-writer-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    store.reservePublicationTarget({
      articleId: "article-24-g",
      publicationId: "publication-24-g",
      attemptId: "attempt-24-g",
      target: { kind: "platform", platformId: "hepan", accountProfileId: "profile-24-g" },
    });
    for (const status of ["submitting", "submitted"])
      assert.throws(
        () =>
          store.commitRemoteOutcome({
            attemptId: "attempt-24-g",
            outcome: { status },
          }),
        { code: "OPERATIONAL_OUTCOME_INVALID" },
      );
    assert.deepEqual(store.listRemoteOrders(), []);
    assert.equal(
      store.listPublicationRecords({
        publicationIds: ["publication-24-g"],
      })[0].status,
      "queued",
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Ticket 24 legacy gate exposes exact compatibility classifications", () => {
  const report = verifyTicket24EAbsence();
  const classification = report.layers.legacyRuntimeBoundary.classification;
  assert.deepEqual(classification.KEEP_STORAGE_COMPATIBILITY_ONLY, [
    "src/infrastructure/operational-store/internal/operational-store-schema.js",
    "src/infrastructure/operational-store/internal/operational-store-schema-v4.js",
  ]);
  assert.equal(report.layers.legacyRuntimeBoundary.forbiddenRuntimeStatuses, 0);
  assert.equal(
    report.layers.legacyRuntimeBoundary.forbiddenMaintenanceLiterals,
    0,
  );
  assert.equal(report.layers.publicResidueVocabulary.sourceMatches, 0);
});
