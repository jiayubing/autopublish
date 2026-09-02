const test = require("node:test");
const assert = require("node:assert/strict");

const { productionIpcRegistry } = require("../desktop/ipc/contracts/production-registry");
const { createAuthenticatedIpcMain } = require("../desktop/ipc/register");
const { registerAiProviderIpc } = require("../desktop/ipc/ai-provider-ipc");
const { registerPlatformSettingsIpc } = require("../desktop/ipc/platform-settings-ipc");
const { registerStorageMaintenanceIpc } = require("../desktop/ipc/storage-maintenance-ipc");
const { registerRuntimeDiagnosticsIpc } = require("../desktop/ipc/runtime-diagnostics-ipc");

const SETTINGS_CHANNELS = [
  "ai-provider:get-status",
  "ai-provider:save",
  "ai-provider:test",
  "ai-provider:clear",
  "platform-settings:get-status",
  "platform-settings:save",
  "platform-settings:test",
  "platform-settings:clear",
  "platform-settings:get-legacy-status",
  "platform-settings:import-legacy",
  "storage-maintenance:get-usage",
  "storage-maintenance:clean-caches",
  "runtime-diagnostics:get",
  "runtime-diagnostics:browser-smoke",
];

function typedIpc() {
  const handlers = new Map();
  const raw = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };
  return {
    ipcMain: createAuthenticatedIpcMain(raw, async () => undefined),
    async invoke(channel, payload) {
      const contract = productionIpcRegistry.byChannel(channel);
      const response = await handlers.get(channel)(
        null,
        productionIpcRegistry.encodeRequest(contract, payload),
      );
      return { response, parsed: productionIpcRegistry.parseResult(contract, response) };
    },
  };
}

const testRecord = {
  testedAt: "2026-07-26T00:00:00.000Z",
  ok: true,
  code: "CONNECTION_OK",
};
const aiStatus = {
  source: "application",
  configured: true,
  baseUrl: "https://provider.example/v1",
  model: "model-a",
  timeoutMs: 60000,
  hasApiKey: true,
  apiKeyMask: "••••••••",
  lastTest: null,
};
const mediaStatus = {
  source: "application",
  configured: true,
  baseUrl: "https://media.example/v1",
  timeoutMs: 30000,
  allowInsecure: false,
  transport: "HTTPS",
  apiKeyMask: "medi****cret",
  thirdPartyId: "长期第三方标识",
  lastTest: null,
};
const usageCategory = {
  bytes: 10,
  files: 1,
  followedSymlinks: 0,
  skippedSymlinks: 0,
};
const storageUsage = {
  logs: usageCategory,
  temporary: usageCategory,
  docxCache: usageCategory,
  profiles: usageCategory,
  tmp: usageCategory,
  totalBytes: 40,
  removableBytes: 30,
  active: false,
};
const unavailableCapability = {
  state: "unavailable",
  source: null,
  errorCode: "PLAYWRIGHT_NODE_UNAVAILABLE",
  lastCheckedAt: null,
};
const browserCapability = {
  state: "not_checked",
  source: "default",
  errorCode: null,
  lastCheckedAt: null,
  channel: "msedge",
  configured: true,
  probed: false,
};
const runtimeDiagnostics = {
  ok: false,
  buildInfo: { version: "1.0.1", commit: "abc123", dirty: false },
  browserChannel: browserCapability,
  capabilities: {
    playwrightNode: unavailableCapability,
    playwrightCli: unavailableCapability,
    browserChannel: browserCapability,
    docx: unavailableCapability,
    hepan: { ...unavailableCapability, state: "optional_unconfigured" },
  },
  errors: [{
    code: "PLAYWRIGHT_NODE_UNAVAILABLE",
    message: "C:\\secret\\playwright.exe could not start",
  }],
  warnings: [],
  runtimeEvents: [{
    diagnosticId: "diag-recovery",
    occurredAt: "2026-07-26T00:00:00.000Z",
    code: "ARTICLE_REMOVAL_RECOVERY_FAILED",
    module: "article-removal-recovery",
    category: "storage",
    operationId: "article-removal-recovery",
    runId: null,
    metadata: { outcome: "failed" },
  }],
};

test("settings production inventory has fourteen versioned exact contracts", () => {
  const contracts = SETTINGS_CHANNELS.map((channel) =>
    productionIpcRegistry.byChannel(channel),
  );
  assert.equal(contracts.every(Boolean), true);
  assert.equal(new Set(contracts.map((contract) => contract.capability)).size, 14);
  assert.equal(contracts.every((contract) => contract.schemaVersion === 1), true);

  const save = productionIpcRegistry.byChannel("ai-provider:save");
  const payload = save.fromArgs([{
    baseUrl: "https://provider.example/v1",
    apiKey: "write-only-secret",
    model: "model-a",
    timeoutMs: 60000,
  }]);
  assert.deepEqual(
    productionIpcRegistry.parseRequest(
      save,
      productionIpcRegistry.encodeRequest(save, payload),
    ),
    payload,
  );
  assert.throws(() => productionIpcRegistry.encodeRequest(save, {
    ...payload,
    filePath: "C:\\secret\\ai-provider.json",
  }), { code: "IPC_UNKNOWN_FIELD" });
  assert.throws(() => productionIpcRegistry.success(save, {
    source: "application",
    configured: true,
    baseUrl: "https://provider.example/v1",
    model: "model-a",
    timeoutMs: 60000,
    hasApiKey: true,
    apiKeyMask: "••••••••",
    lastTest: null,
    apiKey: "must-not-cross-ipc",
  }), { code: "IPC_UNKNOWN_FIELD" });
});

