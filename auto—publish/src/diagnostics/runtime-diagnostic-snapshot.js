"use strict";

const { parseDiagnosticRecord } = require("./diagnostic-schema");

const SAFE_CAPABILITY_STATES = new Set([
  "ready",
  "not_checked",
  "optional_unconfigured",
  "unavailable",
]);
const SAFE_BUILD_INFO_OBSERVATIONS = new Set([
  "complete",
  "partial",
  "fallback",
  "unavailable",
]);
const SAFE_DIAGNOSTIC_SINK_STATES = new Set([
  "ready",
  "degraded",
  "not_configured",
  "unavailable",
]);
const SAFE_DIAGNOSTIC_STARTUP_STATES = new Set([
  "PASSED",
  "FAILED",
  "NOT_CONFIGURED",
]);
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{1,127}$/;

function safeToken(value, fallback) {
  return typeof value === "string" && SAFE_TOKEN.test(value) ? value : fallback;
}

function safeCode(value, fallback) {
  return typeof value === "string" && SAFE_CODE.test(value) ? value : fallback;
}

function safeTime(value) {
  return typeof value === "string" &&
    value.length <= 64 &&
    SAFE_TOKEN.test(value)
    ? value
    : null;
}

function safeCapability(value) {
  const input = value || {};
  return {
    state: SAFE_CAPABILITY_STATES.has(input.state)
      ? input.state
      : "unavailable",
    source: safeToken(input.source, null),
    errorCode: safeCode(input.errorCode, null),
    lastCheckedAt: safeTime(input.lastCheckedAt),
    ...(input.available !== undefined
      ? { available: input.available === true }
      : {}),
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

function safeBuildInfo(value) {
  const input = value || {};
  return {
    version: safeToken(input.version, "unknown"),
    commit: safeToken(input.commit, "unknown"),
    dirty: input.dirty === true,
    source: safeToken(input.source, "fallback"),
    observation: SAFE_BUILD_INFO_OBSERVATIONS.has(input.observation)
      ? input.observation
      : "fallback",
  };
}

function safeObservation(droppedCount) {
  const count =
    Number.isSafeInteger(droppedCount) && droppedCount > 0 ? droppedCount : 0;
  return {
    status: count > 0 ? "partial" : "complete",
    droppedCount: count,
  };
}

function safeDiagnosticSink(value) {
  const input = value || {};
  const count = (name) =>
    Number.isSafeInteger(input[name]) && input[name] >= 0 ? input[name] : 0;
  return {
    status: SAFE_DIAGNOSTIC_SINK_STATES.has(input.status)
      ? input.status
      : "unavailable",
    startupStatus: SAFE_DIAGNOSTIC_STARTUP_STATES.has(input.startupStatus)
      ? input.startupStatus
      : "NOT_CONFIGURED",
    memoryFailureCount: count("memoryFailureCount"),
    fileFailureCount: count("fileFailureCount"),
    lastFailureCode: safeCode(input.lastFailureCode, null),
  };
}

function safeDiagnosticItems(items, fallbackMessage) {
  return (Array.isArray(items) ? items : []).slice(0, 100).map(function (item) {
    return {
      code: safeCode(item && item.code, "RUNTIME_DIAGNOSTIC"),
      message: fallbackMessage,
    };
  });
}

function safeRuntimeEventsResult(items) {
  const result = [];
  let droppedCount = 0;
  (Array.isArray(items) ? items : []).slice(-100).forEach(function (item) {
    try {
      result.push(parseDiagnosticRecord(item));
    } catch (_) {
      droppedCount += 1;
    }
  });
  return { items: result, droppedCount };
}

function safeRuntimeEvents(items) {
  return safeRuntimeEventsResult(items).items;
}

function safeDiagnostics(diagnostics) {
  const source = diagnostics || {};
  const tools = source.tools || {};
  const capabilities = source.capabilities || {};
  const browser = capabilities.browserChannel || source.browserChannel || {};
  const safeBrowser = safeBrowserCapability({
    channel: browser.channel,
    configured: browser.configured,
    state: browser.state || (browser.probed ? "ready" : "not_checked"),
    probed: browser.state === "ready" || browser.probed === true,
    source: browser.source,
    errorCode: browser.errorCode,
    lastCheckedAt: browser.lastCheckedAt,
  });
  const safeCapabilities = {
    playwrightNode: safeCapability(
      capabilities.playwrightNode || safeTool(tools.playwrightNode),
    ),
    playwrightCli: safeCapability(
      capabilities.playwrightCli || safeTool(tools.playwrightCli),
    ),
    browserChannel: safeBrowser,
    docx: safeCapability(
      capabilities.docx ||
        capability("unavailable", "bundled", "DOCX_RUNTIME_UNAVAILABLE"),
    ),
  };
  const runtimeEvents = safeRuntimeEventsResult(source.runtimeEvents);
  return {
    ok: source.ok === true,
    buildInfo: safeBuildInfo(source.buildInfo),
    capabilities: safeCapabilities,
    browserChannel: safeBrowser,
    tools: {
      playwrightNode: safeCapabilities.playwrightNode,
      playwrightCli: safeCapabilities.playwrightCli,
    },
    errors: safeDiagnosticItems(
      source.errors,
      "运行环境诊断项，请检查诊断代码。",
    ),
    warnings: safeDiagnosticItems(
      source.warnings,
      "运行环境诊断项，请检查诊断代码。",
    ),
    runtimeEvents: runtimeEvents.items,
    runtimeEventsObservation: safeObservation(runtimeEvents.droppedCount),
    diagnosticSink: safeDiagnosticSink(source.diagnosticSink),
  };
}

function safeTool(tool) {
  const available = Boolean(tool && (tool.command || tool.available));
  return { state: available ? "ready" : "unavailable", available };
}

function capability(state, source, errorCode, lastCheckedAt) {
  return {
    state,
    source: source || null,
    errorCode: errorCode || null,
    lastCheckedAt: lastCheckedAt || null,
  };
}

module.exports = {
  SAFE_CAPABILITY_STATES,
  safeToken,
  safeCode,
  safeTime,
  safeCapability,
  safeBrowserCapability,
  safeBuildInfo,
  safeObservation,
  safeDiagnosticSink,
  safeDiagnosticItems,
  safeRuntimeEventsResult,
  safeRuntimeEvents,
  safeDiagnostics,
  safeTool,
  capability,
};
