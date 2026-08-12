const { fail } = require("./operational-store-utils");

const V6_SCHEMA = `CREATE TABLE paid_staging_items(client_id TEXT NOT NULL, article_id TEXT NOT NULL, selected_media_resource_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(client_id,article_id));
CREATE INDEX paid_staging_client ON paid_staging_items(client_id,created_at,article_id);`;

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

function indexColumns(db, name, indexName) {
  return db
    .prepare(`PRAGMA index_info(${JSON.stringify(indexName)})`)
    .all()
    .map((column) => column.name);
}

function verifyV6Structure(db, errorCode) {
  const expected = [
    ["client_id", "TEXT", 1, 1],
    ["article_id", "TEXT", 1, 2],
    ["selected_media_resource_id", "TEXT", 0, 0],
    ["created_at", "TEXT", 1, 0],
    ["updated_at", "TEXT", 1, 0],
  ];
  const actual = columns(db, "paid_staging_items");
  if (
    JSON.stringify(actual) !== JSON.stringify(expected) ||
    !db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get("paid_staging_items")
  )
    throw fail(errorCode);

  const indexes = db
    .prepare("PRAGMA index_list('paid_staging_items')")
    .all();
  const primaryKey = indexes.find((index) => index.origin === "pk");
  const clientIndex = indexes.find((index) => index.name === "paid_staging_client");
  if (
    !primaryKey ||
    JSON.stringify(indexColumns(db, "paid_staging_items", primaryKey.name)) !==
      JSON.stringify(["client_id", "article_id"]) ||
    !clientIndex ||
    clientIndex.unique !== 0 ||
    JSON.stringify(indexColumns(db, "paid_staging_items", clientIndex.name)) !==
      JSON.stringify(["client_id", "created_at", "article_id"])
  )
    throw fail(errorCode);
}

function migrateV6Schema(db, migrationHook, helpers) {
  const fault = (point) => {
    if (migrationHook) migrationHook(point, db);
  };
  helpers.runTransaction(db, () => {
    const before = helpers.tableDataHashes(db);
    fault("before-v6");
    db.exec(V6_SCHEMA);
    fault("after-v6-create");
    helpers.verifyTableDataHashes(
      db,
      before,
      "OPERATIONAL_SCHEMA_MIGRATION_INVALID",
    );
    verifyV6Structure(db, "OPERATIONAL_SCHEMA_MIGRATION_INVALID");
    fault("after-v6-verify");
    helpers.verifyTableDataHashes(
      db,
      before,
      "OPERATIONAL_SCHEMA_MIGRATION_INVALID",
    );
    db.prepare("INSERT INTO schema_migrations VALUES(6,?)").run(
      new Date().toISOString(),
    );
    fault("after-v6-record");
    helpers.verifyMigrationHistory(
      db,
      [1, 2, 3, 4, 5, 6],
      "OPERATIONAL_SCHEMA_MIGRATION_INVALID",
    );
  });
}

module.exports = { V6_SCHEMA, verifyV6Structure, migrateV6Schema };
