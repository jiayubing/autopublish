"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const asar = require("@electron/asar");
const {
  scanArchive: scanLegacyArchive,
  scanSourceTree: scanLegacySourceTree,
} = require("../scripts/verify-legacy-absence");
const {
  dependencyDirectionReport,
  DEPENDENCY_RULES,
  isOperationalFacadeImport,
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
      "operationalStoreBoundary",
      "packageBoundary",
      "trackedGeneratedOutput",
      "uniqueOwnersAndWriters",
    ].sort(),
  );
  assert.equal(
    report.checks.capabilityReachability.reachableCount,
    report.checks.capabilityReachability.capabilityCount,
  );
});

test("architecture guards cover Workstream D boundaries with a bounded legacy allowlist", () => {
  const ruleNames = new Set(DEPENDENCY_RULES.map((rule) => rule.name));
  for (const name of [
    "application-service-to-ipc-contract",
    "platform-adapter-to-global-runtime-config",
    "renderer-to-platform-automation",
  ])
    assert.equal(ruleNames.has(name), true, name);

  const runtimeRule = DEPENDENCY_RULES.find(
    (rule) => rule.name === "platform-adapter-to-global-runtime-config",
  );
  assert.deepEqual([...runtimeRule.allowlist.keys()].sort(), [
    "src/platforms/hepan/adapter.js",
    "src/platforms/lieju/adapter.js",
    "src/platforms/media/adapter.js",
    "src/platforms/toutiao/adapter.js",
  ]);
  assert.equal(runtimeRule.forbidden("scripts/config"), true);
  assert.equal(runtimeRule.forbidden("scripts/config.js"), true);
  assert.equal(runtimeRule.forbidden("src/platforms/runtime-context"), false);
  const serviceRule = DEPENDENCY_RULES.find(
    (rule) => rule.name === "application-service-to-ipc-contract",
  );
  assert.equal(serviceRule.forbidden("desktop/ipc/contracts/example"), true);
  const rendererRule = DEPENDENCY_RULES.find(
    (rule) => rule.name === "renderer-to-platform-automation",
  );
  assert.equal(rendererRule.forbidden("src/platforms/example"), true);
  assert.equal(
    dependencyDirectionReport().violations.some(
      (violation) =>
        violation.rule === "platform-adapter-to-global-runtime-config",
    ),
    false,
  );
});

test("Phase 8 static gates reject bare Node builtins and discover qualified writers/owners", () => {
  assert.equal(
    isOperationalFacadeImport(
      "src/infrastructure/operational-store/operational-store",
    ),
    true,
  );
  assert.equal(
    isOperationalFacadeImport(
      "src/infrastructure/operational-store/operational-store.js",
    ),
    true,
  );
  assert.equal(
    isOperationalFacadeImport(
      "src/infrastructure/operational-store/internal/operational-store-runtime",
    ),
    false,
  );
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

test("legacy absence gate fails closed for each retired source and package capability", async () => {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "legacy-absence-gate-"),
  );
  const samples = [
    "createPublicationLedger()",
    "const runtime = { publicationLedger: {} };",
    "createSubmissionBatchStore()",
    'require("./submission-export-service")',
    'const channel = "desktop:start-batch";',
    "reconcileRemoteOrder()",
    "supplierStatusOrFallback()",
  ];
  try {
    for (const [index, sample] of samples.entries()) {
      const sourceRoot = path.join(temporaryRoot, `source-${index}`);
      write(sourceRoot, "desktop/main.js", sample);
      assert.equal(scanLegacySourceTree(sourceRoot).length, 1, sample);
    }

    const appRoot = path.join(temporaryRoot, "app");
    const resources = path.join(temporaryRoot, "resources");
    write(appRoot, "desktop/main.js", "reconcileRemoteOrder();\n");
    write(appRoot, "node_modules/vendor/index.js", "reconcileRemoteOrder();\n");
    await asar.createPackage(appRoot, path.join(resources, "app.asar"));
    assert.deepEqual(scanLegacyArchive(resources).matches, [
      "desktop/main.js#remote-order-reconciler",
    ]);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
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
