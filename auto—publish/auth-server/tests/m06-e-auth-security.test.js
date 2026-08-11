const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { describe, it } = require("node:test");
const { createAuthService } = require("../../desktop/services/auth-service");
const { createPasswordHash, verifyPassword } = require("../src/auth-domain");
const { createAuthServer } = require("../src/server");
const { applyMigrations } = require("../src/repositories/sqlite-auth-repository");
const { SqliteAuthRepository } = require("../src/repositories/sqlite-auth-repository");
const { backupAuthDatabase } = require("../src/auth-backup-orchestrator");
const { verifyDatabaseFile } = require("../src/auth-database-verifier");
const { checkAuthRestore } = require("../src/auth-recovery-check");
const { runIntegrityChecks } = require("../src/health/sqlite-integrity-worker");
const { createMemoryAuth, createUser } = require("./helpers");

function temporaryRoot(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
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

function createCurrentDatabase(prefix) {
  const temp = temporaryRoot(prefix);
  const filePath = path.join(temp.root, "auth.db");
  const repository = new SqliteAuthRepository({ filePath });
  repository.createUser(currentUser("fixture-user"));
  repository.close();
  return { temp, filePath };
}

function injectPrototypeCloseFailure() {
  const original = DatabaseSync.prototype.close;
  let injected = false;
  DatabaseSync.prototype.close = function closeWithInjectedFailure() {
    const result = original.call(this);
    if (!injected) {
      injected = true;
      throw new Error("close failed at C:\\private\\auth.db");
    }
    return result;
  };
  return () => {
    DatabaseSync.prototype.close = original;
  };
}

function injectRmFailure() {
  const original = fs.rmSync;
  let injected = false;
  fs.rmSync = function rmWithInjectedFailure(...args) {
    if (!injected) {
      injected = true;
      throw new Error("cleanup failed at C:\\private\\auth.db");
    }
    return original.apply(this, args);
  };
  return () => {
    fs.rmSync = original;
  };
}

describe("M06-E auth/security failure semantics", { concurrency: false }, () => {
  it("fails closed for malformed, non-string, and rejected password candidates", async () => {
    const encoded = await createPasswordHash("correct-password", { cost: 16384 });
    assert.equal(await verifyPassword("correct-password", encoded, { maxmem: 64 * 1024 * 1024 }), true);
    assert.equal(await verifyPassword(123, encoded), false);
    assert.equal(await verifyPassword("correct-password", encoded.slice(0, -1)), false);
    assert.equal(await verifyPassword("correct-password", encoded.replace(/\$[0-9a-f]+$/, "$not-hex")), false);
    assert.equal(await verifyPassword("correct-password", encoded, { maxmem: 1 }), false);

    const { repository, domain, administration } = createMemoryAuth({ passwordVerifier: async () => "true" });
    await createUser(administration, "strict-candidate", { password: "correct-password" });
    await assert.rejects(
      () => domain.login({ loginName: "strict-candidate", password: "correct-password", deviceId: "device" }),
      (error) => error.code === "AUTH_INVALID_CREDENTIALS",
    );
    repository.close();
  });

  it("preserves the primary device error and exposes an audit-write failure status", async () => {
    const { repository, domain, administration } = createMemoryAuth({ passwordVerifier: async () => true });
    await createUser(administration, "audit-user", { password: "correct-password" });
    await domain.login({ loginName: "audit-user", password: "correct-password", deviceId: "device-1" });
    const originalAddAuditEvent = repository.addAuditEvent.bind(repository);
    let rejectedDeviceAudits = 0;
    repository.addAuditEvent = (event) => {
      if (event.eventCode === "DEVICE_LIMIT_REJECTED") {
        rejectedDeviceAudits += 1;
        if (rejectedDeviceAudits === 2)
          throw new Error("audit write failed with password/token body");
      }
      return originalAddAuditEvent(event);
    };

    await assert.rejects(
      () => domain.login({ loginName: "audit-user", password: "correct-password", deviceId: "device-2" }),
      (error) =>
        error.code === "AUTH_DEVICE_LIMIT_REACHED" &&
        error.details.auditStatus === "write_failed" &&
        !JSON.stringify(error).includes("password/token body"),
    );
    repository.close();
  });

  it("does not report backup success when source close fails, and preserves backup errors", async () => {
    const database = createCurrentDatabase("autopublish-m06e-backup-");
    try {
      await assert.rejects(
        () => backupAuthDatabase({
          source: database.filePath,
          destination: path.join(database.temp.root, "backup.db"),
          repositoryFactory: () => ({
            close() { throw new Error("close failed with token"); },
          }),
          backupFn: async (_repository, destination) => fs.copyFileSync(database.filePath, destination),
        }),
        (error) => error.code === "AUTH_BACKUP_SOURCE_CLOSE_FAILED",
      );
      await assert.rejects(
        () => backupAuthDatabase({
          source: database.filePath,
          destination: path.join(database.temp.root, "full.db"),
          repositoryFactory: () => ({
            close() { throw new Error("close failed with token"); },
          }),
          backupFn: async () => { throw Object.assign(new Error("disk full"), { code: "ENOSPC" }); },
        }),
        (error) =>
          error.code === "AUTH_BACKUP_DESTINATION_FULL" &&
          error.details.cleanupCode === "AUTH_BACKUP_SOURCE_CLOSE_FAILED",
      );
    } finally {
      database.temp.cleanup();
    }
  });

  it("treats verifier close failure as a failed verification", () => {
    const database = createCurrentDatabase("autopublish-m06e-verifier-");
    const restoreClose = injectPrototypeCloseFailure();
    try {
      assert.throws(
        () => verifyDatabaseFile(database.filePath),
        (error) => error.code === "AUTH_DB_CLOSE_FAILED" && error.details.stage === "verification",
      );
    } finally {
      restoreClose();
      database.temp.cleanup();
    }
  });

  it("retains migration and repository primary errors when rollback fails", () => {
    const migration = temporaryRoot("autopublish-m06e-migration-");
    const migrationDb = new DatabaseSync(path.join(migration.root, "migration.db"));
    const originalExec = DatabaseSync.prototype.exec;
    let rollbackFailureInjected = false;
    DatabaseSync.prototype.exec = function execWithRollbackFailure(sql, ...args) {
      if (String(sql).trim() === "ROLLBACK" && !rollbackFailureInjected) {
        rollbackFailureInjected = true;
        throw new Error("rollback failed at C:\\private\\auth.db");
      }
      return originalExec.call(this, sql, ...args);
    };
    try {
      assert.throws(
        () => applyMigrations(migrationDb, {
          skipIntegrity: true,
          onBeforeMarkerCommit() {
            throw Object.assign(new Error("migration primary failure"), { code: "AUTH_DB_MIGRATION_INJECTED" });
          },
        }),
        (error) => error.code === "AUTH_DB_MIGRATION_INJECTED" && error.details.cleanupCode === "AUTH_DB_ROLLBACK_FAILED",
      );
    } finally {
      DatabaseSync.prototype.exec = originalExec;
      try { migrationDb.exec("ROLLBACK"); } catch (_) { /* test cleanup only */ }
      migrationDb.close();
      migration.cleanup();
    }

    const repositoryDatabase = createCurrentDatabase("autopublish-m06e-repository-");
    const repository = new SqliteAuthRepository({ filePath: repositoryDatabase.filePath });
    const repositoryExec = DatabaseSync.prototype.exec;
    let repositoryRollbackFailureInjected = false;
    DatabaseSync.prototype.exec = function execWithRepositoryRollbackFailure(sql, ...args) {
      if (String(sql).trim() === "ROLLBACK" && !repositoryRollbackFailureInjected) {
        repositoryRollbackFailureInjected = true;
        throw new Error("repository rollback failed with cookie");
      }
      return repositoryExec.call(this, sql, ...args);
    };
    try {
      assert.throws(
        () => repository.transaction(() => { throw new Error("repository primary failure"); }),
        (error) => error.message === "repository primary failure" && error.details.cleanupCode === "AUTH_DB_ROLLBACK_FAILED",
      );
    } finally {
      DatabaseSync.prototype.exec = repositoryExec;
      repository.close();
      repositoryDatabase.temp.cleanup();
    }
  });

  it("keeps recovery failures and cleanup failures observable without leaking paths", () => {
    const database = createCurrentDatabase("autopublish-m06e-recovery-close-");
    const restoreClose = injectPrototypeCloseFailure();
    try {
      assert.throws(
        () => checkAuthRestore(database.filePath, { tempRoot: database.temp.root }),
        (error) => error.code === "AUTH_RESTORE_SOURCE_CLOSE_FAILED",
      );
    } finally {
      restoreClose();
      database.temp.cleanup();
    }

    const cleanupDatabase = createCurrentDatabase("autopublish-m06e-recovery-cleanup-");
    const restoreRm = injectRmFailure();
    try {
      assert.throws(
        () => checkAuthRestore(cleanupDatabase.filePath, { tempRoot: cleanupDatabase.temp.root }),
        (error) => error.code === "AUTH_RESTORE_CLEANUP_FAILED" && !JSON.stringify(error).includes("private"),
      );
    } finally {
      restoreRm();
      cleanupDatabase.temp.cleanup();
    }
  });

  it("fails health integrity when the database close cannot be confirmed", () => {
    const database = createCurrentDatabase("autopublish-m06e-health-");
    const restoreClose = injectPrototypeCloseFailure();
    try {
      assert.throws(
        () => runIntegrityChecks({ filePath: database.filePath, nowMs: Date.now() }),
        (error) =>
          error.code === "AUTH_HEALTH_INTEGRITY_FAILED" &&
          error.details.cleanupCode === "AUTH_HEALTH_DATABASE_CLOSE_FAILED",
      );
    } finally {
      restoreClose();
      database.temp.cleanup();
    }
  });

  it("keeps request failure diagnostics free of raw paths and query values", async () => {
    const temp = temporaryRoot("autopublish-m06e-server-diagnostic-");
    const diagnostics = [];
    const app = createAuthServer({
      repository: { filePath: path.join(temp.root, "auth.db") },
      domain: { login: async () => { throw new Error("raw secret body"); } },
      logger: (entry) => diagnostics.push(entry),
    });
    await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    try {
      const response = await new Promise((resolve, reject) => {
        const request = http.request({
          host: "127.0.0.1",
          port: app.server.address().port,
          path: "/v1/auth/login?token=secret-query",
          method: "POST",
          headers: { "content-type": "application/json" },
        }, (result) => {
          result.resume();
          result.on("end", () => resolve(result));
        });
        request.on("error", reject);
        request.end(JSON.stringify({ loginName: "fixture", password: "secret" }));
      });
      assert.equal(response.statusCode, 503);
      assert.deepEqual(diagnostics, [{ code: "AUTH_REQUEST_FAILED", method: "POST" }]);
      assert.equal(JSON.stringify(diagnostics).includes("secret"), false);
    } finally {
      await new Promise((resolve) => app.server.close(resolve));
      temp.cleanup();
    }
  });

  it("does not report local logout as clean when remote or token cleanup is uncertain", async () => {
    const remoteFailureRoot = temporaryRoot("autopublish-m06e-auth-service-remote-");
    const encryptedStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(value, "utf8"),
      decryptString: (value) => value.toString("utf8"),
    };
    const remoteFailureService = createAuthService({
      userDataPath: remoteFailureRoot.root,
      safeStorage: encryptedStorage,
      request: async (input) => {
        if (input.url.endsWith("/login"))
          return { statusCode: 200, body: { accessToken: "access", refreshToken: "refresh", user: {}, entitlements: [] } };
        if (input.url.endsWith("/logout"))
          return { statusCode: 503, body: { ok: false, error: { message: "token body" } } };
        throw new Error("remote logout body contains token");
      },
    });
    try {
      await remoteFailureService.login("admin", "password");
      const restoreRm = injectRmFailure();
      try {
        const state = await remoteFailureService.logout();
        assert.equal(state.authenticated, false);
        assert.equal(state.errorCode, "AUTH_SERVICE_UNAVAILABLE");
      } finally {
        restoreRm();
      }
    } finally {
      remoteFailureService.dispose();
      remoteFailureRoot.cleanup();
    }

    const localCleanupRoot = temporaryRoot("autopublish-m06e-auth-service-local-");
    const localCleanupService = createAuthService({
      userDataPath: localCleanupRoot.root,
      safeStorage: encryptedStorage,
      request: async (input) =>
        input.url.endsWith("/login")
          ? { statusCode: 200, body: { accessToken: "access", refreshToken: "refresh", user: {}, entitlements: [] } }
          : { statusCode: 200, body: {} },
    });
    try {
      await localCleanupService.login("admin", "password");
      const restoreRm = injectRmFailure();
      try {
        const state = await localCleanupService.logout();
        assert.equal(state.authenticated, false);
        assert.equal(state.errorCode, "AUTH_SERVER_ERROR");
      } finally {
        restoreRm();
      }
    } finally {
      localCleanupService.dispose();
      localCleanupRoot.cleanup();
    }
  });
});
