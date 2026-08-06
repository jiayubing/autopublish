const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const { fail } = require("./operational-store-utils");
const { dryRunSchema, migrateSchema } = require("./operational-store-schema");
const {
  assertStoreAvailable,
  acquireRuntimeOwner,
  registerStore,
  releaseRuntimeOwner,
} = require("./operational-store-owner-lease");
const { verifyOperationalDatabase } = require("./operational-store-verifier");

function databasePath(root, filename, temporary) {
  const expected = path.resolve(
    root,
    ".autopublish",
    "operations",
    "operations.db",
  );
  const actual = path.resolve(filename || expected);
  if (
    actual !== expected &&
    (!temporary ||
      path.dirname(actual) !== path.dirname(expected) ||
      !/^operations\.migration-[a-f0-9-]+\.db$/i.test(path.basename(actual)))
  )
    throw fail("OPERATIONAL_PATH_INVALID");
  return actual;
}

function openOperationalStoreRuntime(options) {
  const value = options || {};
  if (typeof value.workspaceRoot !== "string")
    throw fail("OPERATIONAL_WORKSPACE_REQUIRED");
  const filename = databasePath(
    value.workspaceRoot,
    value.filename,
    value.migrationTemporary === true,
  );
  assertStoreAvailable(filename, fail);
  if (fs.existsSync(filename) && fs.lstatSync(filename).isSymbolicLink())
    throw fail("OPERATIONAL_PATH_INVALID");
  try {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  } catch (_) {
    throw fail("OPERATIONAL_WRITE_OWNER_UNAVAILABLE");
  }
  const runtimeOwner =
    value.migrationTemporary === true
      ? null
      : acquireRuntimeOwner(filename, fail, verifyOperationalDatabase);
  let db;
  try {
    db = new DatabaseSync(filename);
    migrateSchema(
      db,
      typeof value.internalMigrationFault === "function"
        ? value.internalMigrationFault
        : null,
    );
  } catch (error) {
    try {
      if (db) db.close();
    } catch (_) {}
    releaseRuntimeOwner(filename, runtimeOwner);
    throw error && error.code
      ? error
      : fail("OPERATIONAL_DATABASE_OPEN_FAILED");
  }
  registerStore(filename);
  let closed = false;
  return Object.freeze({
    filename,
    db,
    close() {
      if (closed) return;
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      db.close();
      closed = true;
      releaseRuntimeOwner(filename, runtimeOwner);
    },
  });
}

function dryRunOperationalStoreMigration(options) {
  const value = options || {};
  if (typeof value.workspaceRoot !== "string")
    throw fail("OPERATIONAL_WORKSPACE_REQUIRED");
  return dryRunSchema(databasePath(value.workspaceRoot, value.filename, false));
}

module.exports = {
  databasePath,
  dryRunOperationalStoreMigration,
  openOperationalStoreRuntime,
};
