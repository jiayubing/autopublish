"use strict";

const path = require("node:path");
const {
  verificationError,
  assertRegularPath,
} = require("./artifact-path-boundary");

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
  if (!entries.has(relative))
    throw verificationError(
      "ARTIFACT_FILE_MISSING",
      "ASAR artifact is missing",
      artifact && artifact.name,
    );
  let bytes;
  try {
    bytes = asarApi.extractFile(archive, path.normalize(relative));
  } catch (_) {
    throw verificationError(
      "ARTIFACT_NOT_REGULAR",
      "ASAR artifact is not a regular file",
      artifact && artifact.name,
    );
  }
  if (!Buffer.isBuffer(bytes))
    throw verificationError(
      "ARTIFACT_NOT_REGULAR",
      "ASAR artifact is not a regular file",
      artifact && artifact.name,
    );
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
    .reduce(
      (current, key) =>
        current && typeof current === "object" ? current[key] : undefined,
      value,
    );
}

module.exports = {
  readDirectArtifact,
  normalizeAsarEntries,
  readArchiveArtifact,
  readJson,
  readVersionValue,
};
