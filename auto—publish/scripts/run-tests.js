"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const TESTS_DIR = path.join(ROOT, "tests");
const TEST_FILE_PATTERN = /\.test\.(?:js|mjs)$/;

function normalizeRelativeFilename(filename) {
  return String(filename || "").replaceAll("\\", "/");
}

function collectTestFiles(excludedFiles) {
  const files = [];
  const excluded = new Set(
    Array.from(excludedFiles || [], normalizeRelativeFilename),
  );

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(filename);
      } else if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
        const relative = path.relative(ROOT, filename);
        if (!excluded.has(normalizeRelativeFilename(relative)))
          files.push(relative);
      }
    }
  }

  visit(TESTS_DIR);
  return files.sort((left, right) => left.localeCompare(right));
}

function parseArguments(args) {
  const excludedFiles = [];
  let list = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--list") {
      list = true;
    } else if (arg === "--exclude") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        process.stderr.write("--exclude requires a test file\n");
        return null;
      }
      excludedFiles.push(value);
      index += 1;
    } else if (arg.startsWith("--exclude=")) {
      const value = arg.slice("--exclude=".length);
      if (!value) {
        process.stderr.write("--exclude requires a test file\n");
        return null;
      }
      excludedFiles.push(value);
    } else {
      process.stderr.write("Unknown test runner option\n");
      return null;
    }
  }
  return { excludedFiles, list };
}

function printCollection(files) {
  process.stdout.write(
    `Collected ${files.length} test files (.test.js/.test.mjs):\n`,
  );
  files.forEach((file) =>
    process.stdout.write(`- ${file.replaceAll("\\", "/")}\n`),
  );
}

function main(args) {
  const options = parseArguments(args);
  if (!options) return 1;
  const files = collectTestFiles(options.excludedFiles);
  printCollection(files);
  if (options.list) return 0;
  if (files.length === 0) {
    process.stderr.write("No test files were collected\n");
    return 1;
  }

  const result = spawnSync(
    process.execPath,
    ["--test", "--test-concurrency=1", ...files],
    {
      cwd: ROOT,
      stdio: "inherit",
      windowsHide: true,
    },
  );
  if (result.error) {
    process.stderr.write(
      `Unable to start Node test runner: ${result.error.message}\n`,
    );
    return 1;
  }
  return typeof result.status === "number" ? result.status : 1;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { collectTestFiles, main, parseArguments };
