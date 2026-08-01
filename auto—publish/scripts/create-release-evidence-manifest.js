"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const REQUIRED_CHECKS = Object.freeze([
  "required/root-tests",
  "required/auth-tests",
  "required/migration-roundtrip",
  "required/backup-restore-fixture",
  "required/rate-limit-capacity",
  "required/diagnostics-static",
  "required/production-directory-smoke",
]);
const MANUAL_GATES = Object.freeze([
  "platform-endpoints-tls",
  "proxy-source-headers",
  "signing-certificate",
  "installer-acl-upgrade-rollback",
  "external-e2e-owner",
]);
const STATUSES = new Set([
  "PASSED",
  "FAILED",
  "PENDING_HUMAN",
  "BLOCKED_RELEASE",
  "SKIPPED",
  "SKIPPED_OPTIONAL",
]);

function evidenceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function safeStatus(value, fallback) {
  const status = String(value || fallback || "PENDING_HUMAN").toUpperCase();
  return STATUSES.has(status) ? status : "PENDING_HUMAN";
}

function safeHash(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

function safeRelative(value) {
  if (typeof value !== "string" || value.trim() === "" || value.includes("\0"))
    return null;
  const normalized = value.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    normalized.split("/").some((part) => !part || part === "..")
  )
    return null;
  return normalized;
}

function readJson(filename, code) {
  try {
    return JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (_) {
    throw evidenceError(code, "Evidence input is unavailable");
  }
}

function summarizeReport(filename, kind) {
  if (!filename) return { status: "PENDING_HUMAN", source: kind };
  const value = readJson(filename, "RELEASE_EVIDENCE_INPUT_INVALID");
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw evidenceError(
      "RELEASE_EVIDENCE_INPUT_INVALID",
      "Evidence input is invalid",
    );
  const summary = {
    status: safeStatus(
      value.status,
      value.ok === true
        ? "PASSED"
        : value.ok === false
          ? "FAILED"
          : "PENDING_HUMAN",
    ),
    source: kind,
  };
  if (typeof value.code === "string" && /^[A-Z0-9_]{1,80}$/.test(value.code))
    summary.code = value.code;
  [
    "schemaVersion",
    "workspaceSchemaVersion",
    "durationMs",
    "count",
    "passed",
    "failed",
    "skipped",
  ].forEach((key) => {
    if (Number.isSafeInteger(value[key]) && value[key] >= 0)
      summary[key] = value[key];
  });
  const contentHash = safeHash(value.contentHash || value.sha256);
  if (contentHash) summary.sha256 = contentHash;
  return summary;
}

function summarizeArtifactManifest(filename) {
  if (!filename) return { status: "PENDING_HUMAN", artifacts: [] };
  const value = readJson(filename, "RELEASE_ARTIFACT_MANIFEST_INVALID");
  if (!value || typeof value !== "object" || !Array.isArray(value.artifacts))
    throw evidenceError(
      "RELEASE_ARTIFACT_MANIFEST_INVALID",
      "Artifact manifest is invalid",
    );
  const artifacts = value.artifacts.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw evidenceError(
        "RELEASE_ARTIFACT_MANIFEST_INVALID",
        "Artifact manifest entry is invalid",
      );
    const relativePath = safeRelative(item.path);
    const sha256 = safeHash(item.sha256);
    if (
      typeof item.name !== "string" ||
      !["asar", "unpacked", "resources"].includes(item.location) ||
      !relativePath ||
      !sha256
    )
      throw evidenceError(
        "RELEASE_ARTIFACT_MANIFEST_INVALID",
        "Artifact manifest entry is invalid",
      );
    return {
      name: item.name,
      location: item.location,
      path: relativePath,
      sha256,
      bytes:
        Number.isSafeInteger(item.bytes) && item.bytes >= 0 ? item.bytes : null,
      version: typeof item.version === "string" ? item.version : null,
    };
  });
  const manifestHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(filename))
    .digest("hex");
  return {
    status: "PASSED",
    manifestVersion: Number.isSafeInteger(value.manifestVersion)
      ? value.manifestVersion
      : null,
    packageVersion:
      typeof value.packageVersion === "string" ? value.packageVersion : null,
    workspaceSchemaVersion: value.workspaceSchemaVersion,
    sha256: manifestHash,
    artifacts,
  };
}

function currentCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
  } catch (_) {
    return null;
  }
}

function currentSourceState() {
  try {
    const porcelain = execFileSync(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all"],
      { cwd: ROOT, encoding: "utf8" },
    );
    return {
      status: porcelain.trim() === "" ? "CLEAN" : "DIRTY",
      diffSha256: crypto.createHash("sha256").update(porcelain).digest("hex"),
    };
  } catch (_) {
    return {
      status: "UNKNOWN",
      diffSha256: crypto
        .createHash("sha256")
        .update("git-status-unavailable")
        .digest("hex"),
    };
  }
}

function normalizeSourceState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const status = String(value.status || "").toUpperCase();
  const diffSha256 = safeHash(value.diffSha256);
  if (!new Set(["CLEAN", "DIRTY", "UNKNOWN"]).has(status) || !diffSha256)
    return null;
  return { status, diffSha256 };
}

