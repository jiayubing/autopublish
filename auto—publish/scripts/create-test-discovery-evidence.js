"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { collectTestFiles } = require("./run-tests");
const { createExecutionPlan } = require("./test-runner-policy");

const ROOT = path.resolve(__dirname, "..");

function evidenceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
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
          "TEST_DISCOVERY_ARGUMENT_INVALID",
          "output is required",
        );
      options.output = path.resolve(value);
    } else {
      throw evidenceError("TEST_DISCOVERY_ARGUMENT_INVALID", "unknown option");
    }
  }
  return options;
}

function createTestDiscoveryEvidence(options) {
  const opts = options || {};
  const files = collectTestFiles().map((file) => file.replaceAll("\\", "/"));
  const jsFiles = files.filter((file) => file.endsWith(".test.js")).length;
  const mjsFiles = files.filter((file) => file.endsWith(".test.mjs")).length;
  const plan = createExecutionPlan(files);
  const assignments = plan.classifications.map((classification) => ({
    file: classification.file,
    pool: classification.pool,
    reason: classification.reason,
  }));
  const poolDigest = crypto
    .createHash("sha256")
    .update(JSON.stringify(assignments))
    .digest("hex");
  const status = jsFiles > 0 && mjsFiles > 0 ? "PASSED" : "FAILED";
  const report = {
    status,
    operation: "desktop-test-discovery",
    count: files.length,
    jsFiles,
    mjsFiles,
    extensions: [".test.js", ".test.mjs"],
    files,
    pools: {
      parallel: plan.parallelFiles.length,
      serial: plan.serialFiles.length,
    },
    poolDigest,
    everyFileHasExactlyOnePool:
      assignments.length === files.length &&
      new Set(assignments.map((assignment) => assignment.file)).size ===
        files.length,
    assignments,
    sha256: crypto.createHash("sha256").update(files.join("\n")).digest("hex"),
  };
  const output = path.resolve(
    opts.output ||
      path.join(ROOT, "build", "evidence", "desktop-discovery.json"),
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  if (status !== "PASSED")
    throw evidenceError(
      "TEST_DISCOVERY_INCOMPLETE",
      "test discovery is incomplete",
    );
  return report;
}

if (require.main === module) {
  try {
    process.stdout.write(
      JSON.stringify(
        createTestDiscoveryEvidence(parseArguments(process.argv.slice(2))),
      ) + "\n",
    );
  } catch (error) {
    const code =
      error &&
      typeof error.code === "string" &&
      /^TEST_[A-Z0-9_]{1,72}$/.test(error.code)
        ? error.code
        : "TEST_DISCOVERY_EVIDENCE_FAILED";
    process.stderr.write(code + ":test discovery evidence failed\n");
    process.exitCode = 1;
  }
}

module.exports = { createTestDiscoveryEvidence, parseArguments };
