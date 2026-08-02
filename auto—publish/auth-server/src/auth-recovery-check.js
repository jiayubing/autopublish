const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  assertRegularReadableFile,
  verifyDatabaseFile,
  databaseError,
} = require("./auth-database-verifier");

function tempParent(options) {
  const candidate = options && options.tempRoot ? options.tempRoot : os.tmpdir();
  if (typeof candidate !== "string" || !path.isAbsolute(candidate)) throw databaseError("AUTH_RESTORE_TEMP_ROOT_INVALID");
  let stats;
  try { stats = fs.lstatSync(candidate); } catch (_) { throw databaseError("AUTH_RESTORE_TEMP_ROOT_INVALID"); }
  if (!stats.isDirectory()) throw databaseError("AUTH_RESTORE_TEMP_ROOT_INVALID");
  return path.resolve(candidate);
}

function copyToIsolation(source, parent) {
  let isolatedRoot;
  try { isolatedRoot = fs.mkdtempSync(path.join(parent, "autopublish-auth-restore-")); } catch (_) {
    throw databaseError("AUTH_RESTORE_ISOLATION_FAILED");
  }
  const isolatedFile = path.join(isolatedRoot, path.basename(source));
  let sourceDb;
  try {
    sourceDb = new DatabaseSync(source, { readOnly: true });
    sourceDb.exec("BEGIN");
    let snapshot;
    try {
      snapshot = sourceDb.serialize();
    } catch (error) {
      try { sourceDb.exec("ROLLBACK"); } catch (_) { /* preserve the verification result */ }
      if (!/not a database|malformed/i.test(String(error && error.message))) throw error;
      try {
        fs.copyFileSync(source, isolatedFile);
        return { isolatedRoot, isolatedFile, wal: false, shm: false };
      } catch (_) {
        throw databaseError("AUTH_RESTORE_ISOLATION_FAILED");
      }
    }
    sourceDb.exec("COMMIT");
    fs.writeFileSync(isolatedFile, snapshot);
    return { isolatedRoot, isolatedFile, wal: false, shm: false };
  } catch (_) {
    try { if (sourceDb) sourceDb.exec("ROLLBACK"); } catch (_) { /* preserve the isolation failure */ }
    try { fs.rmSync(isolatedRoot, { recursive: true, force: true }); } catch (_) { /* preserve the isolation failure */ }
    throw databaseError("AUTH_RESTORE_ISOLATION_FAILED");
  } finally {
    if (sourceDb) { try { sourceDb.close(); } catch (_) { /* preserve the isolation result */ } }
  }
}

function checkAuthRestore(filePath, options) {
  assertRegularReadableFile(filePath);
  const parent = tempParent(options);
  const isolation = copyToIsolation(filePath, parent);
  let verification;
  let failure;
  try {
    verification = verifyDatabaseFile(isolation.isolatedFile);
  } catch (error) {
    failure = error;
  } finally {
    try { fs.rmSync(isolation.isolatedRoot, { recursive: true, force: true }); } catch (error) {
      if (!failure) failure = databaseError("AUTH_RESTORE_CLEANUP_FAILED");
    }
  }
  if (failure) throw failure;
  return {
    ok: true,
    isolated: true,
    copiedWal: isolation.wal,
    copiedShm: isolation.shm,
    verification,
  };
}

module.exports = { checkAuthRestore, copyToIsolation, tempParent };
