"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  isWithin,
} = require("../../src/infrastructure/runtime/packaged-runtime-resolver");

function verificationError(code, message, artifact) {
  const error = new Error(message);
  error.code = code;
  if (artifact) error.artifact = artifact;
  return error;
}

function linkLike(stat) {
  return Boolean(
    stat &&
    ((typeof stat.isSymbolicLink === "function" && stat.isSymbolicLink()) ||
      (typeof stat.isJunction === "function" && stat.isJunction()) ||
      stat.isJunction === true),
  );
}

function normalizeRelative(value, name) {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.includes("\0") ||
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value)
  )
    throw verificationError(
      "ARTIFACT_MANIFEST_PATH_INVALID",
      name + " is invalid",
    );
  const normalized = value.replace(/[\\]+/g, "/");
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === ""))
    throw verificationError(
      "ARTIFACT_MANIFEST_PATH_INVALID",
      name + " is invalid",
    );
  return parts.join("/");
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
  if (linkLike(stat) || !stat.isDirectory())
    throw verificationError(
      "ARTIFACT_ROOT_INVALID",
      "Production resources directory is invalid",
    );
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
  if (!isWithin(canonicalRoot, absolute, path))
    throw verificationError(
      "ARTIFACT_CANONICAL_ESCAPE",
      "Artifact path escapes the production resources directory",
    );
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
    if (linkLike(stat))
      throw verificationError(
        "ARTIFACT_LINK_REJECTED",
        "Packaged artifact contains a symbolic link or junction",
        absolute,
      );
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
  if (directory ? !stat.isDirectory() : !stat.isFile())
    throw verificationError(
      "ARTIFACT_NOT_REGULAR",
      "Packaged artifact is not a regular file",
      absolute,
    );
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
  if (!isWithin(canonicalRoot, canonical, path))
    throw verificationError(
      "ARTIFACT_CANONICAL_ESCAPE",
      "Artifact canonical path escapes the production resources directory",
      absolute,
    );
  return { absolute, canonical, stat };
}

module.exports = {
  verificationError,
  linkLike,
  normalizeRelative,
  assertRoot,
  assertRegularPath,
};
