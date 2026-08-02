"use strict";

const {
  sanitizeDiagnostics,
  sanitizeBrowserSmoke,
  safeCapabilities,
  safeTools,
} = require("../../src/diagnostics/runtime-diagnostic-ipc");

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{1,127}$/;

function safeId(value) {
  return typeof value === "string" && SAFE_TOKEN.test(value) ? value : null;
}

function safeErrorCode(value) {
  return typeof value === "string" && SAFE_CODE.test(value)
    ? value
    : "RUNTIME_DIAGNOSTICS_FAILED";
}

function failure(error) {
  const diagnosticId = safeId(error && error.diagnosticId);
  return {
    ok: false,
    error: {
      code: safeErrorCode(error && error.code),
      ...(diagnosticId ? { diagnosticId } : {}),
    },
  };
}

function invoke(handler) {
  return Promise.resolve()
    .then(handler)
    .then((data) => ({ ok: true, data }), failure);
}

function registerRuntimeDiagnosticsIpc(deps) {
  const service = deps.runtimeDiagnosticsService;
  if (!service) throw new Error("Runtime diagnostics service is required");
  deps.ipcMain.handle("runtime-diagnostics:get", function () {
    return invoke(function () {
      return sanitizeDiagnostics(service.safeDiagnostics());
    });
  });
  deps.ipcMain.handle("runtime-diagnostics:browser-smoke", function () {
    return invoke(async function () {
      return sanitizeBrowserSmoke(await service.probeBrowser());
    });
  });
}

module.exports = {
  registerRuntimeDiagnosticsIpc,
  sanitizeDiagnostics,
  sanitizeBrowserSmoke,
  safeCapabilities,
  safeTools,
};
