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
const { createExecutionProvenance } = require("./release-evidence-inputs");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "build", "production-artifact-manifest.json");

function createProductionArtifactManifest(options) {
  const opts = options || {};
  const startedAt = Date.now();
  const root = path.resolve(opts.root || ROOT);
  const output = path.resolve(
    opts.output ||
      path.join(root, "build", "production-artifact-manifest.json"),
  );
  const packageValue = readJson(path.join(root, "package.json"));
  if (!packageValue.version || typeof packageValue.version !== "string")
    throw manifestError("Application package version is unavailable");
  const artifacts = collectProductionArtifactEntries(root);
  const provenance = createExecutionProvenance({
    root,
    command: "node scripts/create-production-artifact-manifest.js",
    startedAt,
  });
  const manifest = {
    manifestVersion: ARTIFACT_MANIFEST_VERSION,
    packageVersion: String(packageValue.version),
    workspaceSchemaVersion: WORKSPACE_SCHEMA_VERSION,
    artifacts,
    ...provenance,
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
    ...provenance,
  };
}

if (require.main === module) {
  try {
    process.stdout.write(
      JSON.stringify(createProductionArtifactManifest()) + "\n",
    );
  } catch (error) {
    const code =
      error &&
      typeof error.code === "string" &&
      /^[A-Z0-9_]{1,80}$/.test(error.code)
        ? error.code
        : "ARTIFACT_MANIFEST_BUILD_FAILED";
    process.stderr.write(code + "\n");
    process.exitCode = 1;
  }
}

module.exports = {
  DEFINITIONS,
  createProductionArtifactManifest,
  OUTPUT,
};
