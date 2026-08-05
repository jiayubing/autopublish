"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

function evidenceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parseArguments(argv) {
  const args = Array.from(argv || []);
  const options = { tests: [] };
  while (args.length) {
    const arg = args.shift();
    if (["--output", "--operation", "--test"].includes(arg)) {
      const value = args.shift();
      if (!value || value.startsWith("--"))
        throw evidenceError(
          "TEST_SUITE_ARGUMENT_INVALID",
          arg + " requires a value",
        );
      if (arg === "--output") options.output = path.resolve(value);
      else if (arg === "--operation") options.operation = value;
      else options.tests.push(value.replaceAll("\\", "/"));
    } else {
      throw evidenceError("TEST_SUITE_ARGUMENT_INVALID", "unknown option");
    }
  }
  if (!options.output || !options.operation || options.tests.length === 0)
    throw evidenceError(
      "TEST_SUITE_ARGUMENT_INVALID",
      "output, operation, and at least one test are required",
    );
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,100}$/.test(options.operation))
    throw evidenceError("TEST_SUITE_ARGUMENT_INVALID", "operation is invalid");
  return options;
}

function lastNumber(text, label) {
  const matches = [
    ...text.matchAll(new RegExp("\\u2139 " + label + " (\\d+)", "g")),
  ];
  return matches.length ? Number(matches.at(-1)[1]) : 0;
}

function createTestSuiteEvidence(options) {
  const opts = options || {};
  const tests = opts.tests.map((value) => path.resolve(ROOT, value));
  const startedAt = Date.now();
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-concurrency=1", ...tests],
    {
      cwd: ROOT,
      encoding: "utf8",
      windowsHide: true,
    },
  );
  const output = String(result.stdout || "") + String(result.stderr || "");
  const passed = lastNumber(output, "pass");
  const failed = lastNumber(output, "fail") + (result.status === 0 ? 0 : 1);
  const skipped = lastNumber(output, "skipped");
  const count = lastNumber(output, "tests");
  const report = {
    status: result.status === 0 && failed === 0 ? "PASSED" : "FAILED",
    operation: opts.operation,
    suite: "node-test",
    testFiles: tests.length,
    count,
    passed,
    failed,
    skipped,
    durationMs: Date.now() - startedAt,
    sha256: crypto
      .createHash("sha256")
      .update(tests.map((filename) => fs.readFileSync(filename)).join(""))
      .digest("hex"),
  };
  fs.mkdirSync(path.dirname(opts.output), { recursive: true });
  fs.writeFileSync(opts.output, JSON.stringify(report, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  if (report.status !== "PASSED") {
    process.stderr.write(output);
    throw evidenceError("TEST_SUITE_NOT_PASSED", "test suite did not pass");
  }
  return report;
}

if (require.main === module) {
  try {
    process.stdout.write(
      JSON.stringify(
        createTestSuiteEvidence(parseArguments(process.argv.slice(2))),
      ) + "\n",
    );
  } catch (error) {
    process.stderr.write(
      (error.code || "TEST_SUITE_EVIDENCE_FAILED") +
        ":test suite evidence failed\n",
    );
    process.exitCode = 1;
  }
}

module.exports = { createTestSuiteEvidence, parseArguments };
