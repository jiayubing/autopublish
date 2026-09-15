const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createContentPathPolicy } = require("./content-path-policy");
const { createAtomicFileWriter } = require("./content-file-transaction");
const { selections } = require("./article-removal-plan");

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
    throw removalError(
      "ARTICLE_REMOVAL_WORKSPACE_REQUIRED",
      "workspaceRoot is required",
    );
  }
  const workspaceRoot = path.resolve(opts.workspaceRoot);
  const directory = path.resolve(
    opts.directory ||
      path.join(workspaceRoot, ".autopublish", "article-removal-transactions"),
  );
  const relative = path.relative(workspaceRoot, directory);
  if (
    relative === ".." ||
    relative.startsWith(".." + path.sep) ||
    path.isAbsolute(relative)
  ) {
    throw removalError(
      "ARTICLE_REMOVAL_PATH_INVALID",
      "Transaction storage must be inside the workspace",
    );
  }
  const pathPolicy = createContentPathPolicy(workspaceRoot);
  pathPolicy.assertDirectory(directory, {
    boundary: workspaceRoot,
    create: true,
    code: "ARTICLE_REMOVAL_PATH_INVALID",
    label: "Removal transaction directory",
  });
  const createId =
    opts.createId ||
    function () {
      return crypto.randomUUID();
    };
  const atomicWriter = opts.atomicWriter || createAtomicFileWriter({ fs });
  function filename(id) {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id))
      throw removalError(
        "ARTICLE_REMOVAL_TRANSACTION_ID_INVALID",
        "Removal identity is invalid",
      );
    pathPolicy.assertDirectory(directory, {
      boundary: workspaceRoot,
      code: "ARTICLE_REMOVAL_PATH_INVALID",
      label: "Removal directory",
    });
    return path.join(directory, "trash-" + id + ".json");
  }
  function assertFile(file) {
    let stat;
    try {
      stat = fs.lstatSync(file);
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink())
      throw removalError(
        "ARTICLE_REMOVAL_PATH_INVALID",
        "Removal path is unsafe",
      );
    return true;
  }
  function validate(value, id) {
    if (
      !value ||
      value.version !== 3 ||
      value.id !== id ||
      value.status !== "needs_repair" ||
      !Number.isFinite(Date.parse(value.createdAt)) ||
      !Array.isArray(value.articles)
    )
      throw removalError(
        "ARTICLE_REMOVAL_TRANSACTION_CORRUPT",
        "Removal intent is invalid",
      );
    const refs = selections(value);
    if (
      refs.length !== value.articles.length ||
      value.articles.some(
        (item) =>
          !item ||
          !/^[a-f0-9]{64}$/.test(item.contentFingerprint || "") ||
          (item.operationId !== undefined &&
            (typeof item.operationId !== "string" ||
              !/^[A-Za-z0-9_-]+$/.test(item.operationId))),
      )
    )
      throw removalError(
        "ARTICLE_REMOVAL_TRANSACTION_CORRUPT",
        "Removal intent is invalid",
      );
    return value;
  }
  // Writes are serialized by the selected ArticleStore locks.
  function save(value) {
    const file = filename(value.id);
    validate(value, value.id);
    if (assertFile(file))
      throw removalError(
        "ARTICLE_REMOVAL_OPERATION_CONFLICT",
        "Removal identity already exists",
      );
    if (
      !atomicWriter.write(file, JSON.stringify(value) + "\n", {
        keepExisting: false,
      })
    )
      throw removalError(
        "ARTICLE_REMOVAL_PERSISTENCE_FAILED",
        "Removal intent was not saved",
      );
    return clone(value);
  }
  function get(id) {
    const file = filename(id);
    if (!assertFile(file)) return null;
    let value;
    try {
      value = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw removalError(
        "ARTICLE_REMOVAL_TRANSACTION_CORRUPT",
        "Removal intent is invalid",
      );
    }
    return validate(value, id);
  }
  function list() {
    filename("probe");
    return fs
      .readdirSync(directory, { withFileTypes: true })
      .filter((entry) => /^trash-[A-Za-z0-9_-]+\.json$/.test(entry.name))
      .map((entry) => get(entry.name.slice(6, -5)))
      .filter(Boolean);
  }
  function remove(id) {
    const file = filename(id);
    if (assertFile(file)) fs.unlinkSync(file);
  }
  return { createId, save, get, list, remove };
}
module.exports = { createArticleRemovalTransactionStore };
