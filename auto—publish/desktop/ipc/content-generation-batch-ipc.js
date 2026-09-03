const { wrap } = require("../services/ipc-response");
const { SAFE_MESSAGES } = require("../services/content-generation-batch-service");
const { productionIpcRegistry } = require("./contracts/production-registry");
const { reportDiagnostic } = require("../../src/diagnostics/diagnostic-producer");

const GENERATION_TASK_PAGE_SIZE = 256;

function safeFailure(error) {
  const code = error && typeof error.code === "string" && SAFE_MESSAGES[error.code] ? error.code : "GENERATION_INPUT_INVALID";
  const safeError = { code: code, message: SAFE_MESSAGES[code] || "Generation batch request failed" };
  ["platformId", "templateId", "diagnosticCode"].forEach(function(key) {
    if (error && typeof error[key] === "string" && error[key].length <= 200 && !/[\\/\u0000-\u001F]/.test(error[key])) safeError[key] = error[key];
  });
  return { ok: false, error: safeError };
}

function invoke(handler) {
  return wrap(handler).then(function(result) { return result.ok ? result : safeFailure(result.error); });
}

function input(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const error = new Error(SAFE_MESSAGES.GENERATION_INPUT_INVALID);
    error.code = "GENERATION_INPUT_INVALID";
    throw error;
  }
  return Object.assign({}, value);
}

function safeTask(value) {
  const task = value || {};
  const result = {
    id: task.id,
    clientId: task.clientId,
    platform: task.platform,
    templateId: task.templateId,
    materialIds: Array.isArray(task.materialIds) ? task.materialIds.slice() : [],
    researchQueryIds: Array.isArray(task.researchQueryIds) ? task.researchQueryIds.slice() : [],
    status: task.status,
    attempts: task.attempts,
  };
  if (task.error === null) result.error = null;
  else if (task.error) result.error = {
    code: typeof task.error.code === "string" ? task.error.code : "GENERATION_TASK_FAILED",
    message: "生成任务失败，请检查诊断信息。",
  };
  if (task.articleId !== undefined) result.articleId = task.articleId;
  if (
    typeof task.articleTitle === "string" &&
    task.articleTitle.length > 0 &&
    task.articleTitle.length <= 300 &&
    !/[\u0000-\u001F\u007F]/.test(task.articleTitle)
  ) result.articleTitle = task.articleTitle;
  if (task.createdAt !== undefined) result.createdAt = task.createdAt;
  if (task.updatedAt !== undefined) result.updatedAt = task.updatedAt;
  return result;
}

function taskPage(values, projector) {
  const source = Array.isArray(values) ? values : [];
  return {
    tasks: source.slice(0, GENERATION_TASK_PAGE_SIZE).map(projector),
    truncated: source.length > GENERATION_TASK_PAGE_SIZE,
    total: source.length,
  };
}

function safeBatch(value) {
  if (value === null || value === undefined) return null;
  const tasks = taskPage(value.tasks, safeTask);
  const batch = {
    id: value.id,
    status: value.status,
    clientSources: Array.isArray(value.clientSources) ? value.clientSources.map((item) => ({
      clientId: item.clientId,
      materialIds: Array.isArray(item.materialIds) ? item.materialIds.slice() : [],
      researchQueryIds: Array.isArray(item.researchQueryIds) ? item.researchQueryIds.slice() : [],
    })) : [],
    templates: Array.isArray(value.templates) ? value.templates.map((item) => ({
      platform: item.platform,
      templateId: item.templateId,
    })) : [],
    tasks: tasks.tasks,
    counts: value.counts,
  };
  for (const key of ["version", "concurrency", "createdAt", "updatedAt", "aiConfigFingerprint"])
    if (value[key] !== undefined) batch[key] = value[key];
  if (Array.isArray(value.excludedClients)) batch.excludedClients = value.excludedClients.map((item) => ({
    clientId: item.clientId,
    codes: Array.isArray(item.codes) ? item.codes.slice() : [],
  }));
  if (tasks.truncated) {
    batch.taskCount = tasks.total;
    batch.taskOffset = 0;
    batch.tasksTruncated = true;
  }
  return batch;
}

function safePreview(value) {
  const input = value || {};
  const tasks = taskPage(input.tasks, (item) => ({
    clientId: item.clientId,
    platform: item.platform,
    templateId: item.templateId,
    materialIds: Array.isArray(item.materialIds) ? item.materialIds.slice() : [],
    researchQueryIds: Array.isArray(item.researchQueryIds) ? item.researchQueryIds.slice() : [],
  }));
  return {
    clientCount: input.clientCount,
    executableClientCount: input.executableClientCount,
    taskCount: input.taskCount,
    executableTaskCount: input.executableTaskCount,
    excludedTaskCount: input.excludedTaskCount,
    excludedClients: Array.isArray(input.excludedClients) ? input.excludedClients.map((item) => ({
      clientId: item.clientId,
      codes: Array.isArray(item.codes) ? item.codes.slice() : [],
    })) : [],
    templates: Array.isArray(input.templates) ? input.templates.map((item) => ({
      platform: item.platform,
      templateId: item.templateId,
    })) : [],
    clientSources: Array.isArray(input.clientSources) ? input.clientSources.map((item) => ({
      clientId: item.clientId,
      materialIds: Array.isArray(item.materialIds) ? item.materialIds.slice() : [],
      researchQueryIds: Array.isArray(item.researchQueryIds) ? item.researchQueryIds.slice() : [],
    })) : [],
    tasks: tasks.tasks,
    ...(tasks.truncated ? { taskOffset: 0, tasksTruncated: true } : {}),
  };
}

