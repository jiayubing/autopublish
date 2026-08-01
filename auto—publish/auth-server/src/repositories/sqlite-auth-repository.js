const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync, backup } = require("node:sqlite");
const { applyMigrations } = require("../auth-migration-guard");
const {
  CURRENT_SCHEMA_VERSION,
  REQUIRED_TABLES,
  REQUIRED_COLUMNS,
  verifyOpenDatabase,
  verifySchemaOnly,
} = require("../auth-database-verifier");

function ensureDirectory(filename) {
  if (filename === ":memory:" || filename.startsWith("file:")) return;
  fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
}

function bool(value) { return Boolean(Number(value)); }

function userFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    loginName: row.login_name,
    passwordHash: row.password_hash,
    role: row.role,
    enabled: bool(row.enabled),
    mustChangePassword: bool(row.must_change_password),
    maxDevices: Number(row.max_devices),
    note: row.note,
    failedLoginCount: Number(row.failed_login_count),
    lockedUntil: row.locked_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
    passwordChangedAt: row.password_changed_at,
  };
}

function entitlementFromRow(row) {
  if (!row) return null;
  return { userId: row.user_id, product: row.product, enabled: bool(row.enabled), expiresAt: row.expires_at, createdAt: row.created_at, updatedAt: row.updated_at };
}

function deviceFromRow(row) {
  if (!row) return null;
  return { id: row.id, userId: row.user_id, deviceKeyHash: row.device_key_hash, displayName: row.display_name, appVersion: row.app_version, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, revokedAt: row.revoked_at };
}

function sessionFromRow(row) {
  if (!row) return null;
  return { id: row.id, familyId: row.family_id, userId: row.user_id, deviceId: row.device_id, accessTokenHash: row.access_token_hash, refreshTokenHash: row.refresh_token_hash, accessExpiresAt: row.access_expires_at, refreshExpiresAt: row.refresh_expires_at, createdAt: row.created_at, lastSeenAt: row.last_seen_at, rotatedAt: row.rotated_at, revokedAt: row.revoked_at, revokeReason: row.revoke_reason };
}

function usedRefreshFromRow(row) {
  if (!row) return null;
  return { tokenHash: row.token_hash, familyId: row.family_id, userId: row.user_id, deviceId: row.device_id, usedAt: row.used_at, expiresAt: row.expires_at };
}

function auditFromRow(row) {
  if (!row) return null;
  return { id: row.id, eventCode: row.event_code, userId: row.user_id, deviceId: row.device_id, sourceFingerprint: row.source_fingerprint, resultCode: row.result_code, createdAt: row.created_at };
}

function verifySchema(db) {
  verifySchemaOnly(db);
  return true;
}

function configureConnection(db) {
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;");
}

function configureDatabase(db) {
  configureConnection(db);
  db.exec("PRAGMA journal_mode = WAL;");
}

class SqliteAuthRepository {
  constructor(options) {
    const opts = typeof options === "string" ? { filePath: options } : (options || {});
    this.filePath = opts.filePath || process.env.AUTH_DB_PATH || path.join(process.cwd(), "data", "auth.db");
    ensureDirectory(this.filePath);
    let db;
    try {
      db = new DatabaseSync(this.filePath);
      configureConnection(db);
      this.migrationResult = applyMigrations(db, Object.assign({}, opts, { skipIntegrity: opts.skipIntegrity === true }));
      configureDatabase(db);
      verifySchema(db);
    } catch (error) {
      if (db) { try { db.close(); } catch (_) { /* fail closed */ } }
      throw error;
    }
    this.db = db;
  }