test("AI settings production handlers accept write-only secrets and return safe envelopes", async () => {
  const ipc = typedIpc();
  const calls = [];
  registerAiProviderIpc({
    ipcMain: ipc.ipcMain,
    aiProviderService: {
      getStatus: () => aiStatus,
      save(input) {
        calls.push(input);
        return aiStatus;
      },
      testConnection: async () => testRecord,
      clear: () => ({ cleared: true }),
    },
  });

  const saved = await ipc.invoke("ai-provider:save", {
    baseUrl: aiStatus.baseUrl,
    apiKey: "write-only-secret",
    model: aiStatus.model,
    timeoutMs: aiStatus.timeoutMs,
  });
  assert.deepEqual(saved.parsed, aiStatus);
  assert.deepEqual(calls, [{
    baseUrl: aiStatus.baseUrl,
    apiKey: "write-only-secret",
    model: aiStatus.model,
    timeoutMs: aiStatus.timeoutMs,
  }]);
  assert.doesNotMatch(JSON.stringify(saved.response), /write-only-secret/);
  assert.equal(saved.response.schemaVersion, 1);
});

test("platform settings wire results retain platform identity and never echo drafts", async () => {
  const ipc = typedIpc();
  const calls = [];
  registerPlatformSettingsIpc({
    ipcMain: ipc.ipcMain,
    platformSettingsService: {
      getStatus: () => mediaStatus,
      save(platform, draft) {
        calls.push([platform, draft]);
        return mediaStatus;
      },
      test: async () => ({ ...testRecord, code: "MEDIA_CONNECTION_OK" }),
      clear: () => ({ cleared: true }),
    },
    legacyProviderSettings: {
      discover: () => ({
        media: { available: false, sources: [] },
        sources: [],
        importable: false,
      }),
      getRecord: () => null,
      importLegacy: async () => ({
        imported: [],
        entries: [],
        record: { version: 1, updatedAt: null, entries: [] },
        legacyCookieFilesRemain: false,
      }),
    },
  });

  const result = await ipc.invoke("platform-settings:save", {
    platformId: "media",
    draft: {
      apiKey: "media-write-only-secret",
      baseUrl: mediaStatus.baseUrl,
      timeoutMs: mediaStatus.timeoutMs,
      allowInsecure: false,
      thirdPartyId: "长期第三方标识",
    },
  });
  assert.deepEqual(result.parsed, { platformId: "media", status: mediaStatus });
  assert.equal(calls[0][0], "media");
  assert.equal(calls[0][1].apiKey, "media-write-only-secret");
  assert.equal(calls[0][1].thirdPartyId, "长期第三方标识");
  assert.doesNotMatch(JSON.stringify(result.response), /media-write-only-secret/);
  assert.throws(
    () => productionIpcRegistry.encodeRequest(
      productionIpcRegistry.byChannel("platform-settings:save"),
      { platformId: "media", draft: { thirdPartyId: "x".repeat(129) } },
    ),
    (error) => /^IPC_/.test(error.code),
  );
});

test("storage maintenance reports counts without returning deleted or failed paths", async () => {
  const ipc = typedIpc();
  registerStorageMaintenanceIpc({
    ipcMain: ipc.ipcMain,
    storageMaintenanceService: {
      getUsage: () => storageUsage,
      cleanupCaches: () => ({
        blocked: false,
        deleted: ["C:\\secret\\deleted.log"],
        failed: [{ path: "C:\\secret\\locked.log", code: "EACCES" }],
        usage: storageUsage,
      }),
    },
  });

  const result = await ipc.invoke("storage-maintenance:clean-caches", {});
  assert.deepEqual(result.parsed, {
    blocked: false,
    reason: null,
    deletedCount: 1,
    failedCount: 1,
    usage: storageUsage,
  });
  assert.doesNotMatch(JSON.stringify(result.response), /secret|deleted\.log|locked\.log/i);
});

test("runtime diagnostics expose bounded coded summaries without raw diagnostic text", async () => {
  const ipc = typedIpc();
  registerRuntimeDiagnosticsIpc({
    ipcMain: ipc.ipcMain,
    runtimeDiagnosticsService: {
      safeDiagnostics: () => runtimeDiagnostics,
      probeBrowser: async () => ({
        ok: true,
        browserChannel: "msedge",
        session: "runtime-self-check",
        capability: { ...browserCapability, state: "ready", probed: true },
      }),
    },
  });

  const result = await ipc.invoke("runtime-diagnostics:get", {});
  assert.equal(result.parsed.errors[0].code, "PLAYWRIGHT_NODE_UNAVAILABLE");
  assert.equal(
    result.parsed.errors[0].message,
    "运行环境诊断项，请检查诊断代码。",
  );
  assert.deepEqual(result.parsed.runtimeEvents[0], {
    diagnosticId: "diag-recovery",
    userMessage: "本地存储操作未完成，请检查诊断信息。",
    summary: { code: "ARTICLE_REMOVAL_RECOVERY_FAILED", category: "storage" },
  });
  assert.doesNotMatch(JSON.stringify(result.response), /secret|playwright\.exe|article\.db/i);
});
