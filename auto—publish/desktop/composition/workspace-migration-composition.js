"use strict";

function migrationCompositionError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function createWorkspaceMigrationComposition(options) {
  const values = options || {};
  if (
    typeof values.workspaceRoot !== "string" ||
    !require("node:path").isAbsolute(values.workspaceRoot)
  )
    throw migrationCompositionError("WORKSPACE_MIGRATION_ROOT_INVALID");

  const planner =
    values.planner ||
    require("../../src/content/legacy-migration-planner").createLegacyMigrationPlanner(
      {
        workspaceRoot: values.workspaceRoot,
        workspaceIdentity: values.workspaceIdentity,
      },
    );
  const backup =
    values.backup ||
    require("../services/workspace-migration-backup").createWorkspaceMigrationBackup(
      { workspaceRoot: values.workspaceRoot },
    );
  const inspectJournals =
    values.inspectMigrationJournals ||
    require("../../src/infrastructure/operational-store/operational-store")
      .inspectOperationalStoreMigrationJournals;
  let facade = null;
  let closed = false;

  function needsMigration(planned) {
    const counts = (planned.report && planned.report.counts) || {};
    return (
      planned.plan.entries.length > 0 ||
      (Number.isSafeInteger(counts.unplanned) && counts.unplanned > 0) ||
      (Number.isSafeInteger(counts.corrupt) && counts.corrupt > 0)
    );
  }

  function createGate() {
    const createFacade =
      values.createMigrationFacade ||
      require("../../src/infrastructure/operational-store/operational-store")
        .createOperationalStoreMigrationFacade;
    facade =
      values.migrationFacade ||
      createFacade({
        workspaceRoot: values.workspaceRoot,
        clock: values.clock,
        internalMigrationImportFault: values.internalMigrationImportFault,
      });
    const verifier =
      values.verifier ||
      require("../services/workspace-migration-verifier").createWorkspaceMigrationVerifier(
        {
          listImportedLifecycleFacts: facade.listImportedLifecycleFacts,
          verifyOperationalStore: () =>
            require("../../src/infrastructure/operational-store/operational-store").verifyOperationalDatabase(
              facade.databasePath,
            ),
        },
      );
    const createGateOwner =
      values.createGate ||
      require("../services/workspace-migration-gate")
        .createWorkspaceMigrationGate;
    return (
      values.gate ||
      createGateOwner({
        journal: Object.freeze({
          bootstrapMigrationJournal: facade.bootstrapMigrationJournal,
          readMigrationJournal: facade.readMigrationJournal,
          persistMigrationJournalMetadata:
            facade.persistMigrationJournalMetadata,
        }),
        backup,
        importer: Object.freeze({
          importLifecycleFacts: facade.importLifecycleFacts,
        }),
        verifier,
        sourceVersion: 1,
        fault: values.fault,
      })
    );
  }

  function run(input) {
    if (closed)
      throw migrationCompositionError("WORKSPACE_MIGRATION_ROOT_CLOSED");
    const planned = planner.planResult();
    const migrationRequired = needsMigration(planned);
    const journals = inspectJournals({ workspaceRoot: values.workspaceRoot });
    const matchingJournal = journals.find(
      (journal) =>
        journal.migrationRunId === planned.plan.migrationRunId &&
        journal.workspaceFingerprint === planned.plan.workspaceFingerprint &&
        journal.sourceFingerprint === planned.plan.sourceFingerprint &&
        journal.planFingerprint === planned.plan.planFingerprint &&
        journal.sourceVersion === 1,
    );
    if (!migrationRequired && journals.length === 0) {
      return Object.freeze({
        allowed: true,
        status: "not_required",
        code: null,
        phase: null,
        executionGroupsPaused: true,
        repair: null,
      });
    }
    if (!migrationRequired && !matchingJournal) {
      return Object.freeze({
        allowed: false,
        status: "blocked",
        code: "MIGRATION_JOURNAL_FINGERPRINT_MISMATCH",
        phase: null,
        executionGroupsPaused: true,
        repair: Object.freeze({ kind: "repair_migration_journal" }),
      });
    }
    // The operational facade upgrades its own schema while opening. Preserve
    // the pre-open database first; the gate re-verifies and durably authorizes
    // this same artifact before moving detected -> backed_up.
    if (migrationRequired) {
      backup.ensure({
        migrationRunId: planned.plan.migrationRunId,
        workspaceFingerprint: planned.plan.workspaceFingerprint,
        sourceFingerprint: planned.plan.sourceFingerprint,
        planFingerprint: planned.plan.planFingerprint,
      });
    }
    const gate = createGate();
    return gate.run({
      plan: planned.plan,
      report: planned.report,
      confirmationFingerprint:
        input && typeof input.confirmationFingerprint === "string"
          ? input.confirmationFingerprint
          : null,
      journalRequired: Boolean(matchingJournal),
    });
  }

  function close() {
    if (closed) return;
    closed = true;
    if (facade) facade.close();
  }

  return Object.freeze({ run, close });
}

async function runWorkspaceMigrationGate(options) {
  const composition = createWorkspaceMigrationComposition(options);
  try {
    return composition.run({
      confirmationFingerprint: options && options.confirmationFingerprint,
    });
  } finally {
    composition.close();
  }
}

module.exports = {
  createWorkspaceMigrationComposition,
  runWorkspaceMigrationGate,
};
