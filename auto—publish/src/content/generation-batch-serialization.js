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

function normalizePersistedV1(batch) {
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
      if (task.sourceArticleId !== undefined) assertIdentifier(task.sourceArticleId, "source article id");
      if (task.sourceAttentionId !== undefined && (typeof task.sourceAttentionId !== "string" || !task.sourceAttentionId || task.sourceAttentionId.length > 512))
        throw storeError("GENERATION_BATCH_INVALID", "Source attention identity is invalid");
      return {
        id: task.id,
        clientId: task.clientId,
        platform: task.platform,
        templateId: task.templateId,
        ...(task.sourceArticleId !== undefined ? { sourceArticleId: task.sourceArticleId } : {}),
        ...(task.sourceAttentionId !== undefined ? { sourceAttentionId: task.sourceAttentionId } : {}),
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

const V2_TASK_STATUSES = new Set([...TASK_STATUSES, "uncertain"]);
const V2_BATCH_STATUSES = new Set([...BATCH_STATUSES, "uncertain"]);
const V2_START_STATES = new Set(["not_started", "starting", "started"]);

function normalizeQuestionSource(source) {
  if (!source || typeof source !== "object" || Array.isArray(source))
    throw storeError("GENERATION_SOURCE_INVALID", "Question source is invalid");
  for (const [field, label] of [["id", "question source id"], ["clientId", "client id"], ["geoQuestionId", "GEO question id"], ["collectionQuestionId", "collection question id"]])
    assertIdentifier(source[field], label);
  if (typeof source.questionText !== "string" || !source.questionText.trim() || source.questionText.length > 2000 ||
      !Number.isSafeInteger(source.knowledgeRevision) || source.knowledgeRevision < 1 ||
      typeof source.researchCapturedAt !== "string" || Number.isNaN(Date.parse(source.researchCapturedAt)) ||
      typeof source.researchFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(source.researchFingerprint))
    throw storeError("GENERATION_SOURCE_INVALID", "Question source is invalid");
  return {
    id: source.id,
    clientId: source.clientId,
    geoQuestionId: source.geoQuestionId,
    collectionQuestionId: source.collectionQuestionId,
    questionText: source.questionText,
    knowledgeRevision: source.knowledgeRevision,
    researchCapturedAt: source.researchCapturedAt,
    researchFingerprint: source.researchFingerprint,
  };
}

function countsForV2(tasks) {
  const counts = { total: tasks.length, succeeded: 0, failed: 0, pending: 0, running: 0, uncertain: 0, interrupted: 0, cancelled: 0 };
  for (const task of tasks) counts[task.status]++;
  return counts;
}

function normalizePersistedV2(batch) {
  if (!batch || batch.version !== 2 || typeof batch.id !== "string" ||
      typeof batch.requestId !== "string" || typeof batch.requestFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(batch.requestFingerprint) || !V2_START_STATES.has(batch.startState) ||
      !V2_BATCH_STATUSES.has(batch.status) || !Array.isArray(batch.questionSources) ||
      !Array.isArray(batch.templates) || !Array.isArray(batch.tasks) ||
      typeof batch.aiConfigFingerprint !== "string" || !batch.aiConfigFingerprint.trim())
    throw storeError("GENERATION_BATCH_INVALID", "Generation batch v2 is invalid");
  assertIdentifier(batch.id, "batch id");
  assertIdentifier(batch.requestId, "request id");
  const concurrency = batch.concurrency;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4 || batch.tasks.length > MAX_TASKS)
    throw storeError("GENERATION_BATCH_INVALID", "Generation batch v2 is invalid");
  const questionSources = batch.questionSources.map(normalizeQuestionSource);
  assertUnique(questionSources.map((item) => item.id), "GENERATION_BATCH_INVALID", "Question source id");
  assertUnique(questionSources.map((item) => item.clientId + "\0" + item.geoQuestionId), "GENERATION_BATCH_INVALID", "Question source");
  const sourceIds = new Set(questionSources.map((item) => item.id));
  const templates = batch.templates.map(normalizeTemplate);
  const tasks = batch.tasks.map((task) => {
    if (!task || typeof task !== "object" || !V2_TASK_STATUSES.has(task.status) ||
        !sourceIds.has(task.questionSourceId) || !Number.isInteger(task.attempts) || task.attempts < 0 ||
        (task.articleId !== null && task.articleId !== undefined && typeof task.articleId !== "string"))
      throw storeError("GENERATION_BATCH_INVALID", "Generation task v2 is invalid");
    assertIdentifier(task.id, "task id");
    assertIdentifier(task.platform, "platform");
    assertIdentifier(task.templateId, "template id");
    return {
      id: task.id,
      questionSourceId: task.questionSourceId,
      platform: task.platform,
      templateId: task.templateId,
      status: task.status,
      attempts: task.attempts,
      error: normalizeError(task.error),
      articleId: task.articleId || null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  });
  assertUnique(tasks.map((item) => item.id), "GENERATION_BATCH_INVALID", "Task id");
  const normalized = {
    version: 2,
    id: batch.id,
    requestId: batch.requestId,
    requestFingerprint: batch.requestFingerprint,
    concurrency,
    status: batch.status,
    startState: batch.startState,
    ...(batch.startRequestedAt ? { startRequestedAt: batch.startRequestedAt } : {}),
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
    aiConfigFingerprint: batch.aiConfigFingerprint,
    questionSources,
    templates,
    tasks,
  };
  normalized.counts = countsForV2(tasks);
  return normalized;
}

function normalizePersisted(batch) {
  return batch?.version === 2 ? normalizePersistedV2(batch) : normalizePersistedV1(batch);
}

module.exports = {
  BATCH_VERSION,
  MAX_TASKS,
  TASK_STATUSES,
  BATCH_STATUSES,
  V2_BATCH_STATUSES,
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
  normalizePersistedV1,
  normalizePersistedV2,
  normalizeQuestionSource,
  countsForV2,
};
