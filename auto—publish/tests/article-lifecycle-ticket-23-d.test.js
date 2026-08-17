"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { it } = require("node:test");

const {
  confirmationFingerprint,
  createWorkspaceMigrationGate,
} = require("../desktop/services/workspace-migration-gate");
const {
  createWorkspaceMigrationBackup,
} = require("../desktop/services/workspace-migration-backup");
const {
  createWorkspaceMigrationComposition,
} = require("../desktop/composition/workspace-migration-composition");
const {
  createWorkspaceStartupComposition,
} = require("../desktop/composition/workspace-startup-composition");
const {
  createLegacyMigrationPlanner,
} = require("../src/content/legacy-migration-planner");
const {
  acquireOperationalStoreMigrationLease,
  createOperationalStore,
  createOperationalStoreMigrationFacade,
  releaseOperationalStoreMigrationLease,
} = require("../src/infrastructure/operational-store/operational-store");

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

function plan() {
  return {
    version: 1,
    migrationRunId: "migration-run-23-d",
    workspaceFingerprint: A,
    sourceFingerprint: B,
    planFingerprint: C,
    entries: [{ entryId: "entry-1" }],
  };
}

function harness(options) {
  const values = options || {};
  let journal = null;
  let imports = 0;
  let verifications = 0;
  let backupIdentity = "backup-23-d";
  let backupValid = true;
  const ports = {
    journal: {
      bootstrapMigrationJournal(input) {
        if (!journal) {
          journal = {
            ...input,
            phase: "detected",
            backupIdentity: null,
            confirmationFingerprint: null,
            importCommitFingerprint: null,
            verificationFingerprint: null,
            importedSchemaVersion: null,
          };
        }
        return { ...journal };
      },
      readMigrationJournal() {
        return journal && { ...journal };
      },
      persistMigrationJournalMetadata(input) {
        assert.equal(journal.phase, input.expectedPhase);
        journal = {
          ...journal,
          phase: input.phase,
          backupIdentity: input.backupIdentity,
          confirmationFingerprint: input.confirmationFingerprint,
          verificationFingerprint: input.verificationFingerprint,
        };
        return { ...journal };
      },
    },
    backup: {
      ensure() {
        if (!backupValid) {
          backupIdentity = "backup-23-d-repair";
          backupValid = true;
        }
        return { backupIdentity, reused: false };
      },
      verify(input) {
        return {
          valid:
            backupValid === true && input.backupIdentity === backupIdentity,
        };
      },
    },
    importer: {
      importLifecycleFacts() {
        imports += 1;
        journal = {
          ...journal,
          phase: "import_committed",
          importCommitFingerprint: A,
          importedSchemaVersion: 5,
        };
        return { importCommitFingerprint: A };
      },
    },
    verifier: {
      verify() {
        verifications += 1;
        if (values.verificationFails)
          throw Object.assign(new Error("synthetic"), {
            code: "MIGRATION_POST_IMPORT_VERIFY_FAILED",
          });
        return { valid: true, verificationFingerprint: B };
      },
    },
  };
  return {
    ports,
    state: () => journal,
    imports: () => imports,
    verifications: () => verifications,
    invalidateBackup: () => {
      backupValid = false;
    },
  };
}

it("owns confirmation, import, verification and verified restart policy", () => {
  const fixture = harness();
  const gate = createWorkspaceMigrationGate(fixture.ports);
  const first = gate.run({ plan: plan(), report: { counts: {} } });
  assert.equal(first.allowed, false);
  assert.equal(first.code, "MIGRATION_CONFIRMATION_REQUIRED");
  assert.equal(first.phase, "backed_up");
  assert.equal(fixture.imports(), 0);

  const confirmed = gate.run({
    plan: plan(),
    report: { counts: {} },
    confirmationFingerprint: first.repair.confirmationFingerprint,
  });
  assert.equal(confirmed.allowed, true);
  assert.equal(confirmed.phase, "verified");
  assert.equal(confirmed.executionGroupsPaused, true);
  assert.equal(fixture.imports(), 1);

  const restarted = gate.run({ plan: plan(), report: { counts: {} } });
  assert.equal(restarted.allowed, true);
  assert.equal(restarted.phase, "verified");
  assert.equal(fixture.imports(), 1);
  assert.equal(fixture.verifications(), 2);
});

