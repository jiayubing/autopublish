const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  SqliteAuthRepository,
} = require("./repositories/sqlite-auth-repository");
const { backupAuthDatabase } = require("./auth-backup-orchestrator");
const { checkAuthRestore } = require("./auth-recovery-check");
const { databaseError, annotateCleanupFailure } = require("./auth-database-verifier");

function within(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function assertTemporaryRoot(root) {
  if (typeof root !== "string" || !path.isAbsolute(root))
    throw databaseError("AUTH_RECOVERY_TEMP_ROOT_REQUIRED");
  if (
    process.env.NODE_ENV === "production" ||
    process.env.AUTH_ENV === "production" ||
    process.env.AUTOPUBLISH_ENV === "production"
  ) {
    throw databaseError("AUTH_RECOVERY_PRODUCTION_ENV_REJECTED");
  }
  if (process.env.AUTH_DB_PATH || process.env.AUTH_DB_DIR)
    throw databaseError("AUTH_RECOVERY_DATABASE_ENV_REJECTED");
  let stats;
  try {
    stats = fs.lstatSync(root);
  } catch (_) {
    throw databaseError("AUTH_RECOVERY_TEMP_ROOT_INVALID");
  }
  if (!stats.isDirectory() || !within(os.tmpdir(), root))
    throw databaseError("AUTH_RECOVERY_TEMP_ROOT_INVALID");
  return path.resolve(root);
}

function fixtureUser() {
  return {
    id: "fixture-user",
    loginName: "fixture-user",
    passwordHash: "scrypt$fixture",
    role: "user",
    enabled: true,
    mustChangePassword: false,
    maxDevices: 1,
    note: "fixture",
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: null,
    passwordChangedAt: "2026-01-01T00:00:00.000Z",
  };
}

async function runRecoveryDrill(root) {
  const temporaryRoot = assertTemporaryRoot(root);
  let runRoot;
  let repository;
  let primaryError;
  try {
    runRoot = fs.mkdtempSync(
      path.join(temporaryRoot, "autopublish-auth-drill-"),
    );
    const sourceDirectory = path.join(runRoot, "source");
    fs.mkdirSync(sourceDirectory);
    const source = path.join(sourceDirectory, "auth.db");
    const destination = path.join(runRoot, "backup.db");
    repository = new SqliteAuthRepository({ filePath: source });
    repository.createUser(fixtureUser());
    const walPresentBeforeCheck = fs.existsSync(`${source}-wal`);
    const restoreWhileOpen = checkAuthRestore(source, { tempRoot: runRoot });
    repository.close();
    repository = null;

    const backup = await backupAuthDatabase({ source, destination });
    const restoredBackup = checkAuthRestore(destination, { tempRoot: runRoot });
    const corrupt = path.join(runRoot, "corrupt.db");
    fs.writeFileSync(corrupt, "not a sqlite database");
    let corruptCode = null;
    try {
      checkAuthRestore(corrupt, { tempRoot: runRoot });
    } catch (error) {
      corruptCode = error.code || "AUTH_DB_OPEN_FAILED";
    }
    if (!corruptCode)
      throw databaseError("AUTH_RECOVERY_DRILL_CORRUPT_CASE_PASSED");
    return {
      ok: true,
      temporaryOnly: true,
      walPresentBeforeCheck,
      restoreWhileOpen: restoreWhileOpen.verification.schemaVersion,
      backup: {
        schemaVersion: backup.verification.schemaVersion,
        integrity: backup.verification.integrity,
        contentHash: backup.verification.contentHash,
      },
      restoredBackup: {
        schemaVersion: restoredBackup.verification.schemaVersion,
        integrity: restoredBackup.verification.integrity,
        contentHash: restoredBackup.verification.contentHash,
      },
      corruptCode,
    };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    let cleanupCode = null;
    if (repository) {
      try {
        repository.close();
      } catch (_) {
        cleanupCode = "AUTH_RECOVERY_REPOSITORY_CLOSE_FAILED";
      }
    }
    if (runRoot) {
      try {
        fs.rmSync(runRoot, { recursive: true, force: true });
      } catch (_) {
        cleanupCode = cleanupCode || "AUTH_RECOVERY_CLEANUP_FAILED";
      }
    }
    if (cleanupCode) {
      if (primaryError) annotateCleanupFailure(primaryError, cleanupCode);
      else throw databaseError(cleanupCode);
    }
  }
}

module.exports = { assertTemporaryRoot, runRecoveryDrill, fixtureUser };
