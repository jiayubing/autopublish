"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { collectTestFiles } = require("./run-tests");
const { createExecutionProvenance } = require("./release-evidence-inputs");

const ROOT = path.resolve(__dirname, "..");

function parseArguments(argv) {
  const args = Array.from(argv || []);
  if (args.length !== 2 || args[0] !== "--output")
    throw new Error("ROOT_TEST_EVIDENCE_ARGUMENT_INVALID");
  return { output: path.resolve(args[1]) };
}

function lastCount(output, label) {
  const matches = [
    ...String(output).matchAll(new RegExp("\\u2139 " + label + " (\\d+)", "g")),
  ];
  return matches.length ? Number(matches.at(-1)[1]) : 0;
}

function createRootTestEvidence(options) {
  const opts = options || {};
  const files = collectTestFiles().map((file) => file.replaceAll("\\\\", "/"));
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, ["scripts/run-tests.js"], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
  const output = String(result.stdout || "") + String(result.stderr || "");
  const provenance = createExecutionProvenance({
    root: ROOT,
    command: "node scripts/run-tests.js",
    startedAt,
  });
  const report = {
    status: result.status === 0 ? "PASSED" : "FAILED",
    operation: "desktop-root-tests",
    suite: "node scripts/run-tests.js",
    ...provenance,
    testFiles: files.length,
    count: lastCount(output, "tests"),
    passed: lastCount(output, "pass"),
    failed: lastCount(output, "fail"),
    skipped: lastCount(output, "skipped"),
    sha256: crypto.createHash("sha256").update(files.join("\n")).digest("hex"),
  };
  fs.mkdirSync(path.dirname(opts.output), { recursive: true });
  fs.writeFileSync(opts.output, JSON.stringify(report, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  if (report.status !== "PASSED" || report.failed !== 0)
    throw new Error("ROOT_TEST_EVIDENCE_NOT_PASSED");
  return report;
}

if (require.main === module) {
  try {
    process.stdout.write(
      JSON.stringify(
        createRootTestEvidence(parseArguments(process.argv.slice(2))),
      ) + "\n",
    );
  } catch (error) {
    process.stderr.write((error.message || "ROOT_TEST_EVIDENCE_FAILED") + "\n");
    process.exitCode = 1;
  }
}

module.exports = { createRootTestEvidence, parseArguments };
