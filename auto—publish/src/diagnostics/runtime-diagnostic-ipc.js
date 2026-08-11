"use strict";

const { projectDiagnosticsResult } = require("./diagnostic-projection");
const {
  safeToken,
  safeCode,
  safeBuildInfo,
  safeCapability,
  safeBrowserCapability,
  safeObservation,
  safeDiagnosticSink,
} = require("./runtime-diagnostic-snapshot");

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
  diagnostics.diagnosticSink = safeDiagnosticSink(input.diagnosticSink);
  diagnostics.runtimeEventsObservation = safeObservation(
    input.runtimeEventsObservation &&
      input.runtimeEventsObservation.droppedCount,
  );
  if (input.tools) diagnostics.tools = safeTools(input.tools);
  if (Array.isArray(input.runtimeEvents)) {
    const projected = projectDiagnosticsResult(input.runtimeEvents, {
      limit: 100,
    });
    diagnostics.runtimeEvents = projected.items;
    const declaredDroppedCount =
      input.runtimeEventsObservation &&
      input.runtimeEventsObservation.droppedCount;
    const droppedCount =
      Number.isSafeInteger(declaredDroppedCount) && declaredDroppedCount >= 0
        ? declaredDroppedCount
        : projected.droppedCount;
    diagnostics.runtimeEventsObservation = safeObservation(droppedCount);
  }
  return diagnostics;
}

function sanitizeBrowserSmoke(value) {
  const input = value || {};
  const result = {
    ok: true,
    browserChannel: safeToken(input.browserChannel, "unknown"),
    session: "runtime-self-check",
  };
  if (input.capability)
    result.capability = safeBrowserCapability(input.capability);
  return result;
}

module.exports = {
  sanitizeDiagnostics,
  sanitizeBrowserSmoke,
  safeCapabilities,
  safeTools,
};
