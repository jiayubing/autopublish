const test = require("node:test");
const assert = require("node:assert/strict");

const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");

test("publication namespace is retired from the typed production registry", () => {
  for (const channel of [
    "publication:prepare-regular-uncertain-resolution",
    "publication:confirm-regular-accepted",
    "publication:confirm-regular-not-accepted",
  ]) {
    assert.equal(productionIpcRegistry.byChannel(channel), null, channel);
  }
});
