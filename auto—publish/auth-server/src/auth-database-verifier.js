const fs = require("node:fs");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const CURRENT_SCHEMA_VERSION = 2;
const LEGACY_SCHEMA_VERSION = 1;
const CURRENT_MIGRATION_NAME = "002-multi-user";
const LEGACY_MIGRATION_NAME = "001-auth";

const REQUIRED_TABLES = [
  "users",
  "entitlements",
  "devices",
  "sessions",
  "used_refresh_tokens",
  "audit_events",
];

const REQUIRED_COLUMNS = Object.freeze({
  schema_migrations: ["version", "name", "applied_at"],
  users: [
    "id", "login_name", "password_hash", "role", "enabled", "must_change_password",
    "max_devices", "note", "failed_login_count", "locked_until", "created_at", "updated_at",
    "last_login_at", "password_changed_at",
  ],
  entitlements: ["user_id", "product", "enabled", "expires_at", "created_at", "updated_at"],
  devices: ["id", "user_id", "device_key_hash", "display_name", "app_version", "first_seen_at", "last_seen_at", "revoked_at"],
  sessions: ["id", "family_id", "user_id", "device_id", "access_token_hash", "refresh_token_hash", "access_expires_at", "refresh_expires_at", "created_at", "last_seen_at", "rotated_at", "revoked_at", "revoke_reason"],
  used_refresh_tokens: ["token_hash", "family_id", "user_id", "device_id", "used_at", "expires_at"],
  audit_events: ["id", "event_code", "user_id", "device_id", "source_fingerprint", "result_code", "created_at"],
});

const LEGACY_REQUIRED_COLUMNS = Object.freeze({
  users: ["id", "login_name", "password_hash", "enabled", "created_at", "last_login_at"],
  entitlements: ["user_id", "product", "enabled", "expires_at"],
  sessions: ["id", "user_id", "device_id", "access_token_hash", "refresh_token_hash", "access_expires_at", "refresh_expires_at", "created_at", "revoked_at"],
  audit_events: ["id", "event_code", "user_id", "created_at"],
});

function databaseError(code, details) {
  const error = new Error(code);
  error.code = code;
  error.details = details || {};
  return error;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function tableNames(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => String(row.name));
}

function tableColumns(db, table) {
  return db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all().map((row) => String(row.name));
}

function hasColumns(db, table, columns) {
  const names = tableColumns(db, table);
  return columns.every((column) => names.includes(column));
}

function hasLegacyShape(db) {
  const names = new Set(tableNames(db));
  return Object.entries(LEGACY_REQUIRED_COLUMNS).every(([table, columns]) => names.has(table) && hasColumns(db, table, columns)) &&
    !hasColumns(db, "users", ["role"]);
}

function readMigrationRows(db) {
  if (!tableNames(db).includes("schema_migrations")) return [];
  if (!hasColumns(db, "schema_migrations", REQUIRED_COLUMNS.schema_migrations)) {
    throw databaseError("AUTH_DB_SCHEMA_INVALID", { reason: "schema_migrations_columns" });
  }
  return db.prepare("SELECT version, name, applied_at FROM schema_migrations ORDER BY version").all();
}

function detectSchema(db) {
  const names = tableNames(db);
  const rows = readMigrationRows(db);
  const versions = rows.map((row) => Number(row.version));
  const unknownVersion = versions.find((version) => ![LEGACY_SCHEMA_VERSION, CURRENT_SCHEMA_VERSION].includes(version));
  if (unknownVersion !== undefined) throw databaseError("AUTH_DB_UNKNOWN_SCHEMA", { schemaVersion: unknownVersion });

  const currentMarker = rows.find((row) => Number(row.version) === CURRENT_SCHEMA_VERSION);
  if (currentMarker) {
    if (String(currentMarker.name) !== CURRENT_MIGRATION_NAME) {
      throw databaseError("AUTH_DB_UNKNOWN_SCHEMA", { schemaVersion: CURRENT_SCHEMA_VERSION });
    }
    return { kind: "current", schemaVersion: CURRENT_SCHEMA_VERSION, marker: currentMarker, tables: names };
  }

  const legacyMarker = rows.find((row) => Number(row.version) === LEGACY_SCHEMA_VERSION);
  if (legacyMarker && String(legacyMarker.name) !== LEGACY_MIGRATION_NAME) {
    throw databaseError("AUTH_DB_UNKNOWN_SCHEMA", { schemaVersion: LEGACY_SCHEMA_VERSION });
  }
  if (hasLegacyShape(db)) return { kind: "legacy", schemaVersion: LEGACY_SCHEMA_VERSION, marker: legacyMarker || null, tables: names };
  if (!names.length || (names.length === 1 && names[0] === "schema_migrations" && !rows.length)) return { kind: "uninitialized", schemaVersion: 0, marker: null, tables: names };
  if (legacyMarker) throw databaseError("AUTH_DB_SCHEMA_INVALID", { schemaVersion: LEGACY_SCHEMA_VERSION });
  if (!rows.length && !names.length) return { kind: "uninitialized", schemaVersion: 0, marker: null, tables: names };
  throw databaseError("AUTH_DB_SCHEMA_INVALID", { schemaVersion: 0 });
}

