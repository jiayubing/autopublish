"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  EVIDENCE_FIELDS,
  REQUIRED_CHECKS,
  MANUAL_GATES,
  createReleaseEvidenceManifest,
  summarizeArtifactManifest,
  summarizeRollbackReport,
} = require("../scripts/create-release-evidence-manifest");
const {
  validateReleaseChecklist,
  validateReleaseChecklistFile,
} = require("../scripts/validate-release-checklist");
const {
  createAuthTestSummary,
} = require("../auth-server/scripts/create-test-summary-evidence");

const repositoryRoot = path.resolve(__dirname, "..", "..");

function currentHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
}

function tempRoot() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "autopublish-release-evidence-"),
  );
  return {
    root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function allStatuses(names, status) {
  return Object.fromEntries(names.map((name) => [name, status]));
}

function writeEvidenceReports(root) {
  const files = {};
  EVIDENCE_FIELDS.filter((name) => name !== "artifact").forEach((name) => {
    const filename = path.join(root, name + ".json");
    fs.writeFileSync(
      filename,
      JSON.stringify({ status: "PASSED", count: 1 }),
      "utf8",
    );
    files[name] = filename;
  });
  return files;
}

test("release evidence records safe artifact hashes and fixed check names", () => {
  const fixture = tempRoot();
  try {
    const artifactManifest = path.join(fixture.root, "artifact.json");
    fs.writeFileSync(
      artifactManifest,
      JSON.stringify({
        manifestVersion: 1,
        packageVersion: "1.0.1",
        workspaceSchemaVersion: 1,
        artifacts: [
          {
            name: "node",
            location: "resources",
            path: "tools/node/node.exe",
            sha256: "a".repeat(64),
            bytes: 12,
            version: "v24.18.0",
          },
        ],
      }),
      "utf8",
    );
    const output = path.join(fixture.root, "evidence.json");
    const rollbackReport = path.join(fixture.root, "rollback.json");
    fs.writeFileSync(
      rollbackReport,
      JSON.stringify({
        status: "PASSED",
        package: "rollback.zip",
        sha256: "c".repeat(64),
        plan: "rollback-v1",
      }),
      "utf8",
    );
    const reports = writeEvidenceReports(fixture.root);
    createReleaseEvidenceManifest({
      output,
      artifactManifest,
      commit: currentHead(),
      sourceState: { status: "CLEAN", diffSha256: "b".repeat(64) },
      checks: allStatuses(REQUIRED_CHECKS, "PASSED"),
      manualGates: allStatuses(MANUAL_GATES, "PASSED"),
      rollbackReport,
      migrationReport: reports.migration,
      backupReport: reports.backupRestore,
      discoveryReport: reports.desktopTestDiscovery,
      authReport: reports.authTests,
      containerReport: reports.containerTests,
      offlineReport: reports.offlineSelfTest,
      legacyReport: reports.legacyAbsence,
    });
    const value = JSON.parse(fs.readFileSync(output, "utf8"));
    assert.equal(value.releaseState, "READY_FOR_HUMAN_RELEASE");
    assert.deepEqual(Object.keys(value.requiredChecks), [...REQUIRED_CHECKS]);
    assert.equal(value.artifact.artifacts[0].path, "tools/node/node.exe");
    assert.equal(value.rollbackPackage, "rollback.zip");
    assert.equal(value.rollback.sha256, "c".repeat(64));
    assert.equal(value.offlineSelfTest.status, "PASSED");
    assert.doesNotMatch(
      JSON.stringify(value),
      /C:\\release|rollback\\.zip.*C:/i,
    );
    assert.deepEqual(
      validateReleaseChecklistFile(output).status,
      "READY_FOR_HUMAN_RELEASE",
    );
    const incompleteRollback = Object.assign({}, value, {
      rollback: { status: "PASSED" },
    });
    assert.throws(
      () => validateReleaseChecklist(incompleteRollback),
      (error) => error.code === "RELEASE_CHECKLIST_INVALID",
    );
  } finally {
    fixture.cleanup();
  }
});

test("release evidence rejects unsafe artifact metadata and detached commits", () => {
  const fixture = tempRoot();
  try {
    const artifactManifest = path.join(fixture.root, "artifact.json");
    const base = {
      manifestVersion: 1,
      packageVersion: "1.0.1",
      workspaceSchemaVersion: 1,
      artifacts: [
        {
          name: "node",
          location: "resources",
          path: "tools/node/node.exe",
          sha256: "a".repeat(64),
          bytes: 12,
          version: "v24.18.0",
        },
      ],
    };
    fs.writeFileSync(artifactManifest, JSON.stringify(base), "utf8");
    assert.throws(
      () =>
        createReleaseEvidenceManifest({
          artifactManifest,
          commit: "a".repeat(40),
        }),
      (error) => error.code === "RELEASE_EVIDENCE_COMMIT_MISMATCH",
    );
    const unsafePath = Object.assign({}, base, {
      artifacts: [
        Object.assign({}, base.artifacts[0], {
          path: "C:/Users/alice/private.txt",
        }),
      ],
    });
    fs.writeFileSync(artifactManifest, JSON.stringify(unsafePath), "utf8");
    assert.throws(
      () => summarizeArtifactManifest(artifactManifest),
      (error) => error.code === "RELEASE_ARTIFACT_MANIFEST_INVALID",
    );
    const unsafeVersion = Object.assign({}, base, {
      artifacts: [
        Object.assign({}, base.artifacts[0], { version: "token=leak" }),
      ],
    });
    fs.writeFileSync(artifactManifest, JSON.stringify(unsafeVersion), "utf8");
    assert.throws(
      () => summarizeArtifactManifest(artifactManifest),
      (error) => error.code === "RELEASE_ARTIFACT_MANIFEST_INVALID",
    );
    const rollbackReport = path.join(fixture.root, "rollback.json");
    fs.writeFileSync(
      rollbackReport,
      JSON.stringify({
        status: "PASSED",
        package: "C:/release/rollback.zip",
        sha256: "c".repeat(64),
        plan: "rollback-v1",
      }),
      "utf8",
    );
    assert.throws(
      () => summarizeRollbackReport(rollbackReport),
      (error) => error.code === "RELEASE_ROLLBACK_INPUT_INVALID",
    );
  } finally {
    fixture.cleanup();
  }
});

test("release checklist keeps human gates separate from automated pass state", () => {
  const checks = Object.fromEntries(
    REQUIRED_CHECKS.map((name) => [name, { status: "PASSED" }]),
  );
  const value = {
    manifestVersion: 1,
    commit: "b".repeat(40),
    applicationVersion: "1.2.3",
    authSchemaVersion: 2,
    workspaceSchemaVersion: 1,
    sourceState: { status: "DIRTY", diffSha256: "c".repeat(64) },
    requiredChecks: checks,
    manualGates: allStatuses(MANUAL_GATES, "PENDING_HUMAN"),
    migration: { status: "PENDING_HUMAN" },
    backupRestore: { status: "PENDING_HUMAN" },
    authTests: { status: "PENDING_HUMAN" },
    containerTests: { status: "PENDING_HUMAN" },
    desktopTestDiscovery: { status: "PENDING_HUMAN" },
    artifact: { status: "PENDING_HUMAN" },
    offlineSelfTest: { status: "PENDING_HUMAN" },
    legacyAbsence: { status: "PENDING_HUMAN" },
    rollback: { status: "PENDING_HUMAN" },
    releaseState: "BLOCKED_RELEASE",
  };
  assert.throws(
    () => validateReleaseChecklist(value),
    (error) => error.code === "RELEASE_CHECKLIST_INVALID",
  );
  assert.deepEqual(
    validateReleaseChecklist(value, { allowBlocked: true }).status,
    "BLOCKED_RELEASE",
  );
});

test("Auth evidence reports test-file inventory without mislabeling it as test totals", () => {
  const fixture = tempRoot();
  try {
    const report = createAuthTestSummary({
      status: "PASSED",
      output: path.join(fixture.root, "auth-tests.json"),
    });
    assert.ok(report.testFiles > 0);
    assert.equal(Object.hasOwn(report, "count"), false);
    assert.equal(Object.hasOwn(report, "passed"), false);
    assert.equal(Object.hasOwn(report, "failed"), false);
  } finally {
    fixture.cleanup();
  }
});
