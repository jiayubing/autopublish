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
const {
  REQUIRED_ARTIFACTS,
} = require("../scripts/production-artifact-contract");
const {
  buildReleaseEvidenceManifest,
  checklistEntries,
} = require("../scripts/release-evidence-writer");
const {
  createExecutionProvenance,
  currentSourceState,
} = require("../scripts/release-evidence-inputs");
const applicationVersion = require("../package.json").version;

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

function artifactManifestValue(packageVersion = "1.0.1") {
  return {
    manifestVersion: 1,
    packageVersion,
    workspaceSchemaVersion: 1,
    artifacts: REQUIRED_ARTIFACTS.map((artifact, index) => ({
      name: artifact.name,
      location: artifact.location,
      path: artifact.path,
      sha256: String(index + 1)
        .padStart(2, "0")
        .repeat(32),
      bytes: 12,
      ...(artifact.executable ? { executable: true } : {}),
      ...(artifact.versionFrom
        ? {
            version: "v1.0.0",
            versionFrom: { ...artifact.versionFrom },
          }
        : {}),
    })),
  };
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
      JSON.stringify(artifactManifestValue()),
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
      authMigrationReport: reports.authMigration,
      backupReport: reports.backupRestore,
      capacityReport: reports.capacity,
      discoveryReport: reports.desktopTestDiscovery,
      authReport: reports.authTests,
      containerReport: reports.containerTests,
      offlineReport: reports.offlineSelfTest,
      legacyReport: reports.legacyAbsence,
    });
    const value = JSON.parse(fs.readFileSync(output, "utf8"));
    assert.equal(value.releaseState, "READY_FOR_HUMAN_RELEASE");
    assert.deepEqual(Object.keys(value.requiredChecks), [...REQUIRED_CHECKS]);
    assert.equal(
      value.artifact.artifacts.find((item) => item.name === "playwright-node")
        .path,
      "tools/node/node.exe",
    );
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

test("source-state evidence changes when tracked or untracked content changes", () => {
  const fixture = tempRoot();
  try {
    execFileSync("git", ["init"], { cwd: fixture.root, stdio: "ignore" });
    const tracked = path.join(fixture.root, "tracked.txt");
    fs.writeFileSync(tracked, "one\n", "utf8");
    execFileSync("git", ["add", "tracked.txt"], {
      cwd: fixture.root,
      stdio: "ignore",
    });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=fixture",
        "-c",
        "user.email=fixture@example.test",
        "commit",
        "-m",
        "fixture",
      ],
      { cwd: fixture.root, stdio: "ignore" },
    );
    const clean = currentSourceState(fixture.root);
    assert.equal(clean.status, "CLEAN");

    fs.writeFileSync(tracked, "two\n", "utf8");
    const trackedChange = currentSourceState(fixture.root);
    fs.writeFileSync(tracked, "three\n", "utf8");
    const trackedChangeAgain = currentSourceState(fixture.root);
    assert.equal(trackedChange.status, "DIRTY");
    assert.notEqual(trackedChange.diffSha256, trackedChangeAgain.diffSha256);

    const untracked = path.join(fixture.root, "untracked.txt");
    fs.writeFileSync(untracked, "alpha\n", "utf8");
    const untrackedChange = currentSourceState(fixture.root);
    fs.writeFileSync(untracked, "beta\n", "utf8");
    const untrackedChangeAgain = currentSourceState(fixture.root);
    assert.equal(untrackedChange.status, "DIRTY");
    assert.notEqual(
      untrackedChange.diffSha256,
      untrackedChangeAgain.diffSha256,
    );
  } finally {
    fixture.cleanup();
  }
});

test("execution provenance binds commit, source state, runtime, command, and times", () => {
  const finishedAt = Date.now();
  const provenance = createExecutionProvenance({
    root: repositoryRoot,
    command: "node scripts/run-tests.js",
    startedAt: finishedAt - 25,
    finishedAt,
  });
  assert.match(provenance.commit, /^[a-f0-9]{40,64}$/);
  assert.ok(["CLEAN", "DIRTY"].includes(provenance.sourceState.status));
  assert.match(provenance.sourceState.diffSha256, /^[a-f0-9]{64}$/);
  assert.equal(typeof provenance.sourceState.summary.changedEntries, "number");
  assert.match(provenance.nodeVersion, /^v\d+\.\d+\.\d+$/);
  assert.equal(provenance.command, "node scripts/run-tests.js");
  assert.match(provenance.startedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(provenance.finishedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(provenance.durationMs >= 25);
});

test("execution provenance fails closed when Git source state is unavailable", () => {
  const fixture = tempRoot();
  try {
    execFileSync("git", ["init"], { cwd: fixture.root, stdio: "ignore" });
    fs.writeFileSync(
      path.join(fixture.root, "tracked.txt"),
      "fixture\n",
      "utf8",
    );
    execFileSync("git", ["add", "tracked.txt"], {
      cwd: fixture.root,
      stdio: "ignore",
    });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=fixture",
        "-c",
        "user.email=fixture@example.test",
        "commit",
        "-m",
        "fixture",
      ],
      { cwd: fixture.root, stdio: "ignore" },
    );
    assert.match(
      execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: fixture.root,
        encoding: "utf8",
      }).trim(),
      /^[a-f0-9]{40,64}$/,
    );
    fs.writeFileSync(
      path.join(fixture.root, ".git", "index"),
      "invalid",
      "utf8",
    );
    assert.equal(currentSourceState(fixture.root).status, "UNKNOWN");

    assert.throws(
      () =>
        createExecutionProvenance({
          root: fixture.root,
          command: "node scripts/run-tests.js",
          startedAt: Date.now() - 1,
        }),
      (error) => {
        assert.equal(error.code, "EXECUTION_EVIDENCE_SOURCE_STATE_UNAVAILABLE");
        assert.equal(error.message.includes(fixture.root), false);
        return true;
      },
    );
  } finally {
    fixture.cleanup();
  }
});

