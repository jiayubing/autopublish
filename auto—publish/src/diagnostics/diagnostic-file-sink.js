"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  createDiagnosticDirectoryPolicy,
} = require("./diagnostic-directory-policy");
const { parseDiagnosticRecord } = require("./diagnostic-schema");
const {
  createDiagnosticRotation,
  filenameFor,
  fileIndex,
} = require("./diagnostic-rotation");

const DEFAULTS = Object.freeze({
  maxFileBytes: 1024 * 1024,
  maxFiles: 5,
  maxTotalBytes: 5 * 1024 * 1024,
  maxAgeMs: 30 * 24 * 60 * 60 * 1000,
});

function sinkError(code) {
  const error = new Error("Diagnostic file sink operation failed");
  error.code = code;
  return error;
}

function permissionError(error) {
  return Boolean(error && ["EACCES", "EPERM", "EROFS"].includes(error.code));
}

function limit(value, fallback, maximum) {
  return Number.isSafeInteger(value) && value > 0
    ? Math.min(value, maximum)
    : fallback;
}

function ageLimit(value) {
  return Number.isSafeInteger(value) && value >= 0
    ? Math.min(value, 10 * 365 * 24 * 60 * 60 * 1000)
    : DEFAULTS.maxAgeMs;
}

function timestampMs(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()))
    throw sinkError("DIAGNOSTIC_CLEANUP_TIME_INVALID");
  return date.getTime();
}

