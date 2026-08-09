const assert = require("node:assert/strict");
const test = require("node:test");
const { collectTestFiles } = require("../scripts/run-tests");
const {
  collectInventory,
  E_DECISION,
  renderInventory,
} = require("../scripts/test-inventory");

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
