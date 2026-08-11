"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createMigration } = require("../scripts/migrate-operational-store-v1");
const {
  withRecoveryGuard,
} = require("../src/infrastructure/operational-store/internal/operational-store-recovery-guard");
const {
  createOperationalStore,
  verifyOperationalDatabase,
} = require("../src/infrastructure/operational-store/operational-store");

function hash(filename) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filename))
    .digest("hex");
}
function write(root, name, value) {
  const filename = path.join(root, name);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, value);
  return filename;
}
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "operational-migration-"));
  const queue = write(
    root,
    ".autopublish/input/hepan/queued.md",
    "synthetic queue content\n",
  );
  write(
    root,
    ".autopublish/input/hepan/queued.md.submission.json",
    JSON.stringify({
      version: 2,
      clientId: "client-1",
      generatedArticleId: "article-2",
      targetPlatformId: "hepan",
      contentHash: hash(queue),
      submissionBatchId: "batch-1",
      status: "queued",
    }),
  );
  write(
    root,
    ".autopublish/submission-batches/batch-batch-1.json",
    JSON.stringify({
      version: 1,
      id: "batch-1",
      clientId: "client-1",
      status: "queued",
      items: [
        {
          articleId: "article-2",
          targetPlatformId: "hepan",
          contentHash: hash(queue),
          status: "queued",
        },
      ],
    }),
  );
  write(
    root,
    ".autopublish/submission-records/publications/publication-" +
      "a".repeat(64) +
      ".json",
    JSON.stringify({
      publicationId: "publication-1",
      articleId: "article-1",
      platformId: "toutiao",
      status: "published",
      attempts: [
        {
          attemptId: "attempt-1",
          remoteId: "remote-1",
          remoteUrl: "https://legacy.invalid/published",
        },
      ],
    }),
  );
  write(
    root,
    ".autopublish/data/submission-orders.jsonl",
    JSON.stringify({
      command: "submit",
      dryRun: false,
      params: {
        generatedArticleId: "article-3",
        resource_id: "874630",
        order_nid: "order-1",
        api_key: "secret-not-in-report",
        content: "must-not-leak",
      },
      result: {
        success: true,
        syncStatus: "2",
        syncRaw: {
          data: [
            {
              resource_id: "874630",
              order_nid: "order-1",
              status: 2,
              order_url: "https://media.example.test/a?secret=never",
            },
          ],
        },
      },
    }) + "\n",
  );
  return root;
}
function sourceHashes(root) {
  return [
    ".autopublish/input/hepan/queued.md",
    ".autopublish/input/hepan/queued.md.submission.json",
    ".autopublish/submission-batches/batch-batch-1.json",
    ".autopublish/submission-records/publications/publication-" +
      "a".repeat(64) +
      ".json",
    ".autopublish/data/submission-orders.jsonl",
  ].map((name) => [name, hash(path.join(root, name))]);
}
function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

test("dry-run fully reads production-shaped publication, batch, sidecar and JSONL inputs without changing their hashes", () => {
  const root = fixture();
  try {
    const before = sourceHashes(root),
      migration = createMigration({ workspaceRoot: root });
    const first = migration.dryRun(),
      second = migration.dryRun();
    assert.deepEqual(first, second);
    assert.deepEqual(sourceHashes(root), before);
    assert.deepEqual(first.report.inputs, {
      publication: { files: 1, records: 1 },
      batch: { files: 1, records: 1 },
      sidecar: { files: 1, records: 1 },
      order: { files: 1, records: 1 },
    });
    assert.deepEqual(first.report.counts, {
      mapped: 3,
      duplicates: 0,
      conflicts: 0,
      corrupt: 0,
      unknownAccounts: 2,
      remoteIdMissing: 0,
      targets: 3,
      attempts: 3,
      batches: 1,
      items: 1,
      orders: 1,
      manualItems: 0,
    });
    assert.equal(JSON.stringify(first).includes("secret-not-in-report"), false);
    assert.equal(JSON.stringify(first).includes("must-not-leak"), false);
    assert.equal(JSON.stringify(first).includes(root), false);
  } finally {
    cleanup(root);
  }
});

test("synthetic legacy facts require the isolated workspace migration gate", () => {
  const root = fixture();
  try {
    const before = sourceHashes(root);
    assert.throws(() => createMigration({ workspaceRoot: root }).execute(), {
      code: "MIGRATION_WORKSPACE_GATE_REQUIRED",
    });
    assert.equal(
      fs.existsSync(
        path.join(root, ".autopublish", "operations", "operations.db"),
      ),
      false,
    );
    assert.deepEqual(sourceHashes(root), before);
  } finally {
    cleanup(root);
  }
});

