const { fail } = require("./operational-store-utils");

const V5_SCHEMA = `CREATE TABLE migration_journals(migration_run_id TEXT PRIMARY KEY NOT NULL, workspace_fingerprint TEXT NOT NULL, source_fingerprint TEXT NOT NULL, plan_fingerprint TEXT NOT NULL, source_version INTEGER NOT NULL CHECK(source_version > 0), phase TEXT NOT NULL CHECK(phase IN('detected','backed_up','confirmed','import_committed','verified')), backup_identity TEXT, confirmation_fingerprint TEXT, import_commit_fingerprint TEXT, verification_fingerprint TEXT, imported_schema_version INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE migration_import_entries(entry_id TEXT PRIMARY KEY NOT NULL, migration_run_id TEXT NOT NULL REFERENCES migration_journals(migration_run_id), article_id TEXT NOT NULL UNIQUE, variant TEXT NOT NULL CHECK(variant IN('publishedEvidence','trackablePaidOrder','pendingReadmission','nonPublishedTerminal','needsAttentionConflict','deletionRecoveryConflict')), entry_json TEXT NOT NULL, imported_at TEXT NOT NULL);
CREATE INDEX migration_import_run ON migration_import_entries(migration_run_id,entry_id);
CREATE TABLE migration_import_order_identities(order_id TEXT PRIMARY KEY NOT NULL, entry_id TEXT NOT NULL REFERENCES migration_import_entries(entry_id));`;

function columns(db, name) {
  return db
    .prepare(`PRAGMA table_info(${JSON.stringify(name)})`)
    .all()
    .map(({ name: column, type, notnull, pk }) => [
      column,
      String(type || "").toUpperCase(),
      notnull,
      pk,
    ]);
}

function verifyV5Structure(db, errorCode) {
  const expected = {
    migration_journals: [
      ["migration_run_id", "TEXT", 1, 1],
      ["workspace_fingerprint", "TEXT", 1, 0],
      ["source_fingerprint", "TEXT", 1, 0],
      ["plan_fingerprint", "TEXT", 1, 0],
      ["source_version", "INTEGER", 1, 0],
      ["phase", "TEXT", 1, 0],
      ["backup_identity", "TEXT", 0, 0],
      ["confirmation_fingerprint", "TEXT", 0, 0],
      ["import_commit_fingerprint", "TEXT", 0, 0],
      ["verification_fingerprint", "TEXT", 0, 0],
      ["imported_schema_version", "INTEGER", 0, 0],
      ["created_at", "TEXT", 1, 0],
      ["updated_at", "TEXT", 1, 0],
    ],
    migration_import_entries: [
      ["entry_id", "TEXT", 1, 1],
      ["migration_run_id", "TEXT", 1, 0],
      ["article_id", "TEXT", 1, 0],
      ["variant", "TEXT", 1, 0],
      ["entry_json", "TEXT", 1, 0],
      ["imported_at", "TEXT", 1, 0],
    ],
    migration_import_order_identities: [
      ["order_id", "TEXT", 1, 1],
      ["entry_id", "TEXT", 1, 0],
    ],
  };
  for (const [name, shape] of Object.entries(expected))
    if (JSON.stringify(columns(db, name)) !== JSON.stringify(shape))
      throw fail(errorCode);
  const foreignKeys = db
    .prepare("PRAGMA foreign_key_list('migration_import_entries')")
    .all();
  if (
    foreignKeys.length !== 1 ||
    foreignKeys[0].table !== "migration_journals" ||
    foreignKeys[0].from !== "migration_run_id" ||
    foreignKeys[0].to !== "migration_run_id"
  )
    throw fail(errorCode);
  const uniqueArticle = db
    .prepare("PRAGMA index_list('migration_import_entries')")
    .all()
    .filter((index) => index.unique === 1)
    .some((index) => {
      const fields = db
        .prepare(`PRAGMA index_info(${JSON.stringify(index.name)})`)
        .all()
        .map((column) => column.name);
      return JSON.stringify(fields) === JSON.stringify(["article_id"]);
    });
  if (!uniqueArticle) throw fail(errorCode);
  const orderForeignKeys = db
    .prepare("PRAGMA foreign_key_list('migration_import_order_identities')")
    .all();
  if (
    orderForeignKeys.length !== 1 ||
    orderForeignKeys[0].table !== "migration_import_entries" ||
    orderForeignKeys[0].from !== "entry_id" ||
    orderForeignKeys[0].to !== "entry_id"
  )
    throw fail(errorCode);
}

function migrateV5Schema(db, migrationHook, helpers) {
  const fault = (point) => {
    if (migrationHook) migrationHook(point, db);
  };
  helpers.runTransaction(db, () => {
    const before = helpers.tableDataHashes(db);
    fault("before-v5");
    db.exec(V5_SCHEMA);
    fault("after-v5-create");
    helpers.verifyTableDataHashes(
      db,
      before,
      "OPERATIONAL_SCHEMA_MIGRATION_INVALID",
    );
    verifyV5Structure(db, "OPERATIONAL_SCHEMA_MIGRATION_INVALID");
    db.prepare("INSERT INTO schema_migrations VALUES(5,?)").run(
      new Date().toISOString(),
    );
    fault("after-v5-record");
    helpers.verifyMigrationHistory(
      db,
      [1, 2, 3, 4, 5],
      "OPERATIONAL_SCHEMA_MIGRATION_INVALID",
    );
  });
}

module.exports = { V5_SCHEMA, verifyV5Structure, migrateV5Schema };