  transaction(callback) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch (_) { /* preserve original error */ }
      throw error;
    }
  }

  createUser(user) {
    this.db.prepare(`INSERT INTO users (id, login_name, password_hash, role, enabled, must_change_password, max_devices, note, failed_login_count, locked_until, created_at, updated_at, last_login_at, password_changed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(user.id, user.loginName, user.passwordHash, user.role, user.enabled ? 1 : 0, user.mustChangePassword ? 1 : 0, user.maxDevices, user.note, user.failedLoginCount, user.lockedUntil, user.createdAt, user.updatedAt, user.lastLoginAt, user.passwordChangedAt);
    return user;
  }
  findUserByLoginName(loginName) { return userFromRow(this.db.prepare("SELECT * FROM users WHERE login_name=?").get(loginName)); }
  findUserById(id) { return userFromRow(this.db.prepare("SELECT * FROM users WHERE id=?").get(id)); }
  listUsers() { return this.db.prepare("SELECT * FROM users ORDER BY login_name").all().map(userFromRow); }
  updateUser(id, patch) {
    const fields = { passwordHash: "password_hash", role: "role", enabled: "enabled", mustChangePassword: "must_change_password", maxDevices: "max_devices", note: "note", failedLoginCount: "failed_login_count", lockedUntil: "locked_until", updatedAt: "updated_at", lastLoginAt: "last_login_at", passwordChangedAt: "password_changed_at" };
    const entries = Object.entries(patch || {}).filter(([key, value]) => fields[key] && value !== undefined);
    if (!entries.length) return this.findUserById(id);
    const assignments = entries.map(([key]) => `${fields[key]}=?`).join(", ");
    const values = entries.map(([key]) => {
      const value = patch[key];
      return ["enabled", "mustChangePassword"].includes(key) ? (value ? 1 : 0) : value;
    });
    this.db.prepare(`UPDATE users SET ${assignments} WHERE id=?`).run(...values, id);
    return this.findUserById(id);
  }

  upsertEntitlement(item) {
    this.db.prepare(`INSERT INTO entitlements (user_id, product, enabled, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, product) DO UPDATE SET enabled=excluded.enabled, expires_at=excluded.expires_at, updated_at=excluded.updated_at`)
      .run(item.userId, item.product, item.enabled ? 1 : 0, item.expiresAt, item.createdAt, item.updatedAt);
    return entitlementFromRow(this.db.prepare("SELECT * FROM entitlements WHERE user_id=? AND product=?").get(item.userId, item.product));
  }
  getEntitlements(userId) { return this.db.prepare("SELECT * FROM entitlements WHERE user_id=? ORDER BY product").all(userId).map(entitlementFromRow); }

  createDevice(device) {
    this.db.prepare(`INSERT INTO devices (id, user_id, device_key_hash, display_name, app_version, first_seen_at, last_seen_at, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(device.id, device.userId, device.deviceKeyHash, device.displayName, device.appVersion, device.firstSeenAt, device.lastSeenAt, device.revokedAt);
    return device;
  }
  findDeviceById(id) { return deviceFromRow(this.db.prepare("SELECT * FROM devices WHERE id=?").get(id)); }
  findDeviceByKeyHash(userId, deviceKeyHash) { return deviceFromRow(this.db.prepare("SELECT * FROM devices WHERE user_id=? AND device_key_hash=?").get(userId, deviceKeyHash)); }
  listDevices(userId, options) { return this.db.prepare(`SELECT * FROM devices WHERE user_id=?${options && options.activeOnly ? " AND revoked_at IS NULL" : ""} ORDER BY first_seen_at`).all(userId).map(deviceFromRow); }
  updateDevice(id, patch) {
    const fields = { displayName: "display_name", appVersion: "app_version", lastSeenAt: "last_seen_at", revokedAt: "revoked_at" };
    const entries = Object.entries(patch || {}).filter(([key, value]) => fields[key] && value !== undefined);
    if (entries.length) this.db.prepare(`UPDATE devices SET ${entries.map(([key]) => `${fields[key]}=?`).join(", ")} WHERE id=?`).run(...entries.map(([key]) => patch[key]), id);
    return this.findDeviceById(id);
  }
  revokeDevice(id, revokedAt) { return this.updateDevice(id, { revokedAt: new Date(revokedAt).toISOString() }); }

  createSession(session) {
    this.db.prepare(`INSERT INTO sessions (id, family_id, user_id, device_id, access_token_hash, refresh_token_hash, access_expires_at, refresh_expires_at, created_at, last_seen_at, rotated_at, revoked_at, revoke_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(session.id, session.familyId, session.userId, session.deviceId, session.accessTokenHash, session.refreshTokenHash, session.accessExpiresAt, session.refreshExpiresAt, session.createdAt, session.lastSeenAt, session.rotatedAt, session.revokedAt, session.revokeReason);
    return session;
  }
  findSessionByAccessHash(hash) { return sessionFromRow(this.db.prepare("SELECT * FROM sessions WHERE access_token_hash=?").get(hash)); }
  findSessionByRefreshHash(hash) { return sessionFromRow(this.db.prepare("SELECT * FROM sessions WHERE refresh_token_hash=?").get(hash)); }
  listActiveSessions(userId, deviceId) { return this.db.prepare(`SELECT * FROM sessions WHERE user_id=? AND revoked_at IS NULL${deviceId ? " AND device_id=?" : ""} ORDER BY created_at`).all(...(deviceId ? [userId, deviceId] : [userId])).map(sessionFromRow); }
  listSessions(userId) { return this.db.prepare("SELECT * FROM sessions WHERE user_id=? ORDER BY created_at").all(userId).map(sessionFromRow); }
  updateSession(id, patch) {
    const fields = { lastSeenAt: "last_seen_at", rotatedAt: "rotated_at", revokedAt: "revoked_at", revokeReason: "revoke_reason" };
    const entries = Object.entries(patch || {}).filter(([key, value]) => fields[key] && value !== undefined);
    if (entries.length) this.db.prepare(`UPDATE sessions SET ${entries.map(([key]) => `${fields[key]}=?`).join(", ")} WHERE id=?`).run(...entries.map(([key]) => patch[key]), id);
    return this.db.prepare("SELECT * FROM sessions WHERE id=?").get(id) ? sessionFromRow(this.db.prepare("SELECT * FROM sessions WHERE id=?").get(id)) : null;
  }
  revokeSession(id, revokedAt, reason) {
    const patch = { revokedAt: new Date(revokedAt).toISOString(), revokeReason: reason || null };
    if (reason === "ROTATED") patch.rotatedAt = new Date(revokedAt).toISOString();
    return this.updateSession(id, patch);
  }
  revokeAllSessions(userId, revokedAt, reason) { this.db.prepare("UPDATE sessions SET revoked_at=?, revoke_reason=? WHERE user_id=? AND revoked_at IS NULL").run(new Date(revokedAt).toISOString(), reason || null, userId); }
  revokeDeviceSessions(deviceId, revokedAt, reason) { this.db.prepare("UPDATE sessions SET revoked_at=?, revoke_reason=? WHERE device_id=? AND revoked_at IS NULL").run(new Date(revokedAt).toISOString(), reason || null, deviceId); }
  revokeFamily(familyId, revokedAt, reason) { this.db.prepare("UPDATE sessions SET revoked_at=?, revoke_reason=? WHERE family_id=? AND revoked_at IS NULL").run(new Date(revokedAt).toISOString(), reason || null, familyId); }

  markUsedRefreshToken(item) {
    this.db.prepare("INSERT OR IGNORE INTO used_refresh_tokens (token_hash, family_id, user_id, device_id, used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)").run(item.tokenHash, item.familyId, item.userId, item.deviceId, item.usedAt, item.expiresAt);
  }
  findUsedRefreshToken(tokenHash) { return usedRefreshFromRow(this.db.prepare("SELECT * FROM used_refresh_tokens WHERE token_hash=?").get(tokenHash)); }
  cleanupUsedRefreshTokens(now) { this.db.prepare("DELETE FROM used_refresh_tokens WHERE expires_at <= ?").run(new Date(now).toISOString()); }

  addAuditEvent(event) {
    this.db.prepare("INSERT INTO audit_events (id, event_code, user_id, device_id, source_fingerprint, result_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(event.id, event.eventCode, event.userId, event.deviceId, event.sourceFingerprint, event.resultCode, event.createdAt);
    return event;
  }
  listAuditEvents(options) {
    const opts = options || {};
    const clauses = [];
    const values = [];
    if (opts.userId) { clauses.push("user_id=?"); values.push(opts.userId); }
    const limit = Math.min(Math.max(Number(opts.limit || 100), 1), 500);
    return this.db.prepare(`SELECT * FROM audit_events${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT ?`).all(...values, limit).map(auditFromRow);
  }

  probeReadiness() {
    const connection = this.db.prepare("SELECT 1 AS ok").get();
    if (!connection || Number(connection.ok) !== 1) throw Object.assign(new Error("database connection unavailable"), { code: "AUTH_DB_UNAVAILABLE" });
    const marker = this.db.prepare("SELECT version FROM schema_migrations WHERE version=?").get(CURRENT_SCHEMA_VERSION);
    if (!marker) throw Object.assign(new Error("unknown database schema"), { code: "AUTH_DB_UNKNOWN_SCHEMA" });
    const placeholders = REQUIRED_TABLES.map(() => "?").join(",");
    const tables = this.db.prepare(`SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN (${placeholders})`).get(...REQUIRED_TABLES);
    if (!tables || Number(tables.count) !== REQUIRED_TABLES.length) throw Object.assign(new Error("incomplete database schema"), { code: "AUTH_DB_UNKNOWN_SCHEMA" });
    return { ok: true, schemaVersion: CURRENT_SCHEMA_VERSION, connection: "open" };
  }

  healthCheck() {
    this.probeReadiness();
    return true;
  }

  integrityCheck() {
    verifyOpenDatabase(this.db);
    return true;
  }

  async backupTo(destination) {
    ensureDirectory(destination);
    await backup(this.db, destination);
  }

  close() { if (this.db) this.db.close(); }
}

function createSqliteAuthRepository(options) { return new SqliteAuthRepository(options); }

module.exports = { SqliteAuthRepository, createSqliteAuthRepository, applyMigrations, verifySchema, verifyOpenDatabase, CURRENT_SCHEMA_VERSION, REQUIRED_TABLES, REQUIRED_COLUMNS };
