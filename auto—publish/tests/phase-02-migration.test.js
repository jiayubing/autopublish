"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createMigration } = require("../scripts/migrate-operational-store-v1");
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

test("synthetic legacy workspace executes, verifies, backs up, restore-verifies, and preserves all mapped relationships", () => {
  const root = fixture();
  try {
    const before = sourceHashes(root),
      result = createMigration({ workspaceRoot: root }).execute();
    assert.equal(result.report.counts.mapped, 3);
    assert.equal(verifyOperationalDatabase(result.databasePath).rows, 3);
    const store = createOperationalStore({ workspaceRoot: root });
    const backup = path.join(root, "backup.db");
    assert.equal(store.backup(backup).rows, 3);
    store.close();
    assert.equal(verifyOperationalDatabase(backup).rows, 3);
    assert.deepEqual(sourceHashes(root), before);
    assert.throws(() => createMigration({ workspaceRoot: root }).execute(), {
      code: "MIGRATION_TARGET_EXISTS",
    });
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

test("every migration lifecycle fault leaves source and existing target safe, removes temporary database and releases lease", () => {
  const points = [
    "before_start",
    "scan_publication",
    "import",
    "before_sqlite_commit",
    "verify",
    "before_rename",
  ];
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
                  code: "INJECTED_" + point,
                  migrationReport: report,
                });
            },
          }).execute(),
        { code: "INJECTED_" + point },
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
      assert.doesNotThrow(() =>
        createMigration({ workspaceRoot: root }).execute(),
      );
    } finally {
      cleanup(root);
    }
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
  const second = fixture();
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
      { code: "INJECTED_RENAME" },
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
      { code: "INJECTED_AFTER_RENAME" },
    );
    const target = path.join(
      second,
      ".autopublish",
      "operations",
      "operations.db",
    );
    assert.equal(verifyOperationalDatabase(target).rows, 3);
    assert.throws(() => createMigration({ workspaceRoot: second }).execute(), {
      code: "MIGRATION_TARGET_EXISTS",
    });
  } finally {
    cleanup(second);
  }
});
