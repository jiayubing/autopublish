"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const schema = require("../src/diagnostics/diagnostic-schema");
const factory = require("../src/diagnostics/diagnostic-record-factory");
const {
  initializeDiagnosticSink,
} = require("../src/diagnostics/diagnostic-startup-cleanup");
const {
  resolveMigrationCliPath,
} = require("../desktop/packaging/migration-runtime-paths");
const {
  validateCandidate,
} = require("../src/infrastructure/runtime/packaged-runtime-resolver");
const { validateManifest } = require("../desktop/packaging/artifact-verifier");
const { verifyStorageBoundaries } = require("../scripts/offline-smoke-checks");
const {
  buildReleaseEvidenceManifest,
} = require("../scripts/release-evidence-writer");
const {
  REQUIRED_CHECKS,
  MANUAL_GATES,
} = require("../scripts/release-evidence-contract");

function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-08-toolchain-"));
  return {
    root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

test("diagnostic schema facade preserves the isolated record factory contract", () => {
  const value = {
    diagnosticId: "diag-parity",
    occurredAt: "2026-08-02T00:00:00.000Z",
    code: "TOOLCHAIN_PARITY",
    module: "phase-08",
    category: "internal",
    operationId: "op-parity",
    runId: "run-parity",
    metadata: { action: "verify", recordCount: 1 },
  };
  assert.deepEqual(
    schema.createDiagnosticRecord(value),
    factory.createDiagnosticRecord(value),
  );
  assert.equal(schema.parseDiagnosticRecord(value).metadata.recordCount, 1);
});

test("diagnostic startup cleanup returns a safe failure owner without exposing the source error", () => {
  const result = initializeDiagnosticSink({
    initialize() {
      const error = new Error("C:\\private\\diagnostics");
      error.code = "DIAGNOSTIC_FILE_PERMISSION_DENIED";
      throw error;
    },
  });
  assert.deepEqual(result, {
    status: "FAILED",
    code: "DIAGNOSTIC_FILE_PERMISSION_DENIED",
  });
  assert.doesNotMatch(JSON.stringify(result), /private|diagnostics/);
});

test("packaged migration resolution has no source-tree fallback", () => {
  const fixture = temporaryRoot();
  try {
    const resources = path.join(fixture.root, "resources");
    const sourceRoot = path.join(fixture.root, "source-app");
    fs.mkdirSync(path.join(resources, "app.asar.unpacked"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(sourceRoot, "scripts"), { recursive: true });
    fs.writeFileSync(
      path.join(sourceRoot, "scripts", "migrate-content-library-v2.js"),
      "source fallback",
    );
    const result = resolveMigrationCliPath({
      packaged: true,
      resourcesPath: resources,
      appRoot: sourceRoot,
      env: {},
    });
    assert.equal(result.path, null);
    assert.equal(result.error.code, "MIGRATION_CLI_UNAVAILABLE");
  } finally {
    fixture.cleanup();
  }
});

test("packaged runtime boundary rejects junction-like entries", () => {
  const candidate = path.join(os.tmpdir(), "phase-08-junction.exe");
  const junctionFs = {
    lstatSync() {
      return {
        isFile: () => true,
        isDirectory: () => false,
        isSymbolicLink: () => false,
        isJunction: () => true,
      };
    },
  };
  assert.throws(
    () => validateCandidate(candidate, { fs: junctionFs }),
    (error) => error.code === "PACKAGED_RUNTIME_LINK_REJECTED",
  );
});

test("artifact verifier rejects the retired manifest version compatibility field", () => {
  assert.throws(
    () =>
      validateManifest({
        version: 1,
        packageVersion: "1.0.1",
        workspaceSchemaVersion: 1,
        artifacts: [],
      }),
    (error) => error.code === "ARTIFACT_MANIFEST_INVALID",
  );
});

test("offline storage boundaries repeat without retired Hepan temporary cleanup", () => {
  const fixture = temporaryRoot();
  const originalUtimesSync = fs.utimesSync;
  const calls = [];
  fs.utimesSync = function (...args) {
    calls.push(args);
    return originalUtimesSync.apply(this, args);
  };
  try {
    const result = verifyStorageBoundaries(path.join(fixture.root, "run-0"));
    assert.equal(result.cleanup.status, "passed");
    assert.equal(result.cleanup.removed, 0);
    fs.utimesSync = originalUtimesSync;
    assert.equal(calls.length, 0);
    for (let index = 1; index < 20; index += 1) {
      const repeated = verifyStorageBoundaries(
        path.join(fixture.root, "run-" + index),
      );
      assert.equal(repeated.cleanup.status, "passed");
      assert.equal(repeated.cleanup.removed, 0);
    }
  } finally {
    fs.utimesSync = originalUtimesSync;
    fixture.cleanup();
  }
});

test("release evidence keeps human gates pending and release blocked", () => {
  const manifest = buildReleaseEvidenceManifest({
    sourceState: { status: "CLEAN", diffSha256: "b".repeat(64) },
    checks: Object.fromEntries(REQUIRED_CHECKS.map((name) => [name, "PASSED"])),
  });
  assert.equal(manifest.releaseState, "BLOCKED_RELEASE");
  assert.ok(
    MANUAL_GATES.every(
      (name) => manifest.manualGates[name] === "PENDING_HUMAN",
    ),
  );
  assert.ok(
    manifest.releaseBlockers.some((value) => value.startsWith("MANUAL_")),
  );
  assert.equal(manifest.manualGates["signing-certificate"], "PENDING_HUMAN");
});

test("release evidence can record a blocked snapshot before a production artifact exists", () => {
  const checks = Object.fromEntries(
    REQUIRED_CHECKS.map((name) => [name, "PASSED"]),
  );
  const manifest = buildReleaseEvidenceManifest({ checks });
  assert.equal(manifest.releaseState, "BLOCKED_RELEASE");
  assert.equal(manifest.artifact.status, "PENDING_HUMAN");
  assert.ok(manifest.releaseBlockers.includes("EVIDENCE_ARTIFACT"));
  assert.equal(manifest.manualGates[MANUAL_GATES[0]], "PENDING_HUMAN");
});
