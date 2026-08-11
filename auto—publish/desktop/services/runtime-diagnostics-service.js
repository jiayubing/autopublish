"use strict";

const path = require("node:path");
const childProcess = require("node:child_process");
const {
  createDiagnosticRecord,
} = require("../../src/diagnostics/diagnostic-schema");
const {
  createDiagnosticMemorySink,
} = require("../../src/diagnostics/diagnostic-memory-sink");
const {
  createDiagnosticFileSink,
} = require("../../src/diagnostics/diagnostic-file-sink");
const {
  initializeDiagnosticSink,
} = require("../../src/diagnostics/diagnostic-startup-cleanup");
const {
  capability,
  safeDiagnostics,
} = require("../../src/diagnostics/runtime-diagnostic-snapshot");
const {
  resolvePlaywrightRuntime,
} = require("../../src/infrastructure/runtime/playwright-runtime-resolver");
const {
  probeBundledMammoth,
  readBuildInfo,
  diagnosticErrors,
  diagnosticWarnings,
} = require("./runtime-diagnostics-probes");
const { probeBrowserRuntime } = require("./runtime-browser-smoke");

const DIAGNOSTIC_EVENT_FIELDS = new Set([
  "diagnosticId",
  "occurredAt",
  "code",
  "module",
  "category",
  "operationId",
  "runId",
  "metadata",
]);

