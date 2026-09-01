const { fail, text } = require("./operational-store-utils");
const { verifyV8Structure } = require("./operational-store-schema-v8");

const V9_SCHEMA =
  "ALTER TABLE submission_queue_groups ADD COLUMN submission_interval_seconds INTEGER NOT NULL DEFAULT 30 CHECK(typeof(submission_interval_seconds)='integer' AND submission_interval_seconds BETWEEN 0 AND 3600);";

function queueGroupRows(db) {
  return db
    .prepare(
      "SELECT queue_group_id,platform_id,account_profile_id,pause_intent,revision,created_at,updated_at,image_count FROM submission_queue_groups ORDER BY queue_group_id",
    )
    .all();
}

function verifyV9Structure(db, errorCode) {
  verifyV8Structure(db, errorCode, { allowV9SubmissionInterval: true });
  const columns = db
    .prepare("PRAGMA table_info(submission_queue_groups)")
    .all();
  const interval = columns.at(-1);
  const definition = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='submission_queue_groups'",
    )
    .get();
  const invalidCount = db
    .prepare(
      "SELECT COUNT(*) count FROM submission_queue_groups WHERE typeof(submission_interval_seconds)!='integer' OR submission_interval_seconds NOT BETWEEN 0 AND 3600",
    )
    .get().count;
  if (
    columns.length !== 9 ||
    !interval ||
    interval.name !== "submission_interval_seconds" ||
    String(interval.type || "").toUpperCase() !== "INTEGER" ||
    interval.notnull !== 1 ||
    interval.pk !== 0 ||
    String(interval.dflt_value) !== "30" ||
    !definition ||
    !/CHECK\s*\(\s*typeof\s*\(\s*submission_interval_seconds\s*\)\s*=\s*'integer'\s+AND\s+submission_interval_seconds\s+BETWEEN\s+0\s+AND\s+3600\s*\)/i.test(
      definition.sql || "",
    ) ||
    invalidCount !== 0
  )
    throw fail(errorCode);
}

function migrateV9Schema(db, migrationHook, helpers) {
  const fault = (point) => {
    if (migrationHook) migrationHook(point, db);
  };
  helpers.runTransaction(db, () => {
    const before = helpers.tableDataHashes(db, ["submission_queue_groups"]);
    const beforeGroups = text(queueGroupRows(db));
    fault("before-v9");
    db.exec(V9_SCHEMA);
    fault("after-v9-add-submission-interval");
    helpers.verifyTableDataHashes(
      db,
      before,
      "OPERATIONAL_SCHEMA_MIGRATION_INVALID",
    );
    if (text(queueGroupRows(db)) !== beforeGroups)
      throw fail("OPERATIONAL_SCHEMA_MIGRATION_INVALID");
    verifyV9Structure(db, "OPERATIONAL_SCHEMA_MIGRATION_INVALID");
    fault("after-v9-verify");
    db.prepare("INSERT INTO schema_migrations VALUES(9,?)").run(
      new Date().toISOString(),
    );
    fault("after-v9-record");
    helpers.verifyMigrationHistory(
      db,
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      "OPERATIONAL_SCHEMA_MIGRATION_INVALID",
    );
  });
}

module.exports = { V9_SCHEMA, verifyV9Structure, migrateV9Schema };
