"use strict";

const ARTIFACT_MANIFEST_VERSION = 1;
const WORKSPACE_SCHEMA_VERSION = 1;

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
    name: "migration-cli",
    location: "resources",
    target: "migration/migrate-content-library-v2.js",
    source: "scripts/migrate-content-library-v2.js",
  },
]);

const REQUIRED_ARTIFACTS = Object.freeze(
  DEFINITIONS.map((definition) =>
    Object.freeze({
      name: definition.name,
      location: definition.location,
      path: definition.target,
      executable: definition.executable === true,
      versionFrom: definition.versionSource
        ? Object.freeze({
            location: definition.versionSource.location,
            path: definition.versionSource.path,
            field: definition.versionSource.field,
          })
        : null,
    }),
  ),
);

module.exports = {
  ARTIFACT_MANIFEST_VERSION,
  WORKSPACE_SCHEMA_VERSION,
  DEFINITIONS,
  REQUIRED_ARTIFACTS,
};
