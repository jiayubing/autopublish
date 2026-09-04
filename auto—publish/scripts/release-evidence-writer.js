"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  REQUIRED_CHECKS,
  MANUAL_GATES,
  EVIDENCE_FIELDS,
} = require("./release-evidence-contract");
const {
  evidenceError,
  safeStatus,
  safeRollbackPackage,
  readJson,
  summarizeRollbackReport,
  summarizeReport,
  summarizeArtifactManifest,
  currentCommit,
  currentSourceState,
  safeSchemaVersion,
} = require("./release-evidence-inputs");

const ROOT = path.resolve(__dirname, "..");

function checklistEntries(checks, manualGates, evidence, rollback) {
  const entries = REQUIRED_CHECKS.map((id) => ({
    id,
    kind: "AUTOMATED",
    status: checks[id].status,
    state:
      checks[id].status === "PASSED" ? "AUTOMATED_PASS" : checks[id].status,
  }));
  EVIDENCE_FIELDS.forEach((id) =>
    entries.push({
      id: "evidence/" + id,
      kind: "EVIDENCE",
      status: evidence[id].status,
      state: evidence[id].status,
    }),
  );
  MANUAL_GATES.forEach((id) =>
    entries.push({
      id: "manual/" + id,
      kind: "MANUAL",
      status: manualGates[id],
      state: manualGates[id],
    }),
  );
  entries.push({
    id: "manual/rollback-evidence",
    kind: "MANUAL",
    status: rollback.status,
    state: rollback.status,
  });
  return entries;
}