it("import_committed restart only verifies and never repeats import", () => {
  const fixture = harness();
  const firstGate = createWorkspaceMigrationGate({
    ...fixture.ports,
    fault(point) {
      if (point === "after-import") {
        const error = new Error("synthetic crash");
        error.code = "SYNTHETIC_CRASH_AFTER_IMPORT";
        throw error;
      }
    },
  });
  const confirmation = confirmationFingerprint(plan(), "backup-23-d");
  const crashed = firstGate.run({
    plan: plan(),
    report: { counts: {} },
    confirmationFingerprint: confirmation,
  });
  assert.equal(crashed.allowed, false);
  assert.equal(crashed.phase, "import_committed");
  assert.equal(crashed.repair.kind, "retry_verification");
  assert.equal(fixture.imports(), 1);

  const restarted = createWorkspaceMigrationGate(fixture.ports).run({
    plan: plan(),
    report: { counts: {} },
  });
  assert.equal(restarted.allowed, true);
  assert.equal(restarted.phase, "verified");
  assert.equal(fixture.imports(), 1);
});

it("repairs a confirmed backup before import and requires fresh confirmation", () => {
  const fixture = harness();
  const gate = createWorkspaceMigrationGate({
    ...fixture.ports,
    fault(point) {
      if (point === "before-import") {
        const error = new Error("stop before import");
        error.code = "SYNTHETIC_BEFORE_IMPORT";
        throw error;
      }
    },
  });
  const first = gate.run({ plan: plan(), report: { counts: {} } });
  const stopped = gate.run({
    plan: plan(),
    report: { counts: {} },
    confirmationFingerprint: first.repair.confirmationFingerprint,
  });
  assert.equal(stopped.phase, "confirmed");
  fixture.invalidateBackup();
  const repaired = createWorkspaceMigrationGate(fixture.ports).run({
    plan: plan(),
    report: { counts: {} },
  });
  assert.equal(repaired.code, "MIGRATION_CONFIRMATION_REQUIRED");
  assert.equal(repaired.phase, "backed_up");
  assert.equal(repaired.repair.backupIdentity, "backup-23-d-repair");
  assert.equal(fixture.imports(), 0);
});

it("blocks tampered confirmed bindings and post-import backup loss", () => {
  const fixture = harness();
  const gate = createWorkspaceMigrationGate(fixture.ports);
  const first = gate.run({ plan: plan(), report: { counts: {} } });
  gate.run({
    plan: plan(),
    report: { counts: {} },
    confirmationFingerprint: first.repair.confirmationFingerprint,
  });
  fixture.state().confirmationFingerprint = "f".repeat(64);
  const tampered = gate.run({ plan: plan(), report: { counts: {} } });
  assert.equal(tampered.allowed, false);
  assert.equal(tampered.code, "MIGRATION_CONFIRMATION_FINGERPRINT_MISMATCH");
  fixture.state().confirmationFingerprint = confirmationFingerprint(
    plan(),
    fixture.state().backupIdentity,
  );
  fixture.invalidateBackup();
  const missingBackup = gate.run({ plan: plan(), report: { counts: {} } });
  assert.equal(missingBackup.allowed, false);
  assert.equal(missingBackup.code, "MIGRATION_BACKUP_INTEGRITY_FAILED");
  assert.equal(missingBackup.repair.kind, "restore_pre_import_backup");
});

