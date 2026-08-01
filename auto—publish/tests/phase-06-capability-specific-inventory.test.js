const assert = require("node:assert/strict");
const asar = require("@electron/asar");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");
const {
  productionIpcContractFixtures,
} = require("./fixtures/phase-06-production-ipc-contract-fixtures");

const fixturePath = path.resolve(
  __dirname,
  "fixtures/phase-06-production-ipc-contract-fixtures.js",
);
const matrixPath = path.resolve(
  __dirname,
  "phase-06-production-ipc-fixture-matrix.test.js",
);
const symbolEvidencePath = path.resolve(
  __dirname,
  "helpers/typescript-symbol-evidence.js",
);

test("production inventory is capability-specific and not generated from owner roots", () => {
  const fixtureSource = fs.readFileSync(fixturePath, "utf8");
  const matrixSource = fs.readFileSync(matrixPath, "utf8");
  const symbolEvidenceSource = fs.readFileSync(symbolEvidencePath, "utf8");

  assert.doesNotMatch(fixtureSource, /function productionCallerTrace\s*\(/);
  assert.doesNotMatch(fixtureSource, /entry\.capability\.split\(/);
  assert.doesNotMatch(matrixSource, /\.includes\(fixture\.productionCaller/);
  assert.doesNotMatch(matrixSource, /source\.includes\(/);
  assert.doesNotMatch(matrixSource, /function invokesMethod\s*\(/);
  assert.doesNotMatch(matrixSource, /function containsNamedFeatureMember\s*\(/);
  assert.match(matrixSource, /verifyCapabilityEvidence/);
  assert.match(matrixSource, /createProductionProgram/);
  assert.doesNotMatch(matrixSource, /localDeclarations/);
  assert.doesNotMatch(matrixSource, /featureMethod\s*===\s*binding/);
  assert.doesNotMatch(matrixSource, /\.endsWith\(`\.\$\{application\}`\)/);
  assert.doesNotMatch(matrixSource, /consumerInvokesRecordedFeatureMethod/);
  assert.doesNotMatch(matrixSource, /registrarBindsChannelToApplication/);
  assert.doesNotMatch(symbolEvidenceSource, /getText\(sourceFile\)\s*===\s*receiver/);
  assert.doesNotMatch(symbolEvidenceSource, /function localDeclarations/);
  assert.doesNotMatch(symbolEvidenceSource, /featureMethod\s*===\s*binding/);
  assert.doesNotMatch(symbolEvidenceSource, /endsWith\(`\.\$\{application/);
  assert.match(fixtureSource, /PRODUCTION_CONSUMER_RECEIVERS/);
});

test("production registry does not retain the unconsumed media.removeDraft capability", () => {
  assert.equal(productionIpcRegistry.byCapability("media.removeDraft"), null);
  assert.equal(productionIpcRegistry.byChannel("media:remove-draft"), null);
});

test("source and current ASAR physically omit the retired media.removeDraft path", () => {
  const sourceFiles = [
    "../desktop/ipc/contracts/media-contracts.js",
    "../desktop/ipc/media-ipc.js",
    "../desktop/preload.js",
    "../media-workbench/src/bridge/media.ts",
    "../media-workbench/src/features/media/use-media-feature.ts",
    "../media-workbench/src/features/media/media-feature.js",
  ];
  for (const source of sourceFiles) {
    assert.doesNotMatch(
      fs.readFileSync(path.resolve(__dirname, source), "utf8"),
      /media\.removeDraft|media:remove-draft|\bremoveDraft\b/,
      source,
    );
  }

  const artifact = path.resolve(
    __dirname,
    "../release-alpha/win-unpacked/resources/app.asar",
  );
  assert.ok(fs.existsSync(artifact), artifact);
  for (const source of [
    path.join("desktop", "ipc", "contracts", "media-contracts.js"),
    path.join("desktop", "ipc", "media-ipc.js"),
    path.join("desktop", "preload.js"),
    path.join("build", "preload", "preload.cjs"),
  ]) {
    assert.doesNotMatch(
      asar.extractFile(artifact, source).toString("utf8"),
      /media\.removeDraft|media:remove-draft|\bremoveDraft\b/,
      `app.asar:${source}`,
    );
  }
});

test("every retained capability records an explicit production consumer", () => {
  for (const fixture of productionIpcContractFixtures) {
    const consumer = fixture.productionCaller.consumer;
    assert.ok(consumer, `${fixture.capability}: consumer`);
    assert.ok(
      ["direct", "lifecycle", "event"].includes(consumer.kind),
      `${fixture.capability}: consumer kind`,
    );
    assert.equal(typeof consumer.source, "string", fixture.capability);
    assert.equal(typeof consumer.method, "string", fixture.capability);
    assert.equal(typeof consumer.receiver, "string", fixture.capability);
    assert.equal(typeof consumer.featureSource, "string", fixture.capability);
    assert.equal(typeof consumer.featureMethod, "string", fixture.capability);
    if (consumer.kind === "lifecycle") {
      assert.equal(typeof consumer.stateSource, "string", fixture.capability);
      assert.equal(typeof consumer.stateRoot, "string", fixture.capability);
      assert.equal(typeof consumer.stateField, "string", fixture.capability);
    }
  }
});
