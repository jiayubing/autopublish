const { fail, text } = require("./operational-store-utils");

const V7_SCHEMA = `CREATE TABLE submission_migration_notices(notice_id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL CHECK(kind IN('retired_paid_selection')), source_schema_version INTEGER NOT NULL, target_schema_version INTEGER NOT NULL, article_refs_json TEXT NOT NULL, summary_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX submission_migration_notice_kind ON submission_migration_notices(kind);`;

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

function indexColumns(db, indexName) {
  return db
    .prepare(`PRAGMA index_info(${JSON.stringify(indexName)})`)
    .all()
    .map((column) => column.name);
}

function verifyV7Structure(db, errorCode, options) {
  const expected = [
    ["notice_id", "TEXT", 1, 1],
    ["kind", "TEXT", 1, 0],
    ["source_schema_version", "INTEGER", 1, 0],
    ["target_schema_version", "INTEGER", 1, 0],
    ["article_refs_json", "TEXT", 1, 0],
    ["summary_json", "TEXT", 1, 0],
    ["created_at", "TEXT", 1, 0],
  ];
  const actual = columns(db, "submission_migration_notices");
  const definition = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='submission_migration_notices'",
    )
    .get();
  const indexes = db
    .prepare("PRAGMA index_list('submission_migration_notices')")
    .all();
  const primaryKey = indexes.find((index) => index.origin === "pk");
  const kindIndex = indexes.find(
    (index) => index.name === "submission_migration_notice_kind",
  );
  const legacyTable = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
    .get("paid_staging_items");
  if (
    JSON.stringify(actual) !== JSON.stringify(expected) ||
    !definition ||
    !/CHECK\s*\(\s*kind\s+IN\s*\(\s*'retired_paid_selection'\s*\)\s*\)/i.test(
      definition.sql || "",
    ) ||
    !primaryKey ||
    JSON.stringify(indexColumns(db, primaryKey.name)) !==
      JSON.stringify(["notice_id"]) ||
    !kindIndex ||
    kindIndex.unique !== 1 ||
    JSON.stringify(indexColumns(db, kindIndex.name)) !== JSON.stringify(["kind"]) ||
    (legacyTable && !(options && options.allowLegacy === true))
  )
    throw fail(errorCode);
}

function migrateV7Schema(db, migrationHook, helpers) {
  const fault = (point) => {
    if (migrationHook) migrationHook(point, db);
  };
  helpers.runTransaction(db, () => {
    const before = helpers.tableDataHashes(db);
    const beforeWithoutLegacy = { ...before };
    delete beforeWithoutLegacy.paid_staging_items;
    const legacyRows = db
      .prepare(
        "SELECT client_id,article_id FROM paid_staging_items ORDER BY client_id,article_id",
      )
      .all()
      .map((row) => ({ clientId: row.client_id, articleId: row.article_id }));
    const noticeId = "retired-paid-selection-v1";
    const summary = {
      noticeCode: "PAID_SELECTION_RESELECT_REQUIRED",
      action: "reselect_paid_submission",
      articleCount: legacyRows.length,
      sourceSchemaVersion: 6,
      targetSchemaVersion: 7,
    };
    fault("before-v7");
    db.exec(V7_SCHEMA);
    fault("after-v7-create");
    verifyV7Structure(db, "OPERATIONAL_SCHEMA_MIGRATION_INVALID", {
      allowLegacy: true,
    });
    helpers.verifyTableDataHashes(
      db,
      before,
      "OPERATIONAL_SCHEMA_MIGRATION_INVALID",
    );
    if (legacyRows.length > 0) {
      db.prepare(
        "INSERT INTO submission_migration_notices(notice_id,kind,source_schema_version,target_schema_version,article_refs_json,summary_json,created_at) VALUES(?,?,?,?,?,?,?)",
      ).run(
        noticeId,
        "retired_paid_selection",
        6,
        7,
        text(legacyRows),
        text(summary),
        new Date().toISOString(),
      );
      fault("after-v7-notice");
    }
    db.exec("DROP TABLE paid_staging_items");
    fault("after-v7-clear");
    helpers.verifyTableDataHashes(
      db,
      beforeWithoutLegacy,
      "OPERATIONAL_SCHEMA_MIGRATION_INVALID",
    );
    verifyV7Structure(db, "OPERATIONAL_SCHEMA_MIGRATION_INVALID");
    db.prepare("INSERT INTO schema_migrations VALUES(7,?)").run(
      new Date().toISOString(),
    );
    fault("after-v7-record");
    helpers.verifyMigrationHistory(
      db,
      [1, 2, 3, 4, 5, 6, 7],
      "OPERATIONAL_SCHEMA_MIGRATION_INVALID",
    );
  });
}

module.exports = { V7_SCHEMA, verifyV7Structure, migrateV7Schema };