function createDiagnosticFileSink(options) {
  const opts = options || {};
  const io = opts.fs || fs;
  const policy =
    opts.policy ||
    createDiagnosticDirectoryPolicy({
      fs: io,
      directory: opts.directory,
      root: opts.root,
      mode: opts.mode,
    });
  const maxTotalBytes = limit(
    opts.maxTotalBytes,
    DEFAULTS.maxTotalBytes,
    512 * 1024 * 1024,
  );
  const maxFileBytes = Math.min(
    limit(opts.maxFileBytes, DEFAULTS.maxFileBytes, 64 * 1024 * 1024),
    maxTotalBytes,
  );
  const maxFiles = limit(opts.maxFiles, DEFAULTS.maxFiles, 100);
  const maxAgeMs = ageLimit(opts.maxAgeMs);
  const clock = typeof opts.now === "function" ? opts.now : () => new Date();
  const lockingEnabled = !opts.fs && !opts.policy;
  const lockPath = path.join(policy.directory, ".diagnostics.lock");

  function pause(milliseconds) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
  }

  function withLock(callback) {
    if (!lockingEnabled || typeof io.openSync !== "function") return callback();
    policy.ensureDirectory();
    const startedAt = Date.now();
    let handle = null;
    while (!handle) {
      try {
        handle = io.openSync(lockPath, "wx", 0o600);
      } catch (error) {
        const contended =
          error && ["EEXIST", "EACCES", "EPERM"].includes(error.code);
        if (!contended) {
          if (permissionError(error))
            throw sinkError("DIAGNOSTIC_FILE_PERMISSION_DENIED");
          throw sinkError("DIAGNOSTIC_LOCK_FAILED");
        }
        try {
          const lockStat = io.statSync(lockPath);
          if (Date.now() - Number(lockStat.mtimeMs || 0) > 30000) {
            io.unlinkSync(lockPath);
            continue;
          }
        } catch (statError) {
          if (statError && statError.code === "ENOENT") continue;
          if (permissionError(statError))
            throw sinkError("DIAGNOSTIC_FILE_PERMISSION_DENIED");
          throw sinkError("DIAGNOSTIC_LOCK_INSPECTION_FAILED");
        }
        if (Date.now() - startedAt >= 5000)
          throw sinkError("DIAGNOSTIC_LOCK_TIMEOUT");
        pause(5);
      }
    }
    let result;
    let callbackError = null;
    try {
      result = callback();
    } catch (error) {
      callbackError = error;
    }
    let cleanupError = null;
    try {
      io.closeSync(handle);
    } catch (error) {
      cleanupError = sinkError("DIAGNOSTIC_LOCK_CLOSE_FAILED");
    }
    try {
      io.unlinkSync(lockPath);
    } catch (error) {
      if (!error || error.code !== "ENOENT")
        cleanupError =
          cleanupError || sinkError("DIAGNOSTIC_LOCK_RELEASE_FAILED");
    }
    if (callbackError) throw callbackError;
    if (cleanupError) throw cleanupError;
    return result;
  }

  function safePath(filename) {
    if (path.isAbsolute(filename)) {
      const candidate = path.resolve(filename);
      if (path.dirname(candidate) !== path.resolve(policy.directory))
        throw sinkError("DIAGNOSTIC_DIRECTORY_PATH_ESCAPE");
      return policy.resolveChild(path.basename(candidate));
    }
    return policy.resolveChild(filename);
  }

  function serialized(input) {
    let record;
    try {
      record = parseDiagnosticRecord(input);
    } catch (_) {
      throw sinkError("DIAGNOSTIC_SERIALIZATION_REJECTED");
    }
    const line = JSON.stringify(record) + "\n";
    const bytes = Buffer.byteLength(line, "utf8");
    if (bytes > maxFileBytes || bytes > maxTotalBytes)
      throw sinkError("DIAGNOSTIC_RECORD_TOO_LARGE");
    return { record, line, bytes };
  }

  function remove(filename) {
    let candidate;
    try {
      candidate = safePath(filename);
      io.unlinkSync(candidate);
    } catch (error) {
      if (error && error.code === "ENOENT") return 0;
      if (error && /^DIAGNOSTIC_/.test(error.code || "")) throw error;
      if (permissionError(error))
        throw sinkError("DIAGNOSTIC_FILE_PERMISSION_DENIED");
      throw sinkError("DIAGNOSTIC_CLEANUP_FAILED");
    }
    return 1;
  }

  function rename(from, to) {
    try {
      io.renameSync(safePath(from), safePath(to));
    } catch (error) {
      if (error && /^DIAGNOSTIC_/.test(error.code || "")) throw error;
      if (permissionError(error))
        throw sinkError("DIAGNOSTIC_FILE_PERMISSION_DENIED");
      throw sinkError("DIAGNOSTIC_ROTATION_FAILED");
    }
  }

  const rotation = createDiagnosticRotation({
    fs: io,
    policy,
    maxFiles,
    maxTotalBytes,
    remove,
    rename,
  });

  function validLogFile(filename) {
    let content;
    try {
      content = io.readFileSync(safePath(filename), "utf8");
    } catch (error) {
      if (permissionError(error))
        throw sinkError("DIAGNOSTIC_FILE_PERMISSION_DENIED");
      throw sinkError("DIAGNOSTIC_FILE_READ_FAILED");
    }
    if (Buffer.byteLength(String(content), "utf8") > maxFileBytes) return false;
    const lines = String(content)
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "");
    try {
      lines.forEach((line) => parseDiagnosticRecord(JSON.parse(line)));
      return true;
    } catch (_) {
      return false;
    }
  }

  function cleanupUnlocked() {
    policy.ensureDirectory();
    const result = { removed: 0, skipped: 0, bytes: 0 };
    const now = timestampMs(clock());
    const entries = policy.listRegularFiles();
    result.skipped = entries.skipped;
    entries.files.forEach(function (item) {
      const index = fileIndex(item.path);
      if (index === null) return;
      if (!validLogFile(item.path)) {
        result.bytes += Number(item.stat.size || 0);
        result.removed += remove(item.path);
        return;
      }
      const age = now - Number(item.stat.mtimeMs || 0);
      if (index >= maxFiles || age > maxAgeMs) {
        result.bytes += Number(item.stat.size || 0);
        result.removed += remove(item.path);
      }
    });
    result.removed += rotation.enforceCapacity();
    return result;
  }

  function cleanup() {
    return withLock(cleanupUnlocked);
  }

  function initialize() {
    return withLock(() => {
      policy.ensureDirectory();
      return cleanupUnlocked();
    });
  }

  function appendUnlocked(input) {
    const encoded = serialized(input);
    policy.ensureDirectory();
    let current = policy.resolveChild(filenameFor(0));
    let size = 0;
    try {
      size = io.statSync(current).size;
    } catch (error) {
      if (!error || error.code !== "ENOENT") {
        if (permissionError(error))
          throw sinkError("DIAGNOSTIC_FILE_PERMISSION_DENIED");
        throw sinkError("DIAGNOSTIC_FILE_READ_FAILED");
      }
    }
    if (
      size + encoded.bytes > maxFileBytes ||
      rotation.usage() + encoded.bytes > maxTotalBytes
    )
      rotation.rotate();
    current = policy.resolveChild(filenameFor(0));
    try {
      io.appendFileSync(current, encoded.line, {
        encoding: "utf8",
        mode: 0o600,
      });
      if (typeof io.chmodSync === "function") io.chmodSync(current, 0o600);
    } catch (error) {
      if (permissionError(error))
        throw sinkError("DIAGNOSTIC_FILE_PERMISSION_DENIED");
      throw sinkError("DIAGNOSTIC_FILE_WRITE_FAILED");
    }
    rotation.enforceCapacity();
    return encoded.record;
  }

  function append(input) {
    return withLock(() => appendUnlocked(input));
  }

  return Object.freeze({
    append,
    add: append,
    write: append,
    initialize,
    cleanup,
    usage: () => rotation.usage(),
    listFiles: rotation.listFiles,
    directory: policy.directory,
    maxFileBytes,
    maxFiles,
    maxTotalBytes,
    maxAgeMs,
  });
}

module.exports = {
  createDiagnosticFileSink,
  filenameFor,
  fileIndex,
  sinkError,
};
