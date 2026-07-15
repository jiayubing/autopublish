const fs = require("node:fs");
const path = require("node:path");

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMITS = Object.freeze({
  logAgeMs: 30 * DAY_MS,
  logBytes: 200 * 1024 * 1024,
  temporaryAgeMs: 7 * DAY_MS,
  docxCacheBytes: 500 * 1024 * 1024
});
const BUSY_STATES = new Set(["running", "waiting", "paused", "stopping", "stop_pending", "stopping_pending"]);

function maintenanceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function absoluteDirectory(value, name) {
  if (typeof value !== "string" || value.trim() === "" || !path.isAbsolute(value) || value.includes("\0")) {
    throw maintenanceError("STORAGE_MAINTENANCE_PATH_INVALID", name + " must be an absolute path");
  }
  return path.resolve(value);
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

function assertWhitelisted(localState, directory, name) {
  if (!isWithin(localState, directory)) {
    throw maintenanceError("STORAGE_MAINTENANCE_PATH_INVALID", name + " is outside local state");
  }
}

function stateName(value) {
  if (typeof value === "string") return value.toLowerCase();
  if (!value || typeof value !== "object") return "";
  return String(value.status || value.state || value.phase || value.lifecycle || "").toLowerCase();
}

function isBusy(value, seen) {
  if (typeof value === "string") return BUSY_STATES.has(value.toLowerCase());
  if (!value || (typeof value !== "object" && typeof value !== "function")) return false;
  const visited = seen || new Set();
  if (visited.has(value)) return false;
  visited.add(value);
  if (BUSY_STATES.has(stateName(value)) || value.isBatchRunning === true || value.isPlatformRunning === true ||
      value.isStopPending === true || value.isStopping === true || value.running === true || value.waiting === true ||
      value.paused === true) return true;
  return Object.keys(value).some(function(key) { return isBusy(value[key], visited); });
}

function createStorageMaintenanceService(options) {
  const opts = options || {};
  const io = opts.fs || fs;
  const values = opts.paths || {};
  const localState = absoluteDirectory(values.localState, "localState");
  const directories = {
    logs: absoluteDirectory(values.logs || path.join(localState, "logs"), "logs"),
    temporary: absoluteDirectory(values.temporary || values.tmp || path.join(localState, "tmp"), "temporary"),
    docxCache: absoluteDirectory(values.docxCache || values.clientMaterialCache || path.join(localState, "cache", "docx"), "docxCache"),
    profiles: absoluteDirectory(values.browserProfile || values.doubaoBrowser || path.join(localState, "browser"), "profiles")
  };
  Object.keys(directories).forEach(function(key) { assertWhitelisted(localState, directories[key], key); });
  const limits = Object.assign({}, DEFAULT_LIMITS, opts.limits || {});
  const now = typeof opts.now === "function" ? opts.now : function() { return new Date(); };
  const activity = typeof opts.getActivityState === "function" ? opts.getActivityState : function() { return null; };

  function clockMs() {
    const value = now();
    return value instanceof Date ? value.getTime() : new Date(value).getTime();
  }

  function scan(directory) {
    const files = [];
    let followedSymlinks = 0;
    function visit(current) {
      let rootStat;
      try { rootStat = io.lstatSync(current); } catch (_) { return; }
      if (rootStat.isSymbolicLink()) { followedSymlinks += 1; return; }
      if (!rootStat.isDirectory()) return;
      let entries;
      try { entries = io.readdirSync(current); } catch (_) { return; }
      entries.forEach(function(name) {
        const filePath = path.join(current, name);
        let stat;
        try { stat = io.lstatSync(filePath); } catch (_) { return; }
        if (stat.isSymbolicLink()) { followedSymlinks += 1; return; }
        if (stat.isDirectory()) { visit(filePath); return; }
        if (!stat.isFile()) return;
        files.push({
          path: filePath,
          bytes: Number.isFinite(stat.size) ? stat.size : 0,
          mtimeMs: Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : 0,
          atimeMs: Number.isFinite(stat.atimeMs) ? stat.atimeMs : stat.mtimeMs
        });
      });
    }
    visit(directory);
    return { files: files, followedSymlinks: followedSymlinks };
  }

  function category(directory) {
    const result = scan(directory);
    return {
      bytes: result.files.reduce(function(total, file) { return total + file.bytes; }, 0),
      files: result.files.length,
      followedSymlinks: result.followedSymlinks
    };
  }

  function getUsage() {
    const usage = {
      logs: category(directories.logs),
      temporary: category(directories.temporary),
      docxCache: category(directories.docxCache),
      profiles: category(directories.profiles),
      active: isBusy(activity())
    };
    usage.tmp = usage.temporary;
    usage.totalBytes = usage.logs.bytes + usage.temporary.bytes + usage.docxCache.bytes + usage.profiles.bytes;
    usage.removableBytes = usage.logs.bytes + usage.temporary.bytes + usage.docxCache.bytes;
    return usage;
  }

  function removeFiles(files, result) {
    files.forEach(function(file) {
      try {
        io.unlinkSync(file.path);
        result.deleted.push(file.path);
      } catch (error) {
        result.failed.push({ path: file.path, code: error && error.code ? error.code : "STORAGE_DELETE_FAILED" });
      }
    });
  }

  function cleanupCaches() {
    if (isBusy(activity())) {
      return { blocked: true, reason: "STORAGE_MAINTENANCE_BUSY", deleted: [], failed: [], usage: getUsage() };
    }
    const result = { blocked: false, deleted: [], failed: [] };
    const currentMs = clockMs();
    const logs = scan(directories.logs).files;
    const temporary = scan(directories.temporary).files;
    const docxCache = scan(directories.docxCache).files;

    removeFiles(logs.filter(function(file) { return currentMs - file.mtimeMs > Number(limits.logAgeMs); }), result);
    removeFiles(temporary.filter(function(file) { return currentMs - file.mtimeMs > Number(limits.temporaryAgeMs); }), result);

    function enforceLimit(files, maxBytes) {
      let total = files.reduce(function(sum, file) { return sum + file.bytes; }, 0);
      if (total <= maxBytes) return;
      files.slice().sort(function(first, second) { return first.atimeMs - second.atimeMs; }).some(function(file) {
        if (total <= maxBytes) return true;
        try {
          io.unlinkSync(file.path);
          total -= file.bytes;
          result.deleted.push(file.path);
        } catch (error) {
          result.failed.push({ path: file.path, code: error && error.code ? error.code : "STORAGE_DELETE_FAILED" });
        }
        return false;
      });
    }

    enforceLimit(logs.filter(function(file) { return currentMs - file.mtimeMs <= Number(limits.logAgeMs); }), Number(limits.logBytes));
    enforceLimit(docxCache, Number(limits.docxCacheBytes));
    result.usage = getUsage();
    return result;
  }

  return {
    getUsage: getUsage,
    getStorageUsage: getUsage,
    cleanupCaches: cleanupCaches,
    cleanCaches: cleanupCaches,
    cleanup: cleanupCaches,
    directories: Object.assign({}, directories)
  };
}

module.exports = { createStorageMaintenanceService };
