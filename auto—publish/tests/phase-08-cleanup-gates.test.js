"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const asar = require("@electron/asar");
const {
  classifyModuleSizeSignals,
  isRendererNodeSpecifier,
  packageBoundaryReport,
  publisherOwnerCandidates,
  sqliteWriterOpenings,
  verifyPhase08Gates,
} = require("../scripts/verify-phase-08-gates");

function write(root, relative, content) {
  const filename = path.join(root, relative);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, content);
  return filename;
}

test("Phase 8 cleanup gates pass against the current production tree", () => {
  const report = verifyPhase08Gates();
  assert.equal(report.status, "PASSED");
  assert.deepEqual(
    Object.keys(report.checks).sort(),
    [
      "capabilityReachability",
      "dependencyDirection",
      "legacyAbsence",
      "moduleSize",
      "operationalStoreBoundary",
      "packageBoundary",
      "trackedGeneratedOutput",
      "uniqueOwnersAndWriters",
    ].sort(),
  );
  assert.equal(report.checks.capabilityReachability.reachableCount, 113);
  assert.equal(report.checks.moduleSize.violations.length, 0);
});

test("module size signals are advisory and preserve review-needed growth evidence", () => {
  const report = classifyModuleSizeSignals(
    [
      { file: "src/small.js", lines: 400 },
      { file: "src/new-large.js", lines: 401 },
      { file: "src/reviewed-large.js", lines: 450 },
    ],
    [["src/reviewed-large.js", 425, "cohesive deep module"]],
    400,
  );
  assert.equal(report.status, "PASSED");
  assert.equal(report.enforcement, "advisory");
  assert.equal(report.reviewSignalLines, 400);
  assert.deepEqual(report.notable, [
    {
      file: "src/new-large.js",
      lines: 401,
      reviewStatus: "review-needed",
    },
    {
      file: "src/reviewed-large.js",
      lines: 450,
      reviewStatus: "reviewed",
    },
  ]);
  assert.deepEqual(report.growthSignals, [
    {
      file: "src/reviewed-large.js",
      lines: 450,
      baselineLines: 425,
      reason: "cohesive deep module",
      growthLines: 25,
    },
  ]);
  assert.equal(report.violations.length, 0);
});

test("module size baseline registry fails closed for missing or invalid entries", () => {
  const missing = classifyModuleSizeSignals(
    [{ file: "src/present.js", lines: 10 }],
    [["src/missing.js", 100, "reviewed owner"]],
    400,
  );
  assert.equal(missing.status, "FAILED");
  assert.deepEqual(missing.violations, [
    {
      file: "src/missing.js",
      reason: "review baseline points to a missing module",
    },
  ]);

  const invalid = classifyModuleSizeSignals(
    [{ file: "src/present.js", lines: 10 }],
    [["src/present.js", 0, ""]],
    400,
  );
  assert.equal(invalid.status, "FAILED");
  assert.deepEqual(invalid.violations, [
    {
      file: "src/present.js",
      baselineLines: 0,
      reason: "review baseline entry is invalid or duplicated",
    },
  ]);
});

test("Phase 8 static gates reject bare Node builtins and discover qualified writers/owners", () => {
  assert.equal(isRendererNodeSpecifier("fs"), true);
  assert.equal(isRendererNodeSpecifier("child_process"), true);
  assert.equal(isRendererNodeSpecifier("node:path"), true);
  assert.equal(isRendererNodeSpecifier("react"), false);

  const openings = sqliteWriterOpenings(
    'const sqlite = require("node:sqlite"); new sqlite.DatabaseSync(file);',
  );
  assert.equal(openings.length, 1);
  assert.equal(openings[0].writable, true);
  assert.equal(
    sqliteWriterOpenings(
      'const { DatabaseSync } = require("node:sqlite"); new DatabaseSync(file, { readOnly: true });',
    )[0].writable,
    false,
  );

  assert.deepEqual(
    publisherOwnerCandidates([
      {
        name: "desktop/services/desktop-publisher-router.js",
        source: "function createDesktopPublisherRouter() {}",
      },
      {
        name: "desktop/services/submission-transport.js",
        source: "module.exports = { publish(input) {} };",
      },
    ]),
    [
      "desktop/services/desktop-publisher-router.js",
      "desktop/services/submission-transport.js",
    ],
  );
});

test("package gate permits the generated preload but rejects private package content", async () => {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-08-package-gate-"),
  );
  try {
    const appRoot = path.join(temporaryRoot, "app");
    const resources = path.join(temporaryRoot, "resources");
    write(appRoot, "desktop/main.js", "module.exports = {};\n");
    write(appRoot, "build/preload/preload.cjs", "module.exports = {};\n");
    await asar.createPackage(appRoot, path.join(resources, "app.asar"));
    write(
      resources,
      "production-artifact-manifest.json",
      '{"status":"PASSED"}\n',
    );
    const passedReport = packageBoundaryReport(resources);
    assert.equal(passedReport.status, "PASSED");
    assert.equal(
      passedReport.archiveSha256,
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(resources, "app.asar")))
        .digest("hex"),
    );

    const invalidAppRoot = path.join(temporaryRoot, "invalid-app");
    const invalidResources = path.join(temporaryRoot, "invalid-resources");
    write(invalidAppRoot, "desktop/main.js", "module.exports = {};\n");
    write(
      invalidAppRoot,
      "build/preload/preload.cjs",
      "module.exports = {};\n",
    );
    write(
      invalidAppRoot,
      "tests/fixture.json",
      JSON.stringify({ fixture: true }),
    );
    await asar.createPackage(
      invalidAppRoot,
      path.join(invalidResources, "app.asar"),
    );
    const report = packageBoundaryReport(invalidResources);
    assert.equal(report.status, "FAILED");
    assert.ok(
      report.violations.some(
        (violation) =>
          violation.rule === "private-or-test-content" &&
          violation.entry.endsWith("tests/fixture.json"),
      ),
    );

    const sensitiveAppRoot = path.join(temporaryRoot, "sensitive-app");
    const sensitiveResources = path.join(temporaryRoot, "sensitive-resources");
    write(
      sensitiveAppRoot,
      "desktop/main.js",
      'module.exports = { apiKey: "123456789-secret" };\n',
    );
    await asar.createPackage(
      sensitiveAppRoot,
      path.join(sensitiveResources, "app.asar"),
    );
    write(
      sensitiveResources,
      "tools/extra-secret.js",
      'module.exports = { apiKey: "123456789-extra-secret" };\n',
    );
    const sensitiveReport = packageBoundaryReport(sensitiveResources);
    assert.equal(sensitiveReport.status, "FAILED");
    const sensitiveEntries = sensitiveReport.violations
      .filter((violation) => violation.rule === "sensitive-content")
      .map((violation) => violation.entry);
    assert.ok(
      sensitiveEntries.some((entry) => entry.endsWith("desktop/main.js")),
    );
    assert.ok(
      sensitiveEntries.some((entry) =>
        entry.endsWith("extraResources/tools/extra-secret.js"),
      ),
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