function buildReleaseEvidenceManifest(options) {
  const opts = options || {};
  const packageValue = readJson(
    path.join(ROOT, "package.json"),
    "RELEASE_EVIDENCE_PACKAGE_INVALID",
  );
  const actualCommit = currentCommit(ROOT);
  if (!/^[a-f0-9]{40,64}$/i.test(actualCommit || ""))
    throw evidenceError(
      "RELEASE_EVIDENCE_COMMIT_UNAVAILABLE",
      "Release evidence HEAD is unavailable",
    );
  if (
    typeof opts.commit === "string" &&
    (!/^[a-f0-9]{7,64}$/i.test(opts.commit) ||
      !actualCommit ||
      opts.commit.toLowerCase() !== actualCommit.toLowerCase())
  )
    throw evidenceError(
      "RELEASE_EVIDENCE_COMMIT_MISMATCH",
      "Release evidence commit does not match current HEAD",
    );
  const checks = {};
  REQUIRED_CHECKS.forEach((name) => {
    checks[name] = { status: safeStatus(opts.checks && opts.checks[name]) };
  });
  const manualGates = {};
  MANUAL_GATES.forEach((name) => {
    manualGates[name] = safeStatus(opts.manualGates && opts.manualGates[name]);
  });
  const artifact = summarizeArtifactManifest(opts.artifactManifest);
  const evidence = {
    migration: summarizeReport(
      opts.migrationReport,
      "desktop-migration-report",
    ),
    authMigration: summarizeReport(
      opts.authMigrationReport,
      "auth-migration-report",
    ),
    backupRestore: summarizeReport(opts.backupReport, "backup-restore-report"),
    capacity: summarizeReport(opts.capacityReport, "capacity-report"),
    artifact,
    desktopTestDiscovery: summarizeReport(
      opts.discoveryReport,
      "desktop-discovery-report",
    ),
    authTests: summarizeReport(opts.authReport, "auth-test-report"),
    containerTests: summarizeReport(
      opts.containerReport,
      "auth-container-report",
    ),
    offlineSelfTest: summarizeReport(
      opts.offlineReport,
      "production-offline-self-test",
    ),
  };
  if (
    artifact.status === "PASSED" &&
    artifact.packageVersion !== packageValue.version
  )
    throw evidenceError(
      "RELEASE_ARTIFACT_VERSION_MISMATCH",
      "Production artifact version does not match application version",
    );
  const rollbackEvidence = summarizeRollbackReport(opts.rollbackReport);
  const rollbackPackage =
    rollbackEvidence.package || safeRollbackPackage(opts.rollbackPackage);
  const rollback = Object.assign({}, rollbackEvidence, {
    package: rollbackPackage,
  });
  const sourceState = currentSourceState(ROOT);
  if (sourceState.status === "UNKNOWN")
    throw evidenceError(
      "RELEASE_EVIDENCE_SOURCE_STATE_UNAVAILABLE",
      "Release evidence source state is unavailable",
    );
  const blockers = [];
  REQUIRED_CHECKS.forEach((name) => {
    if (checks[name].status !== "PASSED")
      blockers.push("CHECK_" + name.replace(/[^A-Za-z0-9]+/g, "_"));
  });
  EVIDENCE_FIELDS.forEach((name) => {
    if (evidence[name].status !== "PASSED")
      blockers.push("EVIDENCE_" + name.toUpperCase());
  });
  MANUAL_GATES.forEach((name) => {
    if (manualGates[name] !== "PASSED")
      blockers.push("MANUAL_" + name.replace(/[^A-Za-z0-9]+/g, "_"));
  });
  if (rollback.status !== "PASSED") blockers.push("MANUAL_ROLLBACK_EVIDENCE");
  if (sourceState.status !== "CLEAN")
    blockers.push("SOURCE_" + sourceState.status);
  const allChecksPassed = REQUIRED_CHECKS.every(
    (name) => checks[name].status === "PASSED",
  );
  const allManualPassed = MANUAL_GATES.every(
    (name) => manualGates[name] === "PASSED",
  );
  const manifest = {
    manifestVersion: 1,
    generatedAt: new Date().toISOString(),
    commit: actualCommit,
    applicationVersion:
      typeof packageValue.version === "string" ? packageValue.version : null,
    authSchemaVersion: safeSchemaVersion(opts.authSchemaVersion, 2),
    workspaceSchemaVersion: safeSchemaVersion(
      artifact.workspaceSchemaVersion || opts.workspaceSchemaVersion,
      1,
    ),
    sourceState,
    requiredChecks: checks,
    migration: evidence.migration,
    authMigration: evidence.authMigration,
    backupRestore: evidence.backupRestore,
    capacity: evidence.capacity,
    authTests: evidence.authTests,
    containerTests: evidence.containerTests,
    desktopTestDiscovery: evidence.desktopTestDiscovery,
    artifact,
    offlineSelfTest: evidence.offlineSelfTest,
    rollbackPackage,
    rollback,
    manualGates,
    releaseBlockers: [...new Set(blockers)],
  };
  manifest.checklist = checklistEntries(
    checks,
    manualGates,
    evidence,
    rollback,
  );
  manifest.releaseState =
    allChecksPassed &&
    allManualPassed &&
    rollback.status === "PASSED" &&
    EVIDENCE_FIELDS.every((name) => evidence[name].status === "PASSED") &&
    sourceState.status === "CLEAN"
      ? "READY_FOR_HUMAN_RELEASE"
      : "BLOCKED_RELEASE";
  return manifest;
}

function writeReleaseEvidenceManifest(output, manifest) {
  const filename = path.resolve(output);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(manifest, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  return filename;
}

function createReleaseEvidenceManifest(options) {
  const opts = options || {};
  const manifest = buildReleaseEvidenceManifest(opts);
  const output = writeReleaseEvidenceManifest(
    opts.output || path.join(ROOT, "build", "release-evidence-manifest.json"),
    manifest,
  );
  return {
    output,
    releaseState: manifest.releaseState,
    requiredChecks: REQUIRED_CHECKS.length,
    manualGates: MANUAL_GATES.length,
    blockers: manifest.releaseBlockers.length,
  };
}

module.exports = {
  buildReleaseEvidenceManifest,
  writeReleaseEvidenceManifest,
  createReleaseEvidenceManifest,
  checklistEntries,
};
