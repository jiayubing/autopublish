const { projectDiagnostics } = require("../../src/diagnostics/diagnostic-projection");

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{1,127}$/;
const CAPABILITY_STATES = new Set([
  "ready",
  "not_checked",
  "optional_unconfigured",
  "unavailable",
]);

function safeId(value) {
  return typeof value === "string" && SAFE_TOKEN.test(value) ? value : null;
}

function safeCode(value, fallback) {
  return typeof value === "string" && SAFE_CODE.test(value) ? value : fallback;
}

function failure(error) {
  const diagnosticId = safeId(error && error.diagnosticId);
  return {
    ok: false,
    error: {
      code: safeCode(error && error.code, "RUNTIME_DIAGNOSTICS_FAILED"),
      ...(diagnosticId ? { diagnosticId } : {}),
    },
  };
}

function invoke(handler) {
  return Promise.resolve().then(handler).then(
    (data) => ({ ok: true, data }),
    failure,
  );
}

function safeToken(value, fallback) {
  return typeof value === "string" && SAFE_TOKEN.test(value) ? value : fallback;
}

function safeTime(value) {
  return typeof value === "string" && value.length <= 64 && SAFE_TOKEN.test(value)
    ? value
    : null;
}

function safeBuildInfo(value) {
  const input = value || {};
  return {
    version: safeToken(input.version, "unknown"),
    commit: safeToken(input.commit, "unknown"),
    dirty: input.dirty === true,
  };
}

function safeCapability(value) {
  const input = value || {};
  return {
    state: CAPABILITY_STATES.has(input.state) ? input.state : "unavailable",
    source: safeToken(input.source, null),
    errorCode: safeCode(input.errorCode, null),
    lastCheckedAt: safeTime(input.lastCheckedAt),
    ...(input.available !== undefined ? { available: input.available === true } : {}),
  };
}

function safeBrowserCapability(value) {
  const input = value || {};
  return {
    ...safeCapability(input),
    channel: safeToken(input.channel, null),
    configured: input.configured === true,
    probed: input.probed === true,
  };
}

function safeCapabilities(value) {
  const input = value || {};
  return {
    playwrightNode: safeCapability(input.playwrightNode),
    playwrightCli: safeCapability(input.playwrightCli),
    browserChannel: safeBrowserCapability(input.browserChannel),
    docx: safeCapability(input.docx),
    hepan: safeCapability(input.hepan),
  };
}

function safeTools(value) {
  const input = value || {};
  return {
    playwrightNode: safeCapability(input.playwrightNode),
    playwrightCli: safeCapability(input.playwrightCli),
    hepanPython: safeCapability(input.hepanPython || input.hepan),
  };
}

function safeItems(items, fallbackMessage) {
  return (Array.isArray(items) ? items : []).slice(0, 100).map((item) => ({
    code: safeCode(item && item.code, "RUNTIME_DIAGNOSTIC"),
    message: fallbackMessage,
  }));
}

function sanitizeDiagnostics(value) {
  const input = value || {};
  const diagnostics = {
    ok: input.ok === true,
    buildInfo: safeBuildInfo(input.buildInfo),
    browserChannel: safeBrowserCapability(input.browserChannel),
    capabilities: safeCapabilities(input.capabilities),
    errors: safeItems(input.errors, "运行环境诊断项，请检查诊断代码。"),
    warnings: safeItems(input.warnings, "运行环境诊断项，请检查诊断代码。"),
  };
  if (input.tools) diagnostics.tools = safeTools(input.tools);
  if (Array.isArray(input.runtimeEvents))
    diagnostics.runtimeEvents = projectDiagnostics(input.runtimeEvents, { limit: 100 });
  return diagnostics;
}

function sanitizeBrowserSmoke(value) {
  const input = value || {};
  const result = {
    ok: true,
    browserChannel: safeToken(input.browserChannel, "unknown"),
    session: "runtime-self-check",
  };
  if (input.capability) result.capability = safeBrowserCapability(input.capability);
  return result;
}

function registerRuntimeDiagnosticsIpc(deps) {
  const service = deps.runtimeDiagnosticsService;
  if (!service) throw new Error("Runtime diagnostics service is required");
  deps.ipcMain.handle("runtime-diagnostics:get", function () {
    return invoke(function () { return sanitizeDiagnostics(service.safeDiagnostics()); });
  });
  deps.ipcMain.handle("runtime-diagnostics:browser-smoke", function () {
    return invoke(async function () { return sanitizeBrowserSmoke(await service.probeBrowser()); });
  });
}

module.exports = {
  registerRuntimeDiagnosticsIpc,
  sanitizeDiagnostics,
  sanitizeBrowserSmoke,
  safeCapabilities,
  safeTools,
};
