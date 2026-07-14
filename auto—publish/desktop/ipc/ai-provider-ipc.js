const { app, safeStorage } = require("electron");
const { createAiProviderService } = require("../services/ai-provider-service");

function inputError(message) {
  const error = new Error(message);
  error.code = "AI_CONFIG_INVALID";
  return error;
}

function draft(input) {
  if (input === undefined) return {};
  if (!input || typeof input !== "object" || Array.isArray(input)) throw inputError("AI provider configuration is invalid");
  const allowed = ["baseUrl", "apiKey", "model", "timeoutMs"];
  return allowed.reduce(function(result, key) {
    if (Object.prototype.hasOwnProperty.call(input, key)) result[key] = input[key];
    return result;
  }, {});
}

function safeFailure(error) {
  const code = error && typeof error.code === "string" ? error.code : "IPC_ERROR";
  const messages = {
    AI_CONFIG_INVALID: "AI provider configuration is invalid",
    AI_CONFIG_NOT_SET: "AI provider configuration is not set",
    AI_CONFIG_BUSY: "AI provider configuration is unavailable while generation is running",
    AI_CONFIG_ENV_OVERRIDE: "AI provider configuration is controlled by environment variables",
    AI_CONFIG_ENCRYPTION_UNAVAILABLE: "AI provider encryption is unavailable",
    AI_CONFIG_STORAGE_INVALID: "AI provider configuration file is invalid",
    AI_CONFIG_STORAGE_WRITE_FAILED: "AI provider configuration could not be saved",
    AI_CONNECTION_FAILED: "AI connection test failed"
  };
  return { ok: false, error: { code: code, message: messages[code] || "AI provider request failed" } };
}

function invoke(handler) {
  return Promise.resolve().then(handler).then(function(data) { return { ok: true, data: data }; }, safeFailure);
}

function registerAiProviderIpc(deps) {
  const values = deps || {};
  const ipcMain = values.ipcMain;
  const service = values.aiProviderService || createAiProviderService({
    userDataPath: values.userDataPath || app.getPath("userData"),
    safeStorage: values.safeStorage || safeStorage,
    env: values.env
  });
  ipcMain.handle("ai-provider:get-status", function() { return invoke(function() { return service.getStatus(); }); });
  ipcMain.handle("ai-provider:save", function(event, input) { return invoke(function() { return service.save(draft(input)); }); });
  ipcMain.handle("ai-provider:test", function(event, input) { return invoke(function() { return service.testConnection(draft(input)); }); });
  ipcMain.handle("ai-provider:clear", function() { return invoke(function() { return service.clear(); }); });
}

module.exports = { registerAiProviderIpc };
