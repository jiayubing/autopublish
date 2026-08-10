const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { collectTestFiles } = require("../scripts/run-tests");
const {
  collectInventory,
  createInventorySnapshot,
  dispositionFor,
  E_DECISION,
  inferStaticCategories,
  reconcileInventory,
  renderInventory,
  sourceReadSignals,
  staticSignals,
  extractTests,
} = require("../scripts/test-inventory");
const {
  createTestInventoryEvidence,
} = require("../scripts/create-test-inventory-evidence");

test("M05-0 inventory uses the runner discovery set and covers JS plus MJS", () => {
  const files = collectTestFiles();
  const inventory = collectInventory();
  const paths = inventory.records.map((record) => record.relativePath);

  assert.deepEqual(paths, files);
  assert.ok(paths.some((file) => file.endsWith(".test.js")));
  assert.ok(paths.some((file) => file.endsWith(".test.mjs")));
  assert.equal(new Set(paths).size, paths.length);
  assert.equal(inventory.discovery.files, files.length);
  assert.equal(
    inventory.discovery.jsFiles + inventory.discovery.mjsFiles,
    files.length,
  );
  assert.equal(inventory.summary.declarations, inventory.allTests.length);
});

test("classifier promotes file-scope production readers without treating imports as source assertions", () => {
  const source = `
    const fs = require("node:fs");
    const path = require("node:path");
    const root = __dirname;
    const read = (file) => fs.readFileSync(path.resolve(root, "..", file), "utf8");
    const { owner } = require("../src/owner");
    test("business behavior", () => {
      const view = read("media-workbench/src/View.tsx");
      assert.match(view, /button/);
      assert.equal(owner(), "ready");
    });
  `;
  const declaration = extractTests(source)[0];
  const result = sourceReadSignals(
    declaration.source,
    staticSignals(source),
    source,
  );

  assert.equal(result.level, "assertion");
  assert.equal(result.sourceAssertion, true);
  assert.match(result.reason, /helper/);

  const importOnly = `
    const { owner } = require("../src/owner");
    test("public behavior", () => assert.equal(owner(), "ready"));
  `;
  const importDeclaration = extractTests(importOnly)[0];
  assert.equal(
    sourceReadSignals(
      importDeclaration.source,
      staticSignals(importOnly),
      importOnly,
    ).level,
    "none",
  );
});

test("classifier recognizes split path.join production readers and keeps runtime harness reads heuristic-only", () => {
  const source = `
    const fs = require("node:fs");
    const path = require("node:path");
    const readSource = (file) => fs.readFileSync(
      path.join(root, "media-workbench", "src", file),
      "utf8",
    );
    test("runtime harness behavior", () => {
      const sourceText = readSource("features/content.js");
      const runtime = vm.runInNewContext(sourceText);
      assert.equal(runtime.status, "ready");
    });
  `;
  const declaration = extractTests(source)[0];
  const result = sourceReadSignals(
    declaration.source,
    staticSignals(source),
    source,
  );

  assert.equal(result.level, "file-heuristic");
  assert.equal(result.sourceAssertion, false);

  const assertionSource = source.replace(
    'assert.equal(runtime.status, "ready");',
    'assert.match(sourceText, /createContentSourcesFeature/);',
  );
  const assertionDeclaration = extractTests(assertionSource)[0];
  assert.equal(
    sourceReadSignals(
      assertionDeclaration.source,
      staticSignals(assertionSource),
      assertionSource,
    ).level,
    "assertion",
  );
});

