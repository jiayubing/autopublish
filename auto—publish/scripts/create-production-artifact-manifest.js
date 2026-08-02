"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  ARTIFACT_MANIFEST_VERSION,
  WORKSPACE_SCHEMA_VERSION,
  DEFINITIONS,
} = require("./production-artifact-contract");
const {
  manifestError,
  readJson,
  collectProductionArtifactEntries,
} = require("./artifact-manifest-collector");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "build", "production-artifact-manifest.json");

function createProductionArtifactManifest(options) {
  const opts = options || {};
  const root = path.resolve(opts.root || ROOT);
  const output = path.resolve(
    opts.output ||
      path.join(root, "build", "production-artifact-manifest.json"),
  );
  const packageValue = readJson(path.join(root, "package.json"));
  if (!packageValue.version || typeof packageValue.version !== "string")
    throw manifestError("Application package version is unavailable");
  const artifacts = collectProductionArtifactEntries(root);
  const manifest = {
    manifestVersion: ARTIFACT_MANIFEST_VERSION,
    packageVersion: String(packageValue.version),
    workspaceSchemaVersion: WORKSPACE_SCHEMA_VERSION,
    artifacts,
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  return {
    output,
    packageVersion: manifest.packageVersion,
    workspaceSchemaVersion: WORKSPACE_SCHEMA_VERSION,
    artifacts: artifacts.map((item) => item.name),
  };
}

if (require.main === module) {
  try {
    process.stdout.write(
      JSON.stringify(createProductionArtifactManifest()) + "\n",
    );
  } catch (error) {
    process.stderr.write(
      (error.code || "ARTIFACT_MANIFEST_BUILD_FAILED") +
        ":" +
        (error.message || "Artifact manifest build failed") +
        "\n",
    );
    process.exitCode = 1;
  }
}

module.exports = {
  DEFINITIONS,
  createProductionArtifactManifest,
  OUTPUT,
};
