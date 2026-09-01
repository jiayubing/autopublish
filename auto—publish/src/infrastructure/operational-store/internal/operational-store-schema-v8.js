const { fail, text } = require("./operational-store-utils");
const { verifyV4Structure } = require("./operational-store-schema-v4");

const V8_SCHEMA =
  "ALTER TABLE submission_queue_groups ADD COLUMN image_count INTEGER NOT NULL DEFAULT 0 CHECK(typeof(image_count)='integer' AND image_count BETWEEN 0 AND 5);";

function queueGroupRows(db) {
  return db
    .prepare(
      "SELECT queue_group_id,platform_id,account_profile_id,pause_intent,revision,created_at,updated_at FROM submission_queue_groups ORDER BY queue_group_id",
    )
    .all();
}

function verifyV8Structure(db, errorCode, options) {
  verifyV4Structure(db, errorCode, {
    allowV8ImageCount: true,
    allowV9SubmissionInterval:
      options && options.allowV9SubmissionInterval === true,
  });
  const columns = db
    .prepare("PRAGMA table_info(submission_queue_groups)")
    .all();
  const imageCount = columns.find((column) => column.name === "image_count");
  const allowV9 = options && options.allowV9SubmissionInterval === true;
  const definition = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='submission_queue_groups'",
    )
    .get();
  const invalidCount = db
    .prepare(
      "SELECT COUNT(*) count FROM submission_queue_groups WHERE typeof(image_count)!='integer' OR image_count NOT BETWEEN 0 AND 5",
    )
    .get().count;
  if (
    columns.length !== 8 + (allowV9 ? 1 : 0) ||
    !imageCount ||
    imageCount.name !== "image_count" ||
    String(imageCount.type || "").toUpperCase() !== "INTEGER" ||
    imageCount.notnull !== 1 ||
    imageCount.pk !== 0 ||
    String(imageCount.dflt_value) !== "0" ||
    !definition ||
    !/CHECK\s*\(\s*typeof\s*\(\s*image_count\s*\)\s*=\s*'integer'\s+AND\s+image_count\s+BETWEEN\s+0\s+AND\s+5\s*\)/i.test(
      definition.sql || "",
    ) ||
    invalidCount !== 0
  )
    throw fail(errorCode);
}

function migrateV8Schema(db, migrationHook, helpers) {
  const fault = (point) => {
    if (migrationHook) migrationHook(point, db);
  };
  helpers.runTransaction(db, () => {
    const before = helpers.tableDataHashes(db, ["submission_queue_groups"]);
    const beforeGroups = text(queueGroupRows(db));
    fault("before-v8");
    db.exec(V8_SCHEMA);
    fault("after-v8-add-image-count");
    helpers.verifyTableDataHashes(
      db,
      before,
      "OPERATIONAL_SCHEMA_MIGRATION_INVALID",
    );
    if (text(queueGroupRows(db)) !== beforeGroups)
      throw fail("OPERATIONAL_SCHEMA_MIGRATION_INVALID");
    verifyV8Structure(db, "OPERATIONAL_SCHEMA_MIGRATION_INVALID");
    fault("after-v8-verify");
    db.prepare("INSERT INTO schema_migrations VALUES(8,?)").run(
      new Date().toISOString(),
    );
    fault("after-v8-record");
    helpers.verifyMigrationHistory(
      db,
      [1, 2, 3, 4, 5, 6, 7, 8],
      "OPERATIONAL_SCHEMA_MIGRATION_INVALID",
    );
  });
}

module.exports = { V8_SCHEMA, verifyV8Structure, migrateV8Schema };
