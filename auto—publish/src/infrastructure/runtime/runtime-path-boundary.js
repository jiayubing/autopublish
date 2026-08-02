"use strict";

const fs = require("node:fs");

function resolverError(code, message, candidate) {
  const error = new Error(message);
  error.code = code;
  if (candidate) error.candidate = candidate;
  return error;
}

function isWithin(parent, child, pathApi) {
  const relative = pathApi.relative(parent, child);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(".." + pathApi.sep) &&
      !pathApi.isAbsolute(relative))
  );
}

function normalizedAbsolute(value, pathApi, name) {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.includes("\0") ||
    !pathApi.isAbsolute(value)
  ) {
    throw resolverError("PACKAGED_RUNTIME_PATH_INVALID", name + " is invalid");
  }
  return pathApi.resolve(value);
}

function hasAsarVirtualSegment(value, pathApi) {
  const parts = String(value)
    .replace(/[\\/]+/g, pathApi.sep)
    .split(pathApi.sep)
    .map((part) => part.toLowerCase());
  return parts.includes("app.asar");
}

function regularFile(io, filename) {
  try {
    const stat = io.lstatSync(filename);
    return stat.isFile() && !linkLike(stat);
  } catch (_) {
    return false;
  }
}

function regularDirectory(io, directory) {
  try {
    const stat = io.lstatSync(directory);
    return stat.isDirectory() && !linkLike(stat);
  } catch (_) {
    return false;
  }
}

function linkLike(stat) {
  return Boolean(
    stat &&
    ((typeof stat.isSymbolicLink === "function" && stat.isSymbolicLink()) ||
      (typeof stat.isJunction === "function" && stat.isJunction()) ||
      stat.isJunction === true),
  );
}

function realPath(io, filename, pathApi) {
  if (typeof io.realpathSync !== "function") return pathApi.resolve(filename);
  return io.realpathSync(filename);
}

function inspectAncestors(io, root, filename, pathApi) {
  if (!root) return;
  let current = root;
  const relative = pathApi.relative(root, filename);
  if (
    relative === ".." ||
    relative.startsWith(".." + pathApi.sep) ||
    pathApi.isAbsolute(relative)
  ) {
    throw resolverError(
      "PACKAGED_RUNTIME_CANONICAL_ESCAPE",
      "Packaged runtime path escapes its resource root",
      filename,
    );
  }
  for (const segment of relative ? relative.split(pathApi.sep) : []) {
    current = pathApi.join(current, segment);
    let stat;
    try {
      stat = io.lstatSync(current);
    } catch (error) {
      if (error && error.code === "ENOENT") return;
      throw resolverError(
        "PACKAGED_RUNTIME_PATH_UNAVAILABLE",
        "Packaged runtime path is unavailable",
        filename,
      );
    }
    if (linkLike(stat))
      throw resolverError(
        "PACKAGED_RUNTIME_LINK_REJECTED",
        "Packaged runtime path contains a symbolic link or junction",
        filename,
      );
  }
}

function executableFile(io, filename, pathApi) {
  if (!regularFile(io, filename)) return false;
  if (pathApi.sep === "\\" || process.platform === "win32")
    return [".exe", ".com", ".cmd", ".bat"].includes(
      pathApi.extname(filename).toLowerCase(),
    );
  try {
    return (io.statSync(filename).mode & 0o111) !== 0;
  } catch (_) {
    return false;
  }
}

function validateCandidate(candidate, options) {
  const opts = options || {};
  const io = opts.fs || fs;
  const pathApi = opts.path || require("node:path");
  const absolute = normalizedAbsolute(
    candidate,
    pathApi,
    opts.name || "runtime path",
  );
  if (hasAsarVirtualSegment(absolute, pathApi))
    throw resolverError(
      "PACKAGED_ASAR_PATH_REJECTED",
      "Packaged runtime resources must not use an ASAR virtual path",
      absolute,
    );

  let stat;
  try {
    stat = io.lstatSync(absolute);
  } catch (error) {
    if (error && error.code === "ENOENT")
      throw resolverError(
        "PACKAGED_RUNTIME_PATH_MISSING",
        "Packaged runtime resource is missing",
        absolute,
      );
    throw resolverError(
      "PACKAGED_RUNTIME_PATH_UNAVAILABLE",
      "Packaged runtime resource is unavailable",
      absolute,
    );
  }
  if (linkLike(stat))
    throw resolverError(
      "PACKAGED_RUNTIME_LINK_REJECTED",
      "Packaged runtime resource must be a regular file or directory",
      absolute,
    );
  if (opts.directory ? !stat.isDirectory() : !stat.isFile())
    throw resolverError(
      "PACKAGED_RUNTIME_NOT_REGULAR",
      "Packaged runtime resource is not a regular file or directory",
      absolute,
    );
  if (
    !opts.directory &&
    opts.executable &&
    !executableFile(io, absolute, pathApi)
  )
    throw resolverError(
      "PACKAGED_RUNTIME_NOT_EXECUTABLE",
      "Packaged runtime executable is not executable",
      absolute,
    );

  const root = opts.root
    ? normalizedAbsolute(opts.root, pathApi, "resource root")
    : null;
  if (root) {
    if (hasAsarVirtualSegment(root, pathApi))
      throw resolverError(
        "PACKAGED_ASAR_PATH_REJECTED",
        "Packaged resource root must not be an ASAR virtual path",
        root,
      );
    if (!regularDirectory(io, root))
      throw resolverError(
        "PACKAGED_RUNTIME_ROOT_UNAVAILABLE",
        "Packaged resource root is unavailable",
        root,
      );
    inspectAncestors(io, root, absolute, pathApi);
  }

  let canonicalRoot = root;
  let canonicalCandidate;
  try {
    canonicalCandidate = realPath(io, absolute, pathApi);
    if (root) canonicalRoot = realPath(io, root, pathApi);
  } catch (_) {
    throw resolverError(
      "PACKAGED_RUNTIME_CANONICAL_UNAVAILABLE",
      "Packaged runtime canonical path could not be resolved",
      absolute,
    );
  }
  if (
    typeof canonicalCandidate !== "string" ||
    !pathApi.isAbsolute(canonicalCandidate) ||
    (canonicalRoot &&
      (!pathApi.isAbsolute(canonicalRoot) ||
        !isWithin(canonicalRoot, canonicalCandidate, pathApi)))
  )
    throw resolverError(
      "PACKAGED_RUNTIME_CANONICAL_ESCAPE",
      "Packaged runtime path escapes its resource root",
      absolute,
    );
  return {
    path: canonicalCandidate,
    requestedPath: absolute,
    canonicalRoot: canonicalRoot || null,
  };
}

module.exports = {
  resolverError,
  isWithin,
  normalizedAbsolute,
  hasAsarVirtualSegment,
  regularFile,
  regularDirectory,
  linkLike,
  executableFile,
  validateCandidate,
};