test("corrupt, duplicate, unknown-account and missing-remote legacy facts are explicit manual report items", () => {
  const root = fixture();
  try {
    write(
      root,
      ".autopublish/submission-records/publications/publication-" +
        "b".repeat(64) +
        ".json",
      "{",
    );
    write(
      root,
      ".autopublish/submission-records/publications/publication-" +
        "c".repeat(64) +
        ".json",
      JSON.stringify({
        articleId: "article-1",
        platformId: "toutiao",
        status: "queued",
        attempts: [{ attemptId: "x" }],
      }),
    );
    write(
      root,
      ".autopublish/data/submission-orders.jsonl",
      fs.readFileSync(
        path.join(root, ".autopublish/data/submission-orders.jsonl"),
        "utf8",
      ) +
        JSON.stringify({
          command: "submit",
          dryRun: false,
          params: { generatedArticleId: "article-4", resource_id: "9" },
          result: { success: true },
        }) +
        "\n",
    );
    const report = createMigration({ workspaceRoot: root }).dryRun().report;
    assert.ok(report.counts.corrupt >= 1);
    assert.ok(report.counts.duplicates >= 1);
    assert.ok(report.counts.remoteIdMissing >= 1);
    assert.ok(report.diagnostics.every((item) => item.manual === true));
  } finally {
    cleanup(root);
  }
});

test("retired importer scan faults and gate refusal leave legacy sources untouched", () => {
  const points = ["before_start", "scan_publication"];
  for (const point of points) {
    const root = fixture();
    try {
      const before = sourceHashes(root);
      assert.throws(
        () =>
          createMigration({
            workspaceRoot: root,
            fault: (at, report) => {
              if (at === point)
                throw Object.assign(new Error("injected"), {
                  code: "INJECTED_" + point.toUpperCase(),
                  migrationReport: report,
                });
            },
          }).execute(),
        (error) => {
          if (point === "before_start") {
            assert.equal(error.code, "MIGRATION_EXECUTE_FAILED");
            assert.equal(error.causeCode, "INJECTED_" + point.toUpperCase());
          } else {
            assert.equal(error.code, "INJECTED_" + point.toUpperCase());
          }
          return true;
        },
      );
      assert.deepEqual(sourceHashes(root), before);
      const operations = path.join(root, ".autopublish", "operations");
      assert.equal(
        fs.existsSync(path.join(operations, "operations.db")),
        false,
      );
      assert.equal(
        fs.existsSync(path.join(operations, "migration.lock")),
        false,
      );
      assert.equal(
        fs.existsSync(operations)
          ? fs.readdirSync(operations).some((x) => x.includes("migration-"))
          : false,
        false,
      );
      assert.throws(() => createMigration({ workspaceRoot: root }).execute(), {
        code: "MIGRATION_WORKSPACE_GATE_REQUIRED",
      });
    } finally {
      cleanup(root);
    }
  }
});

test("migration payload write failure removes its own incomplete lease", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "operational-migration-"));
  const originalWriteFileSync = fs.writeFileSync;
  let failLeaseWrite = true;
  try {
    fs.writeFileSync = function patchedWriteFileSync(filename, ...args) {
      if (failLeaseWrite && typeof filename === "number") {
        failLeaseWrite = false;
        throw Object.assign(new Error("no space"), { code: "ENOSPC" });
      }
      return originalWriteFileSync.call(fs, filename, ...args);
    };
    assert.throws(
      () => createMigration({ workspaceRoot: root }).execute(),
      (error) => {
        assert.equal(error.code, "MIGRATION_LEASE_WRITE_FAILED");
        assert.equal(error.causeCode, "ENOSPC");
        return true;
      },
    );
    assert.equal(
      fs.existsSync(
        path.join(root, ".autopublish", "operations", "migration.lock"),
      ),
      false,
    );
    assert.doesNotThrow(() =>
      createMigration({ workspaceRoot: root }).execute(),
    );
  } finally {
    fs.writeFileSync = originalWriteFileSync;
    cleanup(root);
  }
});

test("malformed migration leases fail closed and remain for operator inspection", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "operational-migration-"));
  const lock = path.join(root, ".autopublish", "operations", "migration.lock");
  try {
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    fs.writeFileSync(
      lock,
      JSON.stringify({ version: 1, pid: process.pid }),
      "utf8",
    );
    assert.throws(() => createMigration({ workspaceRoot: root }).execute(), {
      code: "MIGRATION_LEASE_INVALID",
    });
    assert.equal(fs.existsSync(lock), true);
  } finally {
    cleanup(root);
  }
});

test("unreadable legacy input directories fail closed instead of becoming absent", () => {
  const root = fixture();
  const inputRoot = path.join(
    root,
    ".autopublish",
    "submission-records",
    "publications",
  );
  const originalLstat = fs.lstatSync;
  try {
    fs.lstatSync = function patchedLstat(filename, ...args) {
      if (filename === inputRoot)
        throw Object.assign(new Error("permission denied"), { code: "EACCES" });
      return originalLstat.call(fs, filename, ...args);
    };
    assert.throws(() => createMigration({ workspaceRoot: root }).dryRun(), {
      code: "MIGRATION_INPUT_UNAVAILABLE",
    });
  } finally {
    fs.lstatSync = originalLstat;
    cleanup(root);
  }
});

