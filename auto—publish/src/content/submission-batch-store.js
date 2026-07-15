const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function batchError(code, message) { const error = new Error(message); error.code = code; return error; }

function createSubmissionBatchStore(options) {
  const opts = options || {};
  if (typeof opts.workspaceRoot !== "string" || !opts.workspaceRoot.trim()) throw batchError("SUBMISSION_WORKSPACE_REQUIRED", "workspaceRoot is required");
  const directory = path.resolve(opts.directory || path.join(opts.workspaceRoot, ".autopublish", "submission-batches"));
  fs.mkdirSync(directory, { recursive: true });
  const createId = opts.createId || (() => crypto.randomUUID());
  function filename(id) {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id)) throw batchError("SUBMISSION_BATCH_ID_INVALID", "Batch id is invalid");
    return path.join(directory, "batch-" + id + ".json");
  }
  function save(batch) {
    const file = filename(batch.id);
    const temp = file + ".tmp";
    fs.writeFileSync(temp, JSON.stringify(batch, null, 2) + "\n", "utf8");
    fs.renameSync(temp, file);
    return JSON.parse(JSON.stringify(batch));
  }
  function get(id) {
    const file = filename(id);
    if (!fs.existsSync(file)) throw batchError("SUBMISSION_BATCH_NOT_FOUND", "Submission batch was not found");
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  function list() {
    return fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => /^batch-[A-Za-z0-9_-]+\.json$/.test(entry.name)).map((entry) => JSON.parse(fs.readFileSync(path.join(directory, entry.name), "utf8")));
  }
  return { createId, save, get, list };
}

module.exports = { createSubmissionBatchStore };
