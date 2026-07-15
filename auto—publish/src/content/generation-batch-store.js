const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { createWorkspacePaths } = require("../../desktop/workspace-paths");

const BATCH_VERSION = 1;
const MAX_TASKS = 1000;
const MAX_ITEMS = 1000;
const TASK_STATUSES = new Set(["pending", "running", "succeeded", "failed", "interrupted"]);
const BATCH_STATUSES = new Set(["pending", "running", "stopping", "stopped", "interrupted", "paused_configuration", "completed", "failed"]);
const RESUMABLE_STATUSES = new Set(["pending", "failed", "interrupted"]);

function storeError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertIdentifier(value, label) {
  const deviceName = typeof value === "string" ? value.split(".")[0].replace(/[ .]+$/g, "").toUpperCase() : "";
  if (typeof value !== "string" || !value || value.trim() !== value || value === "." || value === ".." ||
      value.length > 200 || value.includes("/") || value.includes("\\") ||
      /[<>:"|?*\u0000-\u001F]/.test(value) || value.endsWith(" ") || value.endsWith(".") ||
      /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(deviceName) ||
      path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw storeError("GENERATION_INVALID_ID", "Invalid " + label);
  }
}

function assertArray(value, code, label, required) {
  if (!Array.isArray(value) || (required && value.length === 0) || value.length > MAX_ITEMS) {
    throw storeError(code, label + " is required");
  }
}

function assertUnique(values, code, label) {
  const seen = new Set();
  values.forEach(function(value) {
    if (seen.has(value)) throw storeError(code, label + " is duplicated");
    seen.add(value);
  });
}

function normalizeSource(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw storeError("GENERATION_SOURCE_INVALID", "Client source is invalid");
  }
  assertIdentifier(source.clientId, "client id");
  assertArray(source.materialIds, "GENERATION_MATERIAL_IDS_REQUIRED", "material ids", true);
  assertArray(source.researchQueryIds, "GENERATION_RESEARCH_IDS_REQUIRED", "research query ids", true);
  source.materialIds.forEach(function(id) { assertIdentifier(id, "material id"); });
  source.researchQueryIds.forEach(function(id) { assertIdentifier(id, "research query id"); });
  assertUnique(source.materialIds, "GENERATION_DUPLICATE_MATERIAL", "Material id");
  assertUnique(source.researchQueryIds, "GENERATION_DUPLICATE_RESEARCH", "Research query id");
  return {
    clientId: source.clientId,
    materialIds: source.materialIds.slice(),
    researchQueryIds: source.researchQueryIds.slice()
  };
}

function normalizeTemplate(template) {
  if (!template || typeof template !== "object" || Array.isArray(template)) {
    throw storeError("GENERATION_TEMPLATE_INVALID", "Template is invalid");
  }
  assertIdentifier(template.platform, "platform");
  assertIdentifier(template.templateId, "template id");
  return { platform: template.platform, templateId: template.templateId };
}

function countsFor(tasks) {
  const counts = { total: tasks.length, succeeded: 0, failed: 0, pending: 0, interrupted: 0 };
  tasks.forEach(function(task) {
    if (Object.prototype.hasOwnProperty.call(counts, task.status)) counts[task.status] += 1;
  });
  return counts;
}

function normalizeError(error) {
  if (!error) return null;
  const code = typeof error.code === "string" && error.code.trim() ? error.code.trim().slice(0, 100) : "GENERATION_TASK_FAILED";
  const message = typeof error.message === "string" && error.message.trim() ? error.message.trim().slice(0, 2000) : String(error).slice(0, 2000);
  return { code: code, message: message };
}

function taskId(batchId, clientId, platform, templateId) {
  const identity = [batchId, clientId, platform, templateId].join("\u0000");
  return "task-" + crypto.createHash("sha256").update(identity).digest("hex").slice(0, 32);
}

