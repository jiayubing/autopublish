const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { AuthDomain } = require("../src/auth-domain");
const { SqliteAuthRepository, applyMigrations } = require("../src/repositories/sqlite-auth-repository");
const { verifyDatabaseFile } = require("../src/auth-database-verifier");
const { backupAuthDatabase } = require("../src/auth-backup-orchestrator");
const { checkAuthRestore } = require("../src/auth-recovery-check");
const { parseArgs } = require("../scripts/recovery-drill");
const { assertTemporaryRoot } = require("../src/recovery-fixtures");
const { hashToken } = require("../src/token-service");

function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autopublish-auth-recovery-test-"));
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function currentUser(id) {
  return {
    id,
    loginName: id,
    passwordHash: "scrypt$fixture",
    role: "user",
    enabled: true,
    mustChangePassword: false,
    maxDevices: 1,
    note: null,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: null,
    passwordChangedAt: "2026-01-01T00:00:00.000Z",
  };
}

function createCurrent(filePath, userId) {
  const repository = new SqliteAuthRepository({ filePath });
  repository.createUser(currentUser(userId || "fixture-user"));
  return repository;
}

function createLegacy(filePath, options) {
  const db = new DatabaseSync(filePath);
  db.exec(fs.readFileSync(path.join(__dirname, "../migrations/001-auth.sql"), "utf8"));
  db.prepare("INSERT INTO users (id, login_name, password_hash, enabled, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run("legacy-user", "legacy-user", "scrypt$legacy", 1, "2026-01-01T00:00:00.000Z", null);
  db.prepare("INSERT INTO entitlements (user_id, product, enabled, expires_at) VALUES (?, ?, ?, ?)")
    .run("legacy-user", options && options.product ? options.product : "desktop", 1, null);
  if (options && options.session) {
    db.prepare("INSERT INTO sessions (id, user_id, device_id, access_token_hash, refresh_token_hash, access_expires_at, refresh_expires_at, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("legacy-session", "legacy-user", "legacy-device", hashToken("legacy-access"), hashToken("legacy-refresh"), "2027-01-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", null);
  }
  if (options && options.orphanEntitlement) db.prepare("INSERT INTO entitlements (user_id, product, enabled, expires_at) VALUES (?, ?, ?, ?)").run("missing-user", "desktop", 1, null);
  if (options && options.marker) {
    db.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
    db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(1, "001-auth", "2026-01-01T00:00:00.000Z");
  }
  db.close();
}

function expectCode(callback, code) {
  assert.throws(callback, (error) => error && error.code === code);
}

function fileHash(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function startContinuousWriter(filePath) {
  const script = `
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.argv[1]);
    db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA wal_autocheckpoint=1;");
    let tick = 0;
    process.stdout.write("ready\\n");
    function write() {
      try {
        db.exec("BEGIN IMMEDIATE");
        db.prepare("UPDATE users SET updated_at=? WHERE id=?").run("writer-" + tick++, "wal-user");
        db.exec("COMMIT");
        db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      } catch (_) {
        try { db.exec("ROLLBACK"); } catch (_) { /* keep the writer alive */ }
      }
      setImmediate(write);
    }
    write();
    process.on("SIGTERM", () => {
      try { db.close(); } finally { process.exit(0); }
    });
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", script, filePath], { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    let ready = false;
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (!ready && output.includes("ready")) {
        ready = true;
        resolve(child);
      }
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (!ready) reject(new Error(`writer exited before ready: ${code}`));
    });
  });
}

async function stopContinuousWriter(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await exited;
}

describe("auth backup, restore and migration safety", () => {
  it("backs up a source and reopens the destination for structured verification", async () => {
    const temp = temporaryRoot();
    const source = path.join(temp.root, "source.db");
    const destination = path.join(temp.root, "destination.db");
    const sourceRepository = createCurrent(source, "backup-user");
    sourceRepository.close();
    const result = await backupAuthDatabase({ source, destination });
    assert.equal(result.ok, true);
    assert.equal(result.sourceClosedBeforeVerification, true);
    assert.equal(result.destinationVerified, true);
    assert.equal(result.verification.schemaVersion, 2);
    assert.equal(result.verification.rowCounts.users, 1);
    assert.equal(result.verification.integrity, "ok");
    assert.equal(verifyDatabaseFile(destination).contentHash, result.verification.contentHash);
    const repeated = await backupAuthDatabase({ source, destination });
    assert.equal(repeated.verification.contentHash, result.verification.contentHash);
    temp.cleanup();
  });

  it("marks a corrupt destination and simulated disk-full backup as failures", async () => {
    const temp = temporaryRoot();
    const source = path.join(temp.root, "source.db");
    const corruptDestination = path.join(temp.root, "corrupt.db");
    const fullDestination = path.join(temp.root, "full.db");
    const sourceRepository = createCurrent(source);
    sourceRepository.close();
    await assert.rejects(
      () => backupAuthDatabase({ source, destination: corruptDestination, backupFn: async (_, destination) => fs.writeFileSync(destination, "truncated") }),
      (error) => error.code === "AUTH_BACKUP_DESTINATION_UNRECOVERABLE" && error.details.reasonCode === "AUTH_DB_CORRUPT",
    );
    await assert.rejects(
      () => backupAuthDatabase({ source, destination: fullDestination, backupFn: async () => { throw Object.assign(new Error("full"), { code: "ENOSPC" }); } }),
      (error) => error.code === "AUTH_BACKUP_DESTINATION_FULL",
    );
    const directoryDestination = path.join(temp.root, "destination-directory");
    fs.mkdirSync(directoryDestination);
    await assert.rejects(
      () => backupAuthDatabase({ source, destination: directoryDestination }),
      (error) => error.code === "AUTH_BACKUP_DESTINATION_INVALID" && error.details.reasonCode === "AUTH_DB_NOT_REGULAR_FILE",
    );
    temp.cleanup();
  });

  it("rejects a missing restore path without creating its parent or database", () => {
    const temp = temporaryRoot();
    const missing = path.join(temp.root, "new", "missing.db");
    expectCode(() => checkAuthRestore(missing, { tempRoot: temp.root }), "AUTH_DB_FILE_NOT_FOUND");
    assert.equal(fs.existsSync(missing), false);
    assert.equal(fs.existsSync(path.dirname(missing)), false);
    temp.cleanup();
  });

  it("rejects directories, unreadable files and invalid arguments before opening SQLite", () => {
    const temp = temporaryRoot();
    const directory = path.join(temp.root, "directory");
    fs.mkdirSync(directory);
    expectCode(() => checkAuthRestore(directory, { tempRoot: temp.root }), "AUTH_DB_NOT_REGULAR_FILE");
    const source = path.join(temp.root, "source.db");
    const repository = createCurrent(source);
    repository.close();
    const deniedFileSystem = {
      constants: fs.constants,
      lstatSync: fs.lstatSync.bind(fs),
      accessSync() { throw Object.assign(new Error("denied"), { code: "EACCES" }); },
    };
    expectCode(() => verifyDatabaseFile(source, { fsModule: deniedFileSystem }), "AUTH_DB_NOT_READABLE");
    expectCode(() => verifyDatabaseFile(""), "AUTH_DB_PATH_INVALID");
    temp.cleanup();
  });

  it("fails closed for empty, truncated, damaged and unknown-schema files without writes", () => {
    const temp = temporaryRoot();
    const empty = path.join(temp.root, "empty.db");
    const emptyDb = new DatabaseSync(empty);
    emptyDb.close();
    const emptyHash = fileHash(empty);
    expectCode(() => checkAuthRestore(empty, { tempRoot: temp.root }), "AUTH_DB_SCHEMA_INVALID");
    assert.equal(fileHash(empty), emptyHash);
    const truncated = path.join(temp.root, "truncated.db");
    const seeded = path.join(temp.root, "seeded.db");
    const seededRepository = createCurrent(seeded);
    seededRepository.close();
    fs.writeFileSync(truncated, fs.readFileSync(seeded).subarray(0, 20));
    expectCode(() => checkAuthRestore(truncated, { tempRoot: temp.root }), "AUTH_DB_CORRUPT");
    const damaged = path.join(temp.root, "damaged.db");
    fs.writeFileSync(damaged, "not a sqlite database");
    expectCode(() => checkAuthRestore(damaged, { tempRoot: temp.root }), "AUTH_DB_CORRUPT");
    const unknown = path.join(temp.root, "unknown.db");
    const unknownDb = new DatabaseSync(unknown);
    unknownDb.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (99, 'future', '2026-01-01T00:00:00.000Z');");
    unknownDb.close();
    const unknownHash = fileHash(unknown);
    expectCode(() => checkAuthRestore(unknown, { tempRoot: temp.root }), "AUTH_DB_UNKNOWN_SCHEMA");
    assert.equal(fileHash(unknown), unknownHash);
    const after = new DatabaseSync(unknown);
    assert.equal(after.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get().count, 1);
    after.close();
    const missingColumn = path.join(temp.root, "missing-column.db");
    const missingColumnDb = new DatabaseSync(missingColumn);
    missingColumnDb.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (2, '002-multi-user', '2026-01-01T00:00:00.000Z'); CREATE TABLE users (id TEXT);");
    missingColumnDb.close();
    expectCode(() => checkAuthRestore(missingColumn, { tempRoot: temp.root }), "AUTH_DB_SCHEMA_INVALID");
    temp.cleanup();
  });

  it("distinguishes known v1 from v2 and migrates legacy data transactionally", () => {
    const temp = temporaryRoot();
    const legacy = path.join(temp.root, "legacy.db");
    createLegacy(legacy, { marker: true });
    expectCode(() => verifyDatabaseFile(legacy), "AUTH_DB_LEGACY_SCHEMA");
    const repository = new SqliteAuthRepository({ filePath: legacy });
    assert.equal(repository.migrationResult.migrated, true);
    assert.equal(repository.migrationResult.schemaVersion, 2);
    assert.equal(repository.findUserByLoginName("legacy-user").loginName, "legacy-user");
    assert.equal(repository.getEntitlements("legacy-user").length, 1);
    repository.close();
    const verified = verifyDatabaseFile(legacy);
    assert.equal(verified.schemaVersion, 2);
    assert.equal(verified.rowCounts.users, 1);
    temp.cleanup();
  });

  it("keeps existing v1 session device bindings usable after migration", async () => {
    const temp = temporaryRoot();
    const legacy = path.join(temp.root, "legacy-session.db");
    createLegacy(legacy, { marker: true, session: true, product: "AutoPublish" });
    let repository;
    try {
      repository = new SqliteAuthRepository({ filePath: legacy });
      const domain = new AuthDomain({ repository, passwordVerifier: () => true });
      const login = await domain.login({ loginName: "legacy-user", password: "legacy-password", deviceId: "legacy-device" });
      assert.equal(login.user.loginName, "legacy-user");
      assert.equal(repository.listDevices("legacy-user")[0].deviceKeyHash, hashToken("legacy-device"));
      const refreshed = await domain.refresh({ refreshToken: "legacy-refresh", deviceId: "legacy-device" });
      assert.equal(refreshed.user.loginName, "legacy-user");
    } finally {
      if (repository) repository.close();
      temp.cleanup();
    }
  });

  it("rolls back before the marker and permits a clean retry", () => {
    const temp = temporaryRoot();
    const legacy = path.join(temp.root, "legacy.db");
    createLegacy(legacy);
    const db = new DatabaseSync(legacy);
    assert.throws(() => applyMigrations(db, {
      skipIntegrity: true,
      onBeforeMarkerCommit({ db: target, verification }) {
        assert.equal(verification.integrity, "ok");
        assert.equal(target.prepare("SELECT version FROM schema_migrations WHERE version=2").get(), undefined);
        throw Object.assign(new Error("injected"), { code: "AUTH_DB_MIGRATION_INJECTED" });
      },
    }), (error) => error.code === "AUTH_DB_MIGRATION_INJECTED");
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get(), undefined);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM users").get().count, 1);
    db.close();
    expectCode(() => verifyDatabaseFile(legacy), "AUTH_DB_LEGACY_SCHEMA");
    const retry = new SqliteAuthRepository({ filePath: legacy });
    assert.equal(retry.migrationResult.migrated, true);
    retry.close();
    temp.cleanup();
  });

  it("rolls back invalid legacy data, then succeeds after the source is repaired", () => {
    const temp = temporaryRoot();
    const legacy = path.join(temp.root, "legacy-invalid.db");
    createLegacy(legacy, { orphanEntitlement: true });
    expectCode(() => new SqliteAuthRepository({ filePath: legacy }), "AUTH_DB_MIGRATION_FAILED");
    const afterFailure = new DatabaseSync(legacy);
    assert.equal(afterFailure.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get(), undefined);
    assert.equal(afterFailure.prepare("SELECT COUNT(*) AS count FROM entitlements").get().count, 2);
    afterFailure.exec("DELETE FROM entitlements WHERE user_id='missing-user'");
    afterFailure.close();
    const retry = new SqliteAuthRepository({ filePath: legacy });
    assert.equal(retry.migrationResult.migrated, true);
    retry.close();
    temp.cleanup();
  });

  it("is idempotent when migration and restore-check are repeated", () => {
    const temp = temporaryRoot();
    const database = path.join(temp.root, "repeat.db");
    const first = new SqliteAuthRepository({ filePath: database });
    assert.equal(first.migrationResult.migrated, true);
    first.close();
    const second = new SqliteAuthRepository({ filePath: database });
    assert.equal(second.migrationResult.migrated, false);
    second.close();
    const firstCheck = checkAuthRestore(database, { tempRoot: temp.root });
    const secondCheck = checkAuthRestore(database, { tempRoot: temp.root });
    assert.equal(firstCheck.verification.contentHash, secondCheck.verification.contentHash);
    assert.equal(fs.readdirSync(temp.root).some((name) => name.startsWith("autopublish-auth-restore-")), false);
    temp.cleanup();
  });

  it("reads a WAL-only change from an isolated copy without changing source WAL state", () => {
    const temp = temporaryRoot();
    const source = path.join(temp.root, "wal.db");
    const repository = createCurrent(source, "wal-user");
    const wal = `${source}-wal`;
    const before = fs.existsSync(wal) ? fileHash(wal) : null;
    const result = checkAuthRestore(source, { tempRoot: temp.root });
    assert.equal(result.verification.rowCounts.users, 1);
    assert.equal(fs.existsSync(wal) ? fileHash(wal) : null, before);
    assert.equal(fs.readdirSync(temp.root).some((name) => name.startsWith("autopublish-auth-restore-")), false);
    repository.close();
    temp.cleanup();
  });

  it("takes consistent restore snapshots while another process continuously writes", async () => {
    const temp = temporaryRoot();
    const source = path.join(temp.root, "concurrent-writer.db");
    const repository = createCurrent(source, "wal-user");
    repository.close();
    const writer = await startContinuousWriter(source);
    const failures = [];
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
          const result = checkAuthRestore(source, { tempRoot: temp.root });
          assert.equal(result.verification.rowCounts.users, 1);
        } catch (error) {
          failures.push(error.code || error.message);
        }
      }
      assert.deepEqual(failures, []);
    } finally {
      await stopContinuousWriter(writer);
      temp.cleanup();
    }
  });

  it("requires an explicit temporary root for the isolated recovery drill", () => {
    expectCode(() => parseArgs([]), "AUTH_RECOVERY_TEMP_ROOT_REQUIRED");
    expectCode(() => parseArgs(["--temp-root"]), "AUTH_RECOVERY_TEMP_ROOT_REQUIRED");
    const temp = temporaryRoot();
    assert.equal(assertTemporaryRoot(temp.root), path.resolve(temp.root));
    expectCode(() => assertTemporaryRoot(process.cwd()), "AUTH_RECOVERY_TEMP_ROOT_INVALID");
    const previousDbPath = process.env.AUTH_DB_PATH;
    const previousEnvironment = process.env.NODE_ENV;
    try {
      process.env.AUTH_DB_PATH = path.join(temp.root, "production.db");
      expectCode(() => assertTemporaryRoot(temp.root), "AUTH_RECOVERY_DATABASE_ENV_REJECTED");
      delete process.env.AUTH_DB_PATH;
      process.env.NODE_ENV = "production";
      expectCode(() => assertTemporaryRoot(temp.root), "AUTH_RECOVERY_PRODUCTION_ENV_REJECTED");
    } finally {
      if (previousDbPath === undefined) delete process.env.AUTH_DB_PATH;
      else process.env.AUTH_DB_PATH = previousDbPath;
      if (previousEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnvironment;
      temp.cleanup();
    }
  });
});
