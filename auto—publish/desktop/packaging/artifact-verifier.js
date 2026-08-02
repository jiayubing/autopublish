"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  executableFile,
} = require("../../src/infrastructure/runtime/packaged-runtime-resolver");
const {
  ARTIFACT_MANIFEST_VERSION,
  REQUIRED_ARTIFACTS,
} = require("../../scripts/production-artifact-contract");
const {
  verificationError,
  normalizeRelative,
  assertRoot,
  assertRegularPath,
} = require("./artifact-path-boundary");
const {
  validateManifest,
  readManifest,
} = require("./artifact-manifest-reader");
const {
  readDirectArtifact,
  normalizeAsarEntries,
  readArchiveArtifact,
  readJson,
  readVersionValue,
} = require("./artifact-reader");

let defaultAsar;
try {
  defaultAsar = require("@electron/asar");
} catch (_) {
  defaultAsar = null;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function verifyArtifactPackage(resourcesPath, options) {
  const opts = options || {};
  const io = opts.fs || fs;
  const asarApi = opts.asar || defaultAsar;
  const root = path.resolve(resourcesPath || "");
  const canonicalRoot = assertRoot(io, root);
  const archive = path.join(root, "app.asar");
  const unpacked = path.join(root, "app.asar.unpacked");
  const archiveEntry = assertRegularPath(io, root, archive, false);
  const unpackedEntry = assertRegularPath(io, root, unpacked, true);
  if (
    !asarApi ||
    typeof asarApi.listPackage !== "function" ||
    typeof asarApi.extractFile !== "function"
  )
    throw verificationError(
      "ARTIFACT_ASAR_UNAVAILABLE",
      "ASAR verifier is unavailable",
    );
  const entries = normalizeAsarEntries(asarApi, archiveEntry.absolute);
  const manifestResult = readManifest(root, opts);
  const manifest = manifestResult.manifest;

  function readArtifact(artifact) {
    if (artifact.location === "asar")
      return readArchiveArtifact(
        asarApi,
        archiveEntry.absolute,
        entries,
        artifact.path,
        artifact,
      );
    const base =
      artifact.location === "unpacked" ? unpackedEntry.absolute : root;
    return readDirectArtifact(
      io,
      canonicalRoot,
      path.join(base, artifact.path),
    );
  }

  function loadMetadata(reference, owner) {
    if (!reference || typeof reference !== "object") return null;
    const artifact = {
      location: reference.location || owner.location,
      path: normalizeRelative(reference.path, owner.name),
      name: owner.name + " metadata",
    };
    return readJson(readArtifact(artifact).bytes, owner);
  }

  const packageJson = readArchiveArtifact(
    asarApi,
    archiveEntry.absolute,
    entries,
    "package.json",
    { name: "package.json" },
  );
  const packageValue = readJson(packageJson.bytes, { name: "package.json" });
  if (packageValue.version !== manifest.packageVersion)
    throw verificationError(
      "ARTIFACT_VERSION_MISMATCH",
      "Packaged application version does not match the manifest",
    );

  const verified = manifest.artifacts.map(function (artifact) {
    const loaded = readArtifact(artifact);
    const actualHash = sha256(loaded.bytes);
    if (actualHash.toLowerCase() !== artifact.sha256.toLowerCase())
      throw verificationError(
        "ARTIFACT_HASH_MISMATCH",
        "Packaged artifact hash does not match the manifest",
        artifact.name,
      );
    if (artifact.bytes !== undefined && loaded.bytes.length !== artifact.bytes)
      throw verificationError(
        "ARTIFACT_SIZE_MISMATCH",
        "Packaged artifact size does not match the manifest",
        artifact.name,
      );
    if (
      artifact.executable &&
      artifact.location !== "asar" &&
      !executableFile(io, loaded.canonical, path)
    )
      throw verificationError(
        "ARTIFACT_PERMISSION_INVALID",
        "Packaged executable does not have executable permissions",
        artifact.name,
      );
    if (artifact.versionFrom) {
      const source = loadMetadata(artifact.versionFrom, artifact);
      const actualVersion = readVersionValue(
        source,
        artifact.versionFrom.field || "version",
      );
      if (String(actualVersion) !== String(artifact.version))
        throw verificationError(
          "ARTIFACT_VERSION_MISMATCH",
          "Packaged artifact version does not match the manifest",
          artifact.name,
        );
    }
    return {
      name: artifact.name,
      location: artifact.location,
      relativePath:
        artifact.location === "asar"
          ? "app.asar/" + artifact.path
          : artifact.location === "unpacked"
            ? "app.asar.unpacked/" + artifact.path
            : artifact.path,
      sha256: actualHash,
      bytes: loaded.bytes.length,
      version: artifact.version || null,
      executable: artifact.executable === true,
    };
  });

  return {
    manifest,
    manifestPath: manifestResult.path,
    resourcesPath: canonicalRoot,
    archivePath: archiveEntry.canonical,
    unpackedPath: unpackedEntry.canonical,
    packageVersion: packageValue.version,
    workspaceSchemaVersion: manifest.workspaceSchemaVersion,
    artifacts: verified,
  };
}

module.exports = {
  ARTIFACT_MANIFEST_VERSION,
  REQUIRED_ARTIFACTS,
  verifyArtifactPackage,
  validateManifest,
  readManifest,
  sha256,
  normalizeRelative,
};
