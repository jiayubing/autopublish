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
  const messages = {
    STORAGE_MAINTENANCE_BUSY: "Cache cleanup is unavailable while a task is active",
    STORAGE_MAINTENANCE_INPUT_INVALID: "Storage maintenance input is invalid",
    STORAGE_MAINTENANCE_PATH_INVALID: "Storage maintenance path is invalid",
    STORAGE_DELETE_FAILED: "Some cache files could not be deleted"
  };
  return { ok: false, error: { code: code, message: messages[code] || "Storage maintenance failed" } };
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
    return invoke(function() { noInput(input, "Storage usage"); return service.getUsage(); });
  });
  values.ipcMain.handle("storage-maintenance:clean-caches", function(event, input) {
    return invoke(function() { noInput(input, "Cache cleanup"); return service.cleanupCaches(); });
  });
  return { module: service, dispose: function() {
    if (typeof values.ipcMain.removeHandler === "function") {
      values.ipcMain.removeHandler("storage-maintenance:get-usage");
      values.ipcMain.removeHandler("storage-maintenance:clean-caches");
    }
  } };
}

module.exports = { registerStorageMaintenanceIpc };
