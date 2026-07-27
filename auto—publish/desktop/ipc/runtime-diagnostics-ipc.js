function failure(error) {
  return {
    ok: false,
    error: {
      code: error && typeof error.code === "string"
        ? error.code
        : "RUNTIME_DIAGNOSTICS_FAILED",
    },
  };
}

function invoke(handler) {
  return Promise.resolve().then(handler).then(
    (data) => ({ ok: true, data }),
    failure,
  );
}

function code(value, fallback) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{1,127}$/.test(value)
    ? value
    : fallback;
}

function sanitizeDiagnostics(value) {
  const input = value || {};
  const diagnostics = {
    ok: input.ok === true,
    buildInfo: input.buildInfo,
    browserChannel: input.browserChannel,
    capabilities: input.capabilities,
    errors: (Array.isArray(input.errors) ? input.errors : []).slice(0, 100).map((item) => ({
      code: code(item && item.code, "RUNTIME_DIAGNOSTIC"),
      message: "运行环境诊断项，请检查诊断代码。",
    })),
    warnings: (Array.isArray(input.warnings) ? input.warnings : []).slice(0, 100).map((item) => ({
      code: code(item && item.code, "RUNTIME_WARNING"),
      message: "运行环境诊断项，请检查诊断代码。",
    })),
  };
  if (input.tools) diagnostics.tools = input.tools;
  if (Array.isArray(input.runtimeEvents)) {
    diagnostics.runtimeEvents = input.runtimeEvents.slice(-100).map((item) => ({
      code: code(item && item.code, "RUNTIME_DIAGNOSTIC"),
      message: "运行期诊断事件，请检查诊断代码。",
      occurredAt: item && item.occurredAt,
    }));
  }
  return diagnostics;
}

function sanitizeBrowserSmoke(value) {
  const input = value || {};
  const result = {
    ok: true,
    browserChannel: input.browserChannel,
    session: "runtime-self-check",
  };
  if (input.capability) result.capability = input.capability;
  return result;
}

function registerRuntimeDiagnosticsIpc(deps) {
  const service = deps.runtimeDiagnosticsService;
  if (!service) throw new Error("Runtime diagnostics service is required");
  deps.ipcMain.handle("runtime-diagnostics:get", function() {
    return invoke(function() { return sanitizeDiagnostics(service.safeDiagnostics()); });
  });
  deps.ipcMain.handle("runtime-diagnostics:browser-smoke", function() {
    return invoke(async function() { return sanitizeBrowserSmoke(await service.probeBrowser()); });
  });
}

module.exports = { registerRuntimeDiagnosticsIpc, sanitizeDiagnostics, sanitizeBrowserSmoke };