it("recovers at every gate crash boundary without duplicating import", () => {
  const points = [
    "before-detected",
    "after-detected",
    "before-backup",
    "after-backup",
    "before-backed-up",
    "after-backed-up",
    "before-confirmed",
    "after-confirmed",
    "before-import",
    "after-import",
    "before-verification",
    "after-verification",
    "before-verified",
    "after-verified",
  ];
  for (const crashPoint of points) {
    const fixture = harness();
    let injected = false;
    const crashing = createWorkspaceMigrationGate({
      ...fixture.ports,
      fault(point) {
        if (!injected && point === crashPoint) {
          injected = true;
          const error = new Error("synthetic crash");
          error.code = "SYNTHETIC_MIGRATION_CRASH";
          throw error;
        }
      },
    });
    crashing.run({
      plan: plan(),
      report: { counts: {} },
      confirmationFingerprint: confirmationFingerprint(plan(), "backup-23-d"),
    });
    assert.equal(injected, true, crashPoint);
    const recovered = createWorkspaceMigrationGate(fixture.ports).run({
      plan: plan(),
      report: { counts: {} },
      confirmationFingerprint: confirmationFingerprint(plan(), "backup-23-d"),
    });
    assert.equal(recovered.allowed, true, crashPoint);
    assert.equal(recovered.phase, "verified", crashPoint);
    assert.equal(fixture.imports(), 1, crashPoint);
  }
});

it("keeps unresolved evidence and verification failure explicitly blocked", () => {
  const unresolved = harness();
  const unresolvedResult = createWorkspaceMigrationGate(unresolved.ports).run({
    plan: plan(),
    report: { counts: { unplanned: 2, corrupt: 1 } },
  });
  assert.equal(unresolvedResult.code, "MIGRATION_PLAN_REPAIR_REQUIRED");
  assert.deepEqual(unresolvedResult.repair, {
    kind: "repair_legacy_evidence",
    unresolvedCount: 3,
  });
  assert.equal(unresolved.state().phase, "detected");
  assert.equal(unresolved.imports(), 0);

  const failed = harness({ verificationFails: true });
  const confirmation = confirmationFingerprint(plan(), "backup-23-d");
  const failedResult = createWorkspaceMigrationGate(failed.ports).run({
    plan: plan(),
    report: { counts: {} },
    confirmationFingerprint: confirmation,
  });
  assert.equal(failedResult.code, "MIGRATION_POST_IMPORT_VERIFY_FAILED");
  assert.equal(failedResult.phase, "import_committed");
  assert.equal(failed.imports(), 1);
});

it("creates and verifies a pre-open operational database backup", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "migration-23-d-backup-"));
  try {
    const operations = path.join(root, ".autopublish", "operations");
    fs.mkdirSync(operations, { recursive: true });
    fs.writeFileSync(path.join(operations, "operations.db"), "before-open");
    fs.writeFileSync(
      path.join(operations, "operations.db-wal"),
      "uncheckpointed",
    );
    const backup = createWorkspaceMigrationBackup({ workspaceRoot: root });
    const request = {
      migrationRunId: plan().migrationRunId,
      workspaceFingerprint: A,
      sourceFingerprint: B,
      planFingerprint: C,
    };
    const created = backup.ensure(request);
    assert.equal(created.reused, false);
    assert.equal(
      backup.verify({ ...request, backupIdentity: created.backupIdentity })
        .valid,
      true,
    );
    const artifact = path.join(
      root,
      ".autopublish",
      "migration-backups",
      created.backupIdentity,
      "operations.db",
    );
    assert.equal(fs.readFileSync(`${artifact}-wal`, "utf8"), "uncheckpointed");
    fs.writeFileSync(artifact, "corrupt");
    assert.equal(
      backup.verify({ ...request, backupIdentity: created.backupIdentity })
        .valid,
      false,
    );
    const repaired = backup.ensure(request);
    assert.notEqual(repaired.backupIdentity, created.backupIdentity);
    assert.equal(
      backup.verify({ ...request, backupIdentity: repaired.backupIdentity })
        .valid,
      true,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("holds a cross-process migration lease before opening the facade", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "migration-23-d-lease-"));
  const lease = acquireOperationalStoreMigrationLease({ workspaceRoot: root });
  try {
    assert.throws(
      () => acquireOperationalStoreMigrationLease({ workspaceRoot: root }),
      { code: "OPERATIONAL_MIGRATION_LEASE_ACTIVE" },
    );
    assert.throws(() => createOperationalStore({ workspaceRoot: root }), {
      code: "OPERATIONAL_MIGRATION_LEASE_ACTIVE",
    });
    const facade = createOperationalStoreMigrationFacade({
      workspaceRoot: root,
      migrationOwner: lease.owner,
    });
    facade.close();
  } finally {
    releaseOperationalStoreMigrationLease(lease);
  }
  const store = createOperationalStore({ workspaceRoot: root });
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
});

