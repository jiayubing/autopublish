const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

const { fail } = require("./operational-store-utils");
const {
  SCHEMA_VERSION,
  tableNames,
  schemaVersion,
  verifyMigrationHistory,
  verifyV1Structure,
  verifyV2Structure,
  verifyV3Structure,
  verifyV4Structure,
  integrityOk,
} = require("./operational-store-schema");

function verifyOperationalDatabase(filename) {
  if (
    typeof filename !== "string" ||
    !fs.existsSync(filename) ||
    fs.lstatSync(filename).isDirectory() ||
    fs.lstatSync(filename).isSymbolicLink()
  )
    throw fail("OPERATIONAL_RESTORE_TARGET_INVALID");
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    const tables = tableNames(db),
      foreignKeys = db.prepare("PRAGMA foreign_key_check").all(),
      version = tables.includes("schema_migrations") ? schemaVersion(db) : 0;
    if (
      !tables.includes("schema_migrations") ||
      !tables.includes("publication_records") ||
      !integrityOk(db) ||
      foreignKeys.length ||
      version !== SCHEMA_VERSION
    )
      throw fail("OPERATIONAL_RESTORE_INVALID");
    verifyMigrationHistory(db, [1, 2, 3, 4], "OPERATIONAL_RESTORE_INVALID");
    verifyV1Structure(db, "OPERATIONAL_RESTORE_INVALID");
    verifyV2Structure(db, "OPERATIONAL_RESTORE_INVALID");
    verifyV3Structure(db, "OPERATIONAL_RESTORE_INVALID", {
      allowV4Columns: true,
    });
    verifyV4Structure(db, "OPERATIONAL_RESTORE_INVALID");
    return {
      schemaVersion: version,
      tables: tables.length,
      rows: db.prepare("SELECT COUNT(*) count FROM publication_records").get()
        .count,
    };
  } finally {
    db.close();
  }
}

module.exports = { verifyOperationalDatabase };
