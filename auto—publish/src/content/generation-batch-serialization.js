const crypto = require("node:crypto");
const path = require("node:path");

const BATCH_VERSION = 1;
const MAX_TASKS = 1000;
const MAX_ITEMS = 1000;
const TASK_STATUSES = new Set([
  "pending",
  "running",
  "succeeded",
  "failed",
  "interrupted",
  "cancelled",
]);
const BATCH_STATUSES = new Set([
  "pending",
  "running",
  "paused",
  "interrupted",
  "paused_configuration",
  "completed",
  "failed",
  "abandoned",
]);
const LEGACY_BATCH_STATUS_NORMALIZATION = new Map([
  ["pausing", "paused"],
  ["stopping", "paused"],
  ["stopped", "paused"],
]);
const RESUMABLE_STATUSES = new Set(["pending", "failed", "interrupted"]);

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertIdentifier(value, label) {
  const deviceName =
    typeof value === "string"
      ? value
          .split(".")[0]
          .replace(/[ .]+$/g, "")
          .toUpperCase()
      : "";
  if (
    typeof value !== "string" ||
    !value ||
    value.trim() !== value ||
    value === "." ||
    value === ".." ||
    value.length > 200 ||
    value.includes("/") ||
    value.includes("\\") ||
    /[<>:"|?*\u0000-\u001F]/.test(value) ||
    value.endsWith(" ") ||
    value.endsWith(".") ||
    /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(deviceName) ||
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value)
  ) {
    throw storeError("GENERATION_INVALID_ID", "Invalid " + label);
  }
}

function assertArray(value, code, label, required) {
  if (
    !Array.isArray(value) ||
    (required && value.length === 0) ||
    value.length > MAX_ITEMS
  )
    throw storeError(code, label + " is required");
}

function assertUnique(values, code, label) {
  const seen = new Set();
  values.forEach(function (value) {
    if (seen.has(value)) throw storeError(code, label + " is duplicated");
    seen.add(value);
  });
}

function normalizeSource(source) {
  if (!source || typeof source !== "object" || Array.isArray(source))
    throw storeError("GENERATION_SOURCE_INVALID", "Client source is invalid");
  assertIdentifier(source.clientId, "client id");
  assertArray(
    source.materialIds,
    "GENERATION_MATERIAL_IDS_REQUIRED",
    "material ids",
    true,
  );
  assertArray(
    source.researchQueryIds,
    "GENERATION_RESEARCH_IDS_REQUIRED",
    "research query ids",
    true,
  );
  source.materialIds.forEach(function (id) {
    assertIdentifier(id, "material id");
  });
  source.researchQueryIds.forEach(function (id) {
    assertIdentifier(id, "research query id");
  });
  assertUnique(
    source.materialIds,
    "GENERATION_DUPLICATE_MATERIAL",
    "Material id",
  );
  assertUnique(
    source.researchQueryIds,
    "GENERATION_DUPLICATE_RESEARCH",
    "Research query id",
  );
  return {
    clientId: source.clientId,
    materialIds: source.materialIds.slice(),
    researchQueryIds: source.researchQueryIds.slice(),
  };
}

function normalizeTemplate(template) {
  if (!template || typeof template !== "object" || Array.isArray(template))
    throw storeError("GENERATION_TEMPLATE_INVALID", "Template is invalid");
  assertIdentifier(template.platform, "platform");
  assertIdentifier(template.templateId, "template id");
  return { platform: template.platform, templateId: template.templateId };
}

function countsFor(tasks) {
  const counts = {
    total: tasks.length,
    succeeded: 0,
    failed: 0,
    pending: 0,
    interrupted: 0,
    cancelled: 0,
  };
  tasks.forEach(function (task) {
    if (Object.prototype.hasOwnProperty.call(counts, task.status))
      counts[task.status] += 1;
  });
  return counts;
}

function normalizeError(error) {
  if (!error) return null;
  const code =
    typeof error.code === "string" && error.code.trim()
      ? error.code.trim().slice(0, 100)
      : "GENERATION_TASK_FAILED";
  const message =
    typeof error.message === "string" && error.message.trim()
      ? error.message.trim().slice(0, 2000)
      : String(error).slice(0, 2000);
  return { code: code, message: message };
}

function taskId(batchId, clientId, platform, templateId) {
  return (
    "task-" +
    crypto
      .createHash("sha256")
      .update([batchId, clientId, platform, templateId].join("\u0000"))
      .digest("hex")
      .slice(0, 32)
  );
}

function normalizePersisted(batch) {
  if (
    !batch ||
    typeof batch !== "object" ||
    Array.isArray(batch) ||
    batch.version !== BATCH_VERSION ||
    typeof batch.id !== "string" ||
    (!BATCH_STATUSES.has(batch.status) && !LEGACY_BATCH_STATUS_NORMALIZATION.has(batch.status)) ||
    !Array.isArray(batch.tasks) ||
    !Array.isArray(batch.clientSources) ||
    !Array.isArray(batch.templates) ||
    typeof batch.aiConfigFingerprint !== "string" ||
    !batch.aiConfigFingerprint.trim()
  )
    throw storeError("GENERATION_BATCH_INVALID", "Generation batch is invalid");
  assertIdentifier(batch.id, "batch id");
  if (batch.tasks.length > MAX_TASKS)
    throw storeError(
      "GENERATION_BATCH_INVALID",
      "Generation batch has too many tasks",
    );
  const concurrency = batch.concurrency === undefined ? 1 : batch.concurrency;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4)
    throw storeError(
      "GENERATION_CONCURRENCY_INVALID",
      "Generation concurrency must be an integer from 1 to 4",
    );
  const normalized = {
    version: BATCH_VERSION,
    id: batch.id,
    concurrency: concurrency,
    status: LEGACY_BATCH_STATUS_NORMALIZATION.get(batch.status) || batch.status,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
    aiConfigFingerprint: batch.aiConfigFingerprint,
    clientSources: batch.clientSources.map(normalizeSource),
    templates: batch.templates.map(normalizeTemplate),
    tasks: batch.tasks.map(function (task) {
      if (
        !task ||
        typeof task !== "object" ||
        Array.isArray(task) ||
        typeof task.id !== "string" ||
        !TASK_STATUSES.has(task.status) ||
        typeof task.clientId !== "string" ||
        typeof task.platform !== "string" ||
        typeof task.templateId !== "string" ||
        !Array.isArray(task.materialIds) ||
        !Array.isArray(task.researchQueryIds) ||
        !Number.isInteger(task.attempts) ||
        task.attempts < 0 ||
        (task.articleId !== null && typeof task.articleId !== "string")
      )
        throw storeError(
          "GENERATION_BATCH_INVALID",
          "Generation task is invalid",
        );
      assertIdentifier(task.id, "task id");
      assertIdentifier(task.clientId, "client id");
      assertIdentifier(task.platform, "platform");
      assertIdentifier(task.templateId, "template id");
      return {
        id: task.id,
        clientId: task.clientId,
        platform: task.platform,
        templateId: task.templateId,
        materialIds: task.materialIds.slice(),
        researchQueryIds: task.researchQueryIds.slice(),
        status: task.status,
        attempts: task.attempts,
        error: normalizeError(task.error),
        articleId: task.articleId === undefined ? null : task.articleId,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      };
    }),
  };
  normalized.counts = countsFor(normalized.tasks);
  return normalized;
}

module.exports = {
  BATCH_VERSION,
  MAX_TASKS,
  TASK_STATUSES,
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
};
