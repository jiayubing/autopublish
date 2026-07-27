function safeFailure(error) {
  const code = error && typeof error.code === "string" ? error.code : "PLATFORM_CONFIG_FAILED";
  return { ok: false, error: { code } };
}

function invoke(handler) {
  return Promise.resolve().then(handler).then((data) => ({ ok: true, data }), safeFailure);
}

function platformId(value) {
  if (typeof value !== "string" || !/^[a-z0-9-]+$/.test(value)) {
    const error = new Error("Invalid platform id");
    error.code = "PLATFORM_CONFIG_INVALID";
    throw error;
  }
  return value;
}

function draft(input) {
  if (input === undefined) return undefined;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    const error = new Error("Invalid platform configuration");
    error.code = "PLATFORM_CONFIG_INVALID";
    throw error;
  }
  return input;
}

function registerPlatformSettingsIpc(deps) {
  const service = deps.platformSettingsService;
  if (!service) throw new Error("Platform settings service is required");
  deps.ipcMain.handle("platform-settings:get-status", function(event, input) { return invoke(() => {
    const id = platformId(input && input.platformId);
    return { platformId: id, status: service.getStatus(id) };
  }); });
  deps.ipcMain.handle("platform-settings:save", function(event, input) { return invoke(() => {
    const id = platformId(input && input.platformId);
    return { platformId: id, status: service.save(id, draft(input && input.draft)) };
  }); });
  deps.ipcMain.handle("platform-settings:test", function(event, input) { return invoke(async () => {
    const id = platformId(input && input.platformId);
    return { platformId: id, result: await service.test(id, draft(input && input.draft)) };
  }); });
  deps.ipcMain.handle("platform-settings:clear", function(event, input) { return invoke(() => {
    const id = platformId(input && input.platformId);
    const result = service.clear(id);
    return { platformId: id, cleared: Boolean(result && result.cleared) };
  }); });
  if (deps.legacyProviderSettings) {
    deps.ipcMain.handle("platform-settings:get-legacy-status", function() { return invoke(() => ({ discover: deps.legacyProviderSettings.discover(), record: deps.legacyProviderSettings.getRecord() })); });
    deps.ipcMain.handle("platform-settings:import-legacy", function(event, input) { return invoke(() => deps.legacyProviderSettings.importLegacy({ confirmed: Boolean(input && input.confirmed) })); });
  }
}

module.exports = { registerPlatformSettingsIpc };
