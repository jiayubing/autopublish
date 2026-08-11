const fs = require("node:fs");
const path = require("node:path");
const {
  CURRENT_SCHEMA_VERSION,
  CURRENT_MIGRATION_NAME,
  LEGACY_SCHEMA_VERSION,
  databaseError,
  detectSchema,
  verifyOpenDatabase,
  verifyTargetSchema,
  annotateCleanupFailure,
} = require("./auth-database-verifier");
const { hashToken } = require("./token-service");

const LEGACY_TABLES = {
  users: "auth_legacy_users",
  entitlements: "auth_legacy_entitlements",
  sessions: "auth_legacy_sessions",
  audit_events: "auth_legacy_audit_events",
};

function migrationPath(options) {
  return (options && options.migrationPath) || path.join(__dirname, "../migrations/002-multi-user.sql");
}

function migrationSql(options) {
  if (options && typeof options.migrationSql === "string") return options.migrationSql;
  try { return fs.readFileSync(migrationPath(options), "utf8"); } catch (_) { throw databaseError("AUTH_DB_MIGRATION_FAILED", { reason: "migration_source_unavailable" }); }
}

function renameLegacyTables(db) {
  for (const [source, target] of Object.entries(LEGACY_TABLES)) db.exec(`ALTER TABLE "${source}" RENAME TO "${target}"`);
}

function migrateLegacyData(db) {
  const legacyDevices = db.prepare("SELECT user_id, device_id FROM auth_legacy_sessions GROUP BY user_id, device_id").all();
  db.exec(`
    INSERT INTO users (
      id, login_name, password_hash, role, enabled, must_change_password, max_devices, note,
      failed_login_count, locked_until, created_at, updated_at, last_login_at, password_changed_at
    )
    SELECT id, login_name, password_hash, 'user', enabled, 0, 1, NULL, 0, NULL,
      created_at, created_at, last_login_at, created_at
    FROM auth_legacy_users;

    INSERT INTO devices (
      id, user_id, device_key_hash, display_name, app_version, first_seen_at, last_seen_at, revoked_at
    )
    SELECT 'legacy:' || user_id || ':' || device_id, user_id,
      'legacy:' || user_id || ':' || device_id, NULL, NULL,
      MIN(created_at), MAX(created_at), NULL
    FROM auth_legacy_sessions
    GROUP BY user_id, device_id;

    INSERT INTO entitlements (
      user_id, product, enabled, expires_at, created_at, updated_at
    )
    SELECT old.user_id, old.product, old.enabled, old.expires_at,
      (SELECT created_at FROM users WHERE users.id = old.user_id),
      (SELECT created_at FROM users WHERE users.id = old.user_id)
    FROM auth_legacy_entitlements AS old;

    INSERT INTO sessions (
      id, family_id, user_id, device_id, access_token_hash, refresh_token_hash,
      access_expires_at, refresh_expires_at, created_at, last_seen_at, rotated_at,
      revoked_at, revoke_reason
    )
    SELECT old.id, 'legacy-family:' || old.id, old.user_id,
      'legacy:' || old.user_id || ':' || old.device_id,
      old.access_token_hash, old.refresh_token_hash, old.access_expires_at,
      old.refresh_expires_at, old.created_at, old.created_at, NULL, old.revoked_at, NULL
    FROM auth_legacy_sessions AS old;

    INSERT INTO audit_events (
      id, event_code, user_id, device_id, source_fingerprint, result_code, created_at
    )
    SELECT id, event_code, user_id, NULL, NULL, NULL, created_at
    FROM auth_legacy_audit_events;

    DROP TABLE auth_legacy_users;
    DROP TABLE auth_legacy_entitlements;
    DROP TABLE auth_legacy_sessions;
    DROP TABLE auth_legacy_audit_events;
  `);
  for (const legacyDevice of legacyDevices) {
    const deviceValue = legacyDevice.device_id === undefined || legacyDevice.device_id === null || legacyDevice.device_id === ""
      ? "legacy-installation"
      : String(legacyDevice.device_id);
    db.prepare("UPDATE devices SET device_key_hash=? WHERE id=? AND user_id=?")
      .run(hashToken(deviceValue), `legacy:${legacyDevice.user_id}:${legacyDevice.device_id}`, legacyDevice.user_id);
  }
}

function targetSchema(db, state, options) {
  if (state.kind === "legacy") {
    renameLegacyTables(db);
    db.exec(migrationSql(options));
    migrateLegacyData(db);
  } else {
    db.exec(migrationSql(options));
  }
  // A migration must always validate the target before exposing its marker.
  return verifyTargetSchema(db, { requireMarker: false, integrity: true });
}

function markerTable(db) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
}

function rollback(db, failure) {
  try {
    db.exec("ROLLBACK");
  } catch (_) {
    annotateCleanupFailure(failure, "AUTH_DB_ROLLBACK_FAILED");
  }
}

function wrapMigrationError(error) {
  if (error && typeof error.code === "string" && error.code.startsWith("AUTH_")) return error;
  const wrapped = databaseError("AUTH_DB_MIGRATION_FAILED", { reason: error && error.code ? error.code : "migration_failed" });
  wrapped.cause = error;
  return wrapped;
}

function applyMigrations(db, options) {
  const opts = options || {};
  let state;
  try {
    db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;");
    state = detectSchema(db);
  } catch (error) {
    throw wrapMigrationError(error);
  }

  if (state.kind === "current") {
    return { migrated: false, schemaVersion: CURRENT_SCHEMA_VERSION, verification: verifyOpenDatabase(db, { integrity: !opts.skipIntegrity }) };
  }
  if (!["legacy", "uninitialized"].includes(state.kind)) throw databaseError("AUTH_DB_SCHEMA_INVALID", { schemaVersion: state.schemaVersion || 0 });

  let inTransaction = false;
  try {
    db.exec("BEGIN IMMEDIATE");
    inTransaction = true;
    markerTable(db);
    const verification = targetSchema(db, state, opts);
    if (typeof opts.onBeforeMarkerCommit === "function") opts.onBeforeMarkerCommit({ db, verification, sourceSchemaVersion: state.schemaVersion });
    db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(CURRENT_SCHEMA_VERSION, CURRENT_MIGRATION_NAME, new Date().toISOString());
    verifyOpenDatabase(db, { integrity: true });
    db.exec("COMMIT");
    inTransaction = false;
    return { migrated: true, schemaVersion: CURRENT_SCHEMA_VERSION, verification };
  } catch (error) {
    const failure = wrapMigrationError(error);
    if (inTransaction) rollback(db, failure);
    throw failure;
  }
}

module.exports = {
  applyMigrations,
  migrationPath,
  LEGACY_TABLES,
};
