const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  isRecoveryGuardBusy,
  withRecoveryGuard,
} = require("./operational-store-recovery-guard");
const {
  reportDiagnostic,
} = require("../../../diagnostics/diagnostic-producer");

const activeStores = new Set();

function ownerLockPath(filename) {
  return path.join(path.dirname(filename), "runtime.lock");
}

function migrationLockPath(filename) {
  return path.join(path.dirname(filename), "migration.lock");
}

function ownerFailure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function reportOwnerCleanupFailure(operation, failureKind) {
  reportDiagnostic({
    code: "OPERATIONAL_OWNER_CLEANUP_FAILED",
    module: "operational-store-owner-lease",
    category: "storage",
    metadata: { operation, phase: "cleanup", failureKind },
  });
}

function lockFailure(fail, code) {
  return typeof fail === "function" ? fail(code) : ownerFailure(code);
}

function ownerProcessAlive(pid, fail, unavailableCode) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && error.code === "EPERM") return true;
    if (error && error.code === "ESRCH") return false;
    throw lockFailure(
      fail,
      unavailableCode || "OPERATIONAL_WRITE_OWNER_UNAVAILABLE",
    );
  }
}

function readLock(
  filename,
  fail,
  unavailableCode = "OPERATIONAL_WRITE_OWNER_UNAVAILABLE",
) {
  try {
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw lockFailure(fail, unavailableCode);
    const value = JSON.parse(fs.readFileSync(filename, "utf8"));
    if (
      !value ||
      !Number.isInteger(value.pid) ||
      value.pid <= 0 ||
      typeof value.token !== "string" ||
      value.token.length === 0
    )
      throw lockFailure(fail, unavailableCode);
    return value;
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    if (error && error.code === unavailableCode) throw error;
    throw lockFailure(fail, unavailableCode);
  }
}

function assertStoreAvailable(filename, fail) {
  if (activeStores.has(filename)) throw fail("OPERATIONAL_WRITE_OWNER_EXISTS");
}

function assertMigrationLeaseAvailable(filename, fail, migrationOwner) {
  const lock = migrationLockPath(filename);
  let value;
  try {
    value = readLock(lock, fail, "OPERATIONAL_MIGRATION_LEASE_UNAVAILABLE");
  } catch (error) {
    if (error && error.code === "OPERATIONAL_MIGRATION_LEASE_UNAVAILABLE")
      throw fail("OPERATIONAL_MIGRATION_LEASE_ACTIVE");
    throw error;
  }
  if (!value) return;
  if (
    migrationOwner &&
    migrationOwner.lock === lock &&
    typeof migrationOwner.token === "string" &&
    value.token === migrationOwner.token
  )
    return;
  if (
    ownerProcessAlive(
      value.pid,
      fail,
      "OPERATIONAL_MIGRATION_LEASE_UNAVAILABLE",
    )
  )
    throw fail("OPERATIONAL_MIGRATION_LEASE_ACTIVE");
  try {
    fs.unlinkSync(lock);
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw fail("OPERATIONAL_MIGRATION_LEASE_ACTIVE");
  }
}

function releaseRuntimeOwnerUnderGuard(runtimeOwner, fail) {
  if (!runtimeOwner) return;
  const value = readLock(runtimeOwner.lock, fail);
  if (value && value.token === runtimeOwner.token) {
    try {
      fs.unlinkSync(runtimeOwner.lock);
    } catch (error) {
      if (error && error.code === "ENOENT") return;
      throw lockFailure(fail, "OPERATIONAL_WRITE_OWNER_RELEASE_FAILED");
    }
  }
}

