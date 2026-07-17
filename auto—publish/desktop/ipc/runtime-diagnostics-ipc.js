const { wrap } = require("../services/ipc-response");

function registerRuntimeDiagnosticsIpc(deps) {
  const service = deps.runtimeDiagnosticsService;
  if (!service) throw new Error("Runtime diagnostics service is required");
  deps.ipcMain.handle("runtime-diagnostics:get", function() {
    return wrap(function() { return service.safeDiagnostics(); });
  });
  deps.ipcMain.handle("runtime-diagnostics:browser-smoke", function() {
    return wrap(function() { return service.probeBrowser(); });
  });
}

module.exports = { registerRuntimeDiagnosticsIpc };
