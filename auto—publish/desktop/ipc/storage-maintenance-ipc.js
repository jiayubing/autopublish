function inputError(message) {
  const error = new Error(message);
  error.code = "STORAGE_MAINTENANCE_INPUT_INVALID";
  return error;
}

function noInput(input, label) {
  if (input !== undefined) throw inputError(label + " does not accept input");
}

function safeFailure(error) {
  const code = error && typeof error.code === "string" ? error.code : "STORAGE_MAINTENANCE_FAILED";
  return { ok: false, error: { code: code } };
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function safeCategory(value) {
  const input = value || {};
  return {
    bytes: count(input.bytes),
    files: count(input.files),
    followedSymlinks: count(input.followedSymlinks),
    skippedSymlinks: count(input.skippedSymlinks),
  };
}

function safeUsage(value) {
  const input = value || {};
  const temporary = safeCategory(input.temporary || input.tmp);
  return {
    logs: safeCategory(input.logs),
    temporary,
    docxCache: safeCategory(input.docxCache),
    profiles: safeCategory(input.profiles),
    tmp: temporary,
    totalBytes: count(input.totalBytes),
    removableBytes: count(input.removableBytes),
    active: input.active === true,
  };
}

function safeCleanup(value, usageFallback) {
  const input = value || {};
  return {
    blocked: input.blocked === true,
    reason: typeof input.reason === "string" ? input.reason : null,
    deletedCount: Array.isArray(input.deleted) ? input.deleted.length : 0,
    failedCount: Array.isArray(input.failed) ? input.failed.length : 0,
    usage: safeUsage(input.usage || usageFallback),
  };
}

function invoke(handler) {
  return Promise.resolve().then(handler).then(function(data) {
    return { ok: true, data: data };
  }, safeFailure);
}

function registerStorageMaintenanceIpc(deps) {
  const values = deps || {};
  if (!values.ipcMain || typeof values.ipcMain.handle !== "function") throw new TypeError("ipcMain is required");
  if (!values.storageMaintenanceService) throw new TypeError("storage maintenance service is required");
  const service = values.storageMaintenanceService;
  values.ipcMain.handle("storage-maintenance:get-usage", function(event, input) {
    return invoke(function() { noInput(input, "Storage usage"); return safeUsage(service.getUsage()); });
  });
  values.ipcMain.handle("storage-maintenance:clean-caches", function(event, input) {
    return invoke(function() {
      noInput(input, "Cache cleanup");
      return safeCleanup(service.cleanupCaches(), service.getUsage());
    });
  });
  return { module: service, dispose: function() {
    if (typeof values.ipcMain.removeHandler === "function") {
      values.ipcMain.removeHandler("storage-maintenance:get-usage");
      values.ipcMain.removeHandler("storage-maintenance:clean-caches");
    }
  } };
}

module.exports = { registerStorageMaintenanceIpc, safeUsage, safeCleanup };
