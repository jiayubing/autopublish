"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  executableFile,
  isWithin,
} = require("../../src/infrastructure/runtime/packaged-runtime-resolver");
const {
  DEFINITIONS,
} = require("../../scripts/create-production-artifact-manifest");

let defaultAsar;
try {
  defaultAsar = require("@electron/asar");
} catch (_) {
  defaultAsar = null;
}

const ARTIFACT_MANIFEST_VERSION = 1;
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

function verificationError(code, message, artifact) {
  const error = new Error(message);
  error.code = code;
  if (artifact) error.artifact = artifact;
  return error;
}

function normalizeRelative(value, name) {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.includes("\0") ||
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value)
  ) {
    throw verificationError(
      "ARTIFACT_MANIFEST_PATH_INVALID",
      name + " is invalid",
    );
  }
  const normalized = value.replace(/[\\]+/g, "/");
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === "")) {
    throw verificationError(
      "ARTIFACT_MANIFEST_PATH_INVALID",
      name + " is invalid",
    );
  }
  return parts.join("/");
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function assertRoot(io, root) {
  let stat;
  try {
    stat = io.lstatSync(root);
  } catch (_) {
    throw verificationError(
      "ARTIFACT_ROOT_MISSING",
      "Production resources directory is missing",
    );
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw verificationError(
      "ARTIFACT_ROOT_INVALID",
      "Production resources directory is invalid",
    );
  }
  try {
    const canonical = io.realpathSync(root);
    if (!path.isAbsolute(canonical)) throw new Error("not absolute");
    return canonical;
  } catch (_) {
    throw verificationError(
      "ARTIFACT_ROOT_CANONICAL_INVALID",
      "Production resources directory is invalid",
    );
  }
}

function assertRegularPath(io, root, filename, directory) {
  const absolute = path.resolve(filename);
  const canonicalRoot = path.resolve(root);
  if (!isWithin(canonicalRoot, absolute, path)) {
    throw verificationError(
      "ARTIFACT_CANONICAL_ESCAPE",
      "Artifact path escapes the production resources directory",
    );
  }
  let current = canonicalRoot;
  const relative = path.relative(canonicalRoot, absolute);
  for (const segment of relative ? relative.split(path.sep) : []) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = io.lstatSync(current);
    } catch (_) {
      throw verificationError(
        "ARTIFACT_FILE_MISSING",
        "Packaged artifact is missing",
        absolute,
      );
    }
    if (stat.isSymbolicLink()) {
      throw verificationError(
        "ARTIFACT_LINK_REJECTED",
        "Packaged artifact contains a symbolic link or junction",
        absolute,
      );
    }
  }
  let stat;
  try {
    stat = io.lstatSync(absolute);
  } catch (_) {
    throw verificationError(
      "ARTIFACT_FILE_MISSING",
      "Packaged artifact is missing",
      absolute,
    );
  }
  if (directory ? !stat.isDirectory() : !stat.isFile()) {
    throw verificationError(
      "ARTIFACT_NOT_REGULAR",
      "Packaged artifact is not a regular file",
      absolute,
    );
  }
  let canonical;
  try {
    canonical = io.realpathSync(absolute);
  } catch (_) {
    throw verificationError(
      "ARTIFACT_CANONICAL_INVALID",
      "Packaged artifact canonical path is unavailable",
      absolute,
    );
  }
  if (!isWithin(canonicalRoot, canonical, path)) {
    throw verificationError(
      "ARTIFACT_CANONICAL_ESCAPE",
      "Artifact canonical path escapes the production resources directory",
      absolute,
    );
  }
  return { absolute, canonical, stat };
}

function readDirectArtifact(io, root, filename) {
  const checked = assertRegularPath(io, root, filename, false);
  const bytes = io.readFileSync(checked.absolute);
  return { bytes, canonical: checked.canonical, stat: checked.stat };
}

function normalizeAsarEntries(asarApi, archive) {
  try {
    return new Set(
      asarApi
        .listPackage(archive)
        .map((entry) => entry.replace(/^[/\\]+/, "").replace(/\\/g, "/")),
    );
  } catch (_) {
    throw verificationError(
      "ARTIFACT_ASAR_INVALID",
      "Production ASAR archive is invalid",
    );
  }
}

function readArchiveArtifact(asarApi, archive, entries, relative, artifact) {
  if (!entries.has(relative)) {
    throw verificationError(
      "ARTIFACT_FILE_MISSING",
      "ASAR artifact is missing",
      artifact.name,
    );
  }
  let bytes;
  try {
    // @electron/asar traverses archive paths with the host separator on
    // Windows, while the manifest intentionally stores portable `/` paths.
    bytes = asarApi.extractFile(archive, path.normalize(relative));
  } catch (_) {
    throw verificationError(
      "ARTIFACT_NOT_REGULAR",
      "ASAR artifact is not a regular file",
      artifact.name,
    );
  }
  if (!Buffer.isBuffer(bytes)) {
    throw verificationError(
      "ARTIFACT_NOT_REGULAR",
      "ASAR artifact is not a regular file",
      artifact.name,
    );
  }
  return { bytes, canonical: null, stat: null };
}