test("classifier catches file-scope helpers, aliases, inline readers, and all source-shape matchers", () => {
  const helperSource = `
    const fs = require("node:fs");
    const path = require("node:path");
    const root = path.resolve(__dirname, "..");
    const readSource = (file) =>
      fs.readFileSync(path.join(root, "src", file), "utf8");
    const source = readSource("View.tsx");
    test("source assertions", () => {
      assert.ok(source.includes("foo"));
      assert.equal(source.indexOf("bar") >= 0, true);
      assert.ok(source.startsWith("<"));
      assert.ok(source.endsWith(">"));
      assert.ok(source.match(/foo/));
      assert.ok(/foo/.test(source));
      assert.match(readSource("Other.tsx"), /baz/);
    });
  `;
  const helperDeclaration = extractTests(helperSource)[0];
  const helperResult = sourceReadSignals(
    helperDeclaration.source,
    staticSignals(helperSource),
    helperSource,
  );

  assert.equal(helperResult.level, "assertion");
  assert.equal(helperResult.sourceAssertion, true);
  assert.equal(helperResult.assertionProfile.assertionCount, 7);
  assert.equal(helperResult.assertionProfile.businessCount, 7);

  const inlineSource = `
    const fs = require("node:fs");
    const path = require("node:path");
    test("inline source assertions", () => {
      assert.match(
        fs.readFileSync(path.join(root, "src", "Inline.tsx"), "utf8"),
        /inline/,
      );
      assert.equal(
        fs.readFileSync(path.join(root, "src", "Inline.tsx"), "utf8")
          .endsWith("tsx"),
        true,
      );
    });
  `;
  const inlineDeclaration = extractTests(inlineSource)[0];
  const inlineResult = sourceReadSignals(
    inlineDeclaration.source,
    staticSignals(inlineSource),
    inlineSource,
  );
  assert.equal(inlineResult.level, "assertion");
  assert.equal(inlineResult.assertionProfile.assertionCount, 2);
});

test("classifier does not treat ordinary path arguments and runtime results as source reads", () => {
  const source = `
    const path = require("node:path");
    const feature = require("../src/feature");
    test("public behavior", () => {
      const result = feature.run(path.join("src", "fixture.json"));
      assert.equal(result.status, "ready");
    });
  `;
  const declaration = extractTests(source)[0];
  const result = sourceReadSignals(
    declaration.source,
    staticSignals(source),
    source,
  );
  assert.equal(result.level, "none");
  assert.equal(result.sourceAssertion, false);
});

test("mixed static and business source assertions fail closed at declaration disposition", () => {
  const source = `
    const fs = require("node:fs");
    const path = require("node:path");
    const readSource = () =>
      fs.readFileSync(path.join(root, "src", "GeneratedArticlesView.tsx"), "utf8");
    const sourceText = readSource();
    test("legacy absence plus public behavior", () => {
      assert.doesNotMatch(sourceText, /OldCapability/);
      assert.match(sourceText, /startPaidMediaBatch/);
    });
  `;
  const declaration = extractTests(source)[0];
  const categories = inferStaticCategories(
    "tests/renderer-confirmation-host.test.js",
    declaration.name,
    declaration.source,
  );
  const signals = sourceReadSignals(
    declaration.source,
    staticSignals(source),
    source,
    categories,
  );

  assert.deepEqual(categories, ["retired-capability/legacy-absence"]);
  assert.equal(signals.assertionProfile.mixed, true);
  assert.equal(signals.assertionProfile.allStatic, false);
  assert.equal(
    dispositionFor(
      {
        sourceRead: signals,
        modifier: null,
        dynamicMatrix: false,
        dynamicName: false,
      },
      "M05-G",
      categories,
    ).disposition,
    "REWRITE_PUBLIC_BEHAVIOR",
  );
});

test("classifier does not infer a legal static category from behavior-test title keywords", () => {
  const source = `
    const value = fs.readFileSync(path.join(root, "media-workbench/src/View.tsx"), "utf8");
    assert.match(value, /safe capability/);
  `;
  const categories = inferStaticCategories(
    "tests/renderer-hepan-settings.test.js",
    "renders independent safe capability guidance and never renders the Cookie",
    source,
  );

  assert.deepEqual(categories, []);
  assert.equal(
    dispositionFor(
      {
        sourceRead: { level: "assertion" },
        modifier: null,
        dynamicMatrix: false,
        dynamicName: false,
      },
      "M05-C",
      categories,
    ).disposition,
    "REWRITE_PUBLIC_BEHAVIOR",
  );
});

test("classifier retains narrow static gates only when the source target is an allowed gate", () => {
  const architectureSource = `
    const source = fs.readFileSync(path.join(root, "desktop/main.js"), "utf8");
    const moduleSpecifiers = parse(source);
    assert.doesNotMatch(moduleSpecifiers, /infrastructure/);
  `;
  assert.deepEqual(
    inferStaticCategories(
      "tests/architecture-seams.test.js",
      "safe boundary",
      architectureSource,
    ),
    ["architecture/dependency"],
  );

  const securitySource = `
    const source = fs.readFileSync(path.join(root, "desktop/preload.js"), "utf8");
    assert.match(source, /sandbox/);
  `;
  assert.deepEqual(
    inferStaticCategories(
      "tests/electron-security.test.js",
      "cookie boundary",
      securitySource,
    ),
    ["security"],
  );
});

