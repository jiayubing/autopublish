const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const { fail, text } = require("./operational-store-utils");
const { runTransaction } = require("./operational-store-transaction");
const {
  V4_SCHEMA,
  V4_CREATE_SCHEMA,
  installV4Schema,
  verifyV4Structure,
  migrateV4Schema,
} = require("./operational-store-schema-v4");

const SCHEMA_VERSION = 4;

const V1_SCHEMA = `CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE account_profiles(account_profile_id TEXT PRIMARY KEY, platform_id TEXT NOT NULL, display_name TEXT, created_at TEXT NOT NULL);
CREATE TABLE publication_records(publication_id TEXT PRIMARY KEY, article_id TEXT NOT NULL, target_key TEXT NOT NULL, target_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('queued','remote_started','submitted','published','failed','uncertain')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(article_id,target_key));
CREATE TABLE publication_attempts(attempt_id TEXT PRIMARY KEY, publication_id TEXT NOT NULL REFERENCES publication_records(publication_id), status TEXT NOT NULL CHECK(status IN('queued','remote_started','submitted','published','failed','uncertain')), created_at TEXT NOT NULL, finished_at TEXT);
CREATE TABLE remote_evidence(evidence_id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES publication_attempts(attempt_id), remote_id TEXT NOT NULL, remote_url TEXT, evidence_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(attempt_id,remote_id));
CREATE TABLE recovery_intents(intent_id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL UNIQUE REFERENCES publication_attempts(attempt_id), state TEXT NOT NULL CHECK(state IN('remote_started','outcome_pending','resolved','manual_check')), payload_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE submission_batches(batch_id TEXT PRIMARY KEY, status TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE submission_items(item_id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES submission_batches(batch_id), article_id TEXT NOT NULL, target_key TEXT NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL, claim_token TEXT, claim_until TEXT, payload_json TEXT NOT NULL, UNIQUE(batch_id,article_id,target_key));
CREATE TABLE remote_orders(order_id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES publication_attempts(attempt_id), remote_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(attempt_id,remote_id));
CREATE TABLE post_processing_jobs(job_id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES publication_attempts(attempt_id), kind TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('queued','claimed','completed','failed')), attempts INTEGER NOT NULL, claim_token TEXT, claim_until TEXT, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(attempt_id,kind));
CREATE INDEX recovery_actionable ON recovery_intents(state,updated_at);
CREATE INDEX job_actionable ON post_processing_jobs(status,claim_until);
CREATE INDEX submission_claimable ON submission_items(batch_id,status,claim_until,item_id);`;

const V2_SCHEMA = `CREATE TABLE submission_item_operations(operation_id TEXT PRIMARY KEY NOT NULL, batch_id TEXT NOT NULL REFERENCES submission_batches(batch_id), item_id TEXT NOT NULL REFERENCES submission_items(item_id), action TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN('prepared','main_staged','sidecar_staged','staged','state_applied','complete')), expected_fingerprint TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(batch_id,item_id,action));`;
const V3_SCHEMA = `CREATE TABLE IF NOT EXISTS order_display_snapshots(attempt_id TEXT PRIMARY KEY NOT NULL REFERENCES publication_attempts(attempt_id), title_snapshot TEXT NOT NULL, filename TEXT NOT NULL, resource_name_snapshot TEXT NOT NULL, quoted_price REAL, created_at TEXT NOT NULL);`;

let expectedV1Structure;
const project = (row, fields) => Object.fromEntries(fields.map((field) => [field, row[field]]));
const pragma = (db, kind, name) => db.prepare(`PRAGMA ${kind}(${JSON.stringify(name)})`).all();