function readJson(bytes, artifact) {
  try {
    const value = JSON.parse(bytes.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("object required");
    return value;
  } catch (_) {
    throw verificationError(
      "ARTIFACT_METADATA_INVALID",
      "Packaged artifact metadata is invalid",
      artifact && artifact.name,
    );
  }
}

function readVersionValue(value, field) {
  return String(field || "")
    .split(".")
    .reduce(function (current, key) {
      return current && typeof current === "object" ? current[key] : undefined;
    }, value);
}

function validateManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw verificationError(
      "ARTIFACT_MANIFEST_INVALID",
      "Production artifact manifest is invalid",
    );
  }
  const manifestVersion =
    value.manifestVersion === undefined ? value.version : value.manifestVersion;
  if (
    manifestVersion !== ARTIFACT_MANIFEST_VERSION ||
    !Array.isArray(value.artifacts) ||
    value.artifacts.length === 0
  ) {
    throw verificationError(
      "ARTIFACT_MANIFEST_INVALID",
      "Production artifact manifest is invalid",
    );
  }
  if (
    typeof value.packageVersion !== "string" ||
    value.packageVersion.trim() === ""
  ) {
    throw verificationError(
      "ARTIFACT_MANIFEST_INVALID",
      "Production artifact manifest version is invalid",
    );
  }
  if (
    !Number.isSafeInteger(value.workspaceSchemaVersion) ||
    value.workspaceSchemaVersion < 1
  ) {
    throw verificationError(
      "ARTIFACT_MANIFEST_INVALID",
      "Production artifact schema version is invalid",
    );
  }
  if (value.artifacts.length !== REQUIRED_ARTIFACTS.length) {
    throw verificationError(
      "ARTIFACT_MANIFEST_INVENTORY_INVALID",
      "Production artifact inventory is incomplete",
    );
  }
  const expectedByName = new Map(
    REQUIRED_ARTIFACTS.map((artifact) => [artifact.name, artifact]),
  );
  const names = new Set();
  return Object.assign({}, value, {
    manifestVersion,
    artifacts: value.artifacts.map(function (artifact) {
      if (
        !artifact ||
        typeof artifact !== "object" ||
        Array.isArray(artifact)
      ) {
        throw verificationError(
          "ARTIFACT_MANIFEST_INVALID",
          "Production artifact entry is invalid",
        );
      }
      const expected = expectedByName.get(artifact.name);
      if (
        typeof artifact.name !== "string" ||
        names.has(artifact.name) ||
        !expected
      ) {
        throw verificationError(
          "ARTIFACT_MANIFEST_INVENTORY_INVALID",
          "Production artifact name is invalid",
        );
      }
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
      ) {
        throw verificationError(
          "ARTIFACT_MANIFEST_INVENTORY_INVALID",
          "Production artifact inventory entry does not match the required package boundary",
          artifact.name,
        );
      }
      if (!/^[a-f0-9]{64}$/i.test(artifact.sha256 || "")) {
        throw verificationError(
          "ARTIFACT_MANIFEST_INVALID",
          "Production artifact hash is invalid",
          artifact.name,
        );
      }
      if (
        artifact.bytes !== undefined &&
        (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0)
      ) {
        throw verificationError(
          "ARTIFACT_MANIFEST_INVALID",
          "Production artifact size is invalid",
          artifact.name,
        );
      }
      if (
        artifact.version !== undefined &&
        (typeof artifact.version !== "string" || artifact.version.trim() === "")
      ) {
        throw verificationError(
          "ARTIFACT_MANIFEST_INVALID",
          "Production artifact version is invalid",
          artifact.name,
        );
      }
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
  ) {
    throw verificationError(
      "ARTIFACT_ASAR_UNAVAILABLE",
      "ASAR verifier is unavailable",
    );
  }
  const entries = normalizeAsarEntries(asarApi, archiveEntry.absolute);
  const manifestResult = readManifest(root, opts);
  const manifest = manifestResult.manifest;
  const verified = [];
  const metadata = new Map();

  function readArtifact(artifact) {
    if (artifact.location === "asar") {
      return readArchiveArtifact(
        asarApi,
        archiveEntry.absolute,
        entries,
        artifact.path,
        artifact,
      );
    }
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
    const location = reference.location || owner.location;
    const artifact = {
      location,
      path: normalizeRelative(reference.path, owner.name),
      name: owner.name + " metadata",
    };
    const loaded = readArtifact(artifact);
    return readJson(loaded.bytes, owner);
  }

  const packageJson = readArchiveArtifact(
    asarApi,
    archiveEntry.absolute,
    entries,
    "package.json",
    { name: "package.json" },
  );
  const packageValue = readJson(packageJson.bytes, { name: "package.json" });
  if (packageValue.version !== manifest.packageVersion) {
    throw verificationError(
      "ARTIFACT_VERSION_MISMATCH",
      "Packaged application version does not match the manifest",
    );
  }

  for (const artifact of manifest.artifacts) {
    const loaded = readArtifact(artifact);
    const actualHash = sha256(loaded.bytes);
    if (actualHash.toLowerCase() !== artifact.sha256.toLowerCase()) {
      throw verificationError(
        "ARTIFACT_HASH_MISMATCH",
        "Packaged artifact hash does not match the manifest",
        artifact.name,
      );
    }
    if (
      artifact.bytes !== undefined &&
      loaded.bytes.length !== artifact.bytes
    ) {
      throw verificationError(
        "ARTIFACT_SIZE_MISMATCH",
        "Packaged artifact size does not match the manifest",
        artifact.name,
      );
    }
    if (
      artifact.executable &&
      artifact.location !== "asar" &&
      !executableFile(io, loaded.canonical, path)
    ) {
      throw verificationError(
        "ARTIFACT_PERMISSION_INVALID",
        "Packaged executable does not have executable permissions",
        artifact.name,
      );
    }
    if (artifact.versionFrom) {
      const source = loadMetadata(artifact.versionFrom, artifact);
      const actualVersion = readVersionValue(
        source,
        artifact.versionFrom.field || "version",
      );
      if (String(actualVersion) !== String(artifact.version)) {
        throw verificationError(
          "ARTIFACT_VERSION_MISMATCH",
          "Packaged artifact version does not match the manifest",
          artifact.name,
        );
      }
    }
    metadata.set(artifact.name, artifact);
    verified.push({
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
    });
  }

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