function acquireRuntimeOwner(
  filename,
  fail,
  verifyExistingDatabase,
  afterAcquire,
  migrationOwner,
) {
  const lock = ownerLockPath(filename);
  try {
    return withRecoveryGuard(filename, () => {
      assertMigrationLeaseAvailable(filename, fail, migrationOwner);
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
          const owner = readLock(lock, fail);
          if (!owner) throw fail("OPERATIONAL_WRITE_OWNER_EXISTS");
          if (ownerProcessAlive(owner && owner.pid, fail))
            throw fail("OPERATIONAL_WRITE_OWNER_EXISTS");
          if (fs.existsSync(filename)) verifyExistingDatabase(filename);
          const currentOwner = readLock(lock, fail);
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
          assertMigrationLeaseAvailable(filename, fail, migrationOwner);
          return runtimeOwner;
        } catch (error) {
          try {
            releaseRuntimeOwnerUnderGuard(runtimeOwner, fail);
          } catch (cleanupError) {
            if (error && !error.cleanupCode)
              error.cleanupCode = cleanupError.code;
            reportOwnerCleanupFailure("runtime-owner-acquire", "release");
          }
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

function acquireMigrationOwner(filename, fail, verifyExistingDatabase) {
  const lock = migrationLockPath(filename);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  try {
    return withRecoveryGuard(filename, () => {
      assertStoreAvailable(filename, fail);
      const runtimeLock = ownerLockPath(filename);
      for (;;) {
        const runtimeOwner = readLock(
          runtimeLock,
          fail,
          "OPERATIONAL_WRITE_OWNER_UNAVAILABLE",
        );
        if (!runtimeOwner) break;
        if (
          ownerProcessAlive(
            runtimeOwner.pid,
            fail,
            "OPERATIONAL_WRITE_OWNER_UNAVAILABLE",
          )
        )
          throw fail("OPERATIONAL_WRITE_OWNER_EXISTS");
        if (fs.existsSync(filename)) verifyExistingDatabase(filename);
        const current = readLock(
          runtimeLock,
          fail,
          "OPERATIONAL_WRITE_OWNER_UNAVAILABLE",
        );
        if (!current || current.token !== runtimeOwner.token) continue;
        try {
          fs.unlinkSync(runtimeLock);
        } catch (_) {
          throw fail("OPERATIONAL_WRITE_OWNER_EXISTS");
        }
      }
      for (;;) {
        const token = crypto.randomUUID();
        try {
          fs.writeFileSync(
            lock,
            JSON.stringify({ version: 1, pid: process.pid, token }),
            { encoding: "utf8", flag: "wx" },
          );
          return Object.freeze({ lock, token });
        } catch (error) {
          if (!error || error.code !== "EEXIST")
            throw fail("OPERATIONAL_MIGRATION_LEASE_UNAVAILABLE");
          const owner = readLock(
            lock,
            fail,
            "OPERATIONAL_MIGRATION_LEASE_UNAVAILABLE",
          );
          if (
            !owner ||
            ownerProcessAlive(
              owner.pid,
              fail,
              "OPERATIONAL_MIGRATION_LEASE_UNAVAILABLE",
            )
          )
            throw fail("OPERATIONAL_MIGRATION_LEASE_ACTIVE");
          const current = readLock(
            lock,
            fail,
            "OPERATIONAL_MIGRATION_LEASE_UNAVAILABLE",
          );
          if (!current || current.token !== owner.token) continue;
          try {
            fs.unlinkSync(lock);
          } catch (error) {
            if (error && error.code === "ENOENT") continue;
            throw fail("OPERATIONAL_MIGRATION_LEASE_ACTIVE");
          }
        }
      }
    });
  } catch (error) {
    if (isRecoveryGuardBusy(error))
      throw fail("OPERATIONAL_MIGRATION_LEASE_ACTIVE");
    if (error && error.code === "OPERATIONAL_RECOVERY_GUARD_UNAVAILABLE")
      throw fail("OPERATIONAL_MIGRATION_LEASE_UNAVAILABLE");
    throw error;
  }
}

function releaseMigrationOwner(filename, migrationOwner) {
  if (!migrationOwner) return;
  const fail = (code) => ownerFailure(code);
  withRecoveryGuard(
    filename,
    () => {
      const owner = readLock(
        migrationOwner.lock,
        fail,
        "OPERATIONAL_MIGRATION_LEASE_UNAVAILABLE",
      );
      if (owner && owner.token === migrationOwner.token) {
        try {
          fs.unlinkSync(migrationOwner.lock);
        } catch (error) {
          if (error && error.code === "ENOENT") return;
          throw fail("OPERATIONAL_MIGRATION_LEASE_RELEASE_FAILED");
        }
      }
    },
    5000,
  );
}

function registerStore(filename) {
  activeStores.add(filename);
}

function releaseRuntimeOwner(filename, runtimeOwner) {
  if (!runtimeOwner) {
    activeStores.delete(filename);
    return;
  }
  const fail = (code) => ownerFailure(code);
  try {
    withRecoveryGuard(
      filename,
      () => releaseRuntimeOwnerUnderGuard(runtimeOwner, fail),
      5000,
    );
  } catch (error) {
    if (
      error &&
      [
        "OPERATIONAL_RECOVERY_GUARD_BUSY",
        "OPERATIONAL_RECOVERY_GUARD_UNAVAILABLE",
      ].includes(error.code)
    )
      throw fail("OPERATIONAL_WRITE_OWNER_RELEASE_FAILED");
    throw error;
  }
  activeStores.delete(filename);
}

module.exports = {
  ownerLockPath,
  migrationLockPath,
  assertStoreAvailable,
  acquireMigrationOwner,
  acquireRuntimeOwner,
  registerStore,
  releaseRuntimeOwner,
  releaseMigrationOwner,
};
