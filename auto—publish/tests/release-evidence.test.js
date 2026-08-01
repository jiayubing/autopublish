"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  REQUIRED_CHECKS,
  MANUAL_GATES,
  createReleaseEvidenceManifest,
} = require("../scripts/create-release-evidence-manifest");
const {
  validateReleaseChecklist,
  validateReleaseChecklistFile,
} = require("../scripts/validate-release-checklist");

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

test("release evidence records safe artifact hashes and fixed check names", () => {
  const fixture = tempRoot();
  try {
    const artifactManifest = path.join(fixture.root, "artifact.json");
    fs.writeFileSync(
      artifactManifest,
      JSON.stringify({
        manifestVersion: 1,
        packageVersion: "1.2.3",
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
    createReleaseEvidenceManifest({
      output,
      artifactManifest,
      commit: "a".repeat(40),
      sourceState: { status: "CLEAN", diffSha256: "b".repeat(64) },
      checks: allStatuses(REQUIRED_CHECKS, "PASSED"),
      manualGates: allStatuses(MANUAL_GATES, "PASSED"),
      rollbackPackage: "C:\\release\\rollback.zip",
    });
    const value = JSON.parse(fs.readFileSync(output, "utf8"));
    assert.equal(value.releaseState, "READY_FOR_HUMAN_RELEASE");
    assert.deepEqual(Object.keys(value.requiredChecks), [...REQUIRED_CHECKS]);
    assert.equal(value.artifact.artifacts[0].path, "tools/node/node.exe");
    assert.equal(value.rollbackPackage, "rollback.zip");
    assert.doesNotMatch(
      JSON.stringify(value),
      /C:\\release|rollback\\.zip.*C:/i,
    );
    assert.deepEqual(
      validateReleaseChecklistFile(output).status,
      "READY_FOR_HUMAN_RELEASE",
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
    sourceState: { status: "DIRTY", diffSha256: "c".repeat(64) },
    requiredChecks: checks,
    manualGates: allStatuses(MANUAL_GATES, "PENDING_HUMAN"),
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
