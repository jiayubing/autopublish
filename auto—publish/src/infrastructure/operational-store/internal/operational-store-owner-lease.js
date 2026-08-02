const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  isRecoveryGuardBusy,
  withRecoveryGuard,
} = require("./operational-store-recovery-guard");

const activeStores = new Set();

function ownerLockPath(filename) {
  return path.join(path.dirname(filename), "runtime.lock");
}

function migrationLockPath(filename) {
  return path.join(path.dirname(filename), "migration.lock");
}

function ownerProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}

function readLock(filename) {
  try {
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    const value = JSON.parse(fs.readFileSync(filename, "utf8"));
    return value && Number.isInteger(value.pid) ? value : null;
  } catch (_) {
    return null;
  }
}

function assertStoreAvailable(filename, fail) {
  if (activeStores.has(filename)) throw fail("OPERATIONAL_WRITE_OWNER_EXISTS");
}

function assertMigrationLeaseAvailable(filename, fail) {
  const lock = migrationLockPath(filename);
  if (!fs.existsSync(lock)) return;
  const value = readLock(lock);
  if (!value || ownerProcessAlive(value.pid))
    throw fail("OPERATIONAL_MIGRATION_LEASE_ACTIVE");
  try {
    fs.unlinkSync(lock);
  } catch (_) {
    throw fail("OPERATIONAL_MIGRATION_LEASE_ACTIVE");
  }
}

function releaseRuntimeOwnerUnderGuard(runtimeOwner) {
  if (!runtimeOwner) return;
  const value = readLock(runtimeOwner.lock);
  if (value && value.token === runtimeOwner.token) {
    try {
      fs.unlinkSync(runtimeOwner.lock);
    } catch (_) {}
  }
}

function acquireRuntimeOwner(
  filename,
  fail,
  verifyExistingDatabase,
  afterAcquire,
) {
  const lock = ownerLockPath(filename);
  try {
    return withRecoveryGuard(filename, () => {
      assertMigrationLeaseAvailable(filename, fail);
      for (;;) {
        const token = crypto.randomUUID();
        try {
          fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, token }), {
            encoding: "utf8",
            flag: "wx",
          });
        } catch (error) {
          if (!error || error.code !== "EEXIST")
            throw fail("OPERATIONAL_WRITE_OWNER_UNAVAILABLE");
          const owner = readLock(lock);
          if (!owner) throw fail("OPERATIONAL_WRITE_OWNER_EXISTS");
          if (ownerProcessAlive(owner && owner.pid))
            throw fail("OPERATIONAL_WRITE_OWNER_EXISTS");
          if (fs.existsSync(filename)) verifyExistingDatabase(filename);
          const currentOwner = readLock(lock);
          if (!currentOwner || currentOwner.token !== owner.token) continue;
          try {
            fs.unlinkSync(lock);
          } catch (_) {
            throw fail("OPERATIONAL_WRITE_OWNER_EXISTS");
          }
          continue;
        }
        const runtimeOwner = { lock, token };
        try {
          if (typeof afterAcquire === "function") afterAcquire(runtimeOwner);
          assertMigrationLeaseAvailable(filename, fail);
          return runtimeOwner;
        } catch (error) {
          releaseRuntimeOwnerUnderGuard(runtimeOwner);
          throw error;
        }
      }
    });
  } catch (error) {
    if (isRecoveryGuardBusy(error)) {
      if (fs.existsSync(migrationLockPath(filename)))
        throw fail("OPERATIONAL_MIGRATION_LEASE_ACTIVE");
      throw fail("OPERATIONAL_WRITE_OWNER_EXISTS");
    }
    if (error && error.code === "OPERATIONAL_RECOVERY_GUARD_UNAVAILABLE")
      throw fail("OPERATIONAL_WRITE_OWNER_UNAVAILABLE");
    throw error;
  }
}

function registerStore(filename) {
  activeStores.add(filename);
}

function releaseRuntimeOwner(filename, runtimeOwner) {
  activeStores.delete(filename);
  if (!runtimeOwner) return;
  try {
    withRecoveryGuard(
      filename,
      () => releaseRuntimeOwnerUnderGuard(runtimeOwner),
      5000,
    );
  } catch (_) {}
}

module.exports = {
  ownerLockPath,
  migrationLockPath,
  assertStoreAvailable,
  acquireRuntimeOwner,
  registerStore,
  releaseRuntimeOwner,
};
