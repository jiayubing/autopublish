"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { runOfflineSelfTest } = require("./offline-self-test");
const {
  verifyArtifactPackage,
} = require("../desktop/packaging/artifact-verifier");

function packageEvidenceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function findPackagedApplication(resourcesPath) {
  const packageRoot = path.dirname(path.resolve(resourcesPath));
  let names;
  try {
    names = fs.readdirSync(packageRoot);
  } catch (_) {
    throw Object.assign(
      new Error("Packaged application directory is unavailable"),
      { code: "PRODUCTION_PACKAGE_APPLICATION_UNAVAILABLE" },
    );
  }
  const candidates = names
    .filter((name) => path.extname(name).toLowerCase() === ".exe")
    .map((name) => path.join(packageRoot, name))
    .filter((filename) => {
      try {
        const stat = fs.lstatSync(filename);
        return stat.isFile() && !stat.isSymbolicLink();
      } catch (_) {
        return false;
      }
    });
  if (candidates.length !== 1) {
    throw Object.assign(
      new Error("Packaged application executable inventory is invalid"),
      { code: "PRODUCTION_PACKAGE_APPLICATION_INVALID" },
    );
  }
  return candidates[0];
}

function parseArguments(argv) {
  const args = Array.from(argv || []);
  const options = {};
  const resourcesPath = args.shift();
  if (!resourcesPath)
    throw Object.assign(
      new Error("Production resources directory is required"),
      { code: "PRODUCTION_PACKAGE_ARGUMENT_INVALID" },
    );
  while (args.length) {
    const arg = args.shift();
    if (arg === "--python") {
      const value = args.shift();
      if (!value || value.startsWith("--"))
        throw Object.assign(new Error("--python requires a value"), {
          code: "PRODUCTION_PACKAGE_ARGUMENT_INVALID",
        });
      options.pythonPath = path.resolve(value);
    } else if (arg === "--application") {
      const value = args.shift();
      if (!value || value.startsWith("--"))
        throw Object.assign(new Error("--application requires a value"), {
          code: "PRODUCTION_PACKAGE_ARGUMENT_INVALID",
        });
      options.applicationPath = path.resolve(value);
    } else if (arg === "--require-python") {
      options.requirePython = true;
    } else if (arg === "--static-only") {
      options.staticOnly = true;
    } else if (arg === "--output") {
      const value = args.shift();
      if (!value || value.startsWith("--"))
        throw packageEvidenceError(
          "PRODUCTION_PACKAGE_ARGUMENT_INVALID",
          "--output requires a value",
        );
      options.output = path.resolve(value);
    } else {
      throw Object.assign(new Error("Unknown production package argument"), {
        code: "PRODUCTION_PACKAGE_ARGUMENT_INVALID",
      });
    }
  }
  return { resourcesPath: path.resolve(resourcesPath), options };
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
    sha256: require("node:crypto")
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

function verifyProductionPackage(resourcesPath, options) {
  const opts = Object.assign({}, options || {});
  const verification = verifyArtifactPackage(resourcesPath, opts);
  if (opts.staticOnly) {
    return {
      ok: true,
      packageVersion: verification.packageVersion,
      workspaceSchemaVersion: verification.workspaceSchemaVersion,
      artifactCount: verification.artifacts.length,
      offline: "not_run",
    };
  }
  const offline = runOfflineSelfTest(
    resourcesPath,
    Object.assign({}, opts, {
      applicationPath:
        opts.applicationPath || findPackagedApplication(resourcesPath),
      requireApplication: true,
    }),
  );
  return {
    ok: true,
    packageVersion: verification.packageVersion,
    workspaceSchemaVersion: verification.workspaceSchemaVersion,
    artifactCount: verification.artifacts.length,
    offline: offline.checks,
  };
}

if (require.main === module) {
  try {
    const parsed = parseArguments(process.argv.slice(2));
    const result = verifyProductionPackage(
      parsed.resourcesPath,
      parsed.options,
    );
    if (parsed.options.output)
      if (
        writeEvidenceReport(parsed.options.output, result).status !== "PASSED"
      )
        throw packageEvidenceError(
          "PRODUCTION_PACKAGE_SMOKE_FAILED",
          "Production smoke evidence contains failed checks",
        );
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    process.stderr.write(
      (error.code || "PRODUCTION_PACKAGE_VERIFY_FAILED") +
        ":Production package verification failed\n",
    );
    process.exitCode = 1;
  }
}

module.exports = {
  findPackagedApplication,
  parseArguments,
  summarizeChecks,
  verifyProductionPackage,
  writeEvidenceReport,
};
