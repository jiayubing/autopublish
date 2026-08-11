"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function evidenceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function testFiles() {
  return fs
    .readdirSync(path.join(ROOT, "tests"))
    .filter((filename) => filename.endsWith(".test.js"))
    .sort();
}

function parseArguments(argv) {
  const args = Array.from(argv || []);
  const options = {};
  while (args.length) {
    const arg = args.shift();
    if (arg === "--output") {
      const value = args.shift();
      if (!value || value.startsWith("--"))
        throw evidenceError(
          "AUTH_TEST_EVIDENCE_ARGUMENT_INVALID",
          "output is required",
        );
      options.output = path.resolve(value);
    } else if (arg === "--status") {
      const value = String(args.shift() || "").toUpperCase();
      if (!["PASSED", "FAILED"].includes(value))
        throw evidenceError(
          "AUTH_TEST_EVIDENCE_ARGUMENT_INVALID",
          "status is invalid",
        );
      options.status = value;
    } else {
      throw evidenceError(
        "AUTH_TEST_EVIDENCE_ARGUMENT_INVALID",
        "unknown option",
      );
    }
  }
  return options;
}

function createAuthTestSummary(options) {
  const opts = options || {};
  const files = testFiles();
  const report = {
    status: opts.status || "PENDING_HUMAN",
    operation: "auth-service-tests",
    suite: "npm --prefix auth-server test",
    testFiles: files.length,
    sha256: crypto.createHash("sha256").update(files.join("\n")).digest("hex"),
  };
  const output = path.resolve(
    opts.output || path.join(ROOT, "build", "evidence", "auth-tests.json"),
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  if (report.status !== "PASSED")
    throw evidenceError(
      "AUTH_TEST_EVIDENCE_NOT_PASSED",
      "auth test summary is not passed",
    );
  return report;
}

if (require.main === module) {
  try {
    process.stdout.write(
      JSON.stringify(
        createAuthTestSummary(parseArguments(process.argv.slice(2))),
      ) + "\n",
    );
  } catch (error) {
    const code =
      error &&
      typeof error.code === "string" &&
      /^AUTH_[A-Z0-9_]{1,72}$/.test(error.code)
        ? error.code
        : "AUTH_TEST_EVIDENCE_FAILED";
    process.stderr.write(code + ":auth test evidence failed\n");
    process.exitCode = 1;
  }
}

module.exports = { createAuthTestSummary, parseArguments };
