const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createContentPathPolicy } = require("./content-path-policy");
const { createAtomicFileWriter } = require("./content-file-transaction");

function removalError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createArticleRemovalTransactionStore(options) {
  const opts = options || {};
  if (typeof opts.workspaceRoot !== "string" || !opts.workspaceRoot.trim()) {
    throw removalError("ARTICLE_REMOVAL_WORKSPACE_REQUIRED", "workspaceRoot is required");
  }
  const workspaceRoot = path.resolve(opts.workspaceRoot);
  const directory = path.resolve(opts.directory || path.join(workspaceRoot, ".autopublish", "article-removal-transactions"));
  const relative = path.relative(workspaceRoot, directory);
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw removalError("ARTICLE_REMOVAL_PATH_INVALID", "Transaction storage must be inside the workspace");
  }
  const pathPolicy = createContentPathPolicy(workspaceRoot);
  pathPolicy.assertDirectory(directory, {
    boundary: workspaceRoot,
    create: true,
    code: "ARTICLE_REMOVAL_PATH_INVALID",
    label: "Removal transaction directory",
  });
  const createId = opts.createId || function() { return crypto.randomUUID(); };
  const now = opts.now || function() { return new Date().toISOString(); };
  const lockTtlMs = Number.isFinite(opts.lockTtlMs) ? Math.max(1000, opts.lockTtlMs) : 5 * 60 * 1000;
  const atomicWriter = opts.atomicWriter || createAtomicFileWriter({ fs: fs });

  function filename(id) {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id)) {
      throw removalError("ARTICLE_REMOVAL_TRANSACTION_ID_INVALID", "Removal transaction id is invalid");
    }
    return path.join(directory, "removal-" + id + ".json");
  }

  function assertRegularFile(filenameValue) {
    let stats;
    try { stats = fs.lstatSync(filenameValue); }
    catch (error) {
      if (error && error.code === "ENOENT") return false;
      throw removalError("ARTICLE_REMOVAL_PATH_INVALID", "Removal transaction path is unsafe");
    }
    if (!stats.isFile() || stats.isSymbolicLink()) throw removalError("ARTICLE_REMOVAL_PATH_INVALID", "Removal transaction path is unsafe");
    return true;
  }

  function save(transaction) {
    if (!transaction || typeof transaction !== "object" || Array.isArray(transaction)) {
      throw removalError("ARTICLE_REMOVAL_TRANSACTION_INVALID", "Removal transaction is invalid");
    }
    if (transaction.resolutionCode !== undefined &&
        (typeof transaction.resolutionCode !== "string" || !/^[A-Z0-9_]{1,80}$/.test(transaction.resolutionCode))) {
      throw removalError("ARTICLE_REMOVAL_RESOLUTION_INVALID", "Removal resolution code is invalid");
    }
    const file = filename(transaction.id);
    atomicWriter.write(file, JSON.stringify(transaction, null, 2) + "\n", { keepExisting: false });
    return clone(transaction);
  }

  function get(id) {
    const file = filename(id);
    if (!fs.existsSync(file)) throw removalError("ARTICLE_REMOVAL_TRANSACTION_NOT_FOUND", "Removal transaction was not found");
    assertRegularFile(file);
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (_) { throw removalError("ARTICLE_REMOVAL_TRANSACTION_CORRUPT", "Removal transaction is corrupt"); }
  }

  function list() {
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter(function(entry) { return entry.isFile() && /^removal-[A-Za-z0-9_-]+\.json$/.test(entry.name); })
      .map(function(entry) { return get(entry.name.slice("removal-".length, -".json".length)); })
      .sort(function(left, right) { return String(left.createdAt || "").localeCompare(String(right.createdAt || "")); });
  }

  function update(id, updater) {
    const current = get(id);
    const next = typeof updater === "function" ? updater(clone(current)) : updater;
    if (!next || typeof next !== "object" || next.id !== current.id) {
      throw removalError("ARTICLE_REMOVAL_TRANSACTION_INVALID", "Removal transaction identity cannot change");
    }
    next.updatedAt = next.updatedAt || now();
    return save(next);
  }

  // A short-lived exclusive lock makes the read/compare/write sequence safe
  // across independently-created service instances in the same workspace.
  function compareAndUpdate(id, expectedRevision, updater) {
    const lock = filename(id) + ".lock";
    let descriptor; let lockToken = null;
    function lockOwnerState(info) {
      if (!info || info.version !== 1 || typeof info.token !== "string" || !info.token || !Number.isSafeInteger(info.pid) || info.pid <= 0) return "unknown";
      try { process.kill(info.pid, 0); return "alive"; }
      catch (error) { return error && (error.code === "ESRCH" || error.code === "ENOENT") ? "dead" : "unknown"; }
    }
    function writeLock() {
      lockToken = crypto.randomUUID();
      fs.writeFileSync(descriptor, JSON.stringify({ version: 1, token: lockToken, owner: String(process.pid), pid: process.pid, createdAt: now() }) + "\n", "utf8");
    }
    try { descriptor = fs.openSync(lock, "wx"); }
    catch (error) {
      if (!error || error.code !== "EEXIST") throw error;
      let stale = false; let info = null; let mtimeMs = 0;
      try {
        assertRegularFile(lock);
        info = JSON.parse(fs.readFileSync(lock, "utf8"));
        mtimeMs = fs.statSync(lock).mtimeMs;
        const currentTime = Date.parse(typeof now === "function" ? now() : now);
        stale = Number.isFinite(currentTime) && currentTime - mtimeMs >= lockTtlMs;
      } catch (_) { return null; }
      const ownerState = lockOwnerState(info);
      if (ownerState !== "dead" || !stale) return null;
      // Rename is the ABA fence. Once this succeeds, a competing writer can
      // create a new lock at the original path; it can never be unlinked by
      // this reclaimer. A plain read-then-unlink would delete that new lock.
      const quarantine = lock + ".reclaim-" + crypto.randomUUID();
      try { fs.renameSync(lock, quarantine); } catch (_) { return null; }
      try {
        assertRegularFile(quarantine);
        const quarantined = JSON.parse(fs.readFileSync(quarantine, "utf8"));
        if (!quarantined || quarantined.token !== info.token) return null;
      } catch (_) { return null; }
      try { fs.unlinkSync(quarantine); } catch (_) {}
      try { descriptor = fs.openSync(lock, "wx"); } catch (_) { return null; }
    }
    try { writeLock(); } catch (error) { try { fs.closeSync(descriptor); fs.unlinkSync(lock); } catch (_) {} throw error; }
    try {
      const current = get(id);
      if (Number(current.revision || 0) !== Number(expectedRevision || 0)) return null;
      const next = typeof updater === "function" ? updater(clone(current)) : updater;
      if (next === null) return null;
      if (!next || typeof next !== "object" || next.id !== current.id) {
        throw removalError("ARTICLE_REMOVAL_TRANSACTION_INVALID", "Removal transaction identity cannot change");
      }
      next.revision = Number(current.revision || 0) + 1;
      next.updatedAt = next.updatedAt || now();
      return save(next);
    } finally {
      try { fs.closeSync(descriptor); } catch (_) {}
      try {
        assertRegularFile(lock);
        const info = JSON.parse(fs.readFileSync(lock, "utf8"));
        if (info && info.token === lockToken) fs.unlinkSync(lock);
      } catch (_) {}
    }
  }

  function recordResolution(id, resolutionCode) {
    if (typeof resolutionCode !== "string" || !/^[A-Z0-9_]{1,80}$/.test(resolutionCode)) {
      throw removalError("ARTICLE_REMOVAL_RESOLUTION_INVALID", "Removal resolution code is invalid");
    }
    return update(id, function(transaction) {
      transaction.resolutionCode = resolutionCode;
      return transaction;
    });
  }

  function remove(id) {
    const file = filename(id);
    if (fs.existsSync(file)) { assertRegularFile(file); fs.unlinkSync(file); }
    return true;
  }

  return { directory, createId, now, save, create: save, get, read: get, list, update, compareAndUpdate, recordResolution, remove, delete: remove };
}

module.exports = { createArticleRemovalTransactionStore };
