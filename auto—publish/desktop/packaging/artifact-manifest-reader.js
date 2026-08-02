"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  ARTIFACT_MANIFEST_VERSION,
  REQUIRED_ARTIFACTS,
} = require("../../scripts/production-artifact-contract");
const {
  verificationError,
  normalizeRelative,
  assertRegularPath,
} = require("./artifact-path-boundary");
function validateManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw verificationError(
      "ARTIFACT_MANIFEST_INVALID",
      "Production artifact manifest is invalid",
    );
  if (
    value.manifestVersion !== ARTIFACT_MANIFEST_VERSION ||
    !Array.isArray(value.artifacts) ||
    value.artifacts.length === 0
  )
    throw verificationError(
      "ARTIFACT_MANIFEST_INVALID",
      "Production artifact manifest is invalid",
    );
  if (
    typeof value.packageVersion !== "string" ||
    value.packageVersion.trim() === ""
  )
    throw verificationError(
      "ARTIFACT_MANIFEST_INVALID",
      "Production artifact manifest version is invalid",
    );
  if (
    !Number.isSafeInteger(value.workspaceSchemaVersion) ||
    value.workspaceSchemaVersion < 1
  )
    throw verificationError(
      "ARTIFACT_MANIFEST_INVALID",
      "Production artifact schema version is invalid",
    );
  if (value.artifacts.length !== REQUIRED_ARTIFACTS.length)
    throw verificationError(
      "ARTIFACT_MANIFEST_INVENTORY_INVALID",
      "Production artifact inventory is incomplete",
    );

  const expectedByName = new Map(
    REQUIRED_ARTIFACTS.map((artifact) => [artifact.name, artifact]),
  );
  const names = new Set();
  return Object.assign({}, value, {
    artifacts: value.artifacts.map(function (artifact) {
      if (!artifact || typeof artifact !== "object" || Array.isArray(artifact))
        throw verificationError(
          "ARTIFACT_MANIFEST_INVALID",
          "Production artifact entry is invalid",
        );
      const expected = expectedByName.get(artifact.name);
      if (
        typeof artifact.name !== "string" ||
        names.has(artifact.name) ||
        !expected
      )
        throw verificationError(
          "ARTIFACT_MANIFEST_INVENTORY_INVALID",
          "Production artifact name is invalid",
        );
      names.add(artifact.name);
      const relative = normalizeRelative(artifact.path, artifact.name);
      if (
        artifact.location !== expected.location ||
        relative !== expected.path ||
        Boolean(artifact.executable) !== expected.executable ||
        (expected.versionFrom === null
          ? artifact.versionFrom !== undefined
          : !artifact.versionFrom ||
            artifact.versionFrom.location !== expected.versionFrom.location ||
            artifact.versionFrom.path !== expected.versionFrom.path ||
            artifact.versionFrom.field !== expected.versionFrom.field)
      )
        throw verificationError(
          "ARTIFACT_MANIFEST_INVENTORY_INVALID",
          "Production artifact inventory entry does not match the required package boundary",
          artifact.name,
        );
      if (!/^[a-f0-9]{64}$/i.test(artifact.sha256 || ""))
        throw verificationError(
          "ARTIFACT_MANIFEST_INVALID",
          "Production artifact hash is invalid",
          artifact.name,
        );
      if (
        artifact.bytes !== undefined &&
        (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0)
      )
        throw verificationError(
          "ARTIFACT_MANIFEST_INVALID",
          "Production artifact size is invalid",
          artifact.name,
        );
      if (
        artifact.version !== undefined &&
        (typeof artifact.version !== "string" || artifact.version.trim() === "")
      )
        throw verificationError(
          "ARTIFACT_MANIFEST_INVALID",
          "Production artifact version is invalid",
          artifact.name,
        );
      return Object.assign({}, artifact, { path: relative });
    }),
  });
}

function readManifest(resourcesPath, options) {
  const opts = options || {};
  const io = opts.fs || fs;
  const filename =
    opts.manifestPath ||
    path.join(resourcesPath, "production-artifact-manifest.json");
  const checked = assertRegularPath(io, resourcesPath, filename, false);
  let value;
  try {
    value = JSON.parse(io.readFileSync(checked.absolute, "utf8"));
  } catch (_) {
    throw verificationError(
      "ARTIFACT_MANIFEST_INVALID",
      "Production artifact manifest cannot be read",
    );
  }
  return { manifest: validateManifest(value), path: checked.canonical };
}

module.exports = { validateManifest, readManifest, normalizeRelative };
