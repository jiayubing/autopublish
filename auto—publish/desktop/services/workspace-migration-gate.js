"use strict";

const crypto = require("node:crypto");

const PHASES = new Set([
  "detected",
  "backed_up",
  "confirmed",
  "import_committed",
  "verified",
]);

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}

function migrationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requiredFunction(owner, name) {
  if (!owner || typeof owner[name] !== "function")
    throw migrationError("WORKSPACE_MIGRATION_GATE_INVALID");
  return owner[name];
}

function safeFailure(error, fallback) {
  const code =
    error && typeof error.code === "string" && /^[A-Z0-9_]+$/u.test(error.code)
      ? error.code
      : fallback;
  return Object.freeze({
    allowed: false,
    status: "blocked",
    code,
    phase: null,
    executionGroupsPaused: true,
    repair: Object.freeze({ kind: "retry_migration" }),
  });
}

function confirmationFingerprint(plan, backupIdentity) {
  return digest({
    version: 1,
    migrationRunId: plan.migrationRunId,
    workspaceFingerprint: plan.workspaceFingerprint,
    sourceFingerprint: plan.sourceFingerprint,
    planFingerprint: plan.planFingerprint,
    backupIdentity,
  });
}

function unresolvedCount(report) {
  const counts = (report && report.counts) || {};
  return ["unplanned", "corrupt"].reduce(
    (total, key) =>
      total +
      (Number.isSafeInteger(counts[key]) && counts[key] > 0 ? counts[key] : 0),
    0,
  );
}

