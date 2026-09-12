const { fail } = require("./operational-store-utils");

const READ_INDEXES = Object.freeze({
  publication_attempts_by_publication: "publication_attempts(publication_id)",
  submission_items_by_article: "submission_items(article_id)",
});
const V10_SCHEMA = Object.entries(READ_INDEXES)
  .map(([name, target]) => `CREATE INDEX ${name} ON ${target};`)
  .join("\n");

function verifyV10Structure(db, errorCode) {
  for (const [name, target] of Object.entries(READ_INDEXES)) {
    const row = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name=?")
      .get(name);
    if (!row || row.sql !== `CREATE INDEX ${name} ON ${target}`)
      throw fail(errorCode);
  }
}

function migrateV10Schema(db, migrationHook, helpers) {
  const fault = (point) => {
    if (migrationHook) migrationHook(point, db);
  };
  helpers.runTransaction(db, () => {
    fault("before-v10");
    db.exec(V10_SCHEMA);
    fault("after-v10-indexes");
    verifyV10Structure(db, "OPERATIONAL_SCHEMA_MIGRATION_INVALID");
    db.prepare("INSERT INTO schema_migrations VALUES(10,?)").run(
      new Date().toISOString(),
    );
    fault("after-v10-record");
    helpers.verifyMigrationHistory(
      db,
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      "OPERATIONAL_SCHEMA_MIGRATION_INVALID",
    );
  });
}

module.exports = {
  READ_INDEXES,
  V10_SCHEMA,
  verifyV10Structure,
  migrateV10Schema,
};