function verifyRequiredSchema(db) {
  for (const table of ["schema_migrations", ...REQUIRED_TABLES]) {
    if (!tableNames(db).includes(table)) throw databaseError("AUTH_DB_SCHEMA_INVALID", { missingTable: table, schemaVersion: CURRENT_SCHEMA_VERSION });
    const missing = REQUIRED_COLUMNS[table].filter((column) => !tableColumns(db, table).includes(column));
    if (missing.length) throw databaseError("AUTH_DB_SCHEMA_INVALID", { missingColumns: missing, table, schemaVersion: CURRENT_SCHEMA_VERSION });
  }
}

function verifyIntegrity(db) {
  let integrity;
  try { integrity = db.prepare("PRAGMA integrity_check").get(); } catch (_) { throw databaseError("AUTH_DB_CORRUPT", { reason: "integrity_check" }); }
  if (!integrity || String(integrity.integrity_check).toLowerCase() !== "ok") throw databaseError("AUTH_DB_CORRUPT", { reason: "integrity_check" });
  let foreignKeys;
  try { foreignKeys = db.prepare("PRAGMA foreign_key_check").all(); } catch (_) { throw databaseError("AUTH_DB_CORRUPT", { reason: "foreign_key_check" }); }
  if (foreignKeys.length) throw databaseError("AUTH_DB_CORRUPT", { reason: "foreign_key_check" });
}

function normalizeValue(value) {
  return typeof value === "bigint" ? value.toString() : value;
}

function contentHash(db) {
  const hash = crypto.createHash("sha256");
  for (const table of ["schema_migrations", ...REQUIRED_TABLES]) {
    hash.update(`${table}\n`);
    const definition = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table);
    hash.update(`${definition && definition.sql ? definition.sql : ""}\n`);
    const rows = db.prepare(`SELECT * FROM ${quoteIdentifier(table)} ORDER BY rowid`).all();
    for (const row of rows) hash.update(`${JSON.stringify(row, (_, value) => normalizeValue(value))}\n`);
  }
  return hash.digest("hex");
}

function rowCounts(db) {
  const counts = {};
  for (const table of REQUIRED_TABLES) counts[table] = Number(db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get().count);
  return counts;
}

function verifyTargetSchema(db, options) {
  const opts = options || {};
  verifyRequiredSchema(db);
  if (opts.requireMarker !== false) {
    const marker = db.prepare("SELECT version, name FROM schema_migrations WHERE version=?").get(CURRENT_SCHEMA_VERSION);
    if (!marker || String(marker.name) !== CURRENT_MIGRATION_NAME) throw databaseError("AUTH_DB_UNKNOWN_SCHEMA", { schemaVersion: CURRENT_SCHEMA_VERSION });
  }
  if (opts.integrity === false) return {
    ok: true,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    integrity: "not-run",
  };
  verifyIntegrity(db);
  return {
    ok: true,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    rowCounts: rowCounts(db),
    contentHash: contentHash(db),
    integrity: "ok",
  };
}

function verifyOpenDatabase(db, options) {
  const schema = detectSchema(db);
  if (schema.kind === "legacy") throw databaseError("AUTH_DB_LEGACY_SCHEMA", { schemaVersion: LEGACY_SCHEMA_VERSION });
  if (schema.kind !== "current") throw databaseError("AUTH_DB_SCHEMA_INVALID", { schemaVersion: schema.schemaVersion || 0 });
  return verifyTargetSchema(db, options);
}

