const fs = require("node:fs");
const crypto = require("node:crypto");

const { createContentPathPolicy } = require("./content-path-policy");
const { createGenerationBatchFileStore } = require("./generation-batch-file-store");
const {
  BATCH_VERSION,
  MAX_TASKS,
  BATCH_STATUSES,
  RESUMABLE_STATUSES,
  clone,
  storeError,
  assertIdentifier,
  assertArray,
  assertUnique,
  normalizeSource,
  normalizeTemplate,
  countsFor,
  normalizeError,
  taskId,
  normalizePersisted,
} = require("./generation-batch-serialization");

function createGenerationBatchStore(options) {
  const opts = typeof options === "string" ? { workspaceRoot: options } : (options || {});
  if (!opts.workspaceRoot) throw storeError("GENERATION_WORKSPACE_REQUIRED", "workspaceRoot is required");
  const makeId = opts.createId || function () { return crypto.randomUUID(); };
  const clock = opts.now || function () { return new Date().toISOString(); };
  const pathPolicy = opts.pathPolicy || createContentPathPolicy(opts.workspaceRoot, { paths: opts.paths });
  const fileStore = opts.fileStore || createGenerationBatchFileStore({
    pathPolicy: pathPolicy,
    normalizePersisted: normalizePersisted,
    clone: clone,
    error: storeError,
    now: clock,
    fs: opts.fs || fs,
  });

  function writeBatch(batch) {
    const normalized = normalizePersisted(batch);
    normalized.counts = countsFor(normalized.tasks);
    return fileStore.write(normalized);
  }

  function getBatch(batchId) { return fileStore.get(batchId); }

  function updateTask(batchId, taskIdValue, update) {
    const batch = getBatch(batchId);
    const task = batch.tasks.find(function (item) { return item.id === taskIdValue; });
    if (!task) throw storeError("GENERATION_TASK_NOT_FOUND", "Generation task was not found");
    update(task, batch);
    batch.counts = countsFor(batch.tasks);
    return writeBatch(batch);
  }

  function updateBatchStatus(batchId, status) {
    if (!BATCH_STATUSES.has(status)) throw storeError("GENERATION_BATCH_STATUS_INVALID", "Generation batch status is invalid");
    const batch = getBatch(batchId);
    batch.status = status;
    return writeBatch(batch);
  }

  function markTaskRunning(batchId, taskIdValue) {
    return updateTask(batchId, taskIdValue, function (task, batch) {
      if (task.status === "running") throw storeError("GENERATION_TASK_BUSY", "Generation task is already running");
      if (task.status === "cancelled") throw storeError("GENERATION_TASK_CANCELLED", "Cancelled generation task cannot run again");
      if (!RESUMABLE_STATUSES.has(task.status)) {
        if (task.status === "succeeded") throw storeError("GENERATION_TASK_ALREADY_SUCCEEDED", "Succeeded task cannot run again");
        throw storeError("GENERATION_TASK_STATUS_INVALID", "Generation task cannot run");
      }
      task.status = "running";
      task.attempts += 1;
      task.error = null;
      task.updatedAt = clock();
      batch.status = "running";
    });
  }

  function markTaskSucceeded(batchId, taskIdValue, articleId) {
    assertIdentifier(articleId, "article id");
    return updateTask(batchId, taskIdValue, function (task, batch) {
      if (task.status === "succeeded") {
        if (task.articleId === articleId) return;
        throw storeError("GENERATION_TASK_CONFLICT", "Generation task already has a different article");
      }
      if (task.articleId && task.articleId !== articleId) throw storeError("GENERATION_TASK_CONFLICT", "Generation task already has a different article");
      task.status = "succeeded";
      task.articleId = articleId;
      task.error = null;
      task.updatedAt = clock();
      batch.status = batch.tasks.every(function (item) { return item.status === "succeeded" || item.status === "cancelled"; }) ? "completed" : "running";
    });
  }

  function markTaskFailed(batchId, taskIdValue, error) {
    return updateTask(batchId, taskIdValue, function (task, batch) {
      if (task.status === "succeeded") throw storeError("GENERATION_TASK_ALREADY_SUCCEEDED", "Succeeded task cannot fail");
      task.status = "failed";
      task.error = normalizeError(error);
      task.updatedAt = clock();
      batch.status = "running";
    });
  }

  function markTaskInterrupted(batchId, taskIdValue) {
    return updateTask(batchId, taskIdValue, function (task, batch) {
      if (task.status === "succeeded") throw storeError("GENERATION_TASK_ALREADY_SUCCEEDED", "Succeeded task cannot interrupt");
      task.status = "interrupted";
      task.updatedAt = clock();
      batch.status = "interrupted";
    });
  }

  function cancelPending(batchId) {
    const batch = getBatch(batchId);
    batch.tasks.forEach(function (task) {
      if (task.status === "pending") {
        task.status = "cancelled";
        task.error = null;
        task.updatedAt = clock();
      }
    });
    if (!batch.tasks.some(function (task) { return ["pending", "running", "failed", "interrupted"].includes(task.status); })) batch.status = "completed";
    return writeBatch(batch);
  }

  function abandonBatch(batchId) {
    const batch = getBatch(batchId);
    if (["running"].includes(batch.status) || batch.tasks.some(function (task) { return task.status === "running"; }))
      throw storeError("GENERATION_BATCH_BUSY", "Running generation batch cannot be ended");
    if (!["pending", "paused", "interrupted", "paused_configuration", "failed"].includes(batch.status))
      throw storeError("GENERATION_BATCH_NOT_ENDABLE", "Generation batch cannot be ended");
    batch.tasks.forEach(function (task) {
      if (task.status === "pending") {
        task.status = "cancelled";
        task.error = null;
        task.updatedAt = clock();
      }
    });
    batch.status = "abandoned";
    return writeBatch(batch);
  }

  function getTasksForContinue(batchId) {
    const batch = getBatch(batchId);
    if (batch.status === "abandoned") return [];
    return batch.tasks.filter(function (task) { return RESUMABLE_STATUSES.has(task.status); }).map(clone);
  }

  function recoverInterrupted(batchId) {
    const filenames = batchId === undefined ? pathPolicy.listGenerationBatchFiles() : [pathPolicy.generationBatchFile(batchId, false)];
    const recovered = [];
    filenames.forEach(function (filename) {
      if (!filename) return;
      let batch;
      try { batch = fileStore.read(filename); }
      catch (error) {
        if (batchId === undefined && error && error.code === "GENERATION_BATCH_INVALID") return;
        throw error;
      }
      let changed = false;
      batch.tasks.forEach(function (task) {
        if (task.status === "running") { task.status = "interrupted"; task.updatedAt = clock(); changed = true; }
      });
      if (changed) { batch.status = "interrupted"; recovered.push(writeBatch(batch)); }
    });
    return recovered.map(clone);
  }

  function createBatch(input) {
    const value = input || {};
    assertArray(value.clientSources, "GENERATION_CLIENT_SOURCES_REQUIRED", "Client sources", true);
    assertArray(value.templates, "GENERATION_TEMPLATES_REQUIRED", "Templates", true);
    if (value.concurrency !== undefined && (!Number.isInteger(value.concurrency) || value.concurrency < 1 || value.concurrency > 4)) throw storeError("GENERATION_CONCURRENCY_INVALID", "Generation concurrency must be an integer from 1 to 4");
    if (typeof value.aiConfigFingerprint !== "string" || !value.aiConfigFingerprint.trim()) throw storeError("GENERATION_AI_FINGERPRINT_REQUIRED", "aiConfigFingerprint is required");
    const sources = value.clientSources.map(normalizeSource);
    assertUnique(sources.map(function (item) { return item.clientId; }), "GENERATION_DUPLICATE_CLIENT", "Client");
    const selectedTemplates = value.templates.map(normalizeTemplate);
    assertUnique(selectedTemplates.map(function (item) { return item.platform + "\u0000" + item.templateId; }), "GENERATION_DUPLICATE_TEMPLATE", "Template");
    if (sources.length * selectedTemplates.length > MAX_TASKS) throw storeError("GENERATION_TASK_LIMIT", "Generation batch has too many tasks");
    const id = makeId();
    assertIdentifier(id, "batch id");
    const createdAt = clock();
    const tasks = [];
    sources.forEach(function (client) {
      selectedTemplates.forEach(function (template) {
        tasks.push({ id: taskId(id, client.clientId, template.platform, template.templateId), clientId: client.clientId, platform: template.platform, templateId: template.templateId, materialIds: client.materialIds.slice(), researchQueryIds: client.researchQueryIds.slice(), status: "pending", attempts: 0, error: null, articleId: null, createdAt: createdAt, updatedAt: createdAt });
      });
    });
    return writeBatch({ version: BATCH_VERSION, id: id, concurrency: value.concurrency === undefined ? 1 : value.concurrency, status: "pending", createdAt: createdAt, updatedAt: createdAt, aiConfigFingerprint: value.aiConfigFingerprint.trim(), clientSources: sources, templates: selectedTemplates, tasks: tasks, counts: countsFor(tasks) });
  }

  recoverInterrupted();

  return {
    createBatch,
    getBatch,
    listBatches: fileStore.list,
    updateBatchStatus,
    markTaskRunning,
    markTaskSucceeded,
    markTaskFailed,
    markTaskInterrupted,
    cancelPending,
    abandonBatch,
    recoverInterrupted,
    getTasksForContinue,
    markRunning: markTaskRunning,
    markSucceeded: markTaskSucceeded,
    markFailed: markTaskFailed,
    markInterrupted: markTaskInterrupted,
  };
}

module.exports = { createGenerationBatchStore };
