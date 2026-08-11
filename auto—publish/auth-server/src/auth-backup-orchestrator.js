const fs = require("node:fs");
const path = require("node:path");
const { SqliteAuthRepository } = require("./repositories/sqlite-auth-repository");
const {
  assertRegularReadableFile,
  verifyDatabaseFile,
  databaseError,
  annotateCleanupFailure,
} = require("./auth-database-verifier");

function operationError(code, details, cause) {
  const error = databaseError(code, details);
  if (cause) error.cause = cause;
  return error;
}

function backupFailureCode(error) {
  if (error && ["ENOSPC", "SQLITE_FULL"].includes(error.code)) return "AUTH_BACKUP_DESTINATION_FULL";
  if (error && ["EACCES", "EPERM", "EROFS", "SQLITE_READONLY"].includes(error.code)) return "AUTH_BACKUP_DESTINATION_NOT_WRITABLE";
  if (error && /disk is full|no space|SQLITE_FULL/i.test(String(error.message || ""))) return "AUTH_BACKUP_DESTINATION_FULL";
  return "AUTH_BACKUP_FAILED";
}

function assertDestinationCandidate(destination) {
  let stats;
  try { stats = fs.lstatSync(destination); } catch (error) {
    if (error && error.code === "ENOENT") return;
    if (error && ["EACCES", "EPERM"].includes(error.code)) throw operationError("AUTH_BACKUP_DESTINATION_NOT_WRITABLE", { reasonCode: error.code }, error);
    throw operationError("AUTH_BACKUP_DESTINATION_INVALID", { reasonCode: error && error.code ? error.code : "destination_check_failed" }, error);
  }
  if (!stats.isFile()) throw operationError("AUTH_BACKUP_DESTINATION_INVALID", { reasonCode: "AUTH_DB_NOT_REGULAR_FILE" });
  try { fs.accessSync(destination, fs.constants.W_OK); } catch (error) {
    throw operationError("AUTH_BACKUP_DESTINATION_NOT_WRITABLE", { reasonCode: error && error.code ? error.code : "destination_not_writable" }, error);
  }
}

async function backupAuthDatabase(options) {
  const opts = options || {};
  const source = opts.source;
  const destination = opts.destination;
  if (typeof source !== "string" || !source.trim()) throw operationError("AUTH_BACKUP_SOURCE_REQUIRED");
  if (typeof destination !== "string" || !destination.trim()) throw operationError("AUTH_BACKUP_DESTINATION_REQUIRED");
  if (path.resolve(source) === path.resolve(destination)) throw operationError("AUTH_BACKUP_DESTINATION_INVALID", { reasonCode: "AUTH_BACKUP_SOURCE_EQUALS_DESTINATION" });
  assertDestinationCandidate(destination);
  try { assertRegularReadableFile(source); } catch (error) {
    throw operationError("AUTH_BACKUP_SOURCE_INVALID", { reasonCode: error && error.code ? error.code : "source_check_failed" }, error);
  }

  let repository;
  let sourceClosed = false;
  let failure;
  try {
    const factory = opts.repositoryFactory || ((repositoryOptions) => new SqliteAuthRepository(repositoryOptions));
    repository = factory({ filePath: source });
    if (!repository || typeof repository.close !== "function") throw operationError("AUTH_BACKUP_SOURCE_INVALID", { reasonCode: "AUTH_BACKUP_REPOSITORY_INVALID" });
    if (typeof opts.backupFn === "function") await opts.backupFn(repository, destination);
    else await repository.backupTo(destination);
  } catch (error) {
    const code = error && error.code && error.code.startsWith("AUTH_BACKUP_") ? error.code : backupFailureCode(error);
    failure = operationError(code, { stage: "backup" }, error);
  } finally {
    if (repository) {
      try { repository.close(); sourceClosed = true; } catch (error) {
        if (!failure) failure = operationError("AUTH_BACKUP_SOURCE_CLOSE_FAILED", { stage: "close" }, error);
        else annotateCleanupFailure(failure, "AUTH_BACKUP_SOURCE_CLOSE_FAILED");
      }
    }
  }
  if (failure) throw failure;

  let verification;
  try {
    verification = verifyDatabaseFile(destination);
  } catch (error) {
    throw operationError("AUTH_BACKUP_DESTINATION_UNRECOVERABLE", { reasonCode: error && error.code ? error.code : "verification_failed" }, error);
  }
  return {
    ok: true,
    sourceClosedBeforeVerification: sourceClosed,
    destinationVerified: true,
    verification,
  };
}

module.exports = { backupAuthDatabase, backupFailureCode, assertDestinationCandidate };