test("release evidence rejects an incomplete production artifact inventory", () => {
  const fixture = tempRoot();
  try {
    const artifactManifest = path.join(fixture.root, "artifact.json");
    const incomplete = artifactManifestValue();
    incomplete.artifacts = incomplete.artifacts.slice(0, 1);
    fs.writeFileSync(artifactManifest, JSON.stringify(incomplete), "utf8");
    assert.throws(
      () => summarizeArtifactManifest(artifactManifest),
      (error) => error.code === "RELEASE_ARTIFACT_MANIFEST_INVALID",
    );
  } finally {
    fixture.cleanup();
  }
});

test("release evidence rejects an artifact application version mismatch", () => {
  const fixture = tempRoot();
  try {
    const artifactManifest = path.join(fixture.root, "artifact.json");
    fs.writeFileSync(
      artifactManifest,
      JSON.stringify(artifactManifestValue(applicationVersion + "-mismatch")),
      "utf8",
    );
    assert.throws(
      () => buildReleaseEvidenceManifest({ artifactManifest }),
      (error) => error.code === "RELEASE_ARTIFACT_VERSION_MISMATCH",
    );
  } finally {
    fixture.cleanup();
  }
});

test("release evidence rejects unsafe artifact metadata and detached commits", () => {
  const fixture = tempRoot();
  try {
    const artifactManifest = path.join(fixture.root, "artifact.json");
    const base = artifactManifestValue();
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
      artifacts: base.artifacts.map((artifact) =>
        artifact.name === "electron-main"
          ? Object.assign({}, artifact, { path: "C:/Users/alice/private.txt" })
          : artifact,
      ),
    });
    fs.writeFileSync(artifactManifest, JSON.stringify(unsafePath), "utf8");
    assert.throws(
      () => summarizeArtifactManifest(artifactManifest),
      (error) => error.code === "RELEASE_ARTIFACT_MANIFEST_INVALID",
    );
    const unsafeVersion = Object.assign({}, base, {
      artifacts: base.artifacts.map((artifact) =>
        artifact.name === "playwright-node"
          ? Object.assign({}, artifact, { version: "token=leak" })
          : artifact,
      ),
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
    authMigration: { status: "PENDING_HUMAN" },
    backupRestore: { status: "PENDING_HUMAN" },
    capacity: { status: "PENDING_HUMAN" },
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
    () => validateReleaseChecklist(value, { allowBlocked: true }),
    (error) => error.code === "RELEASE_CHECKLIST_INVALID",
  );
  value.checklist = checklistEntries(
    checks,
    value.manualGates,
    Object.fromEntries(EVIDENCE_FIELDS.map((name) => [name, value[name]])),
    value.rollback,
  );
  assert.deepEqual(
    validateReleaseChecklist(value, { allowBlocked: true }).status,
    "BLOCKED_RELEASE",
  );
  const mismatched = Object.assign({}, value, {
    checklist: value.checklist.map((entry) =>
      entry.id === REQUIRED_CHECKS[0]
        ? Object.assign({}, entry, { status: "FAILED", state: "FAILED" })
        : entry,
    ),
  });
  assert.throws(
    () => validateReleaseChecklist(mismatched, { allowBlocked: true }),
    (error) => error.code === "RELEASE_CHECKLIST_INVALID",
  );
  const assertInvalidChecklist = (checklist) => {
    assert.throws(
      () =>
        validateReleaseChecklist(Object.assign({}, value, { checklist }), {
          allowBlocked: true,
        }),
      (error) => error.code === "RELEASE_CHECKLIST_INVALID",
    );
  };
  assertInvalidChecklist(
    value.checklist.map((entry, index) =>
      index === 0 ? Object.assign({}, entry, { id: "unknown/check" }) : entry,
    ),
  );
  assertInvalidChecklist(
    value.checklist.map((entry, index) =>
      index === 0 ? Object.assign({}, entry, { kind: "EVIDENCE" }) : entry,
    ),
  );
  assertInvalidChecklist(
    value.checklist.map((entry, index) =>
      index === 0 ? Object.assign({}, entry, { state: "FAILED" }) : entry,
    ),
  );
  assertInvalidChecklist(
    value.checklist.map((entry, index) =>
      index === 1
        ? Object.assign({}, entry, { id: value.checklist[0].id })
        : entry,
    ),
  );
  const mutateChecklistEntry = (id, changes) =>
    value.checklist.map((entry) =>
      entry.id === id ? Object.assign({}, entry, changes) : entry,
    );
  assertInvalidChecklist(
    mutateChecklistEntry("evidence/migration", {
      status: "PASSED",
      state: "PASSED",
    }),
  );
  assertInvalidChecklist(
    mutateChecklistEntry("manual/signing-certificate", {
      status: "PASSED",
      state: "PASSED",
    }),
  );
  assertInvalidChecklist(
    mutateChecklistEntry("manual/rollback-evidence", {
      status: "PASSED",
      state: "PASSED",
    }),
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
