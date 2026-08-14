const fs = require("node:fs");
const path = require("node:path");

const {
  SCHEMA_VERSION,
  tableNames,
  schemaVersion,
  verifyMigrationHistory,
  verifyV1Structure,
  verifyV2Structure,
  verifyV3Structure,
  verifyV4Structure,
  verifyV5Structure,
  verifyV7Structure,
  integrityOk,
} = require("./operational-store-schema");
const { verifyOperationalDatabase } = require("./operational-store-verifier");

function createMaintenanceAggregate(context) {
  const { db, filename, open, fail } = context;

  function verify() {
    open();
    const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();
    const tables = tableNames(db);
    const version = schemaVersion(db);
    if (
      foreignKeys.length ||
      !integrityOk(db) ||
      !tables.includes("publication_records") ||
      version !== SCHEMA_VERSION
    )
      throw fail("OPERATIONAL_VERIFY_FAILED");
    verifyMigrationHistory(db, [1, 2, 3, 4, 5, 6, 7], "OPERATIONAL_VERIFY_FAILED");
    verifyV1Structure(db, "OPERATIONAL_VERIFY_FAILED");
    verifyV2Structure(db, "OPERATIONAL_VERIFY_FAILED");
    verifyV3Structure(db, "OPERATIONAL_VERIFY_FAILED", {
      allowV4Columns: true,
    });
    verifyV4Structure(db, "OPERATIONAL_VERIFY_FAILED");
    verifyV5Structure(db, "OPERATIONAL_VERIFY_FAILED");
    verifyV7Structure(db, "OPERATIONAL_VERIFY_FAILED");
    return {
      schemaVersion: version,
      databasePath: filename,
      foreignKeyViolations: 0,
      tableCount: tables.length,
    };
  }

  function backup(destination) {
    open();
    if (
      typeof destination !== "string" ||
      !path.isAbsolute(destination) ||
      fs.existsSync(destination)
    )
      throw fail("OPERATIONAL_BACKUP_DESTINATION_INVALID");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    fs.copyFileSync(filename, destination, fs.constants.COPYFILE_EXCL);
    return verifyOperationalDatabase(destination);
  }

  return Object.freeze({ verify, backup });
}

module.exports = {
  createMaintenanceAggregate,
  verifyOperationalDatabase,
};
