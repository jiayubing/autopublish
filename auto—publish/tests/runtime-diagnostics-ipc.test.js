const assert = require("node:assert/strict");
const { it } = require("node:test");
const { registerRuntimeDiagnosticsIpc } = require("../desktop/ipc/runtime-diagnostics-ipc");

it("exposes safe capability diagnostics and a browser self-check IPC boundary", async function() {
  const handlers = new Map();
  const service = {
    safeDiagnostics: function() {
      return { ok: false, tools: { playwrightNode: { available: false, source: null } }, errors: [{ code: "PLAYWRIGHT_NODE_UNAVAILABLE", message: "内置 Playwright Node 不可用，请重新安装应用。" }] };
    },
    probeBrowser: async function() {
      const error = new Error("内置 Playwright CLI 不可用，请重新安装应用。");
      error.code = "PLAYWRIGHT_CLI_UNAVAILABLE";
      throw error;
    }
  };
  registerRuntimeDiagnosticsIpc({ ipcMain: { handle: function(channel, handler) { handlers.set(channel, handler); } }, runtimeDiagnosticsService: service });

  const diagnostics = await handlers.get("runtime-diagnostics:get")();
  assert.equal(diagnostics.ok, true);
  assert.equal(diagnostics.data.errors[0].code, "PLAYWRIGHT_NODE_UNAVAILABLE");

  const smoke = await handlers.get("runtime-diagnostics:browser-smoke")();
  assert.equal(smoke.ok, false);
  assert.equal(smoke.error.code, "PLAYWRIGHT_CLI_UNAVAILABLE");
  assert.equal("stack" in smoke.error, false);
});

it("exposes bounded runtime lifecycle events through the diagnostics IPC", async function() {
  const handlers = new Map();
  registerRuntimeDiagnosticsIpc({
    ipcMain: { handle: function(channel, handler) { handlers.set(channel, handler); } },
    runtimeDiagnosticsService: { safeDiagnostics: function() { return { ok: true, errors: [], warnings: [], runtimeEvents: [{ code: "ARTICLE_REMOVAL_RECOVERY_FAILED", message: "Removal recovery failed", occurredAt: "2026-07-25T00:00:00.000Z" }] }; }, probeBrowser: async function() { return {}; } }
  });
  const diagnostics = await handlers.get("runtime-diagnostics:get")();
  assert.deepEqual(diagnostics.data.runtimeEvents, [{ code: "ARTICLE_REMOVAL_RECOVERY_FAILED", message: "运行期诊断事件，请检查诊断代码。", occurredAt: "2026-07-25T00:00:00.000Z" }]);
});

it("forwards the updated browser capability returned by a successful self-check", async function() {
  const handlers = new Map();
  const capability = { channel: "msedge", configured: true, state: "ready", probed: true, source: "default", errorCode: null, lastCheckedAt: "2026-07-17T00:00:00.000Z" };
  registerRuntimeDiagnosticsIpc({
    ipcMain: { handle: function(channel, handler) { handlers.set(channel, handler); } },
    runtimeDiagnosticsService: {
      safeDiagnostics: function() { return { ok: true, capabilities: { browserChannel: capability }, browserChannel: capability, errors: [], warnings: [] }; },
      probeBrowser: async function() { return { ok: true, browserChannel: "msedge", session: "runtime-self-check", capability: capability }; }
    }
  });

  const smoke = await handlers.get("runtime-diagnostics:browser-smoke")();
  assert.equal(smoke.ok, true);
  assert.equal(smoke.data.capability.state, "ready");
  const diagnostics = await handlers.get("runtime-diagnostics:get")();
  assert.equal(diagnostics.data.browserChannel.probed, true);
});
