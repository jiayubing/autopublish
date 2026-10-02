"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const {
  createWorkspaceMigrationComposition,
} = require("../desktop/composition/workspace-migration-composition");
const {
  createOperationalStore,
  createOperationalStoreMigrationFacade,
  inspectOperationalStoreMigrationJournals,
} = require("../src/infrastructure/operational-store/operational-store");

for (const scenario of [
  "clean",
  "backed-up",
  "detected",
  "import-committed",
  "imported-rows",
  "commit-present",
  "foreign-workspace",
  "unknown-import-count",
  "no-verified-history",
  "no-runtime-artifacts",
  "unknown-phase",
  "corrupt-store",
]) {
  test(`stale pre-import journal: ${scenario}`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stale-preimport-"));
    let composition;
    try {
      createOperationalStore({ workspaceRoot: root }).close();
      const database = path.join(root, ".autopublish/operations/operations.db");
      const plan = {
        version: 1,
        migrationRunId: "current",
        workspaceFingerprint: "a".repeat(64),
        sourceFingerprint: "b".repeat(64),
        planFingerprint: "c".repeat(64),
        entries: [],
      };
      const stale = {
        ...plan,
        migrationRunId: "old",
        sourceVersion: 1,
        phase: "confirmed",
        importCommitFingerprint: null,
        importedEntryCount: 0,
      };
      if (scenario === "backed-up") stale.phase = "backed_up";
      if (scenario === "detected") stale.phase = "detected";
      if (scenario === "import-committed") stale.phase = "import_committed";
      if (scenario === "imported-rows") stale.importedEntryCount = 1;
      if (scenario === "commit-present")
        stale.importCommitFingerprint = "d".repeat(64);
      if (scenario === "foreign-workspace")
        stale.workspaceFingerprint = "e".repeat(64);
      if (scenario === "unknown-import-count") delete stale.importedEntryCount;
      if (scenario === "unknown-phase") stale.phase = "unknown";
      const journals = [
        {
          ...plan,
          migrationRunId: "verified",
          sourceVersion: 1,
          phase: "verified",
        },
        stale,
      ];
      if (scenario === "no-verified-history") journals.shift();
      if (scenario === "corrupt-store") fs.writeFileSync(database, "damaged");
      const before = fs.readFileSync(database);
      const historyBefore = JSON.stringify(journals);
      composition = createWorkspaceMigrationComposition({
        workspaceRoot: root,
        planner: {
          planResult: () => ({
            plan,
            report: { counts: { unplanned: 0, corrupt: 0 } },
          }),
          getCurrentRuntimeArtifactCount: () =>
            scenario === "no-runtime-artifacts" ? 0 : 2,
        },
        inspectMigrationJournals: () => journals,
        createMigrationFacade() {
          assert.fail("must not mutate/import the store");
        },
      });
      if (scenario === "corrupt-store") {
        assert.throws(() => composition.run({}));
      } else {
        const allowed = ["clean", "backed-up", "detected"].includes(scenario);
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const result = composition.run({});
          assert.equal(result.allowed, allowed);
          assert.equal(result.executionGroupsPaused, true);
          assert.equal(
            allowed ? result.status : result.code,
            allowed
              ? "stale_preimport_journals_ignored"
              : "MIGRATION_JOURNAL_FINGERPRINT_MISMATCH",
          );
        }
      }
      assert.equal(JSON.stringify(journals), historyBefore);
      assert.deepEqual(fs.readFileSync(database), before);
    } finally {
      if (composition) composition.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

test("journal inspection reports persisted import count without changing history", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "preimport-inspection-"));
  try {
    const facade = createOperationalStoreMigrationFacade({
      workspaceRoot: root,
    });
    try {
      facade.bootstrapMigrationJournal({
        migrationRunId: "synthetic",
        workspaceFingerprint: "a".repeat(64),
        sourceFingerprint: "b".repeat(64),
        planFingerprint: "c".repeat(64),
        sourceVersion: 1,
      });
    } finally {
      facade.close();
    }
    const first = inspectOperationalStoreMigrationJournals({
      workspaceRoot: root,
    });
    assert.equal(first[0].importedEntryCount, 0);
    assert.equal(first[0].phase, "detected");
    assert.deepEqual(
      inspectOperationalStoreMigrationJournals({ workspaceRoot: root }),
      first,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
