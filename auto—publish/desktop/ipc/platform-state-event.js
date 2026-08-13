"use strict";

const {
  projectPlatformSnapshot,
} = require("../application/read-models/platform-read-model");
const {
  productionIpcRegistry,
} = require("./contracts/production-registry");

function encodePlatformStateEvent(snapshot) {
  const contract = productionIpcRegistry.byCapability("platform.stateChanged");
  return productionIpcRegistry.event(
    contract,
    projectPlatformSnapshot(snapshot),
  );
}

module.exports = { encodePlatformStateEvent };
