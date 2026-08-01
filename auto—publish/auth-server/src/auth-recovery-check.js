const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
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

function copyCompanion(source, isolatedRoot, suffix) {
  const companion = `${source}${suffix}`;
  let stats;
  try { stats = fs.lstatSync(companion); } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw databaseError("AUTH_RESTORE_COMPANION_UNREADABLE");
  }
  if (!stats.isFile()) throw databaseError("AUTH_RESTORE_COMPANION_NOT_REGULAR");
  try {
    fs.copyFileSync(companion, path.join(isolatedRoot, `${path.basename(source)}${suffix}`));
    return true;
  } catch (error) {
    if (error && ["EACCES", "EPERM"].includes(error.code)) throw databaseError("AUTH_RESTORE_COMPANION_UNREADABLE");
    throw databaseError("AUTH_RESTORE_ISOLATION_FAILED");
  }
}

function copyToIsolation(source, parent) {
  let isolatedRoot;
  try { isolatedRoot = fs.mkdtempSync(path.join(parent, "autopublish-auth-restore-")); } catch (_) {
    throw databaseError("AUTH_RESTORE_ISOLATION_FAILED");
  }
  const isolatedFile = path.join(isolatedRoot, path.basename(source));
  try {
    fs.copyFileSync(source, isolatedFile);
    const wal = copyCompanion(source, isolatedRoot, "-wal");
    const shm = copyCompanion(source, isolatedRoot, "-shm");
    return { isolatedRoot, isolatedFile, wal, shm };
  } catch (error) {
    try { fs.rmSync(isolatedRoot, { recursive: true, force: true }); } catch (_) { /* preserve the isolation failure */ }
    throw error;
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
