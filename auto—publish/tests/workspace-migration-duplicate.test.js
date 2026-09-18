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
  createWorkspaceMigrationBackup,
} = require("../desktop/services/workspace-migration-backup");
const {
  confirmationFingerprint,
} = require("../desktop/services/workspace-migration-gate");
const {
  createLegacyMigrationPlanner,
} = require("../src/content/legacy-migration-planner");
const {
  createOperationalStoreMigrationFacade,
  inspectOperationalStoreMigrationJournals,
} = require("../src/infrastructure/operational-store/operational-store");

for (const scenario of [
  "new-scan",
  "confirmed-duplicate",
  "changed-fact",
  "corrupt-source",
  "damaged-backup",
  "damaged-verification",
  "unverified-import",
]) {
  test(`workspace migration duplicate: ${scenario}`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "migration-duplicate-"));
    const trash = path.join(root, ".autopublish/article-trash/client");
    fs.mkdirSync(trash, { recursive: true });
    const tombstonePath = path.join(trash, "article.tombstone.json");
    const tombstone = {
      version: 1,
      clientId: "client",
      articleId: "article",
      deletedAt: "2026-09-15T00:00:00.000Z",
      status: "saved",
      permanentlyDeleted: true,
      purgedAt: "2026-09-15T00:01:00.000Z",
    };
    fs.writeFileSync(tombstonePath, JSON.stringify(tombstone));
    const run = (input = {}, options = {}) => {
      const composition = createWorkspaceMigrationComposition({
        workspaceRoot: root,
        ...options,
      });
      try {
        return composition.run(input);
      } finally {
        composition.close();
      }
    };
    try {
      const first = run();
      assert.equal(first.code, "MIGRATION_CONFIRMATION_REQUIRED");
      const imported = run(
        { confirmationFingerprint: first.repair.confirmationFingerprint },
        scenario === "unverified-import"
          ? {
              fault(point) {
                if (point === "before-verification")
                  throw Object.assign(new Error("synthetic"), {
                    code: "SYNTHETIC_FAILURE",
                  });
              },
            }
          : {},
      );
      assert.equal(imported.allowed, scenario !== "unverified-import");
      const generated = path.join(root, "generated/client");
      fs.mkdirSync(generated, { recursive: true });
      fs.writeFileSync(
        path.join(generated, "unrelated.json"),
        JSON.stringify({
          version: 1,
          id: "unrelated",
          clientId: "client",
          status: "saved",
          title: "Synthetic",
          content: "Unrelated ignored content",
        }),
      );
      const plan = createLegacyMigrationPlanner({
        workspaceRoot: root,
      }).planResult().plan;
      assert.equal(plan.entries.length, 1);
      if (scenario === "confirmed-duplicate") {
        const artifact = createWorkspaceMigrationBackup({
          workspaceRoot: root,
        }).ensure(plan);
        const facade = createOperationalStoreMigrationFacade({
          workspaceRoot: root,
        });
        try {
          facade.bootstrapMigrationJournal({
            migrationRunId: plan.migrationRunId,
            workspaceFingerprint: plan.workspaceFingerprint,
            sourceFingerprint: plan.sourceFingerprint,
            planFingerprint: plan.planFingerprint,
            sourceVersion: 1,
          });
          facade.persistMigrationJournalMetadata({
            migrationRunId: plan.migrationRunId,
            expectedPhase: "detected",
            phase: "backed_up",
            backupIdentity: artifact.backupIdentity,
            confirmationFingerprint: null,
            verificationFingerprint: null,
          });
          facade.persistMigrationJournalMetadata({
            migrationRunId: plan.migrationRunId,
            expectedPhase: "backed_up",
            phase: "confirmed",
            backupIdentity: artifact.backupIdentity,
            confirmationFingerprint: confirmationFingerprint(
              plan,
              artifact.backupIdentity,
            ),
            verificationFingerprint: null,
          });
        } finally {
          facade.close();
        }
      }
      if (scenario === "changed-fact")
        fs.writeFileSync(
          tombstonePath,
          JSON.stringify({
            ...tombstone,
            purgedAt: "2026-09-16T00:00:00.000Z",
          }),
        );
      if (scenario === "corrupt-source")
        fs.writeFileSync(path.join(generated, "broken.json"), "{");
      if (scenario === "damaged-backup")
        fs.writeFileSync(
          path.join(
            root,
            ".autopublish/migration-backups",
            first.repair.backupIdentity,
            "manifest.json",
          ),
          "damaged",
        );
      const before = inspectOperationalStoreMigrationJournals({
        workspaceRoot: root,
      });
      if (scenario === "damaged-verification") {
        const db = new (require("node:sqlite").DatabaseSync)(
          path.join(root, ".autopublish/operations/operations.db"),
        );
        try {
          db.prepare(
            "UPDATE migration_journals SET verification_fingerprint=? WHERE phase='verified'",
          ).run("0".repeat(64));
        } finally {
          db.close();
        }
      }
      const result = run();
      if (["new-scan", "confirmed-duplicate"].includes(scenario)) {
        assert.equal(result.allowed, true);
        assert.equal(result.status, "verified_import_reused");
        assert.deepEqual(
          inspectOperationalStoreMigrationJournals({ workspaceRoot: root }),
          before,
        );
        assert.equal(run().allowed, true);
        assert.equal(
          fs.readFileSync(tombstonePath, "utf8"),
          JSON.stringify(tombstone),
        );
      } else {
        assert.equal(result.allowed, false);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

test("current article trash is not legacy deletion evidence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "migration-current-trash-"));
  const trash = path.join(root, ".autopublish/article-trash/client");
  fs.mkdirSync(trash, { recursive: true });
  fs.writeFileSync(
    path.join(trash, "article.tombstone.json"),
    JSON.stringify({
      version: 1,
      clientId: "client",
      articleId: "article",
      deletedAt: "2026-09-15T00:00:00.000Z",
      status: "saved",
      references: [],
      permanentlyDeleted: true,
      purgedAt: "2026-09-15T00:01:00.000Z",
    }),
  );
  try {
    const planner = createLegacyMigrationPlanner({ workspaceRoot: root });
    const result = planner.planResult();
    assert.deepEqual(planner.read().deletions, []);
    assert.equal(result.plan.entries.length, 0);
    const composition = createWorkspaceMigrationComposition({
      workspaceRoot: root,
    });
    try {
      assert.equal(composition.run().status, "not_required");
    } finally {
      composition.close();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
