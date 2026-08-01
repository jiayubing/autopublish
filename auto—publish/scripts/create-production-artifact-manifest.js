"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "build", "production-artifact-manifest.json");
const WORKSPACE_SCHEMA_VERSION = 1;

function manifestError(message) {
  const error = new Error(message);
  error.code = "ARTIFACT_MANIFEST_BUILD_FAILED";
  return error;
}

function regularFile(filename) {
  try {
    const stat = fs.lstatSync(filename);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (_) {
    return false;
  }
}

function hash(filename) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filename))
    .digest("hex");
}

function readJson(filename) {
  try {
    return JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (_) {
    throw manifestError("Required production artifact metadata is unavailable");
  }
}

const DEFINITIONS = Object.freeze([
  {
    name: "electron-main",
    location: "asar",
    target: "desktop/main.js",
    source: "desktop/main.js",
  },
  {
    name: "electron-preload",
    location: "asar",
    target: "build/preload/preload.cjs",
    source: "build/preload/preload.cjs",
  },
  {
    name: "renderer-entry",
    location: "asar",
    target: "media-workbench/dist/index.html",
    source: "media-workbench/dist/index.html",
  },
  {
    name: "playwright-node",
    location: "resources",
    target: "tools/node/node.exe",
    source: "build/runtime-tools/node/node.exe",
    executable: true,
    versionSource: {
      location: "resources",
      path: "tools/node/runtime-tools-manifest.json",
      source: "build/runtime-tools/node/runtime-tools-manifest.json",
      field: "nodeVersion",
    },
  },
  {
    name: "playwright-node-license",
    location: "resources",
    target: "tools/node/LICENSE",
    source: "build/runtime-tools/node/LICENSE",
  },
  {
    name: "playwright-node-manifest",
    location: "resources",
    target: "tools/node/runtime-tools-manifest.json",
    source: "build/runtime-tools/node/runtime-tools-manifest.json",
  },
  {
    name: "playwright-cli",
    location: "unpacked",
    target: "node_modules/@playwright/cli/playwright-cli.js",
    source: "node_modules/@playwright/cli/playwright-cli.js",
    versionSource: {
      location: "unpacked",
      path: "node_modules/@playwright/cli/package.json",
      source: "node_modules/@playwright/cli/package.json",
      field: "version",
    },
  },
  {
    name: "playwright-cli-license",
    location: "unpacked",
    target: "node_modules/@playwright/cli/LICENSE",
    source: "node_modules/@playwright/cli/LICENSE",
  },
  {
    name: "playwright-license",
    location: "unpacked",
    target: "node_modules/playwright/LICENSE",
    source: "node_modules/playwright/LICENSE",
  },
  {
    name: "playwright-core-license",
    location: "unpacked",
    target: "node_modules/playwright-core/LICENSE",
    source: "node_modules/playwright-core/LICENSE",
  },
  {
    name: "hepan-script",
    location: "unpacked",
    target: "src/platforms/hepan/hepan_publish.py",
    source: "src/platforms/hepan/hepan_publish.py",
  },
  {
    name: "hepan-vendor",
    location: "unpacked",
    target: "resources/hepan/vendor-pure/requests/__init__.py",
    source: "resources/hepan/vendor-pure/requests/__init__.py",
  },
  {
    name: "migration-cli",
    location: "resources",
    target: "migration/migrate-content-library-v2.js",
    source: "scripts/migrate-content-library-v2.js",
  },
]);

function createProductionArtifactManifest(options) {
  const opts = options || {};
  const root = path.resolve(opts.root || ROOT);
  const output = path.resolve(
    opts.output ||
      path.join(root, "build", "production-artifact-manifest.json"),
  );
  const packageValue = readJson(path.join(root, "package.json"));
  const artifacts = DEFINITIONS.map(function (definition) {
    const sourcePath = path.join(root, definition.source);
    if (!regularFile(sourcePath))
      throw manifestError("Missing production artifact: " + definition.source);
    const entry = {
      name: definition.name,
      location: definition.location,
      path: definition.target,
      sha256: hash(sourcePath),
      bytes: fs.statSync(sourcePath).size,
    };
    if (definition.executable) entry.executable = true;
    if (definition.versionSource) {
      const sourceValue = readJson(
        path.join(root, definition.versionSource.source),
      );
      const version = String(
        definition.versionSource.field
          .split(".")
          .reduce((value, key) => value && value[key], sourceValue) || "",
      );
      if (!version)
        throw manifestError("Missing version metadata for " + definition.name);
      entry.version = version;
      entry.versionFrom = {
        location: definition.versionSource.location,
        path: definition.versionSource.path,
        field: definition.versionSource.field,
      };
    }
    return entry;
  });
  if (!packageValue.version || typeof packageValue.version !== "string") {
    throw manifestError("Application package version is unavailable");
  }
  const manifest = {
    manifestVersion: 1,
    packageVersion: String(packageValue.version || ""),
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

module.exports = { DEFINITIONS, createProductionArtifactManifest, OUTPUT };
