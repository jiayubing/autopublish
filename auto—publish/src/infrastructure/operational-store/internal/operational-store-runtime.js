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
const {
  reportDiagnostic,
} = require("../../../diagnostics/diagnostic-producer");

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
      : acquireRuntimeOwner(
          filename,
          fail,
          verifyOperationalDatabase,
          null,
          value.migrationOwner,
        );
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
    let cleanupCode = null;
    try {
      if (db) db.close();
    } catch (_) {
      cleanupCode = "OPERATIONAL_DATABASE_CLOSE_FAILED";
      reportDiagnostic({
        code: cleanupCode,
        module: "operational-store-runtime",
        category: "storage",
        metadata: {
          operation: "open",
          phase: "cleanup",
          failureKind: "database-close",
        },
      });
    }
    try {
      releaseRuntimeOwner(filename, runtimeOwner);
    } catch (_) {
      const failureCode = "OPERATIONAL_WRITE_OWNER_RELEASE_FAILED";
      cleanupCode = cleanupCode || failureCode;
      reportDiagnostic({
        code: failureCode,
        module: "operational-store-runtime",
        category: "storage",
        metadata: {
          operation: "open",
          phase: "cleanup",
          failureKind: "owner-release",
        },
      });
    }
    if (cleanupCode && error && !error.cleanupCode)
      error.cleanupCode = cleanupCode;
    throw error && error.code
      ? error
      : fail("OPERATIONAL_DATABASE_OPEN_FAILED");
  }
  registerStore(filename);
  let databaseClosed = false;
  let ownerReleased = runtimeOwner === null;
  return Object.freeze({
    filename,
    db,
    close() {
      if (databaseClosed && ownerReleased) return;
      if (!databaseClosed) {
        db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
        db.close();
        databaseClosed = true;
      }
      if (!ownerReleased) {
        releaseRuntimeOwner(filename, runtimeOwner);
        ownerReleased = true;
      }
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
