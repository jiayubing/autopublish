"use strict";

const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

const { databasePath } = require("./operational-store-runtime");
const { fail } = require("./operational-store-utils");

function inspectOperationalStoreImportedMigrationEntries(options) {
  const value = options || {};
  if (typeof value.workspaceRoot !== "string")
    throw fail("OPERATIONAL_WORKSPACE_REQUIRED");
  const filename = databasePath(value.workspaceRoot, value.filename, false);
  if (!fs.existsSync(filename)) return Object.freeze([]);
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw fail("OPERATIONAL_PATH_INVALID");
  let db;
  try {
    db = new DatabaseSync(filename, { readOnly: true });
    const table = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='migration_import_entries'",
      )
      .get();
    if (!table) return Object.freeze([]);
    return Object.freeze(
      db
        .prepare(
          "SELECT entry_json FROM migration_import_entries ORDER BY entry_id",
        )
        .all()
        .map((row) => Object.freeze(JSON.parse(row.entry_json))),
    );
  } catch (error) {
    throw error && error.code
      ? error
      : fail("OPERATIONAL_MIGRATION_IMPORT_INSPECTION_FAILED");
  } finally {
    if (db) db.close();
  }
}

module.exports = { inspectOperationalStoreImportedMigrationEntries };
