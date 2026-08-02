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
  "required/test-discovery",
  "required/auth-container",
  "required/auth-migration-roundtrip",
  "required/health-semantics",
  "required/media-transport",
  "required/legacy-publish-log-absence",
  "required/toolchain",
  "required/packaging-contracts",
  "required/link-security",
]);
const MANUAL_GATES = Object.freeze([
  "phase4-platform-account-binding",
  "phase4-hepan-reconciliation",
  "phase4-media-http-risk",
  "phase4-signed-browser-login",
  "platform-endpoints-tls",
  "proxy-source-headers",
  "signing-certificate",
  "installer-acl-upgrade-rollback",
  "external-e2e-owner",
  "auth-rpo-rto",
  "auth-backup-policy",
  "auth-recovery-drill",
]);
const VERSION_PATTERN = /^(?:v?\d+\.){2}\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const ROLLBACK_PLAN =
  "previous-signed-artifact-and-reversible-upgrade-procedure-required";
const STATUSES = new Set([
  "PASSED",
  "FAILED",
  "PENDING_HUMAN",
  "BLOCKED_RELEASE",
  "NOT_APPLICABLE",
  "SKIPPED",
  "SKIPPED_OPTIONAL",
]);
const EVIDENCE_FIELDS = Object.freeze([
  "migration",
  "backupRestore",
  "artifact",
  "desktopTestDiscovery",
  "authTests",
  "containerTests",
  "offlineSelfTest",
  "legacyAbsence",
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

function safeVersion(value) {
  return typeof value === "string" && VERSION_PATTERN.test(value)
    ? value
    : null;
}

function safeIdentifier(value) {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(value)
    ? value
    : null;
}

function safeRelative(value) {
  if (typeof value !== "string" || value.trim() === "" || value.includes("\0"))
    return null;
  const normalized = value.replace(/\\/g, "/");
  if (
    path.isAbsolute(value) ||
    path.posix.isAbsolute(normalized) ||
    path.win32.isAbsolute(normalized) ||
    normalized.startsWith("//") ||
    normalized.split("/").some((part) => !part || part === "..")
  )
    return null;
  return normalized;
}

function safeRollbackPackage(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const normalized = safeRelative(value);
  if (!normalized) return null;
  const basename = normalized.split("/").pop();
  return basename && /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(basename)
    ? basename
    : null;
}

function summarizeRollbackReport(filename) {
  if (!filename)
    return {
      status: "PENDING_HUMAN",
      package: null,
      sha256: null,
      plan: ROLLBACK_PLAN,
    };
  const value = readJson(filename, "RELEASE_ROLLBACK_INPUT_INVALID");
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw evidenceError(
      "RELEASE_ROLLBACK_INPUT_INVALID",
      "Rollback evidence input is invalid",
    );
  const status = safeStatus(value.status);
  const packageName = safeRollbackPackage(value.package);
  const sha256 = safeHash(value.sha256);
  const plan = safeIdentifier(value.plan);
  if (status === "PASSED" && (!packageName || !sha256 || !plan))
    throw evidenceError(
      "RELEASE_ROLLBACK_INPUT_INVALID",
      "Passed rollback evidence requires package, hash, and plan",
    );
  return {
    status,
    package: packageName,
    sha256,
    plan: plan || ROLLBACK_PLAN,
  };
}

function readJson(filename, code) {
  try {
    return JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (_) {
    throw evidenceError(code, "Evidence input is unavailable");
  }
}

function inputHash(filename, code) {
  try {
    return crypto
      .createHash("sha256")
      .update(fs.readFileSync(filename))
      .digest("hex");
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
    inputSha256: inputHash(filename, "RELEASE_EVIDENCE_INPUT_INVALID"),
  };
  if (typeof value.code === "string" && /^[A-Z0-9_]{1,80}$/.test(value.code))
    summary.code = value.code;
  [
    "schemaVersion",
    "sourceSchemaVersion",
    "workspaceSchemaVersion",
    "durationMs",
    "count",
    "passed",
    "failed",
    "skipped",
    "testFiles",
    "jsFiles",
    "mjsFiles",
    "archiveEntries",
    "sourceMatches",
    "archiveMatches",
    "artifactCount",
    "checkCount",
    "passedChecks",
    "failedChecks",
    "skippedChecks",
    "runtimeMajor",
    "externalServices",
  ].forEach((key) => {
    if (Number.isSafeInteger(value[key]) && value[key] >= 0)
      summary[key] = value[key];
  });
  [
    "operation",
    "suite",
    "archiveStatus",
    "destinationVerification",
    "restoreCheck",
  ].forEach((key) => {
    if (
      typeof value[key] === "string" &&
      /^[A-Za-z0-9_.:-]{1,100}$/.test(value[key])
    )
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
      !/^[A-Za-z0-9._-]{1,100}$/.test(item.name) ||
      !["asar", "unpacked", "resources"].includes(item.location) ||
      !relativePath ||
      !sha256
    )
      throw evidenceError(
        "RELEASE_ARTIFACT_MANIFEST_INVALID",
        "Artifact manifest entry is invalid",
      );
    const version =
      item.version === null || item.version === undefined
        ? null
        : safeVersion(item.version);
    if (item.version !== null && item.version !== undefined && !version)
      throw evidenceError(
        "RELEASE_ARTIFACT_MANIFEST_INVALID",
        "Artifact version is invalid",
      );
    return {
      name: item.name,
      location: item.location,
      path: relativePath,
      sha256,
      bytes:
        Number.isSafeInteger(item.bytes) && item.bytes >= 0 ? item.bytes : null,
      version,
    };
  });
  if (!artifacts.length)
    throw evidenceError(
      "RELEASE_ARTIFACT_MANIFEST_INVALID",
      "Artifact inventory is empty",
    );
  const packageVersion = safeVersion(value.packageVersion);
  if (!packageVersion)
    throw evidenceError(
      "RELEASE_ARTIFACT_MANIFEST_INVALID",
      "Artifact package version is invalid",
    );
  return {
    status: "PASSED",
    manifestVersion: Number.isSafeInteger(value.manifestVersion)
      ? value.manifestVersion
      : null,
    packageVersion,
    workspaceSchemaVersion: Number.isSafeInteger(value.workspaceSchemaVersion)
      ? value.workspaceSchemaVersion
      : null,
    sha256: inputHash(filename, "RELEASE_ARTIFACT_MANIFEST_INVALID"),
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

function safeSchemaVersion(value, fallback) {
  return Number.isSafeInteger(value) && value >= 1 ? value : fallback;
}

function checklistEntries(checks, manualGates, evidence, rollback) {
  const entries = REQUIRED_CHECKS.map((id) => ({
    id,
    kind: "AUTOMATED",
    status: checks[id].status,
    state:
      checks[id].status === "PASSED" ? "AUTOMATED_PASS" : checks[id].status,
  }));
  EVIDENCE_FIELDS.forEach((id) => {
    entries.push({
      id: "evidence/" + id,
      kind: "EVIDENCE",
      status: evidence[id].status,
      state: evidence[id].status,
    });
  });
  MANUAL_GATES.forEach((id) => {
    entries.push({
      id: "manual/" + id,
      kind: "MANUAL",
      status: manualGates[id],
      state: manualGates[id],
    });
  });
  entries.push({
    id: "manual/rollback-evidence",
    kind: "MANUAL",
    status: rollback.status,
    state: rollback.status,
  });
  return entries;
}

function createReleaseEvidenceManifest(options) {
  const opts = options || {};
  const packageValue = readJson(
    path.join(ROOT, "package.json"),
    "RELEASE_EVIDENCE_PACKAGE_INVALID",
  );
  const actualCommit = currentCommit();
  if (
    typeof opts.commit === "string" &&
    (!/^[a-f0-9]{7,64}$/i.test(opts.commit) ||
      !actualCommit ||
      opts.commit.toLowerCase() !== actualCommit.toLowerCase())
  )
    throw evidenceError(
      "RELEASE_EVIDENCE_COMMIT_MISMATCH",
      "Release evidence commit does not match current HEAD",
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
  const evidence = {
    migration: summarizeReport(opts.migrationReport, "migration-report"),
    backupRestore: summarizeReport(opts.backupReport, "backup-restore-report"),
    artifact,
    desktopTestDiscovery: summarizeReport(
      opts.discoveryReport,
      "desktop-discovery-report",
    ),
    authTests: summarizeReport(opts.authReport, "auth-test-report"),
    containerTests: summarizeReport(
      opts.containerReport,
      "auth-container-report",
    ),
    offlineSelfTest: summarizeReport(
      opts.offlineReport,
      "production-offline-self-test",
    ),
    legacyAbsence: summarizeReport(opts.legacyReport, "legacy-absence-report"),
  };
  if (artifact.packageVersion !== packageValue.version)
    throw evidenceError(
      "RELEASE_ARTIFACT_VERSION_MISMATCH",
      "Production artifact version does not match application version",
    );
  const rollbackEvidence = summarizeRollbackReport(opts.rollbackReport);
  const rollbackPackage =
    rollbackEvidence.package || safeRollbackPackage(opts.rollbackPackage);
  const rollback = Object.assign({}, rollbackEvidence, {
    package: rollbackPackage,
  });
  const sourceState =
    normalizeSourceState(opts.sourceState) || currentSourceState();
  const blockers = [];
  REQUIRED_CHECKS.forEach((name) => {
    if (checks[name].status !== "PASSED")
      blockers.push("CHECK_" + name.replace(/[^A-Za-z0-9]+/g, "_"));
  });
  EVIDENCE_FIELDS.forEach((name) => {
    if (evidence[name].status !== "PASSED")
      blockers.push("EVIDENCE_" + name.toUpperCase());
  });
  MANUAL_GATES.forEach((name) => {
    if (manualGates[name] !== "PASSED")
      blockers.push("MANUAL_" + name.replace(/[^A-Za-z0-9]+/g, "_"));
  });
  if (rollback.status !== "PASSED") blockers.push("MANUAL_ROLLBACK_EVIDENCE");
  if (sourceState.status !== "CLEAN")
    blockers.push("SOURCE_" + sourceState.status);
  const allChecksPassed = REQUIRED_CHECKS.every(
    (name) => checks[name].status === "PASSED",
  );
  const allManualPassed = MANUAL_GATES.every(
    (name) => manualGates[name] === "PASSED",
  );
  const manifest = {
    manifestVersion: 1,
    generatedAt: new Date().toISOString(),
    commit: actualCommit,
    applicationVersion:
      typeof packageValue.version === "string" ? packageValue.version : null,
    authSchemaVersion: safeSchemaVersion(opts.authSchemaVersion, 2),
    workspaceSchemaVersion: safeSchemaVersion(
      artifact.workspaceSchemaVersion || opts.workspaceSchemaVersion,
      1,
    ),
    sourceState,
    requiredChecks: checks,
    migration: evidence.migration,
    backupRestore: evidence.backupRestore,
    authTests: evidence.authTests,
    containerTests: evidence.containerTests,
    desktopTestDiscovery: evidence.desktopTestDiscovery,
    artifact,
    offlineSelfTest: evidence.offlineSelfTest,
    legacyAbsence: evidence.legacyAbsence,
    rollbackPackage,
    rollback,
    manualGates,
    releaseBlockers: [...new Set(blockers)],
  };
  manifest.checklist = checklistEntries(
    checks,
    manualGates,
    evidence,
    rollback,
  );
  manifest.releaseState =
    allChecksPassed &&
    allManualPassed &&
    rollback.status === "PASSED" &&
    EVIDENCE_FIELDS.every((name) => evidence[name].status === "PASSED") &&
    sourceState.status === "CLEAN"
      ? "READY_FOR_HUMAN_RELEASE"
      : "BLOCKED_RELEASE";
  const output = path.resolve(
    opts.output || path.join(ROOT, "build", "release-evidence-manifest.json"),
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  return {
    output,
    releaseState: manifest.releaseState,
    requiredChecks: REQUIRED_CHECKS.length,
    manualGates: MANUAL_GATES.length,
    blockers: manifest.releaseBlockers.length,
  };
}

function parseArguments(argv) {
  const args = Array.from(argv || []);
  const options = { checks: {}, manualGates: {} };
  const valueFor = (arg, name) => {
    const value = arg === name ? args.shift() : arg.slice(name.length + 1);
    if (!value)
      throw evidenceError(
        "RELEASE_EVIDENCE_ARGUMENT_INVALID",
        name + " requires a value",
      );
    return value;
  };
  while (args.length) {
    const arg = args.shift();
    const valueOption = (name) => arg === name || arg.startsWith(name + "=");
    if (valueOption("--output"))
      options.output = path.resolve(valueFor(arg, "--output"));
    else if (valueOption("--artifact-manifest"))
      options.artifactManifest = path.resolve(
        valueFor(arg, "--artifact-manifest"),
      );
    else if (valueOption("--migration-report"))
      options.migrationReport = path.resolve(
        valueFor(arg, "--migration-report"),
      );
    else if (valueOption("--backup-report"))
      options.backupReport = path.resolve(valueFor(arg, "--backup-report"));
    else if (valueOption("--discovery-report"))
      options.discoveryReport = path.resolve(
        valueFor(arg, "--discovery-report"),
      );
    else if (valueOption("--auth-report"))
      options.authReport = path.resolve(valueFor(arg, "--auth-report"));
    else if (valueOption("--container-report"))
      options.containerReport = path.resolve(
        valueFor(arg, "--container-report"),
      );
    else if (valueOption("--offline-report"))
      options.offlineReport = path.resolve(valueFor(arg, "--offline-report"));
    else if (valueOption("--legacy-report"))
      options.legacyReport = path.resolve(valueFor(arg, "--legacy-report"));
    else if (valueOption("--rollback-package"))
      options.rollbackPackage = valueFor(arg, "--rollback-package");
    else if (valueOption("--rollback-report"))
      options.rollbackReport = path.resolve(valueFor(arg, "--rollback-report"));
    else if (valueOption("--commit"))
      options.commit = valueFor(arg, "--commit");
    else if (valueOption("--auth-schema-version"))
      options.authSchemaVersion = Number(
        valueFor(arg, "--auth-schema-version"),
      );
    else if (valueOption("--workspace-schema-version"))
      options.workspaceSchemaVersion = Number(
        valueFor(arg, "--workspace-schema-version"),
      );
    else if (valueOption("--check")) {
      const value = valueFor(arg, "--check");
      const separator = value.indexOf("=");
      if (separator < 1)
        throw evidenceError(
          "RELEASE_EVIDENCE_ARGUMENT_INVALID",
          "--check requires name=status",
        );
      const name = value.slice(0, separator);
      if (!REQUIRED_CHECKS.includes(name))
        throw evidenceError(
          "RELEASE_EVIDENCE_ARGUMENT_INVALID",
          "Unknown required check",
        );
      options.checks[name] = value.slice(separator + 1);
    } else if (valueOption("--manual")) {
      const value = valueFor(arg, "--manual");
      const separator = value.indexOf("=");
      if (separator < 1)
        throw evidenceError(
          "RELEASE_EVIDENCE_ARGUMENT_INVALID",
          "--manual requires name=status",
        );
      const name = value.slice(0, separator);
      if (!MANUAL_GATES.includes(name))
        throw evidenceError(
          "RELEASE_EVIDENCE_ARGUMENT_INVALID",
          "Unknown manual gate",
        );
      options.manualGates[name] = value.slice(separator + 1);
    } else
      throw evidenceError(
        "RELEASE_EVIDENCE_ARGUMENT_INVALID",
        "unknown release evidence option",
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
        ":release evidence manifest failed\n",
    );
    process.exitCode = 1;
  }
}

module.exports = {
  REQUIRED_CHECKS,
  MANUAL_GATES,
  EVIDENCE_FIELDS,
  createReleaseEvidenceManifest,
  parseArguments,
  summarizeArtifactManifest,
  summarizeRollbackReport,
  summarizeReport,
};