function createGenerationBatchStore(options) {
  const opts = typeof options === "string" ? { workspaceRoot: options } : (options || {});
  if (!opts.workspaceRoot) throw storeError("GENERATION_WORKSPACE_REQUIRED", "workspaceRoot is required");
  const workspaceRoot = path.resolve(opts.workspaceRoot);
  const paths = opts.paths || createWorkspacePaths(workspaceRoot);
  const directory = path.resolve(paths.generationBatches || path.join(workspaceRoot, "data", "content-generation-batches"));
  const makeId = opts.createId || function() { return crypto.randomUUID(); };
  const clock = opts.now || function() { return new Date().toISOString(); };

  fs.mkdirSync(directory, { recursive: true });

  function assertRegularFile(filename) {
    let stat;
    try { stat = fs.lstatSync(filename); } catch (error) {
      if (error.code === "ENOENT") return false;
      throw storeError("GENERATION_BATCH_PATH_UNSAFE", "Generation batch path is unsafe", error);
    }
    if (!stat.isFile() || stat.isSymbolicLink()) throw storeError("GENERATION_BATCH_PATH_UNSAFE", "Generation batch path is unsafe");
    return true;
  }

  function batchFilename(batchId) {
    assertIdentifier(batchId, "batch id");
    return path.join(directory, "batch-" + batchId + ".json");
  }

  function transactionFiles(filename) {
    return {
      journal: filename + ".journal",
      backup: filename + ".bak",
      temporary: filename + ".tmp"
    };
  }

  function removeIfRegular(filename) {
    if (!fs.existsSync(filename)) return;
    assertRegularFile(filename);
    fs.unlinkSync(filename);
  }

  function recoverTransaction(filename) {
    const transaction = transactionFiles(filename);
    if (fs.existsSync(transaction.journal)) {
      try {
        assertRegularFile(transaction.journal);
        JSON.parse(fs.readFileSync(transaction.journal, "utf8"));
      } catch (error) {
        throw storeError("GENERATION_BATCH_INVALID", "Generation batch journal is invalid", error);
      }
      if (fs.existsSync(filename)) {
        removeIfRegular(transaction.temporary);
        removeIfRegular(transaction.backup);
      } else if (fs.existsSync(transaction.temporary)) {
        assertRegularFile(transaction.temporary);
        fs.renameSync(transaction.temporary, filename);
        removeIfRegular(transaction.backup);
      } else if (fs.existsSync(transaction.backup)) {
        assertRegularFile(transaction.backup);
        fs.renameSync(transaction.backup, filename);
      } else {
        throw storeError("GENERATION_BATCH_INVALID", "Generation batch transaction is incomplete");
      }
      removeIfRegular(transaction.journal);
    } else {
      if (!fs.existsSync(filename) && fs.existsSync(transaction.temporary)) {
        assertRegularFile(transaction.temporary);
        fs.renameSync(transaction.temporary, filename);
      }
      if (fs.existsSync(transaction.backup) && fs.existsSync(filename)) removeIfRegular(transaction.backup);
    }
  }

  function readBatchFile(filename) {
    try {
      recoverTransaction(filename);
      assertRegularFile(filename);
      return normalizePersisted(JSON.parse(fs.readFileSync(filename, "utf8")));
    } catch (error) {
      if (error.code === "GENERATION_BATCH_INVALID") throw error;
      throw storeError("GENERATION_BATCH_INVALID", "Generation batch is invalid", error);
    }
  }

  function normalizePersisted(batch) {
    if (!batch || typeof batch !== "object" || Array.isArray(batch) || batch.version !== BATCH_VERSION ||
        typeof batch.id !== "string" || !BATCH_STATUSES.has(batch.status) || !Array.isArray(batch.tasks) ||
        !Array.isArray(batch.clientSources) || !Array.isArray(batch.templates) ||
        typeof batch.aiConfigFingerprint !== "string" || !batch.aiConfigFingerprint.trim()) {
      throw storeError("GENERATION_BATCH_INVALID", "Generation batch is invalid");
    }
    assertIdentifier(batch.id, "batch id");
    if (batch.tasks.length > MAX_TASKS) throw storeError("GENERATION_BATCH_INVALID", "Generation batch has too many tasks");
    const concurrency = batch.concurrency === undefined ? 1 : batch.concurrency;
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw storeError("GENERATION_CONCURRENCY_INVALID", "Generation concurrency must be an integer from 1 to 4");
    const normalized = {
      version: BATCH_VERSION,
      id: batch.id,
      concurrency: concurrency,
      status: batch.status,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      aiConfigFingerprint: batch.aiConfigFingerprint,
      clientSources: batch.clientSources.map(normalizeSource),
      templates: batch.templates.map(normalizeTemplate),
      tasks: batch.tasks.map(function(task) {
        if (!task || typeof task !== "object" || Array.isArray(task) || typeof task.id !== "string" ||
            !TASK_STATUSES.has(task.status) || typeof task.clientId !== "string" || typeof task.platform !== "string" ||
            typeof task.templateId !== "string" || !Array.isArray(task.materialIds) || !Array.isArray(task.researchQueryIds) ||
            !Number.isInteger(task.attempts) || task.attempts < 0 || (task.articleId !== null && typeof task.articleId !== "string")) {
          throw storeError("GENERATION_BATCH_INVALID", "Generation task is invalid");
        }
        assertIdentifier(task.id, "task id");
        assertIdentifier(task.clientId, "client id");
        assertIdentifier(task.platform, "platform");
        assertIdentifier(task.templateId, "template id");
        return {
          id: task.id, clientId: task.clientId, platform: task.platform, templateId: task.templateId,
          materialIds: task.materialIds.slice(), researchQueryIds: task.researchQueryIds.slice(),
          status: task.status, attempts: task.attempts, error: normalizeError(task.error),
          articleId: task.articleId === undefined ? null : task.articleId,
          createdAt: task.createdAt, updatedAt: task.updatedAt
        };
      })
    };
    normalized.counts = countsFor(normalized.tasks);
    return normalized;
  }

  function writeBatch(batch) {
    const normalized = normalizePersisted(batch);
    normalized.updatedAt = clock();
    normalized.counts = countsFor(normalized.tasks);
    const filename = batchFilename(normalized.id);
    const transaction = transactionFiles(filename);
    const content = JSON.stringify(normalized, null, 2) + "\n";
    try {
      removeIfRegular(transaction.temporary);
      removeIfRegular(transaction.backup);
      fs.writeFileSync(transaction.temporary, content, { encoding: "utf8", flag: "wx" });
      const descriptor = fs.openSync(transaction.temporary, "r");
      try {
        try { fs.fsyncSync(descriptor); } catch (error) {
          if (error.code !== "EPERM" && error.code !== "EINVAL") throw error;
        }
      } finally { fs.closeSync(descriptor); }
      fs.writeFileSync(transaction.journal, JSON.stringify({ version: 1 }) + "\n", { encoding: "utf8", flag: "w" });
      if (fs.existsSync(filename)) {
        assertRegularFile(filename);
        fs.renameSync(filename, transaction.backup);
      }
      fs.renameSync(transaction.temporary, filename);
      removeIfRegular(transaction.backup);
      removeIfRegular(transaction.journal);
    } catch (error) {
      try {
        if (!fs.existsSync(filename) && fs.existsSync(transaction.backup)) fs.renameSync(transaction.backup, filename);
        removeIfRegular(transaction.temporary);
        removeIfRegular(transaction.journal);
        removeIfRegular(transaction.backup);
      } catch (_) {}
      throw error;
    }
    return clone(normalized);
  }

  function getBatch(batchId) {
    const filename = batchFilename(batchId);
    recoverTransaction(filename);
    if (!fs.existsSync(filename)) throw storeError("GENERATION_BATCH_NOT_FOUND", "Generation batch was not found");
    return clone(readBatchFile(filename));
  }

  function listBatches() {
    const batches = [];
    if (!fs.existsSync(directory)) return batches;
    fs.readdirSync(directory, { withFileTypes: true })
      .filter(function(entry) { return entry.isFile() && /^batch-.+\.json$/.test(entry.name); })
      .forEach(function(entry) {
        try { batches.push(readBatchFile(path.join(directory, entry.name))); } catch (_) {}
      });
    return batches.sort(function(a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }).map(clone);
  }

  function updateTask(batchId, taskIdValue, update) {
    const batch = getBatch(batchId);
    const task = batch.tasks.find(function(item) { return item.id === taskIdValue; });
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
    return updateTask(batchId, taskIdValue, function(task, batch) {
      if (task.status === "running") throw storeError("GENERATION_TASK_BUSY", "Generation task is already running");
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
    return updateTask(batchId, taskIdValue, function(task, batch) {
      if (task.status === "succeeded") {
        if (task.articleId === articleId) return;
        throw storeError("GENERATION_TASK_CONFLICT", "Generation task already has a different article");
      }
      if (task.articleId && task.articleId !== articleId) throw storeError("GENERATION_TASK_CONFLICT", "Generation task already has a different article");
      task.status = "succeeded";
      task.articleId = articleId;
      task.error = null;
      task.updatedAt = clock();
      batch.status = batch.tasks.every(function(item) { return item.status === "succeeded"; }) ? "completed" : "running";
    });
  }

  function markTaskFailed(batchId, taskIdValue, error) {
    return updateTask(batchId, taskIdValue, function(task, batch) {
      if (task.status === "succeeded") throw storeError("GENERATION_TASK_ALREADY_SUCCEEDED", "Succeeded task cannot fail");
      task.status = "failed";
      task.error = normalizeError(error);
      task.updatedAt = clock();
      batch.status = "running";
    });
  }

  function markTaskInterrupted(batchId, taskIdValue) {
    return updateTask(batchId, taskIdValue, function(task, batch) {
      if (task.status === "succeeded") throw storeError("GENERATION_TASK_ALREADY_SUCCEEDED", "Succeeded task cannot interrupt");
      task.status = "interrupted";
      task.updatedAt = clock();
      batch.status = "interrupted";
    });
  }

  function getTasksForContinue(batchId) {
    return getBatch(batchId).tasks.filter(function(task) { return RESUMABLE_STATUSES.has(task.status); }).map(clone);
  }

  function recoverInterrupted(batchId) {
    const filenames = batchId === undefined
      ? fs.readdirSync(directory, { withFileTypes: true }).filter(function(entry) { return entry.isFile() && /^batch-.+\.json$/.test(entry.name); }).map(function(entry) { return path.join(directory, entry.name); })
      : [batchFilename(batchId)];
    const recovered = [];
    filenames.forEach(function(filename) {
      if (!fs.existsSync(filename)) return;
      let batch;
      try {
        batch = readBatchFile(filename);
      } catch (error) {
        if (batchId === undefined && error.code === "GENERATION_BATCH_INVALID") return;
        throw error;
      }
      let changed = false;
      batch.tasks.forEach(function(task) {
        if (task.status === "running") {
          task.status = "interrupted";
          task.updatedAt = clock();
          changed = true;
        }
      });
      if (changed) {
        batch.status = "interrupted";
        recovered.push(writeBatch(batch));
      }
    });
    return recovered.map(clone);
  }

  function createBatch(input) {
    const value = input || {};
    assertArray(value.clientSources, "GENERATION_CLIENT_SOURCES_REQUIRED", "Client sources", true);
    assertArray(value.templates, "GENERATION_TEMPLATES_REQUIRED", "Templates", true);
    if (value.concurrency !== undefined && (!Number.isInteger(value.concurrency) || value.concurrency < 1 || value.concurrency > 4)) {
      throw storeError("GENERATION_CONCURRENCY_INVALID", "Generation concurrency must be an integer from 1 to 4");
    }
    if (typeof value.aiConfigFingerprint !== "string" || !value.aiConfigFingerprint.trim()) {
      throw storeError("GENERATION_AI_FINGERPRINT_REQUIRED", "aiConfigFingerprint is required");
    }
    const sources = value.clientSources.map(normalizeSource);
    assertUnique(sources.map(function(item) { return item.clientId; }), "GENERATION_DUPLICATE_CLIENT", "Client");
    const selectedTemplates = value.templates.map(normalizeTemplate);
    assertUnique(selectedTemplates.map(function(item) { return item.platform + "\u0000" + item.templateId; }), "GENERATION_DUPLICATE_TEMPLATE", "Template");
    if (sources.length * selectedTemplates.length > MAX_TASKS) throw storeError("GENERATION_TASK_LIMIT", "Generation batch has too many tasks");
    const id = makeId();
    assertIdentifier(id, "batch id");
    const createdAt = clock();
    const tasks = [];
    sources.forEach(function(client) {
      selectedTemplates.forEach(function(template) {
        tasks.push({
          id: taskId(id, client.clientId, template.platform, template.templateId),
          clientId: client.clientId,
          platform: template.platform,
          templateId: template.templateId,
          materialIds: client.materialIds.slice(),
          researchQueryIds: client.researchQueryIds.slice(),
          status: "pending",
          attempts: 0,
          error: null,
          articleId: null,
          createdAt: createdAt,
          updatedAt: createdAt
        });
      });
    });
    return writeBatch({
      version: BATCH_VERSION,
      id: id,
      concurrency: value.concurrency === undefined ? 1 : value.concurrency,
      status: "pending",
      createdAt: createdAt,
      updatedAt: createdAt,
      aiConfigFingerprint: value.aiConfigFingerprint.trim(),
      clientSources: sources,
      templates: selectedTemplates,
      tasks: tasks,
      counts: countsFor(tasks)
    });
  }

  recoverInterrupted();

  return {
    createBatch: createBatch,
    getBatch: getBatch,
    listBatches: listBatches,
    updateBatchStatus: updateBatchStatus,
    markTaskRunning: markTaskRunning,
    markTaskSucceeded: markTaskSucceeded,
    markTaskFailed: markTaskFailed,
    markTaskInterrupted: markTaskInterrupted,
    recoverInterrupted: recoverInterrupted,
    getTasksForContinue: getTasksForContinue,
    markRunning: markTaskRunning,
    markSucceeded: markTaskSucceeded,
    markFailed: markTaskFailed,
    markInterrupted: markTaskInterrupted
  };
}

module.exports = { createGenerationBatchStore };
