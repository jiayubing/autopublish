const test = require("node:test");
const assert = require("node:assert/strict");

const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");
const { loadPreloadHarness } = require("./helpers/preload-harness");

test("regular outcome confirmation has one attention-owned public entry", () => {
  for (const capability of [
    "publication.prepareRegularUncertainResolution",
    "publication.confirmRegularAccepted",
    "publication.confirmRegularNotAccepted",
  ]) {
    assert.equal(productionIpcRegistry.byCapability(capability), null, capability);
  }

  const preload = loadPreloadHarness();
  assert.equal(Object.hasOwn(preload.api, "publication"), false);
  assert.equal(
    productionIpcRegistry.byCapability("attention.resolveArticleAttention")
      ?.channel,
    "content:resolve-article-attention",
  );
});
