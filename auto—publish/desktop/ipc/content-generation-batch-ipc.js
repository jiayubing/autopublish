const { wrap } = require("../services/ipc-response");
const { createContentGenerationBatchService, SAFE_MESSAGES } = require("../services/content-generation-batch-service");

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

function invokeBatchCommand(service, method, value) {
  return invoke(async function() {
    const commandInput = input(value);
    return service[method](commandInput);
  });
}

function registerContentGenerationBatchIpc(deps) {
  const values = deps || {};
  const ipcMain = values.ipcMain;
  const service = values.contentGenerationBatchService || createContentGenerationBatchService({ workspaceRoot: values.rootDir, aiProviderService: values.aiProviderService });
  if (!ipcMain || typeof ipcMain.handle !== "function" || !service) throw new Error("Generation batch IPC dependencies are required");
  ipcMain.handle("content:preview-generation-batch", function(event, value) { return invoke(function() { return service.preview(input(value)); }); });
  ipcMain.handle("content:create-generation-batch", function(event, value) { return invoke(function() { return service.createBatch(input(value)); }); });
  ipcMain.handle("content:create-and-start-generation-batch", function(event, value) { return invoke(function() { return service.createAndStartBatch(input(value)); }); });
  ipcMain.handle("content:list-generation-batches", function(event, value) { return invoke(function() { if (value !== undefined) input(value); return service.list(); }); });
  ipcMain.handle("content:get-generation-batch", function(event, value) { return invoke(function() { return service.get(input(value).batchId); }); });
  ipcMain.handle("content:start-generation-batch", function(event, value) { return invoke(function() { return service.startBatch(input(value)); }); });
  ipcMain.handle("content:stop-generation-batch", function(event, value) { return invoke(function() { return service.stopBatch(value === undefined ? undefined : input(value)); }); });
  ipcMain.handle("content:pause-generation-batch", function(event, value) { return invoke(function() { return service.pauseBatch(value === undefined ? undefined : input(value)); }); });
  ipcMain.handle("content:continue-generation-batch", function(event, value) { return invokeBatchCommand(service, "continueBatch", value); });
  ipcMain.handle("content:resume-generation-batch", function(event, value) { return invokeBatchCommand(service, "resumeBatch", value); });
  ipcMain.handle("content:retry-failed-generation-batch", function(event, value) { return invoke(function() { return service.retryFailed(input(value)); }); });
  ipcMain.handle("content:preview-cancel-pending-generation-batch", function(event, value) { return invoke(function() { return service.previewCancelPending(input(value)); }); });
  ipcMain.handle("content:cancel-pending-generation-batch", function(event, value) { return invoke(function() { return service.cancelPending(input(value)); }); });
  ipcMain.handle("content:get-generation-batch-state", function(event, value) { return invoke(function() { if (value !== undefined) input(value); return service.getState(); }); });
  ipcMain.handle("content:get-generation-runtime-snapshot", function() { return invoke(function() {
    if (typeof service.getRuntimeSnapshot === "function") return service.getRuntimeSnapshot();
    return { runtime: service.getState(), batch: null, capabilities: {} };
  }); });
  const sendToRenderer = values.sendToRenderer;
  const unsubscribe = typeof service.subscribe === "function" ? service.subscribe(function(state) {
    if (typeof sendToRenderer === "function") sendToRenderer("content:generation-batch-state", state);
  }) : function() {};
  return { dispose: unsubscribe };
}

module.exports = { registerContentGenerationBatchIpc };
