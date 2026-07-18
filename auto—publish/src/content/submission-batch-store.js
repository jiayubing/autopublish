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
  const now = opts.now || (() => new Date().toISOString());
  function filename(id) {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id)) throw batchError("SUBMISSION_BATCH_ID_INVALID", "Batch id is invalid");
    return path.join(directory, "batch-" + id + ".json");
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function batchStatus(items) {
    const values = Array.isArray(items) ? items.map((item) => item.status) : [];
    if (values.some((status) => ["queued", "reserving"].includes(status))) return "queued";
    if (values.some((status) => status === "submitting")) return "submitting";
    if (values.some((status) => status === "uncertain")) return "uncertain";
    if (values.some((status) => status === "failed")) return "failed";
    if (values.length && values.every((status) => status === "cancelled")) return "cancelled";
    if (values.some((status) => status === "submitted")) return "completed";
    if (values.length && values.every((status) => ["published", "cancelled", "failed-cleaned", "skipped", "excluded"].includes(status))) return "completed";
    return "queued";
  }
  const transitions = {
    queued: new Set(["reserving", "submitting", "submitted", "published", "uncertain", "cancelled", "failed", "failed-cleaned", "skipped"]),
    reserving: new Set(["queued", "submitting", "cancelled", "failed", "failed-cleaned", "skipped"]),
    submitting: new Set(["submitted", "published", "failed", "uncertain"]),
    submitted: new Set(["published", "failed", "uncertain"]),
    published: new Set([]),
    failed: new Set(["failed-cleaned"]),
    uncertain: new Set([]),
    cancelled: new Set([]),
    skipped: new Set([]),
    "failed-cleaned": new Set([])
  };
  function save(batch) {
    const file = filename(batch.id);
    const temp = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
    try {
      fs.writeFileSync(temp, JSON.stringify(batch, null, 2) + "\n", "utf8");
      fs.renameSync(temp, file);
    } finally {
      try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch (_) {}
    }
    return clone(batch);
  }
  function get(id) {
    const file = filename(id);
    if (!fs.existsSync(file)) throw batchError("SUBMISSION_BATCH_NOT_FOUND", "Submission batch was not found");
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  function list() {
    return fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => /^batch-[A-Za-z0-9_-]+\.json$/.test(entry.name)).map((entry) => JSON.parse(fs.readFileSync(path.join(directory, entry.name), "utf8"))).sort((left, right) => {
      const leftTime = Date.parse(left.createdAt);
      const rightTime = Date.parse(right.createdAt);
      const leftValid = Number.isFinite(leftTime);
      const rightValid = Number.isFinite(rightTime);
      if (leftValid !== rightValid) return leftValid ? -1 : 1;
      if (leftValid && leftTime !== rightTime) return rightTime - leftTime;
      return String(right.id || "").localeCompare(String(left.id || ""));
    });
  }
  function listItemsByArticle(clientId, articleId) {
    if (typeof clientId !== "string" || !clientId.trim() || typeof articleId !== "string" || !articleId.trim()) {
      throw batchError("SUBMISSION_BATCH_ARTICLE_INVALID", "Article identity is invalid");
    }
    const result = [];
    list().forEach(function(batch) {
      (batch.items || []).forEach(function(item) {
        if (batch.clientId === clientId && item.articleId === articleId) result.push({ batch: clone(batch), item: clone(item) });
      });
    });
    return result;
  }
  function updateItem(batchId, identity, transition) {
    const batch = get(batchId);
    const reference = identity || {};
    const index = batch.items.findIndex((item) => item.publicationId === reference.publicationId && item.attemptId === reference.attemptId);
    if (index < 0) throw batchError("SUBMISSION_BATCH_ITEM_NOT_FOUND", "Submission batch item was not found");
    const item = batch.items[index];
    if (reference.targetPlatformId && item.targetPlatformId !== reference.targetPlatformId) throw batchError("SUBMISSION_BATCH_PLATFORM_MISMATCH", "Submission batch platform does not match");
    if (!transition || typeof transition !== "object" || Array.isArray(transition) || typeof transition.status !== "string") throw batchError("SUBMISSION_BATCH_TRANSITION_INVALID", "Submission batch transition is invalid");
    const nextStatus = transition.status;
    const allowed = transitions[item.status] || new Set();
    if (item.status !== nextStatus && !allowed.has(nextStatus)) throw batchError("SUBMISSION_BATCH_TRANSITION_INVALID", "Submission batch transition is invalid");
    const allowedFields = ["status", "publicationStatus", "errorCode", "remoteId", "remoteUrl", "reasonCode", "updatedAt", "pairState", "identityMatched", "contentMatched", "mainExists", "sidecarExists"];
    Object.keys(transition).forEach((key) => { if (!allowedFields.includes(key)) throw batchError("SUBMISSION_BATCH_TRANSITION_INVALID", "Submission batch transition is invalid"); });
    Object.assign(item, transition, { status: nextStatus, publicationStatus: transition.publicationStatus === undefined ? nextStatus : transition.publicationStatus, updatedAt: transition.updatedAt || now() });
    batch.status = batchStatus(batch.items);
    batch.updatedAt = now();
    return save(batch);
  }
  function rebindAttempt(batchId, identity, nextAttempt, expected) {
    const batch = get(batchId);
    const reference = identity || {};
    const replacement = nextAttempt || {};
    const index = batch.items.findIndex((item) => item.publicationId === reference.publicationId && item.attemptId === reference.attemptId);
    if (index < 0) throw batchError("SUBMISSION_BATCH_ITEM_NOT_FOUND", "Submission batch item was not found");
    const item = batch.items[index];
    if (reference.targetPlatformId && item.targetPlatformId !== reference.targetPlatformId) throw batchError("SUBMISSION_BATCH_PLATFORM_MISMATCH", "Submission batch platform does not match");
    const checks = expected || {};
    ["articleId", "targetPlatformId", "contentHash"].forEach((field) => {
      if (checks[field] !== undefined && item[field] !== checks[field]) throw batchError("SUBMISSION_BATCH_REBIND_CONFLICT", "Submission batch item identity changed");
    });
    if (typeof replacement.publicationId !== "string" || typeof replacement.attemptId !== "string" || replacement.publicationId !== item.publicationId) {
      throw batchError("SUBMISSION_BATCH_REBIND_INVALID", "Submission batch replacement is invalid");
    }
    if (replacement.attemptId === item.attemptId) return clone(batch);
    if (!["failed", "cancelled", "failed-cleaned", "queued"].includes(item.status)) throw batchError("SUBMISSION_BATCH_REBIND_STATE_INVALID", "Submission batch item cannot be rebound");
    item.attemptId = replacement.attemptId;
    item.status = "queued";
    item.publicationStatus = "queued";
    delete item.errorCode;
    delete item.remoteId;
    delete item.remoteUrl;
    item.reasonCode = "SUBMISSION_ATTEMPT_REBOUND";
    item.updatedAt = now();
    batch.status = batchStatus(batch.items);
    batch.updatedAt = now();
    return save(batch);
  }
  function reconcile(batchId, updates) {
    const batch = get(batchId);
    const changes = typeof updates === "function" ? updates(clone(batch)) : updates;
    if (!Array.isArray(changes)) throw batchError("SUBMISSION_BATCH_RECONCILE_INVALID", "Submission batch reconciliation is invalid");
    let result = batch;
    changes.forEach((change) => {
      result = updateItem(batchId, change.identity, change.transition);
    });
    return result;
  }
  return { createId, save, get, list, listItemsByArticle, findByArticle: listItemsByArticle, listByArticle: listItemsByArticle, updateItem, rebindAttempt, reconcile, batchStatus };
}

module.exports = { createSubmissionBatchStore };
