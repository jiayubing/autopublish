"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function packageEvidenceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function checkStatus(value) {
  const status = value && typeof value === "object" ? value.status : value;
  if (status === 0 || status === "passed" || status === "PASSED")
    return "PASSED";
  if (status === "SKIPPED_OPTIONAL" || status === "skipped_optional")
    return "SKIPPED_OPTIONAL";
  if (status === "not-run" || status === "NOT_APPLICABLE")
    return "NOT_APPLICABLE";
  return "FAILED";
}

function summarizeChecks(checks) {
  const entries = [];
  function collect(value, prefix) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    if (Object.prototype.hasOwnProperty.call(value, "status")) {
      entries.push([prefix, checkStatus(value)]);
      return;
    }
    Object.keys(value)
      .sort()
      .forEach((name) =>
        collect(value[name], prefix ? prefix + "." + name : name),
      );
  }
  collect(checks, "");
  if (entries.length === 0)
    throw packageEvidenceError(
      "PRODUCTION_PACKAGE_CHECKS_EMPTY",
      "Production smoke produced no checks",
    );
  entries.sort(([left], [right]) => left.localeCompare(right));
  const counts = entries.reduce(
    (result, [, status]) => {
      if (status === "PASSED") result.passed += 1;
      else if (status === "SKIPPED_OPTIONAL" || status === "NOT_APPLICABLE")
        result.skipped += 1;
      else result.failed += 1;
      return result;
    },
    { passed: 0, failed: 0, skipped: 0 },
  );
  return {
    checkCount: entries.length,
    passed: counts.passed,
    failed: counts.failed,
    skipped: counts.skipped,
    sha256: crypto
      .createHash("sha256")
      .update(JSON.stringify(entries))
      .digest("hex"),
  };
}

function writeEvidenceReport(output, result) {
  const checks = summarizeChecks(result && result.offline);
  const report = {
    status: result.ok === true && checks.failed === 0 ? "PASSED" : "FAILED",
    operation: "production-directory-smoke",
    packageVersion: result.packageVersion,
    workspaceSchemaVersion: result.workspaceSchemaVersion,
    artifactCount: result.artifactCount,
    checkCount: checks.checkCount,
    passed: checks.passed,
    failed: checks.failed,
    skipped: checks.skipped,
    sha256: checks.sha256,
  };
  const filename = path.resolve(output);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(report, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  return report;
}

module.exports = {
  packageEvidenceError,
  checkStatus,
  summarizeChecks,
  writeEvidenceReport,
};
