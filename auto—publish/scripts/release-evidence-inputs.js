"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  STATUSES,
  VERSION_PATTERN,
  ROLLBACK_PLAN,
} = require("./release-evidence-contract");
const {
  validateManifest,
} = require("../desktop/packaging/artifact-manifest-reader");

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
  return { status, package: packageName, sha256, plan: plan || ROLLBACK_PLAN };
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
  let value = readJson(filename, "RELEASE_ARTIFACT_MANIFEST_INVALID");
  try {
    value = validateManifest(value);
  } catch (_) {
    throw evidenceError(
      "RELEASE_ARTIFACT_MANIFEST_INVALID",
      "Artifact manifest is invalid",
    );
  }
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

function currentCommit(root) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  } catch (_) {
    return null;
  }
}

function currentSourceState(root) {
  try {
    const porcelain = execFileSync(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all"],
      { cwd: root, encoding: "utf8" },
    );
    const diff = execFileSync(
      "git",
      ["diff", "--binary", "--no-ext-diff", "HEAD"],
      { cwd: root },
    );
    const untracked = execFileSync(
      "git",
      ["ls-files", "--others", "--exclude-standard", "-z"],
      { cwd: root },
    );
    const digest = crypto.createHash("sha256");
    digest.update("status\0");
    digest.update(porcelain);
    digest.update("\0diff\0");
    digest.update(diff);
    digest.update("\0untracked\0");
    digest.update(untracked);
    for (const relativePath of untracked
      .toString("utf8")
      .split("\0")
      .filter(Boolean)) {
      digest.update("\0path\0");
      digest.update(relativePath);
      digest.update("\0");
      const filename = path.resolve(root, relativePath);
      try {
        const stats = fs.lstatSync(filename);
        if (stats.isSymbolicLink()) {
          digest.update("symlink\0");
          digest.update(fs.readlinkSync(filename));
        } else if (stats.isFile()) {
          digest.update("file\0");
          digest.update(fs.readFileSync(filename));
        } else {
          digest.update("other\0");
        }
      } catch (error) {
        digest.update("unreadable\0");
        digest.update(error.code || "UNKNOWN");
      }
    }
    return {
      status: porcelain.trim() === "" ? "CLEAN" : "DIRTY",
      diffSha256: digest.digest("hex"),
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
  if (!["CLEAN", "DIRTY", "UNKNOWN"].includes(status) || !diffSha256)
    return null;
  return { status, diffSha256 };
}

function safeSchemaVersion(value, fallback) {
  return Number.isSafeInteger(value) && value >= 1 ? value : fallback;
}

module.exports = {
  evidenceError,
  safeStatus,
  safeHash,
  safeVersion,
  safeIdentifier,
  safeRelative,
  safeRollbackPackage,
  readJson,
  inputHash,
  summarizeRollbackReport,
  summarizeReport,
  summarizeArtifactManifest,
  currentCommit,
  currentSourceState,
  normalizeSourceState,
  safeSchemaVersion,
};
