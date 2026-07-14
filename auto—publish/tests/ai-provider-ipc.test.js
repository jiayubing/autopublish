const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { registerAiProviderIpc } = require("../desktop/ipc/ai-provider-ipc");

function createIpc() {
  const handlers = new Map();
  return { handlers: handlers, ipcMain: { handle: function(channel, handler) { handlers.set(channel, handler); } } };
}

describe("AI provider IPC", function() {
  it("registers a thin safe configuration boundary", async function() {
    const ipc = createIpc();
    const calls = [];
    const service = {
      getStatus: function() { return { configured: false, hasApiKey: false }; },
      save: function(input) { calls.push(["save", input]); return { configured: true }; },
      testConnection: function(input) { calls.push(["test", input]); return Promise.resolve({ ok: true, code: "AI_CONNECTION_OK" }); },
      clear: function() { calls.push(["clear"]); return { cleared: true }; }
    };
    registerAiProviderIpc({ ipcMain: ipc.ipcMain, aiProviderService: service });
    ["ai-provider:get-status", "ai-provider:save", "ai-provider:test", "ai-provider:clear"].forEach(function(channel) {
      assert.equal(ipc.handlers.has(channel), true, channel);
    });
    assert.deepStrictEqual(await ipc.handlers.get("ai-provider:get-status")(), { ok: true, data: { configured: false, hasApiKey: false } });
    assert.deepStrictEqual(await ipc.handlers.get("ai-provider:save")(null, { baseUrl: "https://provider.example/v1", apiKey: "ipc-secret", model: "model-a", timeoutMs: 60000, extra: "drop" }), { ok: true, data: { configured: true } });
    assert.deepStrictEqual(await ipc.handlers.get("ai-provider:test")(null, { apiKey: "ipc-secret" }), { ok: true, data: { ok: true, code: "AI_CONNECTION_OK" } });
    assert.deepStrictEqual(await ipc.handlers.get("ai-provider:clear")(), { ok: true, data: { cleared: true } });
    assert.deepStrictEqual(calls, [
      ["save", { baseUrl: "https://provider.example/v1", apiKey: "ipc-secret", model: "model-a", timeoutMs: 60000 }],
      ["test", { apiKey: "ipc-secret" }], ["clear"]
    ]);
  });

  it("returns only coded safe errors", async function() {
    const ipc = createIpc();
    const failure = new Error("provider-secret-key must not cross IPC");
    failure.code = "AI_CONNECTION_FAILED";
    registerAiProviderIpc({ ipcMain: ipc.ipcMain, aiProviderService: { testConnection: function() { throw failure; } } });
    const result = await ipc.handlers.get("ai-provider:test")(null, { apiKey: "provider-secret-key" });
    assert.deepStrictEqual(result, { ok: false, error: { code: "AI_CONNECTION_FAILED", message: "AI connection test failed" } });
    assert.equal(JSON.stringify(result).includes("provider-secret-key"), false);
  });
});
