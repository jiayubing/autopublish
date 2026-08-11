"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_PARALLEL_CONCURRENCY = 4;

const SERIAL_NAME_RULES = Object.freeze([
  [
    /(?:capacity|migration)/i,
    "capacity and migration tests use shared runtime or migration boundaries",
  ],
  [
    /(?:packaging|release-evidence|alpha-smoke)/i,
    "packaging and release evidence use public artifact outputs",
  ],
  [
    /production-ipc|legacy-path-absence/i,
    "production and legacy absence checks inspect shared packaged outputs",
  ],
  [
    /phase-04-platform-run|phase-08-cleanup-gates/i,
    "platform lifecycle and Phase 8 gate tests own shared process state",
  ],
  [
    /renderer-harness|renderer-contract-artifact-absence|\.electron\.test\./i,
    "Renderer harness and Electron tests use browser or process resources",
  ],
]);

const SERIAL_SOURCE_RULES = Object.freeze([
  [
    /startRenderer|renderer-harness|chromium\.launch|vite[^\n]*--port|\.listen\s*\(/i,
    "Renderer harness or fixed-port resource",
  ],
  [
    /BrowserWindow|app\.whenReady|electron-builder|electron\.asar|require\(["']electron|from ["']electron/i,
    "Electron or packaging resource",
  ],
  [
    /process\.chdir\s*\(|process\.env\.[A-Z_][A-Z0-9_]*\s*=/,
    "process-global mutable state",
  ],
  [
    /release-(?:alpha|production)|build[\\/]evidence|release-production-smoke/i,
    "shared build or release output",
  ],
]);

function normalizeRelativeFilename(filename) {
  return String(filename || "").replaceAll("\\", "/");
}

function sourceFor(filename, root) {
  const absolute = path.resolve(root || ROOT, filename);
  try {
    return fs.readFileSync(absolute, "utf8");
  } catch (_) {
    const error = new Error("Test source is unavailable");
    error.code = "TEST_RUNNER_SOURCE_UNAVAILABLE";
    throw error;
  }
}

function classifyTestFile(filename, options) {
  const file = normalizeRelativeFilename(filename);
  const nameRule = SERIAL_NAME_RULES.find(([pattern]) => pattern.test(file));
  if (nameRule)
    return Object.freeze({ file, pool: "serial", reason: nameRule[1] });

  const source = sourceFor(file, options && options.root);
  const sourceRule = SERIAL_SOURCE_RULES.find(([pattern]) =>
    pattern.test(source),
  );
  if (sourceRule)
    return Object.freeze({ file, pool: "serial", reason: sourceRule[1] });

  if (
    /DatabaseSync|createOperationalStore/.test(source) &&
    !/mkdtempSync|os\.tmpdir/.test(source)
  )
    return Object.freeze({
      file,
      pool: "serial",
      reason: "SQLite test has no explicit isolated temporary workspace",
    });

  return Object.freeze({
    file,
    pool: "parallel",
    reason: "pure, contract, in-memory, or explicitly temporary fixture",
  });
}

function createExecutionPlan(files, options) {
  const normalized = Array.from(files || [], normalizeRelativeFilename);
  if (new Set(normalized).size !== normalized.length)
    throw new Error("TEST_RUNNER_DUPLICATE_FILE");
  const classifications = normalized.map((file) =>
    classifyTestFile(file, options),
  );
  const assigned = new Set();
  for (const classification of classifications) {
    if (
      assigned.has(classification.file) ||
      !["parallel", "serial"].includes(classification.pool)
    )
      throw new Error("TEST_RUNNER_POOL_ASSIGNMENT_INVALID");
    assigned.add(classification.file);
  }
  if (assigned.size !== normalized.length)
    throw new Error("TEST_RUNNER_POOL_ASSIGNMENT_INCOMPLETE");
  const parallelConcurrency =
    options && Number.isInteger(options.parallelConcurrency)
      ? options.parallelConcurrency
      : DEFAULT_PARALLEL_CONCURRENCY;
  if (parallelConcurrency < 1 || parallelConcurrency > 4)
    throw new Error("TEST_RUNNER_CONCURRENCY_INVALID");
  const parallelFiles = classifications
    .filter((item) => item.pool === "parallel")
    .map((item) => item.file);
  const serialFiles = classifications
    .filter((item) => item.pool === "serial")
    .map((item) => item.file);
  if (parallelFiles.length + serialFiles.length !== normalized.length)
    throw new Error("TEST_RUNNER_POOL_PARTITION_INCOMPLETE");
  return Object.freeze({
    allFiles: Object.freeze(normalized),
    classifications: Object.freeze(classifications),
    parallelFiles: Object.freeze(parallelFiles),
    serialFiles: Object.freeze(serialFiles),
    parallelConcurrency,
  });
}

module.exports = {
  DEFAULT_PARALLEL_CONCURRENCY,
  classifyTestFile,
  createExecutionPlan,
  normalizeRelativeFilename,
};
