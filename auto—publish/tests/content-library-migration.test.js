const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const migration = require("../scripts/migrate-content-library-v2");
const { createRuntimeConfigStore } = require("../desktop/runtime-config-store");

function makeFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "content-library-v2-migration-"),
  );
  const sourceRoot = path.join(root, "legacy");
  const contentLibraryRoot = path.join(root, "library");
  const localStateRoot = path.join(root, "local-state");
  const appConfigPath = path.join(root, "app-config", "runtime-config.json");

  write(sourceRoot, "clients/acme/profile.md", "Acme profile\n");
  write(sourceRoot, "clients/acme/ignored.bin", "not a special file\n");
  write(sourceRoot, "generated/acme/article.md", "# Article\n");
  write(sourceRoot, "templates/travel.json", '{"id":"travel"}\n');
  write(sourceRoot, "research/acme/question-1.json", '{"answer":"answer"}\n');
  write(
    sourceRoot,
    "data/content-generation-batches/batch-1.json",
    '{"id":"batch-1"}\n',
  );
  write(
    sourceRoot,
    "data/submission-queues/queue-1.json",
    '{"id":"queue-1"}\n',
  );
  write(
    sourceRoot,
    "data/submission-records/record-1.json",
    '{"id":"record-1"}\n',
  );
  write(sourceRoot, "data/media-resources.json", '{"items":[]}\n');
  write(sourceRoot, "data/media-pool.json", '{"items":[]}\n');
  write(sourceRoot, "data/media-drafts.json", '{"items":[]}\n');
  write(sourceRoot, "data/submission-orders.jsonl", '{"id":"order-1"}\n');
  write(sourceRoot, "input/media/source.docx", "media input\n");
  write(sourceRoot, "published/article.md", "published article\n");
  write(sourceRoot, "logs/app.log", "diagnostic log\n");
  write(
    sourceRoot,
    "work/client-material-cache/acme/material.json",
    '{"cached":true}\n',
  );
  write(
    sourceRoot,
    "work/playwright-cli/profiles/doubao/session.json",
    '{"profile":true}\n',
  );
  write(
    sourceRoot,
    "work/playwright-cli/profiles/lieju/session.json",
    '{"lieju":true}\n',
  );
  write(
    sourceRoot,
    "work/playwright-cli/profiles/toutiao/session.json",
    '{"toutiao":true}\n',
  );
  write(sourceRoot, "work/playwright-cli/state/lieju.json", '{"state":true}\n');
  write(
    sourceRoot,
    ".env",
    [
      "HEPAN_PYTHON=python3",
      "HEPAN_VENDOR_DIR=C:\\vendor",
      "XQW_API_KEY=secret-test-value",
      "XQW_BASE_URL=https://example.test/api",
      "AI_API_KEY=must-not-be-migrated",
      "UNRELATED=value",
    ].join("\n") + "\n",
  );

  return {
    root,
    sourceRoot,
    contentLibraryRoot,
    localStateRoot,
    appConfigPath,
  };
}

function write(root, relativePath, contents) {
  const filename = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, contents, "utf8");
}

