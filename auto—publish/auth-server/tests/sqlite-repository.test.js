const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { SqliteAuthRepository } = require("../src/repositories/sqlite-auth-repository");
const { createUser, temporaryDb } = require("./helpers");

describe("SQLite auth repository", () => {
  it("persists hashes and domain state across repository reopen", async () => {
    const temp = temporaryDb();
    const first = new SqliteAuthRepository({ filePath: temp.filePath });
    // Use the production repository with the same public domain seam.
    const { AuthDomain } = require("../src/auth-domain");
    const { AuthAdministration } = require("../src/auth-administration");
    const sqliteDomain = new AuthDomain({ repository: first, passwordCost: 16384 });
    await createUser(new AuthAdministration({ repository: first, domain: sqliteDomain }), "sqlite-user", { password: "sqlite-password" });
    const session = await sqliteDomain.login({ loginName: "sqlite-user", password: "sqlite-password", deviceId: "sqlite-device" });
    assert.equal(first.healthCheck(), true);
    first.close();
    const reopened = new SqliteAuthRepository({ filePath: temp.filePath });
    assert.equal(reopened.findUserByLoginName("sqlite-user").loginName, "sqlite-user");
    const reopenedDomain = new AuthDomain({ repository: reopened, passwordCost: 16384 });
    assert.equal((await reopenedDomain.inspect(session.accessToken)).user.loginName, "sqlite-user");
    const checkDb = new DatabaseSync(temp.filePath);
    const rows = checkDb.prepare("SELECT password_hash FROM users").all();
    checkDb.close();
    assert.equal(rows[0].password_hash.includes("sqlite-password"), false);
    reopened.close();
    temp.cleanup();
  });

  it("fails closed for unknown schema and malformed database", () => {
    const temp = temporaryDb();
    const unknown = new DatabaseSync(temp.filePath);
    unknown.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (99, 'future', '2026-01-01T00:00:00.000Z');");
    unknown.close();
    assert.throws(() => new SqliteAuthRepository({ filePath: temp.filePath }), (error) => error.code === "AUTH_DB_UNKNOWN_SCHEMA");
    temp.cleanup();
    const corrupt = temporaryDb();
    require("node:fs").writeFileSync(corrupt.filePath, "not a sqlite database");
    assert.throws(() => new SqliteAuthRepository({ filePath: corrupt.filePath }));
    corrupt.cleanup();
  });

  it("rolls back a transaction instead of leaving a partial user", () => {
    const temp = temporaryDb();
    const repository = new SqliteAuthRepository({ filePath: temp.filePath });
    assert.throws(() => repository.transaction(() => {
      repository.createUser({ id: "rollback", loginName: "rollback", passwordHash: "scrypt$test", role: "user", enabled: true, mustChangePassword: false, maxDevices: 1, note: null, failedLoginCount: 0, lockedUntil: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", lastLoginAt: null, passwordChangedAt: "2026-01-01T00:00:00.000Z" });
      throw new Error("rollback");
    }), /rollback/);
    assert.equal(repository.findUserByLoginName("rollback"), null);
    repository.close();
    temp.cleanup();
  });
});