function verifySchemaOnly(db) {
  const schema = detectSchema(db);
  if (schema.kind === "legacy") throw databaseError("AUTH_DB_LEGACY_SCHEMA", { schemaVersion: LEGACY_SCHEMA_VERSION });
  if (schema.kind !== "current") throw databaseError("AUTH_DB_SCHEMA_INVALID", { schemaVersion: schema.schemaVersion || 0 });
  return verifyTargetSchema(db, { integrity: false });
}

function assertRegularReadableFile(filePath, options) {
  const fileSystem = (options && options.fsModule) || fs;
  if (typeof filePath !== "string" || !filePath.trim()) throw databaseError("AUTH_DB_PATH_INVALID");
  let stats;
  try { stats = fileSystem.lstatSync(filePath); } catch (error) {
    if (error && error.code === "ENOENT") throw databaseError("AUTH_DB_FILE_NOT_FOUND");
    if (error && ["EACCES", "EPERM"].includes(error.code)) throw databaseError("AUTH_DB_NOT_READABLE");
    throw databaseError("AUTH_DB_FILE_CHECK_FAILED");
  }
  if (!stats.isFile()) throw databaseError("AUTH_DB_NOT_REGULAR_FILE");
  try { fileSystem.accessSync(filePath, fileSystem.constants ? fileSystem.constants.R_OK : fs.constants.R_OK); } catch (error) {
    if (error && ["ENOENT"].includes(error.code)) throw databaseError("AUTH_DB_FILE_NOT_FOUND");
    throw databaseError("AUTH_DB_NOT_READABLE");
  }
  return stats;
}

function mapOpenError(error) {
  if (error && error.code === "AUTH_DB_SCHEMA_INVALID") return error;
  if (error && error.code === "AUTH_DB_UNKNOWN_SCHEMA") return error;
  if (error && error.code === "AUTH_DB_LEGACY_SCHEMA") return error;
  if (error && error.code === "ENOENT") return databaseError("AUTH_DB_FILE_NOT_FOUND");
  if (error && ["EACCES", "EPERM"].includes(error.code)) return databaseError("AUTH_DB_NOT_READABLE");
  if (error && /not a database|malformed|file is encrypted/i.test(String(error.message || ""))) return databaseError("AUTH_DB_CORRUPT");
  return databaseError("AUTH_DB_OPEN_FAILED");
}

function sha256File(filePath, fileSystem) {
  try { return crypto.createHash("sha256").update(fileSystem.readFileSync(filePath)).digest("hex"); } catch (error) {
    if (error && ["EACCES", "EPERM"].includes(error.code)) throw databaseError("AUTH_DB_NOT_READABLE");
    throw databaseError("AUTH_DB_FILE_CHECK_FAILED");
  }
}

function verifyDatabaseFile(filePath, options) {
  const opts = options || {};
  const fileSystem = opts.fsModule || fs;
  const stats = assertRegularReadableFile(filePath, { fsModule: fileSystem });
  if (Number(stats.size) > 0 && Number(stats.size) < 100) throw databaseError("AUTH_DB_CORRUPT", { reason: "sqlite_header" });
  let db;
  let report;
  try {
    db = new DatabaseSync(filePath, { readOnly: true });
    report = verifyOpenDatabase(db);
  } catch (error) {
    throw error && error.code && error.code.startsWith("AUTH_") ? error : mapOpenError(error);
  } finally {
    if (db) { try { db.close(); } catch (_) { /* preserve verification result */ } }
  }
  report.fileHash = sha256File(filePath, fileSystem);
  return report;
}

module.exports = {
  CURRENT_SCHEMA_VERSION,
  LEGACY_SCHEMA_VERSION,
  CURRENT_MIGRATION_NAME,
  LEGACY_MIGRATION_NAME,
  REQUIRED_TABLES,
  REQUIRED_COLUMNS,
  LEGACY_REQUIRED_COLUMNS,
  databaseError,
  detectSchema,
  verifyTargetSchema,
  verifySchemaOnly,
  verifyIntegrity,
  verifyOpenDatabase,
  verifyDatabaseFile,
  assertRegularReadableFile,
};