it("runs the real planner, journal, atomic importer and verifier end to end", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "migration-23-d-e2e-"));
  const legacySource = {
    workspaceFingerprint: A,
    articles: [
      {
        version: 1,
        clientId: "client-23-d",
        articleId: "article-23-d",
        status: "saved",
        title: "Synthetic title",
        content: "Synthetic body",
      },
    ],
    queues: [
      {
        version: 1,
        clientId: "client-23-d",
        articleId: "article-23-d",
        targetIdentityV1: {
          version: 1,
          kind: "platform",
          platformId: "toutiao",
          accountProfileId: "account-23-d",
        },
        status: "queued",
        queueState: "QUEUED",
        remoteBoundaryCrossed: false,
        sourceRef: "fixture/article-23-d/queued",
      },
    ],
  };
  const planner = createLegacyMigrationPlanner({ legacySource });
  try {
    let composition = createWorkspaceMigrationComposition({
      workspaceRoot: root,
      planner,
    });
    const first = composition.run({});
    composition.close();
    assert.equal(first.code, "MIGRATION_CONFIRMATION_REQUIRED");

    composition = createWorkspaceMigrationComposition({
      workspaceRoot: root,
      planner,
    });
    const migrated = composition.run({
      confirmationFingerprint: first.repair.confirmationFingerprint,
    });
    composition.close();
    assert.equal(migrated.allowed, true);
    assert.equal(migrated.phase, "verified");

    composition = createWorkspaceMigrationComposition({
      workspaceRoot: root,
      planner,
    });
    const restarted = composition.run({});
    composition.close();
    assert.equal(restarted.allowed, true);
    assert.equal(restarted.phase, "verified");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("backs up before opening the store and injects only the import method", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "migration-23-d-root-"));
  const events = [];
  const facade = {
    bootstrapMigrationJournal() {},
    readMigrationJournal() {},
    persistMigrationJournalMetadata() {},
    importLifecycleFacts() {},
    listImportedLifecycleFacts() {},
    verify() {},
    close() {
      events.push("close");
    },
  };
  try {
    const composition = createWorkspaceMigrationComposition({
      workspaceRoot: root,
      planner: {
        planResult() {
          return { plan: plan(), report: { counts: {} } };
        },
      },
      backup: {
        ensure() {
          events.push("backup");
          return { backupIdentity: "backup-23-d" };
        },
        verify() {
          return { valid: true };
        },
      },
      createMigrationFacade() {
        events.push("open-store");
        return facade;
      },
      verifier: { verify() {} },
      createGate(input) {
        assert.deepEqual(Object.keys(input.importer), ["importLifecycleFacts"]);
        return {
          run() {
            events.push("gate");
            return { allowed: false, code: "MIGRATION_CONFIRMATION_REQUIRED" };
          },
        };
      },
    });
    assert.equal(composition.run({}).allowed, false);
    composition.close();
    assert.deepEqual(events, ["backup", "open-store", "gate", "close"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("does not treat an empty current plan as permission to bypass an old journal", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "migration-23-d-journal-"),
  );
  try {
    const composition = createWorkspaceMigrationComposition({
      workspaceRoot: root,
      planner: {
        planResult() {
          return {
            plan: { ...plan(), entries: [] },
            report: { counts: { unplanned: 0, corrupt: 0 } },
          };
        },
      },
      backup: { ensure() {}, verify() {} },
      inspectMigrationJournals() {
        return [
          {
            ...plan(),
            migrationRunId: "older-run",
            sourceVersion: 1,
            phase: "detected",
          },
        ];
      },
    });
    const result = composition.run({});
    assert.equal(result.allowed, false);
    assert.equal(result.code, "MIGRATION_JOURNAL_FINGERPRINT_MISMATCH");
    composition.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("ignores a detected journal when only current runtime artifacts remain", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "migration-23-d-current-artifacts-"),
  );
  try {
    const composition = createWorkspaceMigrationComposition({
      workspaceRoot: root,
      planner: {
        planResult() {
          return {
            plan: { ...plan(), entries: [] },
            report: { counts: { unplanned: 0, corrupt: 0 } },
          };
        },
        getCurrentRuntimeArtifactCount() {
          return 2;
        },
      },
      backup: { ensure() {}, verify() {} },
      inspectMigrationJournals() {
        return [
          {
            ...plan(),
            migrationRunId: "older-run",
            sourceVersion: 1,
            phase: "detected",
          },
        ];
      },
    });
    const result = composition.run({});
    assert.equal(result.allowed, true);
    assert.equal(result.status, "stale_detected_journal_ignored");
    composition.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("does not construct normal or remote composition while migration is blocked", async () => {
  let normalConstructions = 0;
  await assert.rejects(
    createWorkspaceStartupComposition({
      bootstrapState: { workspacePath: "C:\\synthetic-workspace" },
      options: {
        async runWorkspaceMigrationGate() {
          return {
            allowed: false,
            code: "MIGRATION_CONFIRMATION_REQUIRED",
            executionGroupsPaused: true,
          };
        },
        createNormalWorkspaceRuntimeComposition() {
          normalConstructions += 1;
          throw new Error("publisher/worker/paid executor constructed");
        },
      },
    }),
    { code: "MIGRATION_CONFIRMATION_REQUIRED" },
  );
  assert.equal(normalConstructions, 0);
});

it("starts an old workspace whose generated content predates batch provenance", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "migration-23-d-old-generated-workspace-"),
  );
  let normalConstructions = 0;
  try {
    const generatedDirectory = path.join(root, "generated", "畅速");
    fs.mkdirSync(generatedDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(generatedDirectory, "legacy-article.json"),
      JSON.stringify({
        id: "legacy-article",
        clientId: "畅速",
        status: "generated",
        title: "旧工作区文章",
        content: "标题和正文完整，但早期版本没有生成批次标识。",
      }),
      "utf8",
    );

    const composition = await createWorkspaceStartupComposition({
      bootstrapState: {
        workspacePath: root,
        workspaceIdentity: "old-generated-workspace",
      },
      options: {
        createNormalWorkspaceRuntimeComposition() {
          normalConstructions += 1;
          return { dispose() {} };
        },
      },
    });

    assert.equal(normalConstructions, 1);
    assert.equal(typeof composition.dispose, "function");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("requests explicit production confirmation and retries the isolated gate before normal composition", async () => {
  const expected = "a".repeat(64);
  const calls = [];
  let normalConstructions = 0;
  const composition = await createWorkspaceStartupComposition({
    bootstrapState: { workspacePath: "C:\\synthetic-workspace" },
    options: {
      async runWorkspaceMigrationGate(input) {
        calls.push(input.confirmationFingerprint);
        if (input.confirmationFingerprint !== expected) {
          return {
            allowed: false,
            code: "MIGRATION_CONFIRMATION_REQUIRED",
            phase: "backed_up",
            executionGroupsPaused: true,
            repair: {
              kind: "confirm_migration",
              confirmationFingerprint: expected,
              backupIdentity: "backup-safe-id",
            },
          };
        }
        return {
          allowed: true,
          status: "verified",
          executionGroupsPaused: true,
        };
      },
      async confirmWorkspaceMigration(result) {
        assert.equal(result.repair.backupIdentity, "backup-safe-id");
        return result.repair.confirmationFingerprint;
      },
      createNormalWorkspaceRuntimeComposition() {
        normalConstructions += 1;
        return { dispose() {} };
      },
    },
  });
  assert.deepEqual(calls, [null, expected]);
  assert.equal(normalConstructions, 1);
  assert.equal(typeof composition.dispose, "function");
});
