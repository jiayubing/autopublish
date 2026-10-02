"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const {
  createOperationalStore,
  verifyOperationalDatabase,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  RECOVERY_PAGE_SIZE,
} = require("../src/infrastructure/operational-store/internal/operational-store-recovery-aggregate");
function root() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "phase-02-capacity-"));
}
function cleanup(workspaceRoot) {
  fs.rmSync(workspaceRoot, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  });
}
function input(index) {
  return {
    articleId: `article-${index}`,
    publicationId: `publication-${index}`,
    attemptId: `attempt-${index}`,
    target: {
      kind: "platform",
      platformId: "toutiao",
      accountProfileId: "account-1",
    },
  };
}
test("500 and 5000 item batch baseline retains completed claims, reopen and indexed claim query", () => {
  for (const count of [500, 5000]) {
    const workspaceRoot = root();
    try {
      const started = performance.now(),
        store = createOperationalStore({ workspaceRoot });
      store.createSubmissionBatch({
        batchId: `batch-${count}`,
        items: Array.from({ length: count }, (_, index) => ({
          articleId: `article-${count}-${index}`,
          target: input("x").target,
          payload: { source: "synthetic" },
        })),
      });
      const createdMs = performance.now() - started,
        claimStarted = performance.now();
      for (let index = 0; index < count; index += 1) {
        const item = store.claimSubmissionItem({
          batchId: `batch-${count}`,
          claimToken: `worker-${index}`,
        });
        assert.ok(item);
        store.updateSubmissionItem({
          itemId: item.itemId,
          claimToken: `worker-${index}`,
          revision: item.revision,
          status: "completed",
          payload: { result: "synthetic" },
        });
      }
      const claimUpdateMs = performance.now() - claimStarted;
      const databasePath = store.databasePath,
        closeStarted = performance.now();
      store.close();
      const reopened = createOperationalStore({ workspaceRoot });
      reopened.verify();
      reopened.close();
      const reopenMs = performance.now() - closeStarted;
      const db = new DatabaseSync(databasePath, { readOnly: true });
      const plan = db
        .prepare(
          "EXPLAIN QUERY PLAN SELECT * FROM submission_items WHERE batch_id=? AND (status='queued' OR(status='claimed' AND claim_until<?)) ORDER BY item_id LIMIT 1",
        )
        .all(`batch-${count}`, new Date().toISOString())
        .map((row) => row.detail)
        .join(" | ");
      db.close();
      assert.doesNotMatch(plan, /SCAN submission_items/i);
      console.log(
        JSON.stringify({
          phase02BatchBaseline: {
            count,
            createdMs: Math.round(createdMs),
            claimUpdateMs: Math.round(claimUpdateMs),
            reopenMs: Math.round(reopenMs),
            databaseBytes: fs.statSync(databasePath).size,
            queryPlan: plan,
          },
        }),
      );
    } finally {
      cleanup(workspaceRoot);
    }
  }
});

test("10,000 publication baseline retains actionable recovery and closes with a verified database", () => {
  const workspaceRoot = root();
  try {
    const store = createOperationalStore({ workspaceRoot }),
      started = performance.now();
    for (let index = 0; index < 10000; index += 1)
      store.reservePublicationTarget(input(`capacity-${index}`));
    const writeMs = performance.now() - started,
      attention = store.listActionableRecovery();
    assert.equal(attention.length, RECOVERY_PAGE_SIZE);
    assert.equal(attention.hasMore, true);
    const databasePath = store.databasePath;
    store.close();
    assert.equal(verifyOperationalDatabase(databasePath).rows, 10000);
    const db = new DatabaseSync(databasePath, { readOnly: true });
    const recoveryCount = db
      .prepare(
        "SELECT COUNT(*) AS count FROM recovery_intents WHERE state IN('remote_started','outcome_pending','manual_check')",
      )
      .get().count;
    db.close();
    assert.equal(recoveryCount, 10000);
    console.log(
      JSON.stringify({
        phase02PublicationBaseline: {
          records: 10000,
          writeMs: Math.round(writeMs),
          databaseBytes: fs.statSync(databasePath).size,
          actionableRecovery: attention.length,
          actionableRecoveryTotal: recoveryCount,
          recoveryPageSize: RECOVERY_PAGE_SIZE,
        },
      }),
    );
  } finally {
    cleanup(workspaceRoot);
  }
});