test("migration payload write failure never removes a replacement lease", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "operational-migration-"));
  const lock = path.join(root, ".autopublish", "operations", "migration.lock");
  const originalWriteFileSync = fs.writeFileSync;
  let injected = false;
  try {
    fs.writeFileSync = function patchedWriteFileSync(filename, ...args) {
      if (!injected && typeof filename === "number") {
        injected = true;
        fs.closeSync(filename);
        fs.unlinkSync(lock);
        fs.writeFileSync(
          lock,
          JSON.stringify({ version: 1, pid: process.pid, token: "live-B" }),
        );
        throw Object.assign(new Error("no space"), { code: "ENOSPC" });
      }
      return originalWriteFileSync.call(fs, filename, ...args);
    };
    assert.throws(
      () => createMigration({ workspaceRoot: root }).execute(),
      (error) => {
        assert.equal(error.code, "MIGRATION_LEASE_WRITE_FAILED");
        assert.equal(error.causeCode, "ENOSPC");
        return true;
      },
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(lock, "utf8")), {
      version: 1,
      pid: process.pid,
      token: "live-B",
    });
    assert.throws(() => createMigration({ workspaceRoot: root }).execute(), {
      code: "MIGRATION_LEASE_ACTIVE",
    });
  } finally {
    fs.writeFileSync = originalWriteFileSync;
    cleanup(root);
  }
});

test("recovery guard serializes recovery critical sections across processes", () => {
  const root = fixture();
  const filename = path.join(
    root,
    ".autopublish",
    "operations",
    "operations.db",
  );
  const guardModule = path.join(
    __dirname,
    "..",
    "src",
    "infrastructure",
    "operational-store",
    "internal",
    "operational-store-recovery-guard.js",
  );
  const childScript = [
    "const { withRecoveryGuard } = require(process.argv[1]);",
    "try {",
    "  withRecoveryGuard(process.argv[2], () => {});",
    "} catch (error) {",
    "  process.stdout.write(error.code || 'UNKNOWN');",
    "  process.exitCode = 1;",
    "}",
  ].join("\n");
  try {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    withRecoveryGuard(filename, () => {
      const child = require("node:child_process").spawnSync(
        process.execPath,
        ["-e", childScript, guardModule, filename],
        { encoding: "utf8" },
      );
      assert.equal(child.status, 1, child.stderr);
      assert.equal(child.stdout, "OPERATIONAL_RECOVERY_GUARD_BUSY");
    });
  } finally {
    cleanup(root);
  }
});

test("rename failure cannot overwrite an existing valid target, and post-rename interruption is explicitly rejected on retry", () => {
  const root = fixture();
  try {
    const before = sourceHashes(root),
      operations = path.join(root, ".autopublish", "operations");
    fs.mkdirSync(operations, { recursive: true });
    const existing = createOperationalStore({ workspaceRoot: root });
    existing.reservePublicationTarget({
      articleId: "existing-article",
      publicationId: "existing-publication",
      attemptId: "existing-attempt",
      target: {
        kind: "platform",
        platformId: "toutiao",
        accountProfileId: "account-1",
      },
    });
    existing.close();
    const target = path.join(operations, "operations.db"),
      original = hash(target);
    assert.throws(() => createMigration({ workspaceRoot: root }).execute(), {
      code: "MIGRATION_TARGET_EXISTS",
    });
    assert.equal(hash(target), original);
    assert.deepEqual(sourceHashes(root), before);
  } finally {
    cleanup(root);
  }
  const second = fs.mkdtempSync(
    path.join(os.tmpdir(), "operational-migration-"),
  );
  try {
    assert.throws(
      () =>
        createMigration({
          workspaceRoot: second,
          internalRename: () => {
            throw Object.assign(new Error("rename"), {
              code: "INJECTED_RENAME",
            });
          },
        }).execute(),
      (error) => {
        assert.equal(error.code, "MIGRATION_EXECUTE_FAILED");
        assert.equal(error.causeCode, "INJECTED_RENAME");
        return true;
      },
    );
    assert.equal(
      fs.existsSync(
        path.join(second, ".autopublish", "operations", "operations.db"),
      ),
      false,
    );
    assert.throws(
      () =>
        createMigration({
          workspaceRoot: second,
          fault: (at) => {
            if (at === "after_rename")
              throw Object.assign(new Error("after"), {
                code: "INJECTED_AFTER_RENAME",
              });
          },
        }).execute(),
      (error) => {
        assert.equal(error.code, "MIGRATION_INSTALL_UNCERTAIN");
        assert.equal(error.causeCode, "INJECTED_AFTER_RENAME");
        assert.equal(error.installationState, "INSTALLED");
        assert.equal(error.operatorAction, "VERIFY_OPERATIONAL_DATABASE");
        return true;
      },
    );
    const target = path.join(
      second,
      ".autopublish",
      "operations",
      "operations.db",
    );
    assert.equal(verifyOperationalDatabase(target).rows, 0);
    assert.throws(() => createMigration({ workspaceRoot: second }).execute(), {
      code: "MIGRATION_TARGET_EXISTS",
    });
  } finally {
    cleanup(second);
  }
});
