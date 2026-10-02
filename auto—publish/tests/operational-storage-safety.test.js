"use strict";
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createOperationalStore,
  verifyOperationalDatabase,
  SCHEMA_VERSION,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  acquireRuntimeOwner,
} = require("../src/infrastructure/operational-store/internal/operational-store-owner-lease");
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
      SCHEMA_VERSION,
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

test("a malformed runtime owner lock fails closed and remains intact", () => {
  const workspaceRoot = root();
  const operations = path.join(workspaceRoot, ".autopublish", "operations");
  const lock = path.join(operations, "runtime.lock");
  try {
    fs.mkdirSync(operations, { recursive: true });
    fs.writeFileSync(lock, "not-json");
    assert.throws(() => createOperationalStore({ workspaceRoot }), {
      code: "OPERATIONAL_WRITE_OWNER_UNAVAILABLE",
    });
    assert.equal(fs.readFileSync(lock, "utf8"), "not-json");
  } finally {
    cleanup(workspaceRoot);
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

test("expired claims reject the previous owner and retain the replacement across reopen", () => {
  const workspaceRoot = root();
  let store;
  try {
    store = createOperationalStore({ workspaceRoot });
    const expiry = store.createSubmissionBatch({
      batchId: `expiry-small`,
      items: [
        {
          articleId: `expiry-article-small`,
          target: input("x").target,
          payload: {},
        },
      ],
    });
    assert.equal(expiry.batchId, `expiry-small`);
    const claimed = store.claimSubmissionItem({
      batchId: `expiry-small`,
      claimToken: "old",
      leaseMs: -1,
    });
    const reclaimed = store.claimSubmissionItem({
      batchId: `expiry-small`,
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
    store.close();
    store = createOperationalStore({ workspaceRoot });
    assert.doesNotThrow(() =>
      store.updateSubmissionItem({
        itemId: reclaimed.itemId,
        claimToken: "new",
        revision: reclaimed.revision,
        status: "completed",
      }),
    );
  } finally {
    if (store) store.close();
    cleanup(workspaceRoot);
  }
});
