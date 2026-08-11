const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { reportDiagnostic } = require("../diagnostics/diagnostic-producer");

function lockError(code, message, cause) {
  const error = new Error(message || code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function createArticleLock(options) {
  const opts = options || {};
  const fsApi = opts.fs || fs;
  const makeError = typeof opts.error === "function" ? opts.error : lockError;
  const fault = typeof opts.fault === "function" ? opts.fault : function () {};

  function fail(code, message, cause) {
    throw makeError(code, message, cause);
  }
  function exists(filename) {
    try {
      fsApi.lstatSync(filename);
      return true;
    } catch (error) {
      if (error && error.code === "ENOENT") return false;
      throw error;
    }
  }
  function assertRegularFile(filename) {
    let stats;
    try {
      stats = fsApi.lstatSync(filename);
    } catch (error) {
      fail("ARTICLE_LOCK_INVALID", "Article lock ownership is unknown", error);
    }
    if (!stats.isFile() || stats.isSymbolicLink())
      fail("ARTICLE_LOCK_INVALID", "Article lock ownership is unknown");
  }
  function removeRegularFile(filename) {
    if (!exists(filename)) return;
    assertRegularFile(filename);
    fsApi.unlinkSync(filename);
  }
  function readLockOwner(lock) {
    let directoryStat;
    try {
      directoryStat = fsApi.lstatSync(lock.directory);
    } catch (error) {
      fail("ARTICLE_LOCK_INVALID", "Article lock directory is unsafe", error);
    }
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink())
      fail("ARTICLE_LOCK_INVALID", "Article lock directory is unsafe");
    const entries = fsApi.readdirSync(lock.directory);
    if (entries.length !== 1 || entries[0] !== "owner.json")
      fail("ARTICLE_LOCK_INVALID", "Article lock ownership is unknown");
    assertRegularFile(lock.owner);
    let owner;
    try {
      owner = JSON.parse(fsApi.readFileSync(lock.owner, "utf8"));
    } catch (error) {
      fail("ARTICLE_LOCK_INVALID", "Article lock ownership is unknown", error);
    }
    if (
      !owner ||
      owner.version !== 1 ||
      typeof owner.token !== "string" ||
      !/^[a-f0-9-]{36}$/.test(owner.token) ||
      !Number.isSafeInteger(owner.pid) ||
      owner.pid < 1 ||
      typeof owner.createdAt !== "string" ||
      Number.isNaN(Date.parse(owner.createdAt))
    ) {
      fail("ARTICLE_LOCK_INVALID", "Article lock ownership is unknown");
    }
    return owner;
  }
  function processIsLive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if (error && error.code === "ESRCH") return false;
      if (error && error.code === "EPERM") return true;
      fail(
        "ARTICLE_LOCK_INVALID",
        "Article lock owner state is unknown",
        error,
      );
    }
  }
  function removeStaleLock(lock, expectedOwner) {
    const quarantine = lock.directory + ".stale-" + crypto.randomUUID();
    try {
      fsApi.renameSync(lock.directory, quarantine);
    } catch (error) {
      if (error && ["ENOENT", "EEXIST"].includes(error.code)) return false;
      fail(
        "ARTICLE_LOCK_INVALID",
        "Stale article lock could not be isolated",
        error,
      );
    }
    const captured = {
      directory: quarantine,
      owner: path.join(quarantine, "owner.json"),
    };
    const actualOwner = readLockOwner(captured);
    if (actualOwner.token !== expectedOwner.token) {
      if (!exists(lock.directory)) fsApi.renameSync(quarantine, lock.directory);
      fail(
        "ARTICLE_LOCK_INVALID",
        "Article lock ownership changed unexpectedly",
      );
    }
    removeRegularFile(captured.owner);
    fsApi.rmdirSync(captured.directory);
    return true;
  }
  function acquire(files) {
    const lock = {
      directory: path.join(
        files.directory,
        path.basename(files.json, ".json") + ".article-lock",
      ),
    };
    lock.owner = path.join(lock.directory, "owner.json");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const owner = {
        version: 1,
        token: crypto.randomUUID(),
        pid: process.pid,
        createdAt: new Date().toISOString(),
      };
      const candidateDirectory = lock.directory + ".acquire-" + owner.token;
      const candidate = {
        directory: candidateDirectory,
        owner: path.join(candidateDirectory, "owner.json"),
      };
      try {
        fsApi.mkdirSync(candidate.directory);
        fault("after-candidate-directory", { files: files, owner: owner });
        fsApi.writeFileSync(candidate.owner, JSON.stringify(owner) + "\n", {
          encoding: "utf8",
          flag: "wx",
        });
        fault("after-candidate-owner", { files: files, owner: owner });
        fsApi.renameSync(candidate.directory, lock.directory);
        fault("after-acquire-rename", { files: files, owner: owner });
        return { lock: lock, owner: owner };
      } catch (error) {
        let cleanupError = null;
        try {
          if (exists(candidate.owner)) removeRegularFile(candidate.owner);
        } catch (failure) {
          cleanupError = cleanupError || failure;
          reportDiagnostic({
            code: "ARTICLE_LOCK_CANDIDATE_CLEANUP_FAILED",
            module: "article-lock",
            category: "storage",
            operationId: "article-lock-acquire",
            metadata: {
              operation: "candidate-owner-cleanup",
              phase: "cleanup",
              outcome: "failed",
              errorCode: failure && /^[A-Z][A-Z0-9_]{1,127}$/.test(failure.code || "")
                ? failure.code
                : "ARTICLE_LOCK_CLEANUP_FAILED"
            }
          });
        }
        try {
          if (exists(candidate.directory)) fsApi.rmdirSync(candidate.directory);
        } catch (failure) {
          cleanupError = cleanupError || failure;
          reportDiagnostic({
            code: "ARTICLE_LOCK_CANDIDATE_CLEANUP_FAILED",
            module: "article-lock",
            category: "storage",
            operationId: "article-lock-acquire",
            metadata: {
              operation: "candidate-directory-cleanup",
              phase: "cleanup",
              outcome: "failed",
              errorCode: failure && /^[A-Z][A-Z0-9_]{1,127}$/.test(failure.code || "")
                ? failure.code
                : "ARTICLE_LOCK_CLEANUP_FAILED"
            }
          });
        }
        if (cleanupError) throw error;
        if (!exists(lock.directory)) throw error;
      }
      const existing = readLockOwner(lock);
      if (processIsLive(existing.pid))
        fail(
          "ARTICLE_STORE_BUSY",
          "Article is being changed by another process",
        );
      if (!removeStaleLock(lock, existing)) continue;
    }
    fail("ARTICLE_STORE_BUSY", "Article lock could not be acquired");
  }
  function release(held) {
    const current = readLockOwner(held.lock);
    if (current.token !== held.owner.token)
      fail("ARTICLE_LOCK_INVALID", "Article lock ownership was lost");
    const releasedDirectory =
      held.lock.directory + ".release-" + held.owner.token;
    const released = {
      directory: releasedDirectory,
      owner: path.join(releasedDirectory, "owner.json"),
    };
    fsApi.renameSync(held.lock.directory, released.directory);
    fault("after-release-rename", { owner: held.owner });
    const captured = readLockOwner(released);
    if (captured.token !== held.owner.token)
      fail("ARTICLE_LOCK_INVALID", "Article lock ownership was lost");
    removeRegularFile(released.owner);
    fsApi.rmdirSync(released.directory);
  }
  function withLock(files, operation) {
    const held = acquire(files);
    let operationError = null;
    try {
      return operation();
    } catch (error) {
      operationError = error;
      throw error;
    } finally {
      try {
        release(held);
      } catch (releaseError) {
        reportDiagnostic({
          code: "ARTICLE_LOCK_RELEASE_FAILED",
          module: "article-lock",
          category: "storage",
          operationId: "article-lock-release",
          metadata: {
            operation: "lock-release",
            phase: "cleanup",
            outcome: operationError ? "secondary-failure" : "failed",
            errorCode: releaseError && /^[A-Z][A-Z0-9_]{1,127}$/.test(releaseError.code || "")
              ? releaseError.code
              : "ARTICLE_LOCK_RELEASE_FAILED"
          }
        });
        if (!operationError) throw releaseError;
      }
    }
  }
  return { acquire, release, withLock, readOwner: readLockOwner };
}

module.exports = { createArticleLock };