function createWorkspaceMigrationGate(options) {
  const values = options || {};
  const journal = values.journal;
  const backup = values.backup;
  const importer = values.importer;
  const verifier = values.verifier;
  const bootstrapJournal = requiredFunction(
    journal,
    "bootstrapMigrationJournal",
  );
  const readJournal = requiredFunction(journal, "readMigrationJournal");
  const persistJournal = requiredFunction(
    journal,
    "persistMigrationJournalMetadata",
  );
  const ensureBackup = requiredFunction(backup, "ensure");
  const verifyBackup = requiredFunction(backup, "verify");
  const importLifecycleFacts = requiredFunction(
    importer,
    "importLifecycleFacts",
  );
  const verifyImport = requiredFunction(verifier, "verify");
  const faultHook = typeof values.fault === "function" ? values.fault : null;
  const sourceVersion = Number.isSafeInteger(values.sourceVersion)
    ? values.sourceVersion
    : 1;

  function fault(point, detail) {
    if (faultHook) faultHook(point, Object.freeze(detail || {}));
  }

  function blocked(code, phase, repair) {
    return Object.freeze({
      allowed: false,
      status: "blocked",
      code,
      phase,
      executionGroupsPaused: true,
      repair: Object.freeze(repair || { kind: "retry_migration" }),
    });
  }

  function assertJournalIdentity(current, plan) {
    if (
      !current ||
      !PHASES.has(current.phase) ||
      current.migrationRunId !== plan.migrationRunId ||
      current.workspaceFingerprint !== plan.workspaceFingerprint ||
      current.sourceFingerprint !== plan.sourceFingerprint ||
      current.planFingerprint !== plan.planFingerprint ||
      current.sourceVersion !== sourceVersion
    )
      throw migrationError("MIGRATION_JOURNAL_FINGERPRINT_MISMATCH");
  }

  function persist(input, point) {
    fault(`before-${point}`, { migrationRunId: input.migrationRunId });
    const result = persistJournal(input);
    fault(`after-${point}`, { migrationRunId: input.migrationRunId });
    return result;
  }

  function backUp(plan, current) {
    fault("before-backup", { migrationRunId: plan.migrationRunId });
    const artifact = ensureBackup({
      migrationRunId: plan.migrationRunId,
      workspaceFingerprint: plan.workspaceFingerprint,
      sourceFingerprint: plan.sourceFingerprint,
      planFingerprint: plan.planFingerprint,
    });
    fault("after-backup", { migrationRunId: plan.migrationRunId });
    if (!artifact || typeof artifact.backupIdentity !== "string")
      throw migrationError("MIGRATION_BACKUP_INVALID");
    return persist(
      {
        migrationRunId: plan.migrationRunId,
        expectedPhase: current.phase,
        phase: "backed_up",
        backupIdentity: artifact.backupIdentity,
        confirmationFingerprint: null,
        verificationFingerprint: null,
      },
      "backed-up",
    );
  }

  function assertBackup(current, plan) {
    const result = verifyBackup({
      migrationRunId: plan.migrationRunId,
      backupIdentity: current.backupIdentity,
      workspaceFingerprint: plan.workspaceFingerprint,
      sourceFingerprint: plan.sourceFingerprint,
      planFingerprint: plan.planFingerprint,
    });
    if (!result || result.valid !== true)
      throw migrationError("MIGRATION_BACKUP_INTEGRITY_FAILED");
  }

  function assertConfirmation(current, plan) {
    if (
      current.confirmationFingerprint !==
      confirmationFingerprint(plan, current.backupIdentity)
    )
      throw migrationError("MIGRATION_CONFIRMATION_FINGERPRINT_MISMATCH");
  }

  function run(input) {
    const request = input || {};
    const plan = request.plan;
    const report = request.report || null;
    if (
      !plan ||
      plan.version !== 1 ||
      !Array.isArray(plan.entries) ||
      typeof plan.migrationRunId !== "string" ||
      typeof plan.workspaceFingerprint !== "string" ||
      typeof plan.sourceFingerprint !== "string" ||
      typeof plan.planFingerprint !== "string"
    )
      throw migrationError("WORKSPACE_MIGRATION_PLAN_INVALID");

    const unresolved = unresolvedCount(report);
    if (
      plan.entries.length === 0 &&
      unresolved === 0 &&
      request.journalRequired !== true
    ) {
      return Object.freeze({
        allowed: true,
        status: "not_required",
        code: null,
        phase: null,
        executionGroupsPaused: true,
        repair: null,
      });
    }

    let current;
    try {
      fault("before-detected", { migrationRunId: plan.migrationRunId });
      current = bootstrapJournal({
        migrationRunId: plan.migrationRunId,
        workspaceFingerprint: plan.workspaceFingerprint,
        sourceFingerprint: plan.sourceFingerprint,
        planFingerprint: plan.planFingerprint,
        sourceVersion,
      });
      fault("after-detected", { migrationRunId: plan.migrationRunId });
      assertJournalIdentity(current, plan);
    } catch (error) {
      return safeFailure(error, "MIGRATION_JOURNAL_UNAVAILABLE");
    }

    if (unresolved > 0)
      return blocked("MIGRATION_PLAN_REPAIR_REQUIRED", current.phase, {
        kind: "repair_legacy_evidence",
        unresolvedCount: unresolved,
      });

    try {
      if (current.phase === "detected") current = backUp(plan, current);
      assertJournalIdentity(current, plan);

      if (current.phase === "backed_up") {
        try {
          assertBackup(current, plan);
        } catch (error) {
          if (!error || error.code !== "MIGRATION_BACKUP_INTEGRITY_FAILED")
            throw error;
          current = backUp(plan, current);
          assertBackup(current, plan);
        }
        const expectedConfirmation = confirmationFingerprint(
          plan,
          current.backupIdentity,
        );
        if (request.confirmationFingerprint !== expectedConfirmation)
          return blocked("MIGRATION_CONFIRMATION_REQUIRED", current.phase, {
            kind: "confirm_migration",
            confirmationFingerprint: expectedConfirmation,
            backupIdentity: current.backupIdentity,
          });
        current = persist(
          {
            migrationRunId: plan.migrationRunId,
            expectedPhase: "backed_up",
            phase: "confirmed",
            backupIdentity: current.backupIdentity,
            confirmationFingerprint: expectedConfirmation,
            verificationFingerprint: null,
          },
          "confirmed",
        );
      }

      if (current.phase === "confirmed") {
        try {
          assertBackup(current, plan);
        } catch (error) {
          if (!error || error.code !== "MIGRATION_BACKUP_INTEGRITY_FAILED")
            throw error;
          current = backUp(plan, current);
          assertBackup(current, plan);
          return blocked("MIGRATION_CONFIRMATION_REQUIRED", current.phase, {
            kind: "confirm_migration",
            confirmationFingerprint: confirmationFingerprint(
              plan,
              current.backupIdentity,
            ),
            backupIdentity: current.backupIdentity,
          });
        }
        assertConfirmation(current, plan);
        fault("before-import", { migrationRunId: plan.migrationRunId });
        importLifecycleFacts({ plan });
        fault("after-import", { migrationRunId: plan.migrationRunId });
        current = readJournal({ migrationRunId: plan.migrationRunId });
        assertJournalIdentity(current, plan);
      }

      if (current.phase === "import_committed") {
        assertBackup(current, plan);
        assertConfirmation(current, plan);
        fault("before-verification", { migrationRunId: plan.migrationRunId });
        const verified = verifyImport({ plan, journal: current });
        fault("after-verification", { migrationRunId: plan.migrationRunId });
        if (
          !verified ||
          verified.valid !== true ||
          typeof verified.verificationFingerprint !== "string"
        )
          throw migrationError("MIGRATION_POST_IMPORT_VERIFY_FAILED");
        current = persist(
          {
            migrationRunId: plan.migrationRunId,
            expectedPhase: "import_committed",
            phase: "verified",
            backupIdentity: current.backupIdentity,
            confirmationFingerprint: current.confirmationFingerprint,
            verificationFingerprint: verified.verificationFingerprint,
          },
          "verified",
        );
        return Object.freeze({
          allowed: true,
          status: "verified",
          code: null,
          phase: "verified",
          migrationRunId: plan.migrationRunId,
          executionGroupsPaused: true,
          repair: null,
        });
      }

      if (current.phase === "verified") {
        assertBackup(current, plan);
        assertConfirmation(current, plan);
        const verified = verifyImport({ plan, journal: current });
        if (
          !verified ||
          verified.valid !== true ||
          verified.verificationFingerprint !== current.verificationFingerprint
        )
          throw migrationError("MIGRATION_VERIFIED_EVIDENCE_MISMATCH");
        return Object.freeze({
          allowed: true,
          status: "verified",
          code: null,
          phase: "verified",
          migrationRunId: plan.migrationRunId,
          executionGroupsPaused: true,
          repair: null,
        });
      }

      throw migrationError("MIGRATION_JOURNAL_PHASE_INVALID");
    } catch (error) {
      let latest = current;
      try {
        latest = readJournal({ migrationRunId: plan.migrationRunId });
      } catch (journalError) {
        return safeFailure(journalError, "MIGRATION_JOURNAL_UNAVAILABLE");
      }
      return blocked(
        error && typeof error.code === "string"
          ? error.code
          : "WORKSPACE_MIGRATION_FAILED",
        latest && latest.phase ? latest.phase : current.phase,
        {
          kind:
            error &&
            error.code === "MIGRATION_BACKUP_INTEGRITY_FAILED" &&
            latest &&
            ["import_committed", "verified"].includes(latest.phase)
              ? "restore_pre_import_backup"
              : latest &&
                  ["import_committed", "verified"].includes(latest.phase)
                ? "retry_verification"
                : "retry_migration",
        },
      );
    }
  }

  return Object.freeze({ run });
}

module.exports = {
  confirmationFingerprint,
  createWorkspaceMigrationGate,
};
