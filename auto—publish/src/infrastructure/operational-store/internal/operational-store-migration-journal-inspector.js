"use strict";

const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

const { databasePath } = require("./operational-store-runtime");
const { fail } = require("./operational-store-utils");

function inspectOperationalStoreMigrationJournals(options) {
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
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='migration_journals'",
      )
      .get();
    if (!table) return Object.freeze([]);
    return Object.freeze(
      db
        .prepare(
          "SELECT migration_run_id,workspace_fingerprint,source_fingerprint,plan_fingerprint,source_version,phase,backup_identity,confirmation_fingerprint,import_commit_fingerprint,verification_fingerprint,imported_schema_version FROM migration_journals ORDER BY created_at,migration_run_id",
        )
        .all()
        .map((row) =>
          Object.freeze({
            migrationRunId: row.migration_run_id,
            workspaceFingerprint: row.workspace_fingerprint,
            sourceFingerprint: row.source_fingerprint,
            planFingerprint: row.plan_fingerprint,
            sourceVersion: row.source_version,
            phase: row.phase,
            backupIdentity: row.backup_identity,
            confirmationFingerprint: row.confirmation_fingerprint,
            importCommitFingerprint: row.import_commit_fingerprint,
            verificationFingerprint: row.verification_fingerprint,
            importedSchemaVersion: row.imported_schema_version,
          }),
        ),
    );
  } catch (error) {
    throw error && error.code
      ? error
      : fail("OPERATIONAL_MIGRATION_JOURNAL_INSPECTION_FAILED");
  } finally {
    if (db) db.close();
  }
}

module.exports = { inspectOperationalStoreMigrationJournals };
