const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createStorageMaintenanceService,
} = require("../desktop/services/storage-maintenance-service");
const {
  registerStorageMaintenanceIpc,
} = require("../desktop/ipc/storage-maintenance-ipc");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "storage-maintenance-"));
  const paths = {
    localState: path.join(root, "local-state"),
    logs: path.join(root, "local-state", "logs"),
    temporary: path.join(root, "local-state", "tmp"),
    docxCache: path.join(root, "local-state", "cache", "docx"),
    browserProfile: path.join(root, "local-state", "browser", "doubao"),
    aiConfig: path.join(root, "roaming", "ai-provider.json"),
    contentLibrary: path.join(root, "content-library"),
    migrationBackup: path.join(root, "migration-backup"),
  };
  Object.values(paths).forEach(function (value) {
    if (path.extname(value))
      fs.mkdirSync(path.dirname(value), { recursive: true });
    else fs.mkdirSync(value, { recursive: true });
  });
  const now = new Date("2026-07-15T00:00:00.000Z");
  return { root, paths, now };
}

function writeFile(filePath, size, mtime) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.alloc(size, 1));
  fs.utimesSync(filePath, mtime, mtime);
}

describe("storage maintenance", function () {
  it("registers safe usage and cache cleanup IPC commands", async function () {
    const handlers = new Map();
    registerStorageMaintenanceIpc({
      ipcMain: {
        handle: function (channel, handler) {
          handlers.set(channel, handler);
        },
      },
      storageMaintenanceService: {
        getUsage: function () {
          return { logs: { bytes: 1 } };
        },
        cleanupCaches: function () {
          return { blocked: false, deleted: [], failed: [] };
        },
      },
    });

    assert.equal(handlers.has("storage-maintenance:get-usage"), true);
    assert.equal(handlers.has("storage-maintenance:clean-caches"), true);
    const usage = await handlers.get("storage-maintenance:get-usage")(null, undefined);
    assert.equal(usage.ok, true);
    assert.equal(usage.data.logs.bytes, 1);
    assert.deepEqual(Object.keys(usage.data).sort(), [
      "active", "docxCache", "logs", "profiles", "removableBytes",
      "temporary", "tmp", "totalBytes",
    ]);
    const cleanup = await handlers.get("storage-maintenance:clean-caches")(null, undefined);
    assert.deepEqual(cleanup, {
      ok: true,
      data: {
        blocked: false,
        reason: null,
        deletedCount: 0,
        failedCount: 0,
        usage: usage.data,
      },
    });
    const invalid = await handlers.get("storage-maintenance:clean-caches")(
      null,
      { clearAll: true },
    );
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error.code, "STORAGE_MAINTENANCE_INPUT_INVALID");
  });

  it("reports usage and cleans caches without following file or directory links", function () {
    const f = fixture();
    try {
      writeFile(path.join(f.paths.logs, "app.log"), 10, f.now);
      writeFile(path.join(f.paths.temporary, "job.tmp"), 20, f.now);
      writeFile(path.join(f.paths.docxCache, "document.json"), 30, f.now);
      writeFile(path.join(f.paths.browserProfile, "Cookies"), 40, f.now);
      const outside = path.join(f.root, "outside-secret.txt");
      writeFile(outside, 50, f.now);
      const outsideDirectory = path.join(f.root, "outside-directory");
      const outsideNested = path.join(outsideDirectory, "outside-cache.log");
      writeFile(
        outsideNested,
        60,
        new Date(f.now.getTime() - 31 * 24 * 60 * 60 * 1000),
      );
      fs.symlinkSync(outside, path.join(f.paths.logs, "outside-file-link"));
      fs.symlinkSync(
        outsideDirectory,
        path.join(f.paths.logs, "outside-directory-link"),
        "junction",
      );

      const service = createStorageMaintenanceService({
        paths: f.paths,
        now: function () {
          return f.now;
        },
      });
      const usage = service.getUsage();

      assert.equal(usage.logs.bytes, 10);
      assert.equal(usage.temporary.bytes, 20);
      assert.equal(usage.docxCache.bytes, 30);
      assert.equal(usage.profiles.bytes, 40);
      assert.equal(usage.totalBytes, 100);
      assert.equal(usage.logs.followedSymlinks, 0);
      assert.equal(usage.logs.skippedSymlinks, 2);
      assert.equal(fs.existsSync(outside), true);

      const cleanup = service.cleanupCaches();
      assert.equal(cleanup.deleted.includes(outsideNested), false);
      assert.equal(fs.existsSync(outside), true);
      assert.equal(fs.existsSync(outsideNested), true);
      assert.equal(
        fs
          .lstatSync(path.join(f.paths.logs, "outside-file-link"))
          .isSymbolicLink(),
        true,
      );
      assert.equal(
        fs
          .lstatSync(path.join(f.paths.logs, "outside-directory-link"))
          .isSymbolicLink(),
        true,
      );
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("removes only expired or over-limit whitelisted files and preserves protected data", function () {
    const f = fixture();
    try {
      const old = new Date(f.now.getTime() - 31 * 24 * 60 * 60 * 1000);
      const recent = new Date(f.now.getTime() - 2 * 24 * 60 * 60 * 1000);
      writeFile(path.join(f.paths.logs, "old.log"), 5, old);
      writeFile(path.join(f.paths.logs, "recent.log"), 5, recent);
      writeFile(
        path.join(f.paths.temporary, "old.tmp"),
        5,
        new Date(f.now.getTime() - 8 * 24 * 60 * 60 * 1000),
      );
      writeFile(path.join(f.paths.temporary, "recent.tmp"), 5, recent);
      writeFile(
        path.join(f.paths.docxCache, "least-used.json"),
        4,
        new Date(f.now.getTime() - 3 * 24 * 60 * 60 * 1000),
      );
      writeFile(path.join(f.paths.docxCache, "most-used.json"), 4, recent);
      writeFile(path.join(f.paths.browserProfile, "Cookies"), 6, old);
      writeFile(f.paths.aiConfig, 7, old);
      writeFile(path.join(f.paths.contentLibrary, "article.md"), 8, old);
      writeFile(path.join(f.paths.migrationBackup, "backup.zip"), 9, old);

      const service = createStorageMaintenanceService({
        paths: f.paths,
        now: function () {
          return f.now;
        },
        limits: { logBytes: 5, docxCacheBytes: 6 },
      });
      const result = service.cleanupCaches();

      assert.equal(result.blocked, false);
      assert.equal(fs.existsSync(path.join(f.paths.logs, "old.log")), false);
      assert.equal(fs.existsSync(path.join(f.paths.logs, "recent.log")), true);
      assert.equal(
        fs.existsSync(path.join(f.paths.temporary, "old.tmp")),
        false,
      );
      assert.equal(
        fs.existsSync(path.join(f.paths.temporary, "recent.tmp")),
        true,
      );
      assert.equal(
        fs.existsSync(path.join(f.paths.docxCache, "least-used.json")),
        false,
      );
      assert.equal(
        fs.existsSync(path.join(f.paths.docxCache, "most-used.json")),
        true,
      );
      assert.equal(
        fs.existsSync(path.join(f.paths.browserProfile, "Cookies")),
        true,
      );
      assert.equal(fs.existsSync(f.paths.aiConfig), true);
      assert.equal(
        fs.existsSync(path.join(f.paths.contentLibrary, "article.md")),
        true,
      );
      assert.equal(
        fs.existsSync(path.join(f.paths.migrationBackup, "backup.zip")),
        true,
      );
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("blocks cleanup while any collection, generation, or submission task is active", function () {
    const f = fixture();
    try {
      const old = new Date(f.now.getTime() - 31 * 24 * 60 * 60 * 1000);
      writeFile(path.join(f.paths.logs, "old.log"), 5, old);
      const service = createStorageMaintenanceService({
        paths: f.paths,
        now: function () {
          return f.now;
        },
        getActivityState: function () {
          return { collection: { status: "running" } };
        },
      });

      const result = service.cleanupCaches();
      assert.equal(result.blocked, true);
      assert.equal(result.reason, "STORAGE_MAINTENANCE_BUSY");
      assert.equal(fs.existsSync(path.join(f.paths.logs, "old.log")), true);
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("blocks cleanup when the activity provider returns a direct running state", function () {
    const f = fixture();
    try {
      const old = new Date(f.now.getTime() - 31 * 24 * 60 * 60 * 1000);
      writeFile(path.join(f.paths.logs, "old.log"), 5, old);
      const service = createStorageMaintenanceService({
        paths: f.paths,
        now: function () {
          return f.now;
        },
        getActivityState: function () {
          return "running";
        },
      });

      const result = service.cleanupCaches();
      assert.equal(result.blocked, true);
      assert.equal(fs.existsSync(path.join(f.paths.logs, "old.log")), true);
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("continues after one delete fails and makes repeated cleanup safe", function () {
    const f = fixture();
    try {
      const old = new Date(f.now.getTime() - 31 * 24 * 60 * 60 * 1000);
      writeFile(path.join(f.paths.logs, "failed.log"), 5, old);
      writeFile(path.join(f.paths.logs, "deleted.log"), 5, old);
      const realFs = require("node:fs");
      const service = createStorageMaintenanceService({
        paths: f.paths,
        now: function () {
          return f.now;
        },
        fs: Object.assign({}, realFs, {
          unlinkSync: function (filePath) {
            if (filePath.endsWith("failed.log"))
              throw new Error("permission denied");
            return realFs.unlinkSync(filePath);
          },
        }),
      });

      const first = service.cleanupCaches();
      const second = service.cleanupCaches();
      assert.equal(first.failed.length, 1);
      assert.equal(fs.existsSync(path.join(f.paths.logs, "failed.log")), true);
      assert.equal(
        fs.existsSync(path.join(f.paths.logs, "deleted.log")),
        false,
      );
      assert.equal(second.failed.length, 1);
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });
});
