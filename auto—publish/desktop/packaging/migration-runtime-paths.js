"use strict";

const path = require("node:path");
const {
  createPackagedRuntimeResolver,
} = require("../../src/infrastructure/runtime/packaged-runtime-resolver");

function resolveMigrationCliPath(options) {
  const opts = options || {};
  const resolver = createPackagedRuntimeResolver(opts);
  const result = resolver.tryResolve({
    name: "content library migration CLI",
    packagedCandidates: [
      path.join(
        resolver.resourcesPath,
        "migration",
        "migrate-content-library-v2.js",
      ),
      path.join(
        resolver.resourcesPath,
        "app.asar.unpacked",
        "scripts",
        "migrate-content-library-v2.js",
      ),
    ],
    developmentCandidates: [
      path.join(resolver.appRoot, "scripts", "migrate-content-library-v2.js"),
    ],
    root: resolver.packaged ? resolver.resourcesPath : undefined,
    errorCode: "MIGRATION_CLI_UNAVAILABLE",
    message: "Packaged content library migration CLI is unavailable",
  });
  return result.ok
    ? { path: result.value.path, source: result.value.source }
    : { path: null, source: null, error: result.error };
}

module.exports = { resolveMigrationCliPath };
