"use strict";

const path = require("node:path");
const { pathToFileURL } = require("node:url");

const featureRoot = path.resolve(
  __dirname,
  "..",
  "..",
  "media-workbench",
  "src",
  "features",
);

function loadWorkspaceAndPlatformModules() {
  return Promise.all([
    import(
      pathToFileURL(
        path.join(featureRoot, "workspace", "workspace-coordinator.js"),
      )
    ),
    import(
      pathToFileURL(
        path.join(featureRoot, "workspace", "runtime-diagnostic-store.js"),
      )
    ),
    import(
      pathToFileURL(
        path.join(featureRoot, "platform", "platform-event-router.js"),
      )
    ),
  ]);
}

module.exports = { loadWorkspaceAndPlatformModules };
