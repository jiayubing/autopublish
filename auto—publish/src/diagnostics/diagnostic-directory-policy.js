"use strict";

const fs = require("node:fs");
const path = require("node:path");

function policyError(code) {
  const error = new Error("Diagnostic log directory is unsafe");
  error.code = code;
  return error;
}

function absolute(value, code) {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.includes("\0") ||
    !path.isAbsolute(value)
  )
    throw policyError(code || "DIAGNOSTIC_DIRECTORY_PATH_INVALID");
  return path.resolve(value);
}

function within(parent, child) {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!relative.startsWith(".." + path.sep) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function symbolic(stat) {
  return Boolean(
    stat &&
    ((typeof stat.isSymbolicLink === "function" && stat.isSymbolicLink()) ||
      (typeof stat.isJunction === "function" && stat.isJunction()) ||
      stat.isJunction === true),
  );
}

function existingStat(io, filename) {
  try {
    return io.lstatSync(filename);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

function checkSegments(io, filename) {
  const parsed = path.parse(filename);
  const relative = path.relative(parsed.root, filename);
  let current = parsed.root;
  if (!relative) return;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = existingStat(io, current);
    if (stat && symbolic(stat))
      throw policyError("DIAGNOSTIC_DIRECTORY_SYMLINK");
  }
}

function safeRealpath(io, filename) {
  try {
    const realpath =
      io.realpathSync && (io.realpathSync.native || io.realpathSync);
    return realpath ? realpath.call(io, filename) : path.resolve(filename);
  } catch (_) {
    throw policyError("DIAGNOSTIC_DIRECTORY_CANONICAL_PATH_INVALID");
  }
}

function canonicalWithin(io, parent, child) {
  return within(safeRealpath(io, parent), safeRealpath(io, child));
}

function permissionError(error) {
  return Boolean(error && ["EACCES", "EPERM", "EROFS"].includes(error.code));
}

function createDiagnosticDirectoryPolicy(options) {
  const opts = options || {};
  const io = opts.fs || fs;
  const directory = absolute(
    opts.directory,
    "DIAGNOSTIC_DIRECTORY_PATH_INVALID",
  );
  const root = absolute(
    opts.root || directory,
    "DIAGNOSTIC_DIRECTORY_ROOT_INVALID",
  );
  if (!within(root, directory))
    throw policyError("DIAGNOSTIC_DIRECTORY_PATH_ESCAPE");
  const mode = Number.isInteger(opts.mode) ? opts.mode : 0o700;

  function assertLexical(filename) {
    const candidate = absolute(filename, "DIAGNOSTIC_LOG_PATH_INVALID");
    if (!within(root, candidate))
      throw policyError("DIAGNOSTIC_DIRECTORY_PATH_ESCAPE");
    return candidate;
  }

  function ensureDirectory() {
    try {
      checkSegments(io, root);
      const existingRoot = existingStat(io, root);
      if (
        existingRoot &&
        (symbolic(existingRoot) || !existingRoot.isDirectory())
      )
        throw policyError("DIAGNOSTIC_DIRECTORY_NOT_DIRECTORY");
      io.mkdirSync(root, { recursive: true, mode });
      if (typeof io.chmodSync === "function") io.chmodSync(root, mode);
      checkSegments(io, root);
      const rootStat = io.lstatSync(root);
      if (!rootStat.isDirectory() || symbolic(rootStat))
        throw policyError("DIAGNOSTIC_DIRECTORY_NOT_DIRECTORY");
      const canonicalRoot = safeRealpath(io, root);

      checkSegments(io, directory);
      const existingDirectory = existingStat(io, directory);
      if (
        existingDirectory &&
        (symbolic(existingDirectory) || !existingDirectory.isDirectory())
      )
        throw policyError("DIAGNOSTIC_DIRECTORY_NOT_DIRECTORY");
      io.mkdirSync(directory, { recursive: true, mode });
      if (typeof io.chmodSync === "function") io.chmodSync(directory, mode);
      checkSegments(io, directory);
      const directoryStat = io.lstatSync(directory);
      if (!directoryStat.isDirectory() || symbolic(directoryStat))
        throw policyError("DIAGNOSTIC_DIRECTORY_NOT_DIRECTORY");
      const canonicalDirectory = safeRealpath(io, directory);
      if (!within(canonicalRoot, canonicalDirectory))
        throw policyError("DIAGNOSTIC_DIRECTORY_PATH_ESCAPE");
      return directory;
    } catch (error) {
      if (error && /^DIAGNOSTIC_/.test(error.code || "")) throw error;
      if (permissionError(error))
        throw policyError("DIAGNOSTIC_DIRECTORY_PERMISSION_DENIED");
      throw policyError("DIAGNOSTIC_DIRECTORY_CREATE_FAILED");
    }
  }

  function resolveChild(filename) {
    if (
      typeof filename !== "string" ||
      filename.length < 1 ||
      filename.length > 128 ||
      filename === "." ||
      filename === ".." ||
      /[\\/\0]/.test(filename)
    )
      throw policyError("DIAGNOSTIC_LOG_FILENAME_INVALID");
    ensureDirectory();
    const candidate = assertLexical(path.join(directory, filename));
    const canonicalRoot = safeRealpath(io, root);
    const parentCanonical = safeRealpath(io, path.dirname(candidate));
    if (!within(canonicalRoot, parentCanonical))
      throw policyError("DIAGNOSTIC_DIRECTORY_PATH_ESCAPE");
    const stat = existingStat(io, candidate);
    if (stat && symbolic(stat)) throw policyError("DIAGNOSTIC_LOG_SYMLINK");
    if (stat && (!stat.isFile() || stat.isDirectory()))
      throw policyError("DIAGNOSTIC_LOG_FILE_INVALID");
    if (stat && !within(canonicalRoot, safeRealpath(io, candidate)))
      throw policyError("DIAGNOSTIC_DIRECTORY_PATH_ESCAPE");
    return candidate;
  }

  function listRegularFiles() {
    ensureDirectory();
    const files = [];
    let names;
    try {
      names = io.readdirSync(directory);
    } catch (error) {
      if (permissionError(error))
        throw policyError("DIAGNOSTIC_DIRECTORY_PERMISSION_DENIED");
      throw policyError("DIAGNOSTIC_DIRECTORY_READ_FAILED");
    }
    let skipped = 0;
    names.forEach(function (name) {
      let candidate;
      try {
        candidate = resolveChild(name);
      } catch (error) {
        if (error && error.code === "DIAGNOSTIC_DIRECTORY_PERMISSION_DENIED")
          throw error;
        skipped += 1;
        return;
      }
      const stat = existingStat(io, candidate);
      if (!stat || symbolic(stat) || !stat.isFile()) {
        skipped += 1;
        return;
      }
      files.push({ path: candidate, stat });
    });
    return { files, skipped };
  }

  function assertRegularFile(filename) {
    const candidate = resolveChild(filename);
    const stat = existingStat(io, candidate);
    if (!stat || symbolic(stat) || !stat.isFile())
      throw policyError("DIAGNOSTIC_LOG_FILE_INVALID");
    return { path: candidate, stat };
  }

  return Object.freeze({
    directory,
    root,
    mode,
    ensureDirectory,
    resolveChild,
    safePath: resolveChild,
    listRegularFiles,
    assertRegularFile,
    isWithin: (candidate) => {
      try {
        const lexical = absolute(candidate, "DIAGNOSTIC_LOG_PATH_INVALID");
        if (!within(root, lexical)) return false;
        const canonicalRoot = safeRealpath(io, root);
        const stat = existingStat(io, lexical);
        const canonicalCandidate = stat
          ? safeRealpath(io, lexical)
          : safeRealpath(io, path.dirname(lexical));
        return within(canonicalRoot, canonicalCandidate);
      } catch (_) {
        return false;
      }
    },
  });
}

module.exports = {
  createDiagnosticDirectoryPolicy,
  within,
  policyError,
  canonicalWithin,
};