function snapshot(root) {
  if (!fs.existsSync(root)) return [];
  const entries = [];
  function visit(current) {
    for (const entry of fs
      .readdirSync(current, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = path.join(current, entry.name);
      const relative = path.relative(root, filename).replace(/\\/g, "/");
      if (entry.isDirectory()) visit(filename);
      else
        entries.push([relative, fs.readFileSync(filename).toString("base64")]);
    }
  }
  visit(root);
  return entries;
}

function createMigrator(fixture, options) {
  return migration.createContentLibraryMigrator(
    Object.assign(
      {
        sourceRoot: fixture.sourceRoot,
        contentLibraryRoot: fixture.contentLibraryRoot,
        localStateRoot: fixture.localStateRoot,
        appConfigPath: fixture.appConfigPath,
        clock: () => "2026-07-15T12:00:00.000Z",
      },
      options,
    ),
  );
}

describe("content library v2 migration", function () {
  it("dry-runs without creating or modifying any destination", function () {
    const fixture = makeFixture();
    try {
      const sourceBefore = snapshot(fixture.sourceRoot);
      const result = createMigrator(fixture).dryRun();

      assert.equal(result.mode, "dry-run");
      assert.equal(result.writes, 0);
      assert.equal(result.completed, false);
      assert.equal(result.summary.copied, 0);
      assert.ok(result.summary.planned > 0);
      assert.ok(result.missing.some((item) => item.source === "data/research"));
      assert.deepEqual(snapshot(fixture.sourceRoot), sourceBefore);
      assert.equal(fs.existsSync(fixture.contentLibraryRoot), false);
      assert.equal(fs.existsSync(fixture.localStateRoot), false);
      assert.equal(fs.existsSync(fixture.appConfigPath), false);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("reports non-empty targets, conflicts, missing sources, duplicate mappings, and unsafe paths", function () {
    const fixture = makeFixture();
    try {
      write(
        fixture.contentLibraryRoot,
        "clients/acme/profile.md",
        "operator version\n",
      );
      write(
        fixture.sourceRoot,
        "data/research/acme/question-1.json",
        '{"answer":"duplicate"}\n',
      );

      const result = createMigrator(fixture).dryRun();
      assert.ok(
        result.conflicts.some((item) => item.code === "TARGET_CONFLICT"),
      );
      assert.ok(
        result.duplicates.some(
          (item) =>
            item.target === ".autopublish/research/acme/question-1.json",
        ),
      );
      assert.equal(result.destinationNonEmpty, true);
      assert.ok(result.missing.some((item) => item.source === "tmp"));
      assert.equal(result.safe, false);

      assert.throws(
        () =>
          migration.validateMigrationPaths({
            sourceRoot: fixture.sourceRoot,
            contentLibraryRoot: path.join(fixture.sourceRoot, "nested"),
            localStateRoot: fixture.localStateRoot,
            appConfigPath: fixture.appConfigPath,
          }),
        (error) => error.code === "MIGRATION_PATH_OVERLAP",
      );

      const crossDrive = migration.validateMigrationPaths({
        sourceRoot: "C:\\legacy",
        contentLibraryRoot: "D:\\content-library",
        localStateRoot: "E:\\local-state",
        appConfigPath: "E:\\config\\runtime.json",
      });
      assert.equal(crossDrive.crossVolume, true);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("requires an explicit execution confirmation", function () {
    const fixture = makeFixture();
    try {
      assert.throws(
        () => createMigrator(fixture).migrate(),
        (error) => error.code === "MIGRATION_CONFIRMATION_REQUIRED",
      );
      assert.equal(fs.existsSync(fixture.contentLibraryRoot), false);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("copies portable and local data, writes checksums and a completion marker, and keeps the source", function () {
    const fixture = makeFixture();
    try {
      const sourceBefore = snapshot(fixture.sourceRoot);
      const result = createMigrator(fixture).migrate({ confirmed: true });

      assert.equal(result.mode, "execute");
      assert.equal(result.completed, true);
      assert.ok(
        result.manifestPath.endsWith(
          "content-library-v2-migration-manifest.json",
        ),
      );
      assert.ok(
        result.completionMarkerPath.endsWith(
          "content-library-v2-migration-complete.json",
        ),
      );
      assert.equal(
        fs.readFileSync(
          path.join(fixture.contentLibraryRoot, "clients/acme/profile.md"),
          "utf8",
        ),
        "Acme profile\n",
      );
      assert.equal(
        fs.readFileSync(
          path.join(
            fixture.contentLibraryRoot,
            ".autopublish/research/acme/question-1.json",
          ),
          "utf8",
        ),
        '{"answer":"answer"}\n',
      );
      assert.equal(
        fs.readFileSync(
          path.join(
            fixture.contentLibraryRoot,
            ".autopublish/batches/batch-1.json",
          ),
          "utf8",
        ),
        '{"id":"batch-1"}\n',
      );
      assert.equal(
        fs.readFileSync(
          path.join(
            fixture.contentLibraryRoot,
            ".autopublish/queue/queue-1.json",
          ),
          "utf8",
        ),
        '{"id":"queue-1"}\n',
      );
      assert.equal(
        fs.readFileSync(
          path.join(
            fixture.contentLibraryRoot,
            ".autopublish/data/media-resources.json",
          ),
          "utf8",
        ),
        '{"items":[]}\n',
      );
      assert.equal(
        fs.readFileSync(
          path.join(
            fixture.contentLibraryRoot,
            ".autopublish/input/media/source.docx",
          ),
          "utf8",
        ),
        "media input\n",
      );
      assert.equal(
        fs.readFileSync(
          path.join(
            fixture.contentLibraryRoot,
            ".autopublish/published/article.md",
          ),
          "utf8",
        ),
        "published article\n",
      );
      assert.equal(
        fs.readFileSync(
          path.join(fixture.localStateRoot, "logs/app.log"),
          "utf8",
        ),
        "diagnostic log\n",
      );
      assert.equal(
        fs.readFileSync(
          path.join(
            fixture.localStateRoot,
            "cache/client-material/acme/material.json",
          ),
          "utf8",
        ),
        '{"cached":true}\n',
      );
      assert.equal(
        fs.readFileSync(
          path.join(fixture.localStateRoot, "browser/doubao/session.json"),
          "utf8",
        ),
        '{"profile":true}\n',
      );
      assert.equal(
        fs.readFileSync(
          path.join(
            fixture.localStateRoot,
            "browser/profiles/lieju/session.json",
          ),
          "utf8",
        ),
        '{"lieju":true}\n',
      );
      assert.equal(
        fs.readFileSync(
          path.join(
            fixture.localStateRoot,
            "browser/profiles/toutiao/session.json",
          ),
          "utf8",
        ),
        '{"toutiao":true}\n',
      );
      assert.equal(
        fs.readFileSync(
          path.join(fixture.localStateRoot, "browser/state/lieju.json"),
          "utf8",
        ),
        '{"state":true}\n',
      );
      const appConfig = JSON.parse(
        fs.readFileSync(fixture.appConfigPath, "utf8"),
      );
      assert.equal(result.legacyProviderConfig.media, true);
      assert.equal(result.legacyProviderConfig.hepan, true);
      assert.equal(appConfig.values.HEPAN_PYTHON, undefined);
      assert.equal(appConfig.values.XQW_API_KEY, undefined);
      assert.equal(appConfig.values.XQW_BASE_URL, undefined);
      assert.equal(
        Object.prototype.hasOwnProperty.call(appConfig.values, "AI_API_KEY"),
        false,
      );
      assert.equal(
        Object.prototype.hasOwnProperty.call(appConfig.values, "UNRELATED"),
        false,
      );
      assert.equal(
        createRuntimeConfigStore({
          configRoot: path.dirname(fixture.appConfigPath),
        }).read().XQW_API_KEY,
        undefined,
      );
      assert.equal(
        createRuntimeConfigStore({
          configRoot: path.dirname(fixture.appConfigPath),
        }).readLegacy().XQW_API_KEY,
        undefined,
      );
      const manifest = JSON.parse(fs.readFileSync(result.manifestPath, "utf8"));
      assert.equal(manifest.version, 2);
      assert.ok(
        manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)),
      );
      assert.equal(
        JSON.stringify(manifest).includes("secret-test-value"),
        false,
      );
      const completionMarker = JSON.parse(
        fs.readFileSync(result.completionMarkerPath, "utf8"),
      );
      assert.equal(completionMarker.status, "complete");
      assert.match(completionMarker.manifestSha256, /^[a-f0-9]{64}$/);
      assert.equal(
        completionMarker.manifestSha256,
        crypto
          .createHash("sha256")
          .update(fs.readFileSync(result.manifestPath))
          .digest("hex"),
      );
      assert.deepEqual(snapshot(fixture.sourceRoot), sourceBefore);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("is idempotent and recovers a partially copied migration without overwriting changes", function () {
    const fixture = makeFixture();
    let failed = false;
    try {
      assert.throws(() =>
        createMigrator(fixture, {
          copyFile: (source, target) => {
            if (
              !failed &&
              source.endsWith(path.join("generated", "acme", "article.md"))
            ) {
              failed = true;
              throw new Error("injected copy failure");
            }
            fs.copyFileSync(source, target);
          },
        }).migrate({ confirmed: true }),
      );
      assert.equal(
        fs.existsSync(
          path.join(
            fixture.contentLibraryRoot,
            ".autopublish/content-library-v2-migration-complete.json",
          ),
        ),
        false,
      );

      const recovered = createMigrator(fixture).migrate({ confirmed: true });
      assert.equal(recovered.completed, true);
      const second = createMigrator(fixture).migrate({ confirmed: true });
      assert.equal(second.completed, true);
      assert.ok(second.summary.skipped > 0);
      assert.equal(
        fs.readFileSync(
          path.join(fixture.contentLibraryRoot, "generated/acme/article.md"),
          "utf8",
        ),
        "# Article\n",
      );
      const rolledBack = createMigrator(fixture).rollback();
      assert.equal(rolledBack.completed, true);
      assert.equal(
        fs.existsSync(
          path.join(fixture.contentLibraryRoot, "generated/acme/article.md"),
        ),
        false,
      );
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("fails closed when completed provenance or its completion hash is tampered", function () {
    const fixture = makeFixture();
    try {
      const migrated = createMigrator(fixture).migrate({ confirmed: true });
      const manifestPath = migrated.manifestPath;
      const originalManifest = fs.readFileSync(manifestPath, "utf8");
      const manifest = JSON.parse(originalManifest);

      manifest.completedAt = "tampered";
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
      assert.throws(
        () => createMigrator(fixture).migrate({ confirmed: true }),
        (error) => error.code === "MIGRATION_COMPLETED_CONFLICT",
      );

      fs.writeFileSync(manifestPath, originalManifest, "utf8");
      const ownershipTampered = JSON.parse(originalManifest);
      ownershipTampered.rollback.createdTargets = [];
      fs.writeFileSync(
        manifestPath,
        JSON.stringify(ownershipTampered, null, 2) + "\n",
        "utf8",
      );
      assert.throws(
        () => createMigrator(fixture).migrate({ confirmed: true }),
        (error) => error.code === "MIGRATION_COMPLETED_CONFLICT",
      );
      assert.throws(
        () => createMigrator(fixture).rollback(),
        (error) => error.code === "MIGRATION_ROLLBACK_PROOF_INVALID",
      );
      assert.equal(
        fs.existsSync(
          path.join(fixture.contentLibraryRoot, "generated/acme/article.md"),
        ),
        true,
      );
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects unexpected app-config backups when no app-config existed", function () {
    const fixture = makeFixture();
    const backupPath =
      fixture.appConfigPath + migration.APP_CONFIG_BACKUP_SUFFIX;
    try {
      write(fixture.root, path.relative(fixture.root, backupPath), "foreign\n");
      assert.throws(
        () => createMigrator(fixture).migrate({ confirmed: true }),
        (error) => error.code === "MIGRATION_ROLLBACK_BACKUP_CONFLICT",
      );
      assert.equal(fs.readFileSync(backupPath, "utf8"), "foreign\n");

      fs.unlinkSync(backupPath);
      const migrated = createMigrator(fixture).migrate({ confirmed: true });
      write(fixture.root, path.relative(fixture.root, backupPath), "foreign\n");
      assert.throws(
        () => createMigrator(fixture).migrate({ confirmed: true }),
        (error) => error.code === "MIGRATION_COMPLETED_CONFLICT",
      );
      assert.throws(
        () => createMigrator(fixture).rollback(),
        (error) => error.code === "MIGRATION_ROLLBACK_CONFLICT",
      );
      assert.equal(fs.readFileSync(backupPath, "utf8"), "foreign\n");
      assert.equal(
        fs.existsSync(
          path.join(fixture.contentLibraryRoot, "generated/acme/article.md"),
        ),
        true,
      );
      assert.equal(migrated.completed, true);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("preserves created-target ownership when interrupted after a target rename", function () {
    const fixture = makeFixture();
    const targetPath = path.join(
      fixture.contentLibraryRoot,
      "generated",
      "acme",
      "article.md",
    );
    const originalRename = fs.renameSync;
    let interrupted = false;
    try {
      fs.renameSync = function (source, target) {
        if (!interrupted && path.resolve(target) === path.resolve(targetPath)) {
          interrupted = true;
          originalRename(source, target);
          throw new Error("injected post-rename interruption");
        }
        return originalRename(source, target);
      };
      assert.throws(
        () => createMigrator(fixture).migrate({ confirmed: true }),
        /post-rename interruption/,
      );
      const manifestPath = path.join(
        fixture.contentLibraryRoot,
        ".autopublish",
        migration.MANIFEST_NAME,
      );
      const interruptedManifest = JSON.parse(
        fs.readFileSync(manifestPath, "utf8"),
      );
      assert.equal(interruptedManifest.status, "in-progress");
      assert.ok(
        interruptedManifest.rollback.createdTargets.includes(
          "generated/acme/article.md",
        ),
      );
    } finally {
      fs.renameSync = originalRename;
    }
    try {
      const recovered = createMigrator(fixture).migrate({ confirmed: true });
      assert.equal(recovered.completed, true);
      const rolledBack = createMigrator(fixture).rollback();
      assert.equal(rolledBack.completed, true);
      assert.equal(fs.existsSync(targetPath), false);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("preserves app-config rollback intent when interrupted after replacement", function () {
    const fixture = makeFixture();
    const originalRename = fs.renameSync;
    let interrupted = false;
    try {
      fs.renameSync = function (source, target) {
        if (
          !interrupted &&
          path.resolve(target) === path.resolve(fixture.appConfigPath)
        ) {
          interrupted = true;
          originalRename(source, target);
          throw new Error("injected app-config interruption");
        }
        return originalRename(source, target);
      };
      assert.throws(
        () => createMigrator(fixture).migrate({ confirmed: true }),
        /app-config interruption/,
      );
      const manifestPath = path.join(
        fixture.contentLibraryRoot,
        ".autopublish",
        migration.MANIFEST_NAME,
      );
      const interruptedManifest = JSON.parse(
        fs.readFileSync(manifestPath, "utf8"),
      );
      assert.equal(interruptedManifest.rollback.appConfig.pending, true);
      assert.match(
        interruptedManifest.rollback.appConfig.migratedSha256,
        /^[a-f0-9]{64}$/,
      );
    } finally {
      fs.renameSync = originalRename;
    }
    try {
      const recovered = createMigrator(fixture).migrate({ confirmed: true });
      assert.equal(recovered.completed, true);
      const rolledBack = createMigrator(fixture).rollback();
      assert.equal(rolledBack.completed, true);
      assert.equal(fs.existsSync(fixture.appConfigPath), false);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("records and executes a guarded byte-for-byte rollback fixture", function () {
    const fixture = makeFixture();
    const originalConfig = '{\n  "version": 1,\n  "values": {}\n}\n';
    try {
      write(
        fixture.contentLibraryRoot,
        "clients/acme/untouched.txt",
        "keep content\n",
      );
      write(fixture.localStateRoot, "logs/untouched.log", "keep local\n");
      write(fixture.appConfigPath, "", originalConfig);
      const sourceBefore = snapshot(fixture.sourceRoot);
      const migrated = createMigrator(fixture).migrate({ confirmed: true });
      assert.equal(migrated.completed, true);
      assert.equal(
        migration.parseArguments([
          "--source",
          fixture.sourceRoot,
          "--content-library",
          fixture.contentLibraryRoot,
          "--local-state",
          fixture.localStateRoot,
          "--app-config",
          fixture.appConfigPath,
          "--rollback",
        ]).mode,
        "rollback",
      );

      const rolledBack = createMigrator(fixture).rollback();
      assert.equal(rolledBack.mode, "rollback");
      assert.equal(rolledBack.completed, true);
      assert.equal(rolledBack.rollback.status, "complete");
      assert.ok(rolledBack.rollback.removedTargets > 0);
      assert.equal(
        fs.readFileSync(
          path.join(fixture.contentLibraryRoot, "clients/acme/untouched.txt"),
          "utf8",
        ),
        "keep content\n",
      );
      assert.equal(
        fs.readFileSync(
          path.join(fixture.localStateRoot, "logs/untouched.log"),
          "utf8",
        ),
        "keep local\n",
      );
      assert.equal(
        fs.existsSync(
          path.join(fixture.contentLibraryRoot, "generated/acme/article.md"),
        ),
        false,
      );
      assert.equal(
        fs.existsSync(
          path.join(fixture.localStateRoot, "browser/doubao/session.json"),
        ),
        false,
      );
      assert.equal(
        fs.readFileSync(fixture.appConfigPath, "utf8"),
        originalConfig,
      );
      assert.equal(
        fs.existsSync(
          fixture.appConfigPath + migration.APP_CONFIG_BACKUP_SUFFIX,
        ),
        false,
      );
      assert.equal(
        JSON.parse(fs.readFileSync(rolledBack.manifestPath, "utf8")).status,
        "rolled-back",
      );
      assert.equal(
        JSON.parse(fs.readFileSync(rolledBack.completionMarkerPath, "utf8"))
          .status,
        "rolled-back",
      );
      assert.deepEqual(snapshot(fixture.sourceRoot), sourceBefore);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("preserves the last valid manifest when Windows keeps the destination locked", function () {
    const fixture = makeFixture();
    const manifestPath = path.join(
      fixture.contentLibraryRoot,
      ".autopublish",
      migration.MANIFEST_NAME,
    );
    const previous =
      JSON.stringify({ version: 2, status: "complete", proof: "previous" }) +
      "\n";
    write(
      fixture.contentLibraryRoot,
      path.join(".autopublish", migration.MANIFEST_NAME),
      previous,
    );
    const originalRename = fs.renameSync;
    try {
      fs.renameSync = function (source, target) {
        if (path.resolve(target) === path.resolve(manifestPath)) {
          const error = new Error("destination is locked");
          error.code = "EBUSY";
          throw error;
        }
        return originalRename(source, target);
      };
      assert.throws(
        () => createMigrator(fixture).migrate({ confirmed: true }),
        (error) => error.code === "MIGRATION_COMPLETED_CONFLICT",
      );
      assert.equal(fs.readFileSync(manifestPath, "utf8"), previous);
      assert.equal(
        fs.existsSync(
          path.join(
            fixture.contentLibraryRoot,
            "generated",
            "acme",
            "article.md",
          ),
        ),
        false,
      );
    } finally {
      fs.renameSync = originalRename;
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects symlinked source entries and does not follow them", function (t) {
    const fixture = makeFixture();
    const outside = path.join(fixture.root, "outside");
    fs.mkdirSync(outside);
    try {
      try {
        fs.symlinkSync(
          outside,
          path.join(fixture.sourceRoot, "clients", "linked"),
          "junction",
        );
      } catch (error) {
        if (["EPERM", "EACCES", "ENOTSUP", "EINVAL"].includes(error.code)) {
          t.skip("symlinks or junctions are unavailable in this environment");
          return;
        }
        throw error;
      }
      assert.throws(
        () => createMigrator(fixture).dryRun(),
        (error) => error.code === "MIGRATION_SYMLINK_UNSAFE",
      );
      assert.equal(snapshot(outside).length, 0);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("supports the CLI dry-run and requires --execute for writes", function () {
    const fixture = makeFixture();
    const script = path.resolve(
      __dirname,
      "..",
      "scripts",
      "migrate-content-library-v2.js",
    );
    try {
      const dryRun = childProcess.spawnSync(
        process.execPath,
        [
          script,
          "--source",
          fixture.sourceRoot,
          "--content-library",
          fixture.contentLibraryRoot,
          "--local-state",
          fixture.localStateRoot,
          "--app-config",
          fixture.appConfigPath,
          "--dry-run",
        ],
        { encoding: "utf8" },
      );
      assert.equal(dryRun.status, 0, dryRun.stderr);
      assert.equal(JSON.parse(dryRun.stdout).mode, "dry-run");
      assert.equal(fs.existsSync(fixture.contentLibraryRoot), false);

      const execute = childProcess.spawnSync(
        process.execPath,
        [
          script,
          "--source",
          fixture.sourceRoot,
          "--content-library",
          fixture.contentLibraryRoot,
          "--local-state",
          fixture.localStateRoot,
          "--app-config",
          fixture.appConfigPath,
          "--execute",
        ],
        { encoding: "utf8" },
      );
      assert.equal(execute.status, 0, execute.stderr);
      assert.equal(JSON.parse(execute.stdout).mode, "execute");
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("excludes the one-shot migration script from the desktop package", function () {
    const config = fs.readFileSync(
      path.resolve(__dirname, "..", "electron-builder.alpha.yml"),
      "utf8",
    );
    assert.match(
      config,
      /^\s*-\s+["']?!scripts\/migrate-content-library-v2\.js["']?\s*$/m,
    );
  });
});