function tableStructure(db, name) {
  const definition = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name);
  if (!definition) return null;
  const columns = pragma(db, "table_info", name).map((row) => project(row, "name type notnull dflt_value pk".split(" ")));
  const foreignKeys = pragma(db, "foreign_key_list", name).map((row) => project(row, "id seq table from to on_update on_delete match".split(" ")));
  const indexes = pragma(db, "index_list", name).map((index) => ({
    name: index.origin === "c" ? index.name : null,
    ...project(index, "unique origin partial".split(" ")),
    columns: pragma(db, "index_info", index.name).map((column) => column.name),
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const checks = (definition.sql || "").replace(/\s+/g, "").match(/CHECK\((?:[^()]|\([^()]*\))*\)/gi);
  return { columns, foreignKeys, indexes, checks: checks || [] };
}

function tableNames(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
}

function verifyV1Structure(db, errorCode) {
  if (!expectedV1Structure) {
    const expected = new DatabaseSync(":memory:");
    try {
      expected.exec(V1_SCHEMA);
      expectedV1Structure = Object.fromEntries(tableNames(expected).map((name) => [name, tableStructure(expected, name)]));
    } finally { expected.close(); }
  }
  if (Object.entries(expectedV1Structure).some(([name, structure]) => JSON.stringify(tableStructure(db, name)) !== JSON.stringify(structure))) throw fail(errorCode);
}

function schemaVersion(db) {
  const row = db.prepare("SELECT MAX(version) version FROM schema_migrations").get();
  return row && Number.isInteger(row.version) ? row.version : 0;
}

function verifyMigrationHistory(db, expectedVersions, errorCode) {
  const rows = db.prepare("SELECT version,applied_at FROM schema_migrations ORDER BY version").all();
  if (rows.length !== expectedVersions.length || rows.some((row, index) => row.version !== expectedVersions[index] || typeof row.applied_at !== "string" || !row.applied_at.trim() || !Number.isFinite(Date.parse(row.applied_at)))) throw fail(errorCode);
}

function tableDataHashes(db, ignoredTables = []) {
  const ignored = new Set(ignoredTables);
  return Object.fromEntries(tableNames(db).filter((name) => !name.startsWith("sqlite_") && !ignored.has(name)).sort().map((name) => {
    const quoted = JSON.stringify(name);
    const columns = db.prepare(`PRAGMA table_info(${quoted})`).all().sort((left, right) => left.cid - right.cid).map((column) => column.name);
    const selection = columns.map((column) => JSON.stringify(column)).join(",");
    const rows = db.prepare(`SELECT ${selection} FROM ${quoted} ORDER BY ${selection}`).all().map((row) => columns.map((column) => row[column]));
    return [name, crypto.createHash("sha256").update(text(rows)).digest("hex")];
  }));
}

function verifyTableDataHashes(db, expected, errorCode) {
  const actual = tableDataHashes(db, tableNames(db).filter((name) => !(name in expected)));
  if (text(actual) !== text(expected)) throw fail(errorCode);
}

function verifyV2Structure(db, errorCode, options) {
  const allowLegacy = options && options.allowLegacyOperationIdNullability === true;
  const tables = tableNames(db);
  const definition = tables.includes("submission_item_operations") ? db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='submission_item_operations'").get() : null;
  const columns = tables.includes("submission_item_operations") ? db.prepare("PRAGMA table_info(submission_item_operations)").all() : [];
  const foreignKeys = tables.includes("submission_item_operations") ? db.prepare("PRAGMA foreign_key_list(submission_item_operations)").all() : [];
  const required = [["operation_id", "TEXT"], ["batch_id", "TEXT"], ["item_id", "TEXT"], ["action", "TEXT"], ["state", "TEXT"], ["expected_fingerprint", "TEXT"], ["payload_json", "TEXT"], ["created_at", "TEXT"], ["updated_at", "TEXT"]];
  const unique = tables.includes("submission_item_operations") ? db.prepare("PRAGMA index_list(submission_item_operations)").all().filter((index) => index.unique === 1).map((index) => db.prepare(`PRAGMA index_info(${JSON.stringify(index.name)})`).all().map((column) => column.name).join(",")) : [];
  const operationId = columns.find((column) => column.name === "operation_id");
  if (!tables.includes("submission_item_operations") || columns.length !== required.length || !required.every(([name, type], index) => columns[index] && columns[index].name === name && columns[index].type.toUpperCase() === type && (columns[index].notnull === 1 || (allowLegacy && name === "operation_id" && columns[index].notnull === 0))) || !operationId || (operationId.pk !== 1 && !unique.includes("operation_id")) || !definition || !/CHECK\s*\(\s*state\s+IN\s*\(\s*'prepared'\s*,\s*'main_staged'\s*,\s*'sidecar_staged'\s*,\s*'staged'\s*,\s*'state_applied'\s*,\s*'complete'\s*\)\s*\)/i.test(definition.sql || "") || !unique.includes("batch_id,item_id,action") || foreignKeys.length !== 2 || !foreignKeys.some((key) => key.table === "submission_batches" && key.from === "batch_id" && key.to === "batch_id") || !foreignKeys.some((key) => key.table === "submission_items" && key.from === "item_id" && key.to === "item_id")) throw fail(errorCode);
}

function installV2OperationSchema(db, errorCode) {
  if (!tableNames(db).includes("submission_item_operations")) { db.exec(V2_SCHEMA); return; }
  verifyV2Structure(db, errorCode, { allowLegacyOperationIdNullability: true });
  const operationId = db.prepare("PRAGMA table_info(submission_item_operations)").all().find((column) => column.name === "operation_id");
  if (operationId && operationId.notnull === 1) return;
  if (db.prepare("SELECT COUNT(*) count FROM submission_item_operations WHERE operation_id IS NULL").get().count !== 0) throw fail(errorCode);
  db.exec(`ALTER TABLE submission_item_operations RENAME TO submission_item_operations_legacy_phase_05;
${V2_SCHEMA}
INSERT INTO submission_item_operations(operation_id,batch_id,item_id,action,state,expected_fingerprint,payload_json,created_at,updated_at)
SELECT operation_id,batch_id,item_id,action,state,expected_fingerprint,payload_json,created_at,updated_at FROM submission_item_operations_legacy_phase_05;
DROP TABLE submission_item_operations_legacy_phase_05;`);
}

function verifyV3Structure(db, errorCode, options) {
  const columns = tableNames(db).includes("order_display_snapshots") ? db.prepare("PRAGMA table_info(order_display_snapshots)").all() : [];
  const foreignKeys = tableNames(db).includes("order_display_snapshots") ? db.prepare("PRAGMA foreign_key_list(order_display_snapshots)").all() : [];
  const required = [["attempt_id", "TEXT", 1, 1], ["title_snapshot", "TEXT", 1, 0], ["filename", "TEXT", 1, 0], ["resource_name_snapshot", "TEXT", 1, 0], ["quoted_price", "REAL", 0, 0], ["created_at", "TEXT", 1, 0]];
  const allowV4 = options && options.allowV4Columns === true;
  const extra = [["media_resource_id", "TEXT", 0, 0], ["estimated_total", "REAL", 0, 0], ["system_submission_code", "TEXT", 0, 0]];
  if (columns.length !== required.length + (allowV4 ? extra.length : 0) || !required.every(([name, type, notnull, pk], index) => columns[index] && columns[index].name === name && columns[index].type.toUpperCase() === type && columns[index].notnull === notnull && columns[index].pk === pk) || (allowV4 && !extra.every(([name, type, notnull, pk], index) => columns[required.length + index] && columns[required.length + index].name === name && columns[required.length + index].type.toUpperCase() === type && columns[required.length + index].notnull === notnull && columns[required.length + index].pk === pk)) || foreignKeys.length !== 1 || foreignKeys[0].table !== "publication_attempts" || foreignKeys[0].from !== "attempt_id" || foreignKeys[0].to !== "attempt_id") throw fail(errorCode);
}

function migrationFault(hook, point, db) { if (hook) hook(point, db); }

function dryRunSchema(filename) {
  if (typeof filename !== "string" || !path.isAbsolute(filename))
    throw fail("OPERATIONAL_PATH_INVALID");
  if (!fs.existsSync(filename)) throw fail("OPERATIONAL_DATABASE_NOT_FOUND");
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw fail("OPERATIONAL_PATH_INVALID");
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    const version = schemaVersion(db);
    if (version > SCHEMA_VERSION) throw fail("OPERATIONAL_SCHEMA_FUTURE");
    if (version < 1) throw fail("OPERATIONAL_SCHEMA_INVALID");
    const history = version === 1 ? [1] : version === 2 ? [1, 2] : version === 3 ? [1, 2, 3] : [1, 2, 3, 4];
    verifyMigrationHistory(db, history, "OPERATIONAL_SCHEMA_INVALID");
    verifyV1Structure(db, "OPERATIONAL_SCHEMA_INVALID");
    if (version >= 2) verifyV2Structure(db, "OPERATIONAL_SCHEMA_INVALID");
    if (version >= 3) verifyV3Structure(db, "OPERATIONAL_SCHEMA_INVALID", { allowV4Columns: version >= 4 });
    if (version >= 4) verifyV4Structure(db, "OPERATIONAL_SCHEMA_INVALID");
    return Object.freeze({
      mode: "dry-run",
      databasePath: filename,
      fromVersion: version,
      toVersion: SCHEMA_VERSION,
      migrations: Object.freeze(Array.from({ length: SCHEMA_VERSION - version }, (_, index) => version + index + 1)),
      dataHashes: Object.freeze(tableDataHashes(db)),
    });
  } finally {
    db.close();
  }
}

function migrateSchema(db, migrationHook) {
  db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
  const tables = tableNames(db);
  if (!tables.includes("schema_migrations")) {
    if (tables.some((name) => name !== "sqlite_sequence")) throw fail("OPERATIONAL_SCHEMA_INVALID");
    runTransaction(db, () => { db.exec(V1_SCHEMA); db.prepare("INSERT INTO schema_migrations VALUES(1,?)").run(new Date().toISOString()); });
  }
  let version = schemaVersion(db);
  if (version > SCHEMA_VERSION) throw fail("OPERATIONAL_SCHEMA_FUTURE");
  if (version < 1) throw fail("OPERATIONAL_SCHEMA_INVALID");
  const history = version === 1 ? [1] : version === 2 ? [1, 2] : version === 3 ? [1, 2, 3] : [1, 2, 3, 4];
  verifyMigrationHistory(db, history, "OPERATIONAL_SCHEMA_INVALID");
  verifyV1Structure(db, "OPERATIONAL_SCHEMA_INVALID");
  if (version === 1) {
    runTransaction(db, () => {
      const before = tableDataHashes(db), beforeWithoutHistory = { ...before };
      delete beforeWithoutHistory.schema_migrations;
      migrationFault(migrationHook, "before-v2", db); installV2OperationSchema(db, "OPERATIONAL_SCHEMA_MIGRATION_INVALID"); migrationFault(migrationHook, "after-v2-create", db); verifyTableDataHashes(db, before, "OPERATIONAL_SCHEMA_MIGRATION_INVALID"); verifyV2Structure(db, "OPERATIONAL_SCHEMA_MIGRATION_INVALID"); migrationFault(migrationHook, "after-v2-verify", db); verifyTableDataHashes(db, before, "OPERATIONAL_SCHEMA_MIGRATION_INVALID");
      db.prepare("INSERT INTO schema_migrations VALUES(2,?)").run(new Date().toISOString()); migrationFault(migrationHook, "after-v2-record", db); verifyTableDataHashes(db, beforeWithoutHistory, "OPERATIONAL_SCHEMA_MIGRATION_INVALID"); verifyMigrationHistory(db, [1, 2], "OPERATIONAL_SCHEMA_MIGRATION_INVALID");
    });
    version = 2;
  }
  if (version === 2) {
    runTransaction(db, () => {
      migrationFault(migrationHook, "before-v3", db); db.exec(V3_SCHEMA); verifyV3Structure(db, "OPERATIONAL_SCHEMA_MIGRATION_INVALID"); migrationFault(migrationHook, "after-v3-create", db); db.prepare("INSERT INTO schema_migrations VALUES(3,?)").run(new Date().toISOString()); migrationFault(migrationHook, "after-v3-record", db); verifyMigrationHistory(db, [1, 2, 3], "OPERATIONAL_SCHEMA_MIGRATION_INVALID");
    });
    version = 3;
  }
  if (version === 3) {
    migrateV4Schema(db, migrationHook, { runTransaction, tableDataHashes, verifyTableDataHashes, verifyMigrationHistory });
    version = 4;
  }
  if (version !== SCHEMA_VERSION) throw fail("OPERATIONAL_SCHEMA_INVALID");
  verifyMigrationHistory(db, [1, 2, 3, 4], "OPERATIONAL_SCHEMA_INVALID");
  verifyV1Structure(db, "OPERATIONAL_SCHEMA_INVALID"); verifyV2Structure(db, "OPERATIONAL_SCHEMA_INVALID"); verifyV3Structure(db, "OPERATIONAL_SCHEMA_INVALID", { allowV4Columns: true }); verifyV4Structure(db, "OPERATIONAL_SCHEMA_INVALID");
}

function integrityOk(db) { const result = db.prepare("PRAGMA integrity_check").all(); return result.length === 1 && Object.values(result[0])[0] === "ok"; }

module.exports = { SCHEMA_VERSION, V1_SCHEMA, V2_SCHEMA, V3_SCHEMA, V4_SCHEMA, V4_CREATE_SCHEMA, tableNames, schemaVersion, verifyMigrationHistory, tableDataHashes, verifyTableDataHashes, verifyV1Structure, verifyV2Structure, installV2OperationSchema, verifyV3Structure, installV4Schema, verifyV4Structure, dryRunSchema, migrateSchema, integrityOk };
