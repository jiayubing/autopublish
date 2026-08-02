"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DEFINITIONS } = require("./production-artifact-contract");

function manifestError(message) {
  const error = new Error(message);
  error.code = "ARTIFACT_MANIFEST_BUILD_FAILED";
  return error;
}

function regularFile(filename, io) {
  const fileSystem = io || fs;
  try {
    const stat = fileSystem.lstatSync(filename);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (_) {
    return false;
  }
}

function hash(filename, io) {
  return crypto
    .createHash("sha256")
    .update((io || fs).readFileSync(filename))
    .digest("hex");
}

function readJson(filename, io) {
  try {
    return JSON.parse((io || fs).readFileSync(filename, "utf8"));
  } catch (_) {
    throw manifestError("Required production artifact metadata is unavailable");
  }
}

function readVersion(value, field) {
  return String(
    String(field || "version")
      .split(".")
      .reduce((current, key) => current && current[key], value) || "",
  );
}

function collectProductionArtifactEntries(root, options) {
  const opts = options || {};
  const io = opts.fs || fs;
  const definitions = opts.definitions || DEFINITIONS;
  return definitions.map(function (definition) {
    const sourcePath = path.join(root, definition.source);
    if (!regularFile(sourcePath, io))
      throw manifestError("Missing production artifact: " + definition.source);
    const entry = {
      name: definition.name,
      location: definition.location,
      path: definition.target,
      sha256: hash(sourcePath, io),
      bytes: io.statSync(sourcePath).size,
    };
    if (definition.executable) entry.executable = true;
    if (definition.versionSource) {
      const sourceValue = readJson(
        path.join(root, definition.versionSource.source),
        io,
      );
      const version = readVersion(sourceValue, definition.versionSource.field);
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
}

module.exports = {
  manifestError,
  regularFile,
  hash,
  readJson,
  readVersion,
  collectProductionArtifactEntries,
};
