const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const migration = require("../scripts/migrate-publication-ledger-v1");
const { createPublicationLedger } = require("../src/publication/publication-ledger");

function hash(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function write(root, relativePath, value) {
  const filename = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, value, "utf8");
  return filename;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "publication-ledger-migration-"));
  const article = "# Migrated title\n\nMigrated body\n";
  const queueFile = write(root, ".autopublish/input/toutiao/migrated.md", article);
  const sidecar = {
    version: 1,
    submissionBatchId: "batch-1",
    generatedArticleId: "article-1",
    clientId: "client-1",
    targetPlatformId: "toutiao",
    contentHash: hash(article),
    status: "queued"
  };
  write(root, ".autopublish/input/toutiao/migrated.md.submission.json", JSON.stringify(sidecar) + "\n");
  write(root, ".autopublish/submission-records/batch-batch-1.json", JSON.stringify({
    version: 1,
    id: "batch-1",
    clientId: "client-1",
    createdAt: "2026-07-18T00:00:00.000Z",
    status: "queued",
    items: [{
      articleId: "article-1",
      targetPlatformId: "toutiao",
      contentHash: hash(article),
      status: "queued",
      filePath: queueFile
    }]
  }) + "\n");
  write(root, ".autopublish/data/submission-orders.jsonl", JSON.stringify({
    version: 1,
    ts: "2026-07-18T00:01:00.000Z",
    command: "submit",
    dryRun: false,
    params: {
      clientId: "client-1",
      generatedArticleId: "article-1",
      resource_id: "874630",
      content_file: queueFile,
      api_key: "secret-must-not-leak",
      content: "private body must not leak"
    },
    result: {
      success: true,
      data: { order_nid: "order-1" }
    }
  }) + "\n" + JSON.stringify({
    version: 1,
    ts: "2026-07-18T00:02:00.000Z",
    command: "order",
    dryRun: false,
    params: {
      clientId: "client-1",
      generatedArticleId: "article-1",
      resource_id: "874630",
      order_nid: "order-1",
      content_file: queueFile
    },
    result: {
      success: true,
      syncStatus: "2",
      syncedAt: "2026-07-18T00:03:00.000Z",
      syncRaw: { data: [{ status: 2, order_nid: "order-1", order_url: "https://media.example.test/article/1?token=secret" }] }
    }
  }) + "\n");
  write(root, "published/orphan.md", "orphan body\n");
  return { root, queueFile };
}

function createMigrator(root) {
  return migration.createPublicationLedgerMigration({
    workspaceRoot: root,
    clock: () => "2026-07-18T01:00:00.000Z",
    commit: "11ea5847995998fa12461e041f2fdc26fc85112f"
  });
}

