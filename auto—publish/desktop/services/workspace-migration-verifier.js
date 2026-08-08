"use strict";

const crypto = require("node:crypto");

function canonical(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonical);
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)), "utf8")
    .digest("hex");
}

function verifierError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function createWorkspaceMigrationVerifier(options) {
  const values = options || {};
  if (
    typeof values.listImportedLifecycleFacts !== "function" ||
    typeof values.verifyOperationalStore !== "function"
  )
    throw verifierError("MIGRATION_VERIFIER_INVALID");

  function verify(input) {
    const request = input || {};
    const plan = request.plan;
    const journal = request.journal;
    if (!plan || !journal || journal.migrationRunId !== plan.migrationRunId)
      throw verifierError("MIGRATION_VERIFY_REQUEST_INVALID");
    const imported = values.listImportedLifecycleFacts({
      migrationRunId: plan.migrationRunId,
    });
    const expected = [...plan.entries].sort((left, right) =>
      left.entryId.localeCompare(right.entryId),
    );
    const actual = [...imported].sort((left, right) =>
      left.entryId.localeCompare(right.entryId),
    );
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw verifierError("MIGRATION_IMPORTED_FACTS_MISMATCH");
    const store = values.verifyOperationalStore();
    if (
      !store ||
      !Number.isSafeInteger(store.schemaVersion) ||
      store.schemaVersion !== journal.importedSchemaVersion ||
      !journal.importCommitFingerprint
    )
      throw verifierError("MIGRATION_OPERATIONAL_VERIFY_FAILED");
    return Object.freeze({
      valid: true,
      verificationFingerprint: digest({
        version: 1,
        migrationRunId: plan.migrationRunId,
        planFingerprint: plan.planFingerprint,
        backupIdentity: journal.backupIdentity,
        confirmationFingerprint: journal.confirmationFingerprint,
        importCommitFingerprint: journal.importCommitFingerprint,
        schemaVersion: store.schemaVersion,
        entries: actual,
      }),
    });
  }

  return Object.freeze({ verify });
}

module.exports = { createWorkspaceMigrationVerifier };