function createReleaseEvidenceManifest(options) {
  const opts = options || {};
  const packageValue = readJson(
    path.join(ROOT, "package.json"),
    "RELEASE_EVIDENCE_PACKAGE_INVALID",
  );
  const checks = {};
  REQUIRED_CHECKS.forEach((name) => {
    checks[name] = { status: safeStatus(opts.checks && opts.checks[name]) };
  });
  const manualGates = {};
  MANUAL_GATES.forEach((name) => {
    manualGates[name] = safeStatus(opts.manualGates && opts.manualGates[name]);
  });
  const artifact = summarizeArtifactManifest(opts.artifactManifest);
  const sourceState =
    normalizeSourceState(opts.sourceState) || currentSourceState();
  const evidence = {
    manifestVersion: 1,
    generatedAt: new Date().toISOString(),
    commit:
      typeof opts.commit === "string" && /^[a-f0-9]{7,64}$/i.test(opts.commit)
        ? opts.commit
        : currentCommit(),
    applicationVersion:
      typeof packageValue.version === "string" ? packageValue.version : null,
    authSchemaVersion: 2,
    workspaceSchemaVersion: artifact.workspaceSchemaVersion || 1,
    sourceState,
    requiredChecks: checks,
    migration: summarizeReport(opts.migrationReport, "migration-report"),
    backupRestore: summarizeReport(opts.backupReport, "backup-restore-report"),
    artifact,
    rollbackPackage:
      typeof opts.rollbackPackage === "string" && opts.rollbackPackage.trim()
        ? path.basename(opts.rollbackPackage)
        : null,
    manualGates,
  };
  const allChecksPassed = REQUIRED_CHECKS.every(
    (name) => checks[name].status === "PASSED",
  );
  const allManualPassed = MANUAL_GATES.every(
    (name) => manualGates[name] === "PASSED",
  );
  evidence.releaseState =
    allChecksPassed && allManualPassed && sourceState.status === "CLEAN"
      ? "READY_FOR_HUMAN_RELEASE"
      : "BLOCKED_RELEASE";
  const output = path.resolve(
    opts.output || path.join(ROOT, "build", "release-evidence-manifest.json"),
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  return {
    output,
    releaseState: evidence.releaseState,
    requiredChecks: REQUIRED_CHECKS.length,
    manualGates: MANUAL_GATES.length,
  };
}

function parseArguments(argv) {
  const args = Array.from(argv || []);
  const options = { checks: {}, manualGates: {} };
  while (args.length) {
    const arg = args.shift();
    const valueArg = (name) => {
      const value =
        arg === name
          ? args.shift()
          : arg.startsWith(name + "=")
            ? arg.slice(name.length + 1)
            : null;
      if (!value)
        throw evidenceError(
          "RELEASE_EVIDENCE_ARGUMENT_INVALID",
          name + " requires a value",
        );
      return value;
    };
    if (arg === "--output" || arg.startsWith("--output="))
      options.output = valueArg("--output");
    else if (
      arg === "--artifact-manifest" ||
      arg.startsWith("--artifact-manifest=")
    )
      options.artifactManifest = path.resolve(valueArg("--artifact-manifest"));
    else if (
      arg === "--migration-report" ||
      arg.startsWith("--migration-report=")
    )
      options.migrationReport = path.resolve(valueArg("--migration-report"));
    else if (arg === "--backup-report" || arg.startsWith("--backup-report="))
      options.backupReport = path.resolve(valueArg("--backup-report"));
    else if (
      arg === "--rollback-package" ||
      arg.startsWith("--rollback-package=")
    )
      options.rollbackPackage = valueArg("--rollback-package");
    else if (arg === "--commit" || arg.startsWith("--commit="))
      options.commit = valueArg("--commit");
    else if (arg === "--check" || arg.startsWith("--check=")) {
      const value = valueArg("--check");
      const separator = value.indexOf("=");
      if (separator < 1)
        throw evidenceError(
          "RELEASE_EVIDENCE_ARGUMENT_INVALID",
          "--check requires name=status",
        );
      options.checks[value.slice(0, separator)] = value.slice(separator + 1);
    } else if (arg === "--manual" || arg.startsWith("--manual=")) {
      const value = valueArg("--manual");
      const separator = value.indexOf("=");
      if (separator < 1)
        throw evidenceError(
          "RELEASE_EVIDENCE_ARGUMENT_INVALID",
          "--manual requires name=status",
        );
      options.manualGates[value.slice(0, separator)] = value.slice(
        separator + 1,
      );
    } else
      throw evidenceError(
        "RELEASE_EVIDENCE_ARGUMENT_INVALID",
        "Unknown release evidence argument",
      );
  }
  return options;
}

if (require.main === module) {
  try {
    process.stdout.write(
      JSON.stringify(
        createReleaseEvidenceManifest(parseArguments(process.argv.slice(2))),
      ) + "\n",
    );
  } catch (error) {
    process.stderr.write(
      (error.code || "RELEASE_EVIDENCE_FAILED") +
        ":Release evidence manifest failed\n",
    );
    process.exitCode = 1;
  }
}

module.exports = {
  REQUIRED_CHECKS,
  MANUAL_GATES,
  createReleaseEvidenceManifest,
  parseArguments,
  summarizeArtifactManifest,
};
