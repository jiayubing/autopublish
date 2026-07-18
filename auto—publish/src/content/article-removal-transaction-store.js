const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

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
  fs.mkdirSync(directory, { recursive: true });
  const createId = opts.createId || function() { return crypto.randomUUID(); };
  const now = opts.now || function() { return new Date().toISOString(); };

  function filename(id) {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id)) {
      throw removalError("ARTICLE_REMOVAL_TRANSACTION_ID_INVALID", "Removal transaction id is invalid");
    }
    return path.join(directory, "removal-" + id + ".json");
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
    const temporary = file + ".tmp-" + process.pid + "-" + crypto.randomUUID();
    try {
      fs.writeFileSync(temporary, JSON.stringify(transaction, null, 2) + "\n", "utf8");
      fs.renameSync(temporary, file);
    } finally {
      try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch (_) {}
    }
    return clone(transaction);
  }

  function get(id) {
    const file = filename(id);
    if (!fs.existsSync(file)) throw removalError("ARTICLE_REMOVAL_TRANSACTION_NOT_FOUND", "Removal transaction was not found");
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
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return true;
  }

  return { directory, createId, now, save, create: save, get, read: get, list, update, recordResolution, remove, delete: remove };
}

module.exports = { createArticleRemovalTransactionStore };
