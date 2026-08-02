"use strict";

const path = require("node:path");

function filenameFor(index) {
  return index === 0 ? "diagnostics.jsonl" : "diagnostics." + index + ".jsonl";
}

function fileIndex(filename) {
  const match = path
    .basename(filename)
    .match(/^diagnostics(?:\.(\d+))?\.jsonl$/);
  if (!match) return null;
  const index = Number(match[1] || 0);
  return Number.isSafeInteger(index) ? index : null;
}

function createDiagnosticRotation(options) {
  const opts = options || {};
  const io = opts.fs;
  const policy = opts.policy;
  const maxFiles = opts.maxFiles;
  const maxTotalBytes = opts.maxTotalBytes;
  const remove = opts.remove;
  const rename = opts.rename;
  if (
    !io ||
    !policy ||
    typeof remove !== "function" ||
    typeof rename !== "function"
  )
    throw new TypeError("Diagnostic rotation dependencies are required");

  function listFiles() {
    return policy
      .listRegularFiles()
      .files.map((item) => ({ ...item, index: fileIndex(item.path) }))
      .filter((item) => item.index !== null)
      .sort((left, right) => left.index - right.index);
  }

  function oldestFirst(files) {
    return files.slice().sort((left, right) => {
      if (left.index !== right.index) return right.index - left.index;
      return Number(left.stat.mtimeMs || 0) - Number(right.stat.mtimeMs || 0);
    });
  }

  function usage(files) {
    return (files || listFiles()).reduce(
      (total, item) => total + Number(item.stat.size || 0),
      0,
    );
  }

  function exists(filename) {
    return io.existsSync(policy.resolveChild(filename));
  }

  function rotate() {
    policy.ensureDirectory();
    if (maxFiles === 1) {
      if (exists(filenameFor(0))) remove(filenameFor(0));
      return;
    }
    for (let index = maxFiles - 1; index >= 1; index -= 1) {
      const source = filenameFor(index - 1);
      const target = filenameFor(index);
      if (!exists(source)) continue;
      if (exists(target)) remove(target);
      rename(source, target);
    }
  }

  function enforceCapacity() {
    let removed = 0;
    let files = listFiles();
    while (files.length > maxFiles) {
      const candidate = oldestFirst(files)[0];
      removed += remove(candidate.path);
      files = listFiles();
    }
    while (usage(files) > maxTotalBytes && files.length > 1) {
      const rotated = oldestFirst(files).find((item) => item.index > 0);
      if (!rotated) break;
      removed += remove(rotated.path);
      files = listFiles();
    }
    if (usage(files) > maxTotalBytes && files.length === 1)
      removed += remove(files[0].path);
    return removed;
  }

  return Object.freeze({
    listFiles,
    usage,
    rotate,
    enforceCapacity,
    filenameFor,
    fileIndex,
  });
}

module.exports = { createDiagnosticRotation, filenameFor, fileIndex };
