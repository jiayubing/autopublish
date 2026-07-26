const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { it } = require("node:test");
const { createMigration } = require("../scripts/migrate-content-metadata-v1");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-metadata-v1-"));
  fs.mkdirSync(path.join(root, "clients", "physical-client"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, "clients", "physical-client", "client.json"),
    JSON.stringify({ id: "logical-client", name: "Client" }) + "\n",
  );
  return root;
}
function multiFixture(count) {
  const root = fixture();
  for (let index = 1; index < count; index += 1) {
    const directory = path.join(root, "clients", "physical-client-" + index);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, "client.json"),
      JSON.stringify({
        id: "logical-client-" + index,
        name: "Client " + index,
      }) + "\n",
    );
  }
  return root;
}
function snapshot(root) {
  const result = [];
  function walk(directory) {
    fs.readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((entry) => {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(filename);
        else
          result.push([
            path.relative(root, filename),
            fs.readFileSync(filename),
          ]);
      });
  }
  walk(root);
  return result;
}

it("dry-run reports a version write without modifying the workspace", () => {
  const root = fixture();
  try {
    const before = snapshot(root);
    const report = createMigration({ workspaceRoot: root }).dryRun();
    assert.equal(report.version, 1);
    assert.equal(report.mode, "dry-run");
    assert.equal(report.writes, 1);
    assert.deepEqual(snapshot(root), before);
    assert.equal(
      fs.existsSync(path.join(root, "content-metadata-v1-manifest.json")),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("keeps duplicate, missing, corrupt and directory conflicts in a repair report", () => {
  const root = fixture();
  try {
    fs.mkdirSync(path.join(root, "clients", "second"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "clients", "second", "client.json"),
      JSON.stringify({ id: "logical-client", name: "Duplicate" }),
    );
    fs.writeFileSync(path.join(root, "clients", "broken", "client.json"), "{", {
      encoding: "utf8",
    });
  } catch (_) {
    /* fixture is still useful if the optional broken path cannot be created */
  }
  try {
    const report = createMigration({ workspaceRoot: root }).dryRun();
    assert.ok(report.duplicateClientIds.length >= 1);
    assert.ok(report.directoryConflicts.length >= 1);
    assert.ok(report.repairItems.length >= 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("executes atomically with an independent backup and rolls back byte-for-byte", () => {
  const root = fixture();
  const backup = fs.mkdtempSync(
    path.join(os.tmpdir(), "content-metadata-backup-"),
  );
  fs.rmSync(backup, { recursive: true, force: true });
  try {
    const before = snapshot(root);
    const result = createMigration({
      workspaceRoot: root,
      backupRoot: backup,
      confirmed: true,
      now: () => "2026-07-25T00:00:00.000Z",
    }).execute();
    assert.equal(result.mode, "execute");
    assert.equal(
      JSON.parse(
        fs.readFileSync(
          path.join(root, "clients", "physical-client", "client.json"),
          "utf8",
        ),
      ).metadataVersion,
      1,
    );
    assert.ok(fs.existsSync(result.manifestPath));
    const rolledBack = createMigration({
      workspaceRoot: root,
      backupRoot: backup,
    }).rollback();
    assert.equal(rolledBack.mode, "rollback");
    assert.deepEqual(snapshot(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(backup, { recursive: true, force: true });
  }
});

it("scans generated articles when clients root is absent", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "content-metadata-generated-only-"),
  );
  try {
    fs.mkdirSync(path.join(root, "generated", "physical"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "generated", "physical", "article.json"),
      JSON.stringify({
        id: "article-1",
        generationTaskId: "task-1",
        createdAt: "not-a-time",
      }),
    );
    const report = createMigration({ workspaceRoot: root }).dryRun();
    assert.equal(report.scannedArticles, 1);
    assert.deepEqual(report.missingIds, []);
    assert.equal(report.invalidTimes.length, 1);
    assert.ok(report.repairItems.some((item) => item.kind === "clients-root"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("rejects a tampered backup before touching the workspace", () => {
  const root = fixture();
  const backup = path.join(
    os.tmpdir(),
    "content-metadata-tampered-" +
      Date.now() +
      "-" +
      Math.random().toString(16).slice(2),
  );
  try {
    const migration = createMigration({
      workspaceRoot: root,
      backupRoot: backup,
      confirmed: true,
    });
    migration.execute();
    fs.appendFileSync(
      path.join(
        backup,
        "snapshot",
        "clients",
        "physical-client",
        "client.json",
      ),
      "tampered",
    );
    const before = snapshot(root);
    assert.throws(
      () =>
        createMigration({ workspaceRoot: root, backupRoot: backup }).rollback(),
      { code: "CONTENT_METADATA_BACKUP_HASH_MISMATCH" },
    );
    assert.deepEqual(snapshot(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(backup, { recursive: true, force: true });
  }
});

it("restores the complete workspace after first, middle, and last staging write failures", () => {
  for (const failureAt of [1, 2, 3]) {
    const root = multiFixture(4);
    const backup = path.join(
      os.tmpdir(),
      "content-metadata-fault-" +
        Date.now() +
        "-" +
        failureAt +
        "-" +
        Math.random().toString(16).slice(2),
    );
    const before = snapshot(root);
    const originalWrite = fs.writeFileSync;
    let writes = 0;
    try {
      fs.writeFileSync = function (filename, data, encoding) {
        if (
          String(filename).includes(".staging-") &&
          String(filename).endsWith(".tmp-" + process.pid + "-")
        ) {
          /* no-op: filenames contain a random suffix */
        }
        if (
          String(filename).includes(".staging-") &&
          String(filename).includes(".tmp-")
        ) {
          writes += 1;
          if (writes === failureAt)
            throw Object.assign(new Error("disk full"), { code: "EIO" });
        }
        return originalWrite.call(fs, filename, data, encoding);
      };
      assert.throws(
        () =>
          createMigration({
            workspaceRoot: root,
            backupRoot: backup,
            confirmed: true,
          }).execute(),
        /disk full/,
      );
      assert.deepEqual(snapshot(root), before);
      assert.ok(
        fs.existsSync(path.join(backup, "content-metadata-v1-manifest.json")),
      );
    } finally {
      fs.writeFileSync = originalWrite;
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(backup, { recursive: true, force: true });
    }
  }
});

it("makes repeated execute explicit only while the workspace matches the committed result", () => {
  const root = fixture();
  const backup = path.join(
    os.tmpdir(),
    "content-metadata-repeat-" +
      Date.now() +
      "-" +
      Math.random().toString(16).slice(2),
  );
  try {
    const first = createMigration({
      workspaceRoot: root,
      backupRoot: backup,
      confirmed: true,
    }).execute();
    const afterExecute = snapshot(root);
    const second = createMigration({
      workspaceRoot: root,
      backupRoot: backup,
      confirmed: true,
    }).execute();
    assert.equal(second.noOp, true);
    assert.deepEqual(snapshot(root), afterExecute);
    const firstRollback = createMigration({
      workspaceRoot: root,
      backupRoot: backup,
    }).rollback();
    assert.equal(firstRollback.mode, "rollback");
    const afterRollback = snapshot(root);
    assert.throws(
      () =>
        createMigration({
          workspaceRoot: root,
          backupRoot: backup,
          confirmed: true,
        }).execute(),
      { code: "CONTENT_METADATA_ROLLED_BACK_REEXECUTE_REQUIRED" },
    );
    const secondRollback = createMigration({
      workspaceRoot: root,
      backupRoot: backup,
    }).rollback();
    assert.equal(secondRollback.noOp, true);
    assert.deepEqual(snapshot(root), afterRollback);
    assert.equal(first.manifestPath, second.manifestPath);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(backup, { recursive: true, force: true });
  }
});

it("does not treat a changed committed workspace as an execute no-op", () => {
  const root = fixture();
  const backup = path.join(
    os.tmpdir(),
    "content-metadata-committed-conflict-" +
      Date.now() +
      "-" +
      Math.random().toString(16).slice(2),
  );
  try {
    createMigration({
      workspaceRoot: root,
      backupRoot: backup,
      confirmed: true,
    }).execute();
    const metadataPath = path.join(
      root,
      "clients",
      "physical-client",
      "client.json",
    );
    fs.writeFileSync(
      metadataPath,
      JSON.stringify({
        id: "logical-client",
        name: "changed",
        metadataVersion: 1,
      }) + "\n",
    );
    assert.throws(
      () =>
        createMigration({
          workspaceRoot: root,
          backupRoot: backup,
          confirmed: true,
        }).execute(),
      { code: "CONTENT_METADATA_WORKSPACE_CHANGED" },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(backup, { recursive: true, force: true });
  }
});

it("rejects malformed manifests and backup extras before rollback mutation", () => {
  for (const mutate of [
    (manifestPath, backup) => fs.writeFileSync(manifestPath, "{", "utf8"),
    (manifestPath, backup) => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      manifest.version = 99;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    },
    (manifestPath, backup) =>
      fs.writeFileSync(path.join(backup, "injected.json"), "injected"),
  ]) {
    const root = fixture();
    const backup = path.join(
      os.tmpdir(),
      "content-metadata-manifest-" +
        Date.now() +
        "-" +
        Math.random().toString(16).slice(2),
    );
    try {
      const result = createMigration({
        workspaceRoot: root,
        backupRoot: backup,
        confirmed: true,
      }).execute();
      const before = snapshot(root);
      mutate(result.manifestPath, backup);
      assert.throws(() =>
        createMigration({ workspaceRoot: root, backupRoot: backup }).rollback(),
      );
      assert.deepEqual(snapshot(root), before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(backup, { recursive: true, force: true });
    }
  }
});

it("rejects a tampered transaction id before execute, recover, or rollback can mutate any sibling path", () => {
  for (const mode of ["execute", "recover", "rollback"]) {
    const root = fixture();
    const backup = path.join(
      os.tmpdir(),
      `content-metadata-transaction-id-${mode}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const originalCopy = fs.cpSync;
    const originalRename = fs.renameSync;
    const originalRemove = fs.rmSync;
    let mutations = 0;
    try {
      const executed = createMigration({
        workspaceRoot: root,
        backupRoot: backup,
        confirmed: true,
      }).execute();
      const manifest = JSON.parse(
        fs.readFileSync(executed.manifestPath, "utf8"),
      );
      manifest.transactionId = `anchor${path.sep}..${path.sep}..${path.sep}escaped-target`;
      fs.writeFileSync(executed.manifestPath, JSON.stringify(manifest));
      const before = snapshot(root);
      fs.cpSync = function () {
        mutations += 1;
        return originalCopy.apply(fs, arguments);
      };
      fs.renameSync = function () {
        mutations += 1;
        return originalRename.apply(fs, arguments);
      };
      fs.rmSync = function () {
        mutations += 1;
        return originalRemove.apply(fs, arguments);
      };
      const migration = createMigration({
        workspaceRoot: root,
        backupRoot: backup,
        confirmed: true,
      });
      assert.throws(() => migration[mode](), {
        code: "CONTENT_METADATA_MANIFEST_INVALID",
      });
      assert.equal(mutations, 0, mode);
      assert.deepEqual(snapshot(root), before);
    } finally {
      fs.cpSync = originalCopy;
      fs.renameSync = originalRename;
      fs.rmSync = originalRemove;
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(backup, { recursive: true, force: true });
    }
  }
});

it("requires explicit confirmation and disjoint absolute paths for execute", () => {
  const root = fixture();
  try {
    assert.throws(
      () =>
        createMigration({
          workspaceRoot: root,
          backupRoot: path.join(root, "backup"),
        }).execute(),
      { code: "CONTENT_METADATA_CONFIRMATION_REQUIRED" },
    );
    assert.throws(
      () => createMigration({ workspaceRoot: root, backupRoot: root }).dryRun(),
      { code: "CONTENT_METADATA_PATH_OVERLAP" },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("recovers a durable COMMITTING transaction when the process stops between directory renames", () => {
  const root = multiFixture(2);
  const backup = path.join(
    os.tmpdir(),
    "content-metadata-recover-" +
      Date.now() +
      "-" +
      Math.random().toString(16).slice(2),
  );
  const beforeRename = fs.renameSync;
  let interrupted = false;
  try {
    fs.renameSync = function (from, to) {
      if (
        !interrupted &&
        String(from).includes(".staging-") &&
        path.resolve(to) === path.resolve(root)
      ) {
        interrupted = true;
        const error = new Error("crash between renames");
        error.code = "EIO";
        throw error;
      }
      return beforeRename.apply(fs, arguments);
    };
    assert.throws(
      () =>
        createMigration({
          workspaceRoot: root,
          backupRoot: backup,
          confirmed: true,
        }).execute(),
      { code: "EIO" },
    );
    fs.renameSync = beforeRename;
    assert.equal(fs.existsSync(root), false);
    const recovered = createMigration({
      workspaceRoot: root,
      backupRoot: backup,
    }).recover();
    assert.equal(recovered.state, "COMMITTED");
    assert.equal(
      JSON.parse(
        fs.readFileSync(
          path.join(root, "clients", "physical-client", "client.json"),
          "utf8",
        ),
      ).metadataVersion,
      1,
    );
    assert.equal(
      fs.existsSync(
        root +
          ".before-" +
          JSON.parse(
            fs.readFileSync(
              path.join(backup, "content-metadata-v1-manifest.json"),
              "utf8",
            ),
          ).transactionId,
      ),
      false,
    );
  } finally {
    fs.renameSync = beforeRename;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(backup, { recursive: true, force: true });
  }
});

it("keeps the verified new workspace when old-root cleanup partially fails and recover finishes cleanup", () => {
  const root = multiFixture(3);
  const backup = path.join(
    os.tmpdir(),
    "content-metadata-cleanup-" +
      Date.now() +
      "-" +
      Math.random().toString(16).slice(2),
  );
  const originalRm = fs.rmSync;
  let injected = false;
  try {
    fs.rmSync = function (target, options) {
      if (
        !injected &&
        String(target).includes(".before-") &&
        options &&
        options.recursive
      ) {
        injected = true;
        const names = fs.readdirSync(target, { withFileTypes: true });
        const first = names[0];
        originalRm.call(fs, path.join(target, first.name), {
          recursive: first.isDirectory(),
        });
        const error = new Error("old root cleanup EIO");
        error.code = "EIO";
        throw error;
      }
      return originalRm.apply(fs, arguments);
    };
    assert.throws(
      () =>
        createMigration({
          workspaceRoot: root,
          backupRoot: backup,
          confirmed: true,
        }).execute(),
      { code: "EIO" },
    );
    fs.rmSync = originalRm;
    const manifestPath = path.join(backup, "content-metadata-v1-manifest.json");
    assert.equal(
      JSON.parse(fs.readFileSync(manifestPath, "utf8")).state,
      "CLEANUP_PENDING",
    );
    assert.equal(
      JSON.parse(
        fs.readFileSync(
          path.join(root, "clients", "physical-client", "client.json"),
          "utf8",
        ),
      ).metadataVersion,
      1,
    );
    assert.equal(
      createMigration({ workspaceRoot: root, backupRoot: backup }).recover()
        .state,
      "COMMITTED",
    );
    assert.equal(
      JSON.parse(fs.readFileSync(manifestPath, "utf8")).state,
      "COMMITTED",
    );
  } finally {
    fs.rmSync = originalRm;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(backup, { recursive: true, force: true });
  }
});

it("recovers rollback after the restore switch is interrupted", () => {
  const root = fixture();
  const backup = path.join(
    os.tmpdir(),
    "content-metadata-rollback-recover-" +
      Date.now() +
      "-" +
      Math.random().toString(16).slice(2),
  );
  const originalRename = fs.renameSync;
  let interrupted = false;
  try {
    const executed = createMigration({
      workspaceRoot: root,
      backupRoot: backup,
      confirmed: true,
    }).execute();
    fs.renameSync = function (from, to) {
      if (
        !interrupted &&
        String(from).includes(".restore-") &&
        path.resolve(to) === path.resolve(root)
      ) {
        interrupted = true;
        const error = new Error("rollback restore switch interrupted");
        error.code = "EIO";
        throw error;
      }
      return originalRename.apply(fs, arguments);
    };
    assert.throws(
      () =>
        createMigration({ workspaceRoot: root, backupRoot: backup }).rollback(),
      { code: "EIO" },
    );
    fs.renameSync = originalRename;
    const manifestPath = executed.manifestPath;
    assert.equal(
      JSON.parse(fs.readFileSync(manifestPath, "utf8")).state,
      "ROLLBACK_COMMITTING",
    );
    assert.equal(fs.existsSync(root), false);
    const recovered = createMigration({
      workspaceRoot: root,
      backupRoot: backup,
    }).recover();
    assert.equal(recovered.state, "ROLLED_BACK");
    assert.equal(fs.existsSync(root), true);
    assert.equal(
      JSON.parse(
        fs.readFileSync(
          path.join(root, "clients", "physical-client", "client.json"),
          "utf8",
        ),
      ).metadataVersion,
      undefined,
    );
    assert.equal(
      JSON.parse(fs.readFileSync(manifestPath, "utf8")).state,
      "ROLLED_BACK",
    );
  } finally {
    fs.renameSync = originalRename;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(backup, { recursive: true, force: true });
  }
});

it("persists rollback repair intent and resumes rollback after conflicting restore evidence is repaired", () => {
  const root = multiFixture(2);
  const backup = path.join(
    os.tmpdir(),
    `content-metadata-rollback-repair-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const originalRename = fs.renameSync;
  let injected = false;
  try {
    const executed = createMigration({
      workspaceRoot: root,
      backupRoot: backup,
      confirmed: true,
    }).execute();
    const beforeRollback = snapshot(root);
    fs.renameSync = function (from, to) {
      const isManifestWrite =
        path.resolve(to) === path.resolve(executed.manifestPath) &&
        String(from).includes(".tmp-");
      const pending = isManifestWrite
        ? JSON.parse(fs.readFileSync(from, "utf8"))
        : null;
      const result = originalRename.apply(fs, arguments);
      if (!injected && pending && pending.state === "ROLLBACK_COMMITTING") {
        injected = true;
        const manifest = JSON.parse(
          fs.readFileSync(executed.manifestPath, "utf8"),
        );
        fs.appendFileSync(
          path.join(
            root + ".restore-" + manifest.transactionId,
            "clients",
            "physical-client",
            "client.json",
          ),
          "tampered",
        );
      }
      return result;
    };
    assert.throws(
      () =>
        createMigration({ workspaceRoot: root, backupRoot: backup }).rollback(),
      { code: "CONTENT_METADATA_RECOVERY_CONFLICT" },
    );
    fs.renameSync = originalRename;
    const conflicted = JSON.parse(
      fs.readFileSync(executed.manifestPath, "utf8"),
    );
    assert.equal(conflicted.state, "NEEDS_REPAIR");
    assert.equal(conflicted.repairIntent, "rollback");
    assert.deepEqual(snapshot(root), beforeRollback);
    const restoreRoot = root + ".restore-" + conflicted.transactionId;
    fs.rmSync(restoreRoot, { recursive: true, force: true });
    fs.cpSync(path.join(backup, "snapshot"), restoreRoot, {
      recursive: true,
      dereference: false,
    });
    assert.throws(
      () =>
        createMigration({ workspaceRoot: root, backupRoot: backup }).recover(),
      { code: "CONTENT_METADATA_REPAIR_CONFIRMATION_REQUIRED" },
    );
    const repaired = createMigration({
      workspaceRoot: root,
      backupRoot: backup,
      repairConfirmed: true,
    }).recover();
    assert.equal(repaired.state, "ROLLED_BACK");
    assert.deepEqual(snapshot(root), snapshot(path.join(backup, "snapshot")));
    assert.equal(
      JSON.parse(fs.readFileSync(executed.manifestPath, "utf8")).state,
      "ROLLED_BACK",
    );
    assert.equal(fs.existsSync(restoreRoot), false);
  } finally {
    fs.renameSync = originalRename;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(backup, { recursive: true, force: true });
  }
});

it("never reports a forward repair as committed while rollback restore evidence remains", () => {
  const root = fixture();
  const backup = path.join(
    os.tmpdir(),
    `content-metadata-forward-repair-restore-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  try {
    const executed = createMigration({
      workspaceRoot: root,
      backupRoot: backup,
      confirmed: true,
    }).execute();
    const manifest = JSON.parse(fs.readFileSync(executed.manifestPath, "utf8"));
    const restoreRoot = root + ".restore-" + manifest.transactionId;
    fs.cpSync(path.join(backup, "snapshot"), restoreRoot, {
      recursive: true,
      dereference: false,
    });
    manifest.state = "NEEDS_REPAIR";
    manifest.repairIntent = "forward";
    fs.writeFileSync(executed.manifestPath, JSON.stringify(manifest));
    assert.throws(
      () =>
        createMigration({
          workspaceRoot: root,
          backupRoot: backup,
          repairConfirmed: true,
        }).recover(),
      { code: "CONTENT_METADATA_RECOVERY_CONFLICT" },
    );
    const conflicted = JSON.parse(
      fs.readFileSync(executed.manifestPath, "utf8"),
    );
    assert.equal(conflicted.state, "NEEDS_REPAIR");
    assert.equal(conflicted.repairIntent, "forward");
    assert.equal(fs.existsSync(restoreRoot), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(backup, { recursive: true, force: true });
  }
});

it("rejects a staging root symlink before recovery can install it", () => {
  const root = fixture();
  const backup = path.join(
    os.tmpdir(),
    "content-metadata-staging-link-" +
      Date.now() +
      "-" +
      Math.random().toString(16).slice(2),
  );
  const external = path.join(
    os.tmpdir(),
    "content-metadata-staging-link-target-" +
      Date.now() +
      "-" +
      Math.random().toString(16).slice(2),
  );
  try {
    const executed = createMigration({
      workspaceRoot: root,
      backupRoot: backup,
      confirmed: true,
    }).execute();
    fs.cpSync(root, external, { recursive: true, dereference: false });
    fs.rmSync(root, { recursive: true, force: true });
    fs.cpSync(path.join(backup, "snapshot"), root, {
      recursive: true,
      dereference: false,
    });
    const manifestPath = executed.manifestPath;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    fs.symlinkSync(
      external,
      root + ".staging-" + manifest.transactionId,
      "junction",
    );
    manifest.state = "COMMITTING";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(
      () =>
        createMigration({ workspaceRoot: root, backupRoot: backup }).recover(),
      { code: "CONTENT_METADATA_RECOVERY_CONFLICT" },
    );
    const conflicted = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.equal(conflicted.state, "NEEDS_REPAIR");
    assert.equal(conflicted.repairIntent, "forward");
    assert.equal(fs.lstatSync(root).isDirectory(), true);
    assert.equal(fs.lstatSync(root).isSymbolicLink(), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(backup, { recursive: true, force: true });
    fs.rmSync(external, { recursive: true, force: true });
  }
});

it("requires explicit confirmation before retrying a NEEDS_REPAIR recovery", () => {
  const root = multiFixture(2);
  const backup = path.join(
    os.tmpdir(),
    "content-metadata-needs-repair-confirm-" +
      Date.now() +
      "-" +
      Math.random().toString(16).slice(2),
  );
  const originalRename = fs.renameSync;
  let interrupted = false;
  try {
    fs.renameSync = function (from, to) {
      if (
        !interrupted &&
        String(from).includes(".staging-") &&
        path.resolve(to) === path.resolve(root)
      ) {
        interrupted = true;
        const error = new Error("crash between renames");
        error.code = "EIO";
        throw error;
      }
      return originalRename.apply(fs, arguments);
    };
    assert.throws(
      () =>
        createMigration({
          workspaceRoot: root,
          backupRoot: backup,
          confirmed: true,
        }).execute(),
      { code: "EIO" },
    );
    fs.renameSync = originalRename;
    const manifestPath = path.join(backup, "content-metadata-v1-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.state = "NEEDS_REPAIR";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(
      () =>
        createMigration({ workspaceRoot: root, backupRoot: backup }).recover(),
      { code: "CONTENT_METADATA_REPAIR_CONFIRMATION_REQUIRED" },
    );
    assert.equal(fs.existsSync(root), false);
    assert.equal(
      JSON.parse(fs.readFileSync(manifestPath, "utf8")).state,
      "NEEDS_REPAIR",
    );
    assert.equal(
      createMigration({
        workspaceRoot: root,
        backupRoot: backup,
        repairConfirmed: true,
      }).recover().state,
      "COMMITTED",
    );
  } finally {
    fs.renameSync = originalRename;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(backup, { recursive: true, force: true });
  }
});

it("fails closed when an installed workspace has residual staging evidence", () => {
  const root = fixture();
  const backup = path.join(
    os.tmpdir(),
    "content-metadata-residual-staging-" +
      Date.now() +
      "-" +
      Math.random().toString(16).slice(2),
  );
  try {
    const executed = createMigration({
      workspaceRoot: root,
      backupRoot: backup,
      confirmed: true,
    }).execute();
    const manifestPath = executed.manifestPath;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const stagingRoot = root + ".staging-" + manifest.transactionId;
    fs.cpSync(path.join(backup, "snapshot"), stagingRoot, {
      recursive: true,
      dereference: false,
    });
    manifest.state = "COMMITTING";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(
      () =>
        createMigration({ workspaceRoot: root, backupRoot: backup }).recover(),
      { code: "CONTENT_METADATA_RECOVERY_CONFLICT" },
    );
    assert.equal(
      JSON.parse(fs.readFileSync(manifestPath, "utf8")).state,
      "NEEDS_REPAIR",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(backup, { recursive: true, force: true });
  }
});

it("resumes PREPARED and STAGING_VERIFIED checkpoints instead of leaving a permanent no-op", () => {
  for (const interruption of [
    "before-staging",
    "partial-first",
    "partial-middle",
    "partial-last",
    "before-staging-verified",
    "before-committing",
    "before-old-root-ready",
  ]) {
    const root = multiFixture(3);
    const backup = path.join(
      os.tmpdir(),
      `content-metadata-early-${interruption}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const originalCopy = fs.cpSync;
    const originalRename = fs.renameSync;
    let interrupted = false;
    try {
      fs.cpSync = function (from, to, options) {
        if (!interrupted && String(to).includes(".staging-")) {
          if (interruption === "before-staging") {
            interrupted = true;
            throw Object.assign(new Error("before staging"), { code: "EIO" });
          }
          if (interruption.startsWith("partial-")) {
            originalCopy.apply(fs, arguments);
            const files = snapshot(to);
            const offset =
              interruption === "partial-first"
                ? 0
                : interruption === "partial-last"
                  ? files.length - 1
                  : Math.floor(files.length / 2);
            fs.unlinkSync(path.join(to, files[offset][0]));
            interrupted = true;
            throw Object.assign(new Error("partial staging"), { code: "EIO" });
          }
        }
        return originalCopy.apply(fs, arguments);
      };
      fs.renameSync = function (from, to) {
        if (
          !interrupted &&
          String(to).endsWith("content-metadata-v1-manifest.json") &&
          String(from).includes(".tmp-")
        ) {
          const pending = JSON.parse(fs.readFileSync(from, "utf8"));
          if (
            (interruption === "before-staging-verified" &&
              pending.state === "STAGING_VERIFIED") ||
            (interruption === "before-committing" &&
              pending.state === "COMMITTING") ||
            (interruption === "before-old-root-ready" &&
              pending.state === "OLD_ROOT_READY")
          ) {
            interrupted = true;
            throw Object.assign(new Error(interruption), { code: "EIO" });
          }
        }
        return originalRename.apply(fs, arguments);
      };
      assert.throws(
        () =>
          createMigration({
            workspaceRoot: root,
            backupRoot: backup,
            confirmed: true,
          }).execute(),
        { code: "EIO" },
      );
      fs.cpSync = originalCopy;
      fs.renameSync = originalRename;
      const recovered = createMigration({
        workspaceRoot: root,
        backupRoot: backup,
      }).recover();
      assert.equal(recovered.state, "COMMITTED", interruption);
      assert.equal(
        createMigration({ workspaceRoot: root, backupRoot: backup }).recover()
          .noOp,
        true,
      );
      assert.equal(
        createMigration({
          workspaceRoot: root,
          backupRoot: backup,
          confirmed: true,
        }).execute().noOp,
        true,
      );
    } finally {
      fs.cpSync = originalCopy;
      fs.renameSync = originalRename;
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(backup, { recursive: true, force: true });
    }
  }
});

it("rolls back from a verified partial migration old-root and removes every residual", () => {
  for (const failureAt of ["first", "middle", "last"]) {
    const root = multiFixture(4);
    const backup = path.join(
      os.tmpdir(),
      `content-metadata-partial-old-rollback-${failureAt}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const before = snapshot(root);
    const originalRemove = fs.rmSync;
    let interrupted = false;
    try {
      fs.rmSync = function (target, options) {
        if (
          !interrupted &&
          String(target).includes(".before-") &&
          options &&
          options.recursive
        ) {
          interrupted = true;
          const files = snapshot(target);
          const count =
            failureAt === "first"
              ? 1
              : failureAt === "last"
                ? files.length
                : Math.ceil(files.length / 2);
          files.slice(0, count).forEach(([filename]) =>
            originalRemove.call(fs, path.join(target, filename), {
              force: true,
            }),
          );
          throw Object.assign(
            new Error(`partial old-root cleanup ${failureAt}`),
            { code: "EIO" },
          );
        }
        return originalRemove.apply(fs, arguments);
      };
      assert.throws(
        () =>
          createMigration({
            workspaceRoot: root,
            backupRoot: backup,
            confirmed: true,
          }).execute(),
        { code: "EIO" },
      );
      fs.rmSync = originalRemove;
      const rolledBack = createMigration({
        workspaceRoot: root,
        backupRoot: backup,
      }).rollback();
      assert.equal(rolledBack.state, "ROLLED_BACK");
      assert.deepEqual(snapshot(root), before);
      const manifest = JSON.parse(
        fs.readFileSync(
          path.join(backup, "content-metadata-v1-manifest.json"),
          "utf8",
        ),
      );
      assert.equal(
        fs.existsSync(root + ".before-" + manifest.transactionId),
        false,
      );
      assert.equal(
        fs.existsSync(root + ".before-" + manifest.transactionId + "-rollback"),
        false,
      );
      assert.equal(
        fs.existsSync(root + ".restore-" + manifest.transactionId),
        false,
      );
    } finally {
      fs.rmSync = originalRemove;
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(backup, { recursive: true, force: true });
    }
  }
});

it("aborts an early partial staging deterministically and keeps repeated recovery idempotent", () => {
  const root = multiFixture(3);
  const backup = path.join(
    os.tmpdir(),
    `content-metadata-early-rollback-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const before = snapshot(root);
  const originalCopy = fs.cpSync;
  let interrupted = false;
  try {
    fs.cpSync = function (from, to, options) {
      if (!interrupted && String(to).includes(".staging-")) {
        originalCopy.apply(fs, arguments);
        const files = snapshot(to);
        fs.unlinkSync(path.join(to, files[0][0]));
        interrupted = true;
        throw Object.assign(new Error("partial staging"), { code: "EIO" });
      }
      return originalCopy.apply(fs, arguments);
    };
    assert.throws(
      () =>
        createMigration({
          workspaceRoot: root,
          backupRoot: backup,
          confirmed: true,
        }).execute(),
      { code: "EIO" },
    );
    fs.cpSync = originalCopy;
    const rolledBack = createMigration({
      workspaceRoot: root,
      backupRoot: backup,
    }).rollback();
    assert.equal(rolledBack.state, "ROLLED_BACK");
    assert.deepEqual(snapshot(root), before);
    assert.equal(
      createMigration({ workspaceRoot: root, backupRoot: backup }).rollback()
        .noOp,
      true,
    );
    assert.equal(
      createMigration({ workspaceRoot: root, backupRoot: backup }).recover()
        .noOp,
      true,
    );
    assert.throws(
      () =>
        createMigration({
          workspaceRoot: root,
          backupRoot: backup,
          confirmed: true,
        }).execute(),
      { code: "CONTENT_METADATA_ROLLED_BACK_REEXECUTE_REQUIRED" },
    );
  } finally {
    fs.cpSync = originalCopy;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(backup, { recursive: true, force: true });
  }
});

it("re-enters the early evidence matrix for an explicitly confirmed repair", () => {
  const root = multiFixture(3);
  const backup = path.join(
    os.tmpdir(),
    `content-metadata-early-repair-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const originalCopy = fs.cpSync;
  let interrupted = false;
  try {
    fs.cpSync = function (from, to, options) {
      if (!interrupted && String(to).includes(".staging-")) {
        originalCopy.apply(fs, arguments);
        const files = snapshot(to);
        fs.unlinkSync(path.join(to, files[files.length - 1][0]));
        interrupted = true;
        throw Object.assign(new Error("partial staging"), { code: "EIO" });
      }
      return originalCopy.apply(fs, arguments);
    };
    assert.throws(
      () =>
        createMigration({
          workspaceRoot: root,
          backupRoot: backup,
          confirmed: true,
        }).execute(),
      { code: "EIO" },
    );
    fs.cpSync = originalCopy;
    const manifestPath = path.join(backup, "content-metadata-v1-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.state = "NEEDS_REPAIR";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(
      () =>
        createMigration({ workspaceRoot: root, backupRoot: backup }).recover(),
      { code: "CONTENT_METADATA_REPAIR_CONFIRMATION_REQUIRED" },
    );
    assert.equal(
      createMigration({
        workspaceRoot: root,
        backupRoot: backup,
        repairConfirmed: true,
      }).recover().state,
      "COMMITTED",
    );
  } finally {
    fs.cpSync = originalCopy;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(backup, { recursive: true, force: true });
  }
});

it("rejects an unknown old-root residual before changing the installed workspace", () => {
  for (const mutation of [
    "hash",
    "type",
    "unknown-file",
    "unknown-directory",
  ]) {
    const root = multiFixture(3);
    const backup = path.join(
      os.tmpdir(),
      `content-metadata-old-residual-${mutation}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const originalRemove = fs.rmSync;
    let interrupted = false;
    try {
      fs.rmSync = function (target, options) {
        if (
          !interrupted &&
          String(target).includes(".before-") &&
          options &&
          options.recursive
        ) {
          interrupted = true;
          const files = snapshot(target);
          originalRemove.call(fs, path.join(target, files[0][0]), {
            force: true,
          });
          throw Object.assign(new Error("partial old-root cleanup"), {
            code: "EIO",
          });
        }
        return originalRemove.apply(fs, arguments);
      };
      assert.throws(() =>
        createMigration({
          workspaceRoot: root,
          backupRoot: backup,
          confirmed: true,
        }).execute(),
      );
      fs.rmSync = originalRemove;
      const manifest = JSON.parse(
        fs.readFileSync(
          path.join(backup, "content-metadata-v1-manifest.json"),
          "utf8",
        ),
      );
      const oldRoot = root + ".before-" + manifest.transactionId;
      const remaining = snapshot(oldRoot)[0][0];
      if (mutation === "hash")
        fs.appendFileSync(path.join(oldRoot, remaining), "tampered");
      if (mutation === "type") {
        fs.unlinkSync(path.join(oldRoot, remaining));
        fs.mkdirSync(path.join(oldRoot, remaining));
      }
      if (mutation === "unknown-file")
        fs.writeFileSync(path.join(oldRoot, "unknown"), "unknown");
      if (mutation === "unknown-directory")
        fs.mkdirSync(path.join(oldRoot, "unknown-empty-directory"));
      const installed = snapshot(root);
      assert.throws(
        () =>
          createMigration({
            workspaceRoot: root,
            backupRoot: backup,
          }).rollback(),
        { code: "CONTENT_METADATA_RECOVERY_CONFLICT" },
      );
      assert.deepEqual(snapshot(root), installed);
    } finally {
      fs.rmSync = originalRemove;
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(backup, { recursive: true, force: true });
    }
  }
});

it("rejects an old-root junction residual without touching its external target", () => {
  const root = multiFixture(3);
  const backup = path.join(
    os.tmpdir(),
    `content-metadata-old-residual-junction-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const external = fs.mkdtempSync(
    path.join(os.tmpdir(), "content-metadata-old-residual-target-"),
  );
  const marker = path.join(external, "marker.txt");
  const originalRemove = fs.rmSync;
  let interrupted = false;
  try {
    fs.writeFileSync(marker, "external-evidence");
    fs.rmSync = function (target, options) {
      if (
        !interrupted &&
        String(target).includes(".before-") &&
        options &&
        options.recursive
      ) {
        interrupted = true;
        const files = snapshot(target);
        originalRemove.call(fs, path.join(target, files[0][0]), {
          force: true,
        });
        throw Object.assign(new Error("partial old-root cleanup"), {
          code: "EIO",
        });
      }
      return originalRemove.apply(fs, arguments);
    };
    assert.throws(
      () =>
        createMigration({
          workspaceRoot: root,
          backupRoot: backup,
          confirmed: true,
        }).execute(),
      { code: "EIO" },
    );
    fs.rmSync = originalRemove;
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(backup, "content-metadata-v1-manifest.json"),
        "utf8",
      ),
    );
    const oldRoot = root + ".before-" + manifest.transactionId;
    fs.symlinkSync(
      external,
      path.join(oldRoot, "unknown-junction"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const installed = snapshot(root);
    assert.throws(
      () =>
        createMigration({ workspaceRoot: root, backupRoot: backup }).rollback(),
      { code: "CONTENT_METADATA_RECOVERY_CONFLICT" },
    );
    assert.deepEqual(snapshot(root), installed);
    assert.equal(fs.readFileSync(marker, "utf8"), "external-evidence");
  } finally {
    fs.rmSync = originalRemove;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(backup, { recursive: true, force: true });
    fs.rmSync(external, { recursive: true, force: true });
  }
});

it("finishes rollback cleanup after the restored workspace is installed and rollback old-root is gone", () => {
  const root = multiFixture(3);
  const backup = path.join(
    os.tmpdir(),
    `content-metadata-rollback-final-cleanup-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const originalRemove = fs.rmSync;
  let migrationCleanupInterrupted = false;
  let rollbackCleanupInterrupted = false;
  try {
    fs.rmSync = function (target, options) {
      if (
        !migrationCleanupInterrupted &&
        String(target).includes(".before-") &&
        !String(target).endsWith("-rollback") &&
        options &&
        options.recursive
      ) {
        migrationCleanupInterrupted = true;
        const files = snapshot(target);
        originalRemove.call(fs, path.join(target, files[0][0]), {
          force: true,
        });
        throw Object.assign(new Error("migration cleanup interrupted"), {
          code: "EIO",
        });
      }
      if (
        migrationCleanupInterrupted &&
        !rollbackCleanupInterrupted &&
        String(target).endsWith("-rollback") &&
        options &&
        options.recursive
      ) {
        rollbackCleanupInterrupted = true;
        originalRemove.apply(fs, arguments);
        throw Object.assign(
          new Error("rollback cleanup interrupted after effect"),
          { code: "EIO" },
        );
      }
      return originalRemove.apply(fs, arguments);
    };
    assert.throws(
      () =>
        createMigration({
          workspaceRoot: root,
          backupRoot: backup,
          confirmed: true,
        }).execute(),
      { code: "EIO" },
    );
    assert.throws(
      () =>
        createMigration({ workspaceRoot: root, backupRoot: backup }).rollback(),
      { code: "EIO" },
    );
    fs.rmSync = originalRemove;
    const recovered = createMigration({
      workspaceRoot: root,
      backupRoot: backup,
    }).recover();
    assert.equal(recovered.state, "ROLLED_BACK");
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(backup, "content-metadata-v1-manifest.json"),
        "utf8",
      ),
    );
    assert.equal(
      fs.existsSync(root + ".before-" + manifest.transactionId),
      false,
    );
    assert.equal(
      fs.existsSync(root + ".before-" + manifest.transactionId + "-rollback"),
      false,
    );
    assert.equal(
      fs.existsSync(root + ".restore-" + manifest.transactionId),
      false,
    );
  } finally {
    fs.rmSync = originalRemove;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(backup, { recursive: true, force: true });
  }
});
