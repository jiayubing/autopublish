"use strict";
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
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
  acquireRuntimeOwner,
} = require("../src/infrastructure/operational-store/internal/operational-store-owner-lease");
const {
  RECOVERY_PAGE_SIZE,
} = require("../src/infrastructure/operational-store/internal/operational-store-recovery-aggregate");
const { createMigration } = require("../scripts/migrate-operational-store-v1");

const childScript = path.join(
  __dirname,
  "helpers",
  "phase-02-operational-child.js",
);
function root() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "phase-02-runtime-"));
}
function cleanup(workspaceRoot) {
  fs.rmSync(workspaceRoot, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  });
}
function input(index, accountProfileId = "account-1") {
  return {
    articleId: `article-${index}`,
    publicationId: `publication-${index}`,
    attemptId: `attempt-${index}`,
    target: { kind: "platform", platformId: "toutiao", accountProfileId },
  };
}
function waitReady(child) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(
      () => reject(new Error("child did not become ready")),
      10000,
    );
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const line = buffer.indexOf("\n");
      if (line < 0) return;
      clearTimeout(timer);
      resolve(JSON.parse(buffer.slice(0, line)));
    });
    child.once("error", reject);
  });
}
async function stop(child, signal = "SIGTERM") {
  if (child.exitCode !== null) return;
  child.kill(signal);
  await new Promise((resolve) => child.once("exit", resolve));
}
function spawn(mode, workspaceRoot) {
  return childProcess.spawn(
    process.execPath,
    [childScript, mode, workspaceRoot],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
}

test("real child processes enforce runtime writer and migration lease ownership, then recover after graceful and forced exit", async () => {
  const workspaceRoot = root();
  try {
    const writer = spawn("writer", workspaceRoot);
    assert.deepEqual(await waitReady(writer), { status: "ready" });
    assert.throws(() => createOperationalStore({ workspaceRoot }), {
      code: "OPERATIONAL_WRITE_OWNER_EXISTS",
    });
    assert.throws(() => createMigration({ workspaceRoot }).execute(), {
      code: "MIGRATION_RUNTIME_OWNER_ACTIVE",
    });
    await stop(writer);
    const takeover = createOperationalStore({ workspaceRoot });
    takeover.close();

    const migrationRoot = root();
    const migration = spawn("migration", migrationRoot);
    assert.deepEqual(await waitReady(migration), { status: "ready" });
    assert.throws(
      () => createOperationalStore({ workspaceRoot: migrationRoot }),
      { code: "OPERATIONAL_MIGRATION_LEASE_ACTIVE" },
    );
    await stop(migration, "SIGKILL");
    const afterMigration = createMigration({
      workspaceRoot: migrationRoot,
    }).execute();
    assert.equal(
      verifyOperationalDatabase(afterMigration.databasePath).schemaVersion,
      3,
    );
    cleanup(migrationRoot);

    const crashed = spawn("writer-commit", workspaceRoot);
    assert.deepEqual(await waitReady(crashed), { status: "ready" });
    await stop(crashed, "SIGKILL");
    const recovered = createOperationalStore({ workspaceRoot });
    assert.equal(recovered.verify().foreignKeyViolations, 0);
    recovered.reservePublicationTarget(input("after-crash"));
    recovered.close();

    const uncommitted = spawn("writer-uncommitted", workspaceRoot);
    assert.deepEqual(await waitReady(uncommitted), { status: "ready" });
    await stop(uncommitted, "SIGKILL");
    const recoveredRollback = createOperationalStore({ workspaceRoot });
    assert.equal(recoveredRollback.verify().foreignKeyViolations, 0);
    assert.doesNotThrow(() =>
      recoveredRollback.reservePublicationTarget({
        articleId: "child-uncommitted-article",
        publicationId: "replacement-publication",
        attemptId: "replacement-attempt",
        target: {
          kind: "platform",
          platformId: "toutiao",
          accountProfileId: "account-1",
        },
      }),
    );
    recoveredRollback.close();
  } finally {
    cleanup(workspaceRoot);
  }
});

test("runtime lease rechecks migration ownership after its atomic lock is acquired", () => {
  const workspaceRoot = root();
  const operations = path.join(workspaceRoot, ".autopublish", "operations");
  const filename = path.join(operations, "operations.db");
  const migrationLock = path.join(operations, "migration.lock");
  const fail = (code) => Object.assign(new Error(code), { code });
  fs.mkdirSync(operations, { recursive: true });
  try {
    assert.throws(
      () =>
        acquireRuntimeOwner(
          filename,
          fail,
          () => {},
          () => {
            fs.writeFileSync(
              migrationLock,
              JSON.stringify({ pid: process.pid }),
              { flag: "wx" },
            );
          },
        ),
      { code: "OPERATIONAL_MIGRATION_LEASE_ACTIVE" },
    );
    assert.equal(fs.existsSync(path.join(operations, "runtime.lock")), false);
  } finally {
    cleanup(workspaceRoot);
  }
});

test("migration rechecks runtime ownership after its atomic lock is acquired", () => {
  const workspaceRoot = root();
  const operations = path.join(workspaceRoot, ".autopublish", "operations");
  const runtimeLock = path.join(operations, "runtime.lock");
  try {
    assert.throws(
      () =>
        createMigration({
          workspaceRoot,
          fault(point) {
            if (point === "after_lease")
              fs.writeFileSync(
                runtimeLock,
                JSON.stringify({ pid: process.pid, token: "test" }),
                { flag: "wx" },
              );
          },
        }).execute(),
      { code: "MIGRATION_RUNTIME_OWNER_ACTIVE" },
    );
    assert.equal(fs.existsSync(path.join(operations, "migration.lock")), false);
  } finally {
    cleanup(workspaceRoot);
  }
});

test("a migration contender never removes a lease it did not acquire", () => {
  for (const value of [
    JSON.stringify({ version: 1, pid: process.pid, token: "live" }),
    "not-json",
  ]) {
    const workspaceRoot = root();
    const lock = path.join(
      workspaceRoot,
      ".autopublish",
      "operations",
      "migration.lock",
    );
    try {
      fs.mkdirSync(path.dirname(lock), { recursive: true });
      fs.writeFileSync(lock, value);
      assert.throws(() => createMigration({ workspaceRoot }).execute(), {
        code: "MIGRATION_LEASE_ACTIVE",
      });
      assert.equal(fs.readFileSync(lock, "utf8"), value);
    } finally {
      cleanup(workspaceRoot);
    }
  }
});

test("SQLITE_FULL-equivalent commit failure, inaccessible paths and corruption fail closed without partial facts", () => {
  const workspaceRoot = root();
  try {
    const store = createOperationalStore({
      workspaceRoot,
      internalBeforeCommit: () => {
        throw Object.assign(new Error("full"), { code: "SQLITE_FULL" });
      },
    });
    assert.throws(() => store.reservePublicationTarget(input("full")), {
      code: "SQLITE_FULL",
    });
    store.close();
    const reopened = createOperationalStore({ workspaceRoot });
    assert.equal(reopened.verify().foreignKeyViolations, 0);
    reopened.reservePublicationTarget(input("after-full"));
    reopened.close();
    const blockedRoot = path.join(workspaceRoot, "not-a-directory");
    fs.writeFileSync(blockedRoot, "x");
    assert.throws(
      () => createOperationalStore({ workspaceRoot: blockedRoot }),
      { code: "OPERATIONAL_WRITE_OWNER_UNAVAILABLE" },
    );
  } finally {
    cleanup(workspaceRoot);
  }
  const corruptRoot = root();
  try {
    const filename = path.join(
      corruptRoot,
      ".autopublish",
      "operations",
      "operations.db",
    );
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, "not a sqlite database");
    const before = fs.readFileSync(filename, "utf8");
    assert.throws(() => createOperationalStore({ workspaceRoot: corruptRoot }));
    assert.equal(fs.readFileSync(filename, "utf8"), before);
  } finally {
    cleanup(corruptRoot);
  }
});

test("500 and 5000 item batch baseline retains claims, revisions, expiry, reopen and indexed claim query", () => {
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
      const expiry = store.createSubmissionBatch({
        batchId: `expiry-${count}`,
        items: [
          {
            articleId: `expiry-article-${count}`,
            target: input("x").target,
            payload: {},
          },
        ],
      });
      assert.equal(expiry.batchId, `expiry-${count}`);
      const claimed = store.claimSubmissionItem({
        batchId: `expiry-${count}`,
        claimToken: "old",
        leaseMs: -1,
      });
      const reclaimed = store.claimSubmissionItem({
        batchId: `expiry-${count}`,
        claimToken: "new",
      });
      assert.equal(reclaimed.itemId, claimed.itemId);
      assert.throws(
        () =>
          store.updateSubmissionItem({
            itemId: claimed.itemId,
            claimToken: "old",
            revision: claimed.revision,
            status: "completed",
          }),
        { code: "OPERATIONAL_BATCH_REVISION_CONFLICT" },
      );
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