function safeState(value) {
  const state = value || {};
  return {
    state: state.state || state.status || "idle",
    status: state.status || state.state || "idle",
    batchId: state.batchId || null,
    counts: state.counts || null,
    updatedAt: state.updatedAt,
    runtimeId: state.runtimeId,
    sequence: state.sequence,
    isBatchRunning: state.isBatchRunning === true,
    isStopPending: state.isStopPending === true,
  };
}

function safeCapabilities(value) {
  const input = value || {};
  return {
    canResume: input.canResume === true,
    canContinue: input.canContinue === true,
    canRetry: input.canRetry === true,
    canCancel: input.canCancel === true,
  };
}

function safeRuntimeSnapshot(value) {
  const input = value || {};
  return {
    runtimeId: input.runtimeId,
    sequence: input.sequence,
    runtime: safeState(input.runtime),
    batch: safeBatch(input.batch),
    capabilities: safeCapabilities(input.capabilities),
  };
}

function registerContentGenerationBatchIpc(deps) {
  const values = deps || {};
  const ipcMain = values.ipcMain;
  const service = values.contentGenerationBatchService;
  if (!ipcMain || typeof ipcMain.handle !== "function" || !service) throw new Error("Generation batch IPC dependencies are required");
  ipcMain.handle("content:preview-generation-batch", function(event, value) { return invoke(async function() { return safePreview(await service.preview(input(value))); }); });
  ipcMain.handle("content:create-and-start-generation-batch", function(event, value) { return invoke(async function() { return { batch: safeBatch(await service.createAndStartBatch(input(value))) }; }); });
  ipcMain.handle("content:pause-generation-batch", function(event, value) { return invoke(async function() { return { batch: safeBatch(await service.pauseBatch(value === undefined ? undefined : input(value))) }; }); });
  ipcMain.handle("content:abandon-generation-batch", function(event, value) { return invoke(async function() { return { batch: safeBatch(await service.abandonBatch(input(value))) }; }); });
  ipcMain.handle("content:resume-generation-batch", function(event, value) { return invoke(async function() { return { batch: safeBatch(await service.resumeBatch(input(value))) }; }); });
  ipcMain.handle("content:retry-failed-generation-batch", function(event, value) { return invoke(async function() { return { batch: safeBatch(await service.retryFailed(input(value))) }; }); });
  ipcMain.handle("content:preview-cancel-pending-generation-batch", function(event, value) { return invoke(function() { return service.previewCancelPending(input(value)); }); });
  ipcMain.handle("content:cancel-pending-generation-batch", function(event, value) { return invoke(async function() { return { batch: safeBatch(await service.cancelPending(input(value))) }; }); });
  ipcMain.handle("content:get-generation-runtime-snapshot", function() { return invoke(function() {
    if (typeof service.getRuntimeSnapshot === "function") return safeRuntimeSnapshot(service.getRuntimeSnapshot());
    const runtime = safeState(service.getState());
    return { runtimeId: runtime.runtimeId, sequence: runtime.sequence, runtime, batch: null, capabilities: safeCapabilities({}) };
  }); });
  const sendToRenderer = values.sendToRenderer;
  const runtimeEvent = productionIpcRegistry.byCapability("generation.runtimeChanged");
  const publishEvents = values.publishEvents !== false;
  const unsubscribe = publishEvents && typeof service.subscribe === "function" ? service.subscribe(function(state) {
    if (typeof sendToRenderer !== "function") return;
    try {
      const eventState = state && state.batch ? Object.assign({}, state, { batch: safeBatch(state.batch) }) : state;
      sendToRenderer(runtimeEvent.channel, productionIpcRegistry.event(runtimeEvent, eventState));
    } catch (_) {
      reportDiagnostic({
        code: "GENERATION_RUNTIME_EVENT_DELIVERY_FAILED",
        module: "content-generation-batch-ipc",
        category: "transport",
        operationId: "generation-runtime-event",
        metadata: {
          action: "send",
          channel: runtimeEvent.channel,
          transport: "ipc",
          outcome: "failed",
        },
      });
    }
  }) : function() {};
  return { dispose: unsubscribe };
}

module.exports = { GENERATION_TASK_PAGE_SIZE, registerContentGenerationBatchIpc, safeBatch, safePreview, safeState, safeRuntimeSnapshot };