function createRuntimeDiagnosticsService(options) {
  const opts = options || {};
  const workspaceValue =
    opts.workspaceRoot || process.env.AUTO_PUBLISH_WORKSPACE;
  const appValue = opts.appRoot || process.env.AUTO_PUBLISH_APP_ROOT;
  if (typeof workspaceValue !== "string" || !workspaceValue.trim())
    throw new Error("workspaceRoot is required");
  if (typeof appValue !== "string" || !appValue.trim())
    throw new Error("appRoot is required");
  const workspaceRoot = path.resolve(workspaceValue);
  const appRoot = path.resolve(appValue);
  const execFile = opts.execFile || childProcess.execFile;
  let platformSettingsService = opts.platformSettingsService || null;
  let browserProbe = {
    channel: null,
    state: "not_checked",
    lastCheckedAt: null,
    errorCode: null,
  };
  const memorySink =
    opts.memorySink || createDiagnosticMemorySink({ maxRecords: 100 });
  const fileSink =
    opts.fileSink ||
    (opts.paths && opts.paths.logs
      ? createDiagnosticFileSink({
          directory: opts.paths.logs,
          root: opts.paths.localState || opts.paths.logs,
        })
      : null);
  const startupCleanup =
    fileSink && opts.initializeFileSink !== false
      ? initializeDiagnosticSink(fileSink)
      : { status: "NOT_CONFIGURED" };
  let memoryFailureCount = 0;
  let fileFailureCount = 0;
  let lastFailureCode = null;

  function safeFailureCode(value) {
    return value && typeof value.code === "string" &&
      /^[A-Z][A-Z0-9_]{1,127}$/.test(value.code)
      ? value.code
      : null;
  }

  function diagnosticSinkStatus() {
    return {
      status: memoryFailureCount > 0 || fileFailureCount > 0
        ? "degraded"
        : fileSink
          ? "ready"
          : "not_configured",
      startupStatus: startupCleanup.status,
      memoryFailureCount,
      fileFailureCount,
      lastFailureCode,
    };
  }

  function currentBrowserCapability(browserChannel) {
    if (!browserChannel.configured) {
      browserProbe = {
        channel: null,
        state: "unavailable",
        lastCheckedAt: null,
        errorCode: browserChannel.errorCode || "BROWSER_CHANNEL_INVALID",
      };
      return Object.assign(
        {},
        capability(
          "unavailable",
          browserChannel.source,
          browserChannel.errorCode || "BROWSER_CHANNEL_INVALID",
        ),
        browserChannel,
      );
    }
    if (browserProbe.channel !== browserChannel.channel)
      browserProbe = {
        channel: browserChannel.channel,
        state: "not_checked",
        lastCheckedAt: null,
        errorCode: null,
      };
    return Object.assign({}, browserProbe, browserChannel);
  }

  function diagnose() {
    const tools = resolvePlaywrightRuntime(
      Object.assign({}, opts, {
        appRoot,
        hepanProvider: platformSettingsService
          ? function () {
              return platformSettingsService.getRuntimeConfig("hepan");
            }
          : opts.hepanProvider,
      }),
    );
    const mammoth = probeBundledMammoth(appRoot, opts.docxAvailable);
    const capabilities = {
      playwrightNode: capability(
        tools.playwrightNode.command ? "ready" : "unavailable",
        tools.playwrightNode.source,
        tools.playwrightNode.command ? null : "PLAYWRIGHT_NODE_UNAVAILABLE",
      ),
      playwrightCli: capability(
        tools.playwrightCli.command ? "ready" : "unavailable",
        tools.playwrightCli.source,
        tools.playwrightCli.command ? null : "PLAYWRIGHT_CLI_UNAVAILABLE",
      ),
      browserChannel: currentBrowserCapability(tools.browserChannel),
      docx: capability(
        mammoth.available ? "ready" : "unavailable",
        "bundled",
        mammoth.available ? null : "DOCX_RUNTIME_UNAVAILABLE",
      ),
      hepan: capability(
        tools.hepanPython.command ? "ready" : "optional_unconfigured",
        tools.hepanPython.source || "optional",
        tools.hepanPython.command ? null : "HEPAN_PYTHON_UNAVAILABLE",
      ),
    };
    const errors = diagnosticErrors(tools, capabilities);
    const warnings = diagnosticWarnings(tools, capabilities);
    return {
      ok: errors.length === 0,
      workspaceRoot,
      appRoot,
      buildInfo: readBuildInfo(appRoot, opts.env),
      tools,
      capabilities,
      errors,
      warnings,
      runtimeEvents: memorySink.getSnapshot(),
      diagnosticSink: diagnosticSinkStatus(),
    };
  }

  function probeBrowser() {
    return probeBrowserRuntime({
      diagnose,
      execFile,
      env: opts.env,
      onState: function (state) {
        browserProbe = state;
      },
      readSafeDiagnostics: function () {
        return safeDiagnostics(diagnose());
      },
    });
  }

  return Object.freeze({
    diagnose,
    probeBrowser,
    safeDiagnostics: function () {
      return safeDiagnostics(diagnose());
    },
    startupCleanup,
    report: function (event) {
      if (!event || typeof event !== "object") return false;
      try {
        if (Object.keys(event).some((key) => !DIAGNOSTIC_EVENT_FIELDS.has(key)))
          return false;
      } catch (_) {
        return false;
      }
      let record;
      try {
        record = createDiagnosticRecord({
          diagnosticId: event.diagnosticId,
          code: event.code,
          module: event.module || "runtime",
          category: event.category || "internal",
          operationId: event.operationId,
          runId: event.runId,
          occurredAt: event.occurredAt,
          metadata: event.metadata,
        });
      } catch (_) {
        return false;
      }
      try {
        memorySink.append(record);
      } catch (error) {
        memoryFailureCount += 1;
        lastFailureCode = safeFailureCode(error);
        return false;
      }
      try {
        if (fileSink) fileSink.append(record);
      } catch (error) {
        fileFailureCount += 1;
        lastFailureCode = safeFailureCode(error);
      }
      return true;
    },
    memorySink,
    fileSink,
    getDiagnosticSinkStatus: diagnosticSinkStatus,
    setPlatformSettingsService: function (service) {
      platformSettingsService = service || null;
    },
  });
}

module.exports = { createRuntimeDiagnosticsService, safeDiagnostics };
