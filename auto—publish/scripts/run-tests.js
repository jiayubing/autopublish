"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const TESTS_DIR = path.join(ROOT, "tests");
const TEST_FILE_PATTERN = /\.test\.(?:js|mjs)$/;

function collectTestFiles() {
  const files = [];

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(filename);
      } else if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
        files.push(path.relative(ROOT, filename));
      }
    }
  }

  visit(TESTS_DIR);
  return files.sort((left, right) => left.localeCompare(right));
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
  const files = collectTestFiles();
  printCollection(files);
  if (args.includes("--list")) return 0;
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

module.exports = { collectTestFiles, main };
