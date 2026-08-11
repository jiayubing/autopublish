"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runRecoveryDrill } = require("../src/recovery-fixtures");

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
          "AUTH_BACKUP_EVIDENCE_ARGUMENT_INVALID",
          "output is required",
        );
      options.output = path.resolve(value);
    } else {
      throw evidenceError(
        "AUTH_BACKUP_EVIDENCE_ARGUMENT_INVALID",
        "unknown option",
      );
    }
  }
  return options;
}

async function createBackupRestoreEvidence(options) {
  const opts = options || {};
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "autopublish-auth-backup-"),
  );
  const startedAt = Date.now();
  try {
    const result = await runRecoveryDrill(temporaryRoot);
    const hashesMatch =
      result.backup.contentHash === result.restoredBackup.contentHash;
    if (
      result.ok !== true ||
      result.temporaryOnly !== true ||
      result.backup.integrity !== "ok" ||
      result.restoredBackup.integrity !== "ok" ||
      !hashesMatch ||
      !result.corruptCode
    ) {
      throw evidenceError(
        "AUTH_BACKUP_RESTORE_EVIDENCE_FAILED",
        "backup restore evidence did not converge",
      );
    }
    const report = {
      status: "PASSED",
      operation: "auth-backup-restore-fixture",
      schemaVersion: result.backup.schemaVersion,
      destinationVerification: "PASSED",
      restoreCheck: "PASSED",
      corruptionGate: "PASSED",
      durationMs: Date.now() - startedAt,
      count: 3,
      passed: 3,
      failed: 0,
      skipped: 0,
      sha256: result.backup.contentHash,
    };
    const output = path.resolve(
      opts.output ||
        path.join(process.cwd(), "build", "evidence", "backup-restore.json"),
    );
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
      encoding: "utf8",
      mode: 0o600,
    });
    return report;
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  createBackupRestoreEvidence(parseArguments(process.argv.slice(2)))
    .then((report) => process.stdout.write(JSON.stringify(report) + "\n"))
    .catch((error) => {
      const code =
        error &&
        typeof error.code === "string" &&
        /^AUTH_[A-Z0-9_]{1,72}$/.test(error.code)
          ? error.code
          : "AUTH_BACKUP_EVIDENCE_FAILED";
      process.stderr.write(code + ":backup restore evidence failed\n");
      process.exitCode = 1;
    });
}

module.exports = { createBackupRestoreEvidence, parseArguments };
