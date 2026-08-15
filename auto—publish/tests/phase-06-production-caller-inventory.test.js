const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");

const RETIRED_WITHOUT_PRODUCTION_CONSUMER = Object.freeze([
  "attention.getArticleAttention",
  "content.listTemplates",
  "content.listGeneratedArticles",
  "content.listArticleTrash",
  "content.previewTrashArticles",
  "content.listArticleRemovalTransactions",
  "content.listSubmissionBatches",
  "content.previewCancelSubmissionBatch",
  "content.previewRetryFailedPublication",
  "content.retryFailedPublication",
  "content.startDoubaoBatch",
  "generation.createBatch",
  "generation.listBatches",
  "generation.getBatch",
  "generation.startBatch",
  "generation.getState",
  "publication.listForArticles",
]);

test("capabilities without a real production feature and View consumer are retired", () => {
  for (const capability of RETIRED_WITHOUT_PRODUCTION_CONSUMER) {
    assert.equal(
      productionIpcRegistry.byCapability(capability),
      null,
      capability,
    );
  }
});
test("checkpoint C keeps one Settings owner and zero retired media/navigation protocol references", () => {
  const rendererRoot = path.resolve(__dirname, "../media-workbench/src");
  const rendererSources = fs
    .readdirSync(rendererRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:js|ts|tsx)$/.test(entry.name))
    .map((entry) =>
      fs.readFileSync(path.join(entry.parentPath, entry.name), "utf8"),
    );
  assert.equal(
    rendererSources.flatMap(
      (source) => source.match(/<SettingsFeatureProvider\b/g) || [],
    ).length,
    1,
  );

  const rendererTypeSources = fs
    .readdirSync(path.resolve(__dirname, "../media-workbench/src/types"))
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => `../media-workbench/src/types/${entry}`);
  const protocolSources = [
    "../desktop/ipc/contracts/production-registry.js",
    "../desktop/workspace-data-invalidation.js",
    "../desktop/preload.js",
    "../media-workbench/src/features/workspace/workspace-coordinator.js",
    ...rendererTypeSources,
  ]
    .map((source) => fs.readFileSync(path.resolve(__dirname, source), "utf8"))
    .join("\n");
  assert.doesNotMatch(protocolSources, /media[.:]stopSubmit|media:stop-submit/);
  assert.doesNotMatch(
    protocolSources,
    /navigationSummary|navigation-summary|navigation_summary/,
  );
});