describe("publication ledger v1 migration", function() {
  it("defaults to a write-free dry-run and classifies queue, order, and orphan archive safely", function() {
    const current = fixture();
    try {
      const result = createMigrator(current.root).dryRun();

      assert.equal(result.mode, "dry-run");
      assert.equal(result.writes, 0);
      assert.equal(result.summary.queued, 1);
      assert.equal(result.summary.published, 1);
      assert.ok(result.reports.some((item) => item.code === "LEGACY_UNLINKED"));
      assert.equal(fs.existsSync(path.join(current.root, ".autopublish/submission-records/publications")), false);
      assert.equal(fs.existsSync(path.join(current.root, ".autopublish/submission-records/publication-ledger-v1-migration.json")), false);
      assert.equal(fs.readFileSync(current.queueFile, "utf8"), "# Migrated title\n\nMigrated body\n");
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  it("requires the exact execution token and preserves legacy files", function() {
    const current = fixture();
    try {
      const migrator = createMigrator(current.root);
      assert.throws(() => migrator.execute(), { code: "MIGRATION_CONFIRMATION_REQUIRED" });
      assert.throws(() => migrator.execute({ confirmationToken: "wrong-token" }), { code: "MIGRATION_CONFIRMATION_REQUIRED" });
      assert.equal(fs.existsSync(path.join(current.root, ".autopublish/submission-records/publications")), false);
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  it("uses the existing ledger API, writes a redacted manifest, and is idempotent", function() {
    const current = fixture();
    try {
      const migrator = createMigrator(current.root);
      const result = migrator.execute({ confirmationToken: migration.MIGRATION_CONFIRMATION_TOKEN });
      const ledger = createPublicationLedger({ workspaceRoot: current.root });
      const records = ledger.store.list();
      const queueRecord = records.find((record) => record.targetKey === "platform:toutiao");
      const mediaRecord = records.find((record) => record.targetKey === "media-resource:874630");

      assert.equal(result.mode, "execute");
      assert.equal(result.writes, 2);
      assert.equal(queueRecord.status, "queued");
      assert.equal(mediaRecord.status, "published");
      assert.equal(mediaRecord.attempts.at(-1).remoteId, "order-1");
      assert.equal(fs.existsSync(current.queueFile), true);
      const manifestPath = path.join(current.root, ".autopublish/submission-records/publication-ledger-v1-migration.json");
      const manifestText = fs.readFileSync(manifestPath, "utf8");
      const manifest = JSON.parse(manifestText);
      assert.equal(manifest.version, 1);
      assert.equal(manifest.commit, "11ea5847995998fa12461e041f2fdc26fc85112f");
      assert.ok(manifest.entries.every((entry) => entry.source && entry.target && Number.isInteger(entry.bytes) && /^[a-f0-9]{64}$/.test(entry.sha256) && entry.version && entry.commit));
      assert.equal(manifestText.includes("secret-must-not-leak"), false);
      assert.equal(manifestText.includes("private body must not leak"), false);
      assert.equal(manifestText.includes("token=secret"), false);

      const second = createMigrator(current.root).execute({ confirmationToken: migration.MIGRATION_CONFIRMATION_TOKEN });
      assert.equal(second.idempotent, true);
      assert.equal(createPublicationLedger({ workspaceRoot: current.root }).store.list().length, 2);
      assert.equal(createPublicationLedger({ workspaceRoot: current.root }).store.get(mediaRecord.publicationId).attempts.length, 1);
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  it("does not create or replace a newer publication and fails closed on invalid sidecars", function() {
    const current = fixture();
    try {
      const ledger = createPublicationLedger({ workspaceRoot: current.root, now: () => "2026-07-18T00:00:00.000Z", createId: (kind) => "new-" + kind });
      const article = { articleKey: "generated:client-1:article-1", clientId: "client-1", articleId: "article-1", contentHash: null };
      const existing = ledger.reserve(article, { platformId: "toutiao" }, { displayName: "new publication" });
      const invalid = write(current.root, ".autopublish/input/hepan/bad.md", "bad\n");
      write(current.root, ".autopublish/input/hepan/bad.md.submission.json", JSON.stringify({
        version: 1,
        generatedArticleId: "bad-article",
        clientId: "client-1",
        targetPlatformId: "hepan",
        contentHash: "0".repeat(64),
        status: "queued"
      }) + "\n");

      const result = createMigrator(current.root).execute({ confirmationToken: migration.MIGRATION_CONFIRMATION_TOKEN });
      assert.equal(result.idempotent, false);
      assert.equal(createPublicationLedger({ workspaceRoot: current.root }).store.get(existing.publicationId).displayName, "new publication");
      assert.ok(result.reports.some((item) => item.code === "QUEUE_SIDECAR_HASH_MISMATCH" && item.source.includes("bad.md")));
      assert.equal(fs.existsSync(invalid), true);
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  it("keeps the CLI dry by default and gates writes behind the token", function() {
    const current = fixture();
    const script = path.resolve(__dirname, "..", "scripts", "migrate-publication-ledger-v1.js");
    try {
      const dryRun = childProcess.spawnSync(process.execPath, [script, "--workspace", current.root], { encoding: "utf8" });
      assert.equal(dryRun.status, 0, dryRun.stderr);
      assert.equal(JSON.parse(dryRun.stdout).mode, "dry-run");
      assert.equal(fs.existsSync(path.join(current.root, ".autopublish/submission-records/publications")), false);

      const blocked = childProcess.spawnSync(process.execPath, [script, "--workspace", current.root, "--execute"], { encoding: "utf8" });
      assert.notEqual(blocked.status, 0);
      assert.match(blocked.stderr, /MIGRATION_CONFIRMATION_REQUIRED/);
      assert.equal(fs.existsSync(path.join(current.root, ".autopublish/submission-records/publications")), false);

      const execute = childProcess.spawnSync(process.execPath, [script, "--workspace", current.root, "--execute", "--confirm", migration.MIGRATION_CONFIRMATION_TOKEN], { encoding: "utf8" });
      assert.equal(execute.status, 0, execute.stderr);
      assert.equal(JSON.parse(execute.stdout).mode, "execute");
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });
});