test("M05-0 inventory is reproducible and records every disposition boundary", () => {
  const first = collectInventory();
  const second = collectInventory();

  assert.equal(first.discovery.sha256, second.discovery.sha256);
  assert.equal(first.manifestDigest, second.manifestDigest);
  assert.ok(first.summary.dynamicMatrices > 0);
  assert.ok(first.summary.assertionLevelSourceCandidates > 0);
  assert.ok(first.signatureClusters.length > 0);
  assert.ok(first.duplicateInvariantClusters.length >= 8);
  assert.equal(first.eDecision.mode, E_DECISION.mode);
  assert.deepEqual(first.eDecision.order, [
    "M05-D",
    "M05-E1",
    "M05-E2",
    "M05-E3",
    "M05-F",
  ]);

  for (const record of first.records) {
    assert.match(record.relativePath, /^tests\/.*\.test\.(?:js|mjs)$/);
    assert.ok(["parallel", "serial"].includes(record.pool));
    assert.equal(record.tests.length, record.testCount);
  }
  for (const declaration of first.allTests) {
    assert.match(declaration.id, /^T-[0-9a-f]{10}$/);
    assert.ok(declaration.disposition);
    assert.ok(declaration.replacement);
    if (declaration.sourceRead.level === "assertion")
      assert.notEqual(declaration.package, "NONE");
  }
  for (const cluster of first.signatureClusters) {
    assert.match(cluster.id, /^SIG-[0-9a-f]{10}$/);
    assert.equal(
      cluster.disposition,
      "RETAIN_UNPROVEN_DUPLICATE_UNTIL_OWNER_REVIEW",
    );
    assert.ok(cluster.replacement);
    assert.ok(cluster.tests.length > 1);
  }
});

test("M05-0 rendered ledger includes the stable before gate and do-not-touch boundary", () => {
  const inventory = collectInventory();
  const rendered = renderInventory(inventory);

  assert.match(rendered, /M05-0 authoritative test disposition ledger/);
  assert.match(rendered, new RegExp(inventory.manifestDigest));
  assert.match(rendered, /\.test\.mjs/);
  assert.match(rendered, /M05-E1 → M05-E2 → M05-E3/);
  assert.match(rendered, /do-not-touch boundary/);
});

test("after inventory reconciles every file and disposition against before", () => {
  const inventory = collectInventory();
  const snapshot = createInventorySnapshot(inventory);
  const reconciliation = reconcileInventory(snapshot, inventory);

  assert.equal(reconciliation.status, "PASSED");
  assert.deepEqual(reconciliation.addedFiles, []);
  assert.deepEqual(reconciliation.removedFiles, []);
  assert.deepEqual(reconciliation.poolMismatches, []);
  assert.deepEqual(reconciliation.dispositionMismatches, []);
  assert.deepEqual(reconciliation.unexpectedNewDeclarations, []);
  assert.deepEqual(reconciliation.missingAfterDisposition, []);
  assert.equal(reconciliation.uniquePools, true);
});

test("inventory evidence writes a complete before/after reconciliation report", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "m05-h-inventory-evidence-"),
  );
  try {
    const snapshot = createInventorySnapshot(collectInventory());
    const before = path.join(root, "before.json");
    const output = path.join(root, "after.json");
    fs.writeFileSync(before, JSON.stringify(snapshot), "utf8");
    const report = createTestInventoryEvidence({ before, output });
    assert.equal(report.status, "PASSED");
    assert.equal(report.reconciliation.status, "PASSED");
    assert.equal(report.reconciliation.uniquePools, true);
    assert.deepEqual(report.reconciliation.unexpectedNewDeclarations, []);
    assert.deepEqual(report.reconciliation.missingAfterDisposition, []);
    assert.equal(report.after.files.length, report.after.discovery.files);
    assert.equal(
      JSON.parse(fs.readFileSync(output, "utf8")).reconciliation.status,
      "PASSED",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
