const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createAiProviderService } = require("../desktop/services/ai-provider-service");

const config = {
  baseUrl: "https://provider.example/v1",
  apiKey: "service-secret-key",
  model: "model-a",
  timeoutMs: 60000
};

function createStore(initial) {
  let value = initial || null;
  const writes = [];
  return {
    writes: writes,
    read: function() { return value; },
    write: function(next) { value = Object.assign({}, next); writes.push(value); return value; },
    clear: function() { value = null; return { cleared: true }; }
  };
}

function createTestStatusStore(initial) {
  let value = initial || null;
  const writes = [];
  return {
    writes: writes,
    read: function() { return value; },
    write: function(next) { value = Object.assign({}, next); writes.push(value); return value; },
    clear: function() { value = null; return { cleared: true }; }
  };
}

describe("AI provider service", function() {
  it("reports an application configuration without exposing the API key", function() {
    const service = createAiProviderService({ configStore: createStore(Object.assign({}, config, { lastTest: null })) });
    assert.deepStrictEqual(service.getStatus(), {
      source: "application", configured: true, baseUrl: config.baseUrl, model: config.model,
      timeoutMs: 60000, hasApiKey: true, apiKeyMask: "••••••••", lastTest: null
    });
  });

  it("gives complete operating-system AI settings read-only priority", function() {
    const store = createStore(config);
    const service = createAiProviderService({
      configStore: store,
      env: { AI_API_KEY: "environment-secret", AI_BASE_URL: config.baseUrl, AI_MODEL: "env-model", AI_TIMEOUT_MS: "1200" }
    });
    assert.equal(service.getStatus().source, "environment");
    assert.equal(service.getStatus().model, "env-model");
    assert.equal(service.getStatus().timeoutMs, 1200);
    for (const operation of ["save", "testConnection", "clear"]) {
      assert.throws(function() { service[operation](config); }, function(error) { return error.code === "AI_CONFIG_ENV_OVERRIDE"; });
    }
    assert.equal(store.writes.length, 0);
  });

  it("saves locally without creating or calling a network client", function() {
    const store = createStore();
    let factoryCalls = 0;
    const service = createAiProviderService({
      configStore: store,
      aiClientFactory: function() { factoryCalls += 1; throw new Error("network must not run"); }
    });
    const saved = service.save(config);
    assert.equal(saved.configured, true);
    assert.equal(factoryCalls, 0);
    assert.equal(store.writes.length, 1);
  });

  it("tests a draft with fixed messages and preserves the saved configuration on failure", async function() {
    const store = createStore(config);
    let request;
    const service = createAiProviderService({
      configStore: store,
      aiClientFactory: function(input) {
        assert.equal(input.apiKey, config.apiKey);
        return { complete: async function(messages) { request = messages; throw new Error("provider-secret-key leaked"); } };
      }
    });
    await assert.rejects(service.testConnection(config), function(error) {
      return error.code === "AI_CONNECTION_FAILED" && !error.message.includes("provider-secret-key");
    });
    assert.deepStrictEqual(request, [
      { role: "system", content: "Connection test" },
      { role: "user", content: "Reply with OK only" }
    ]);
    assert.equal(store.writes.length, 0);
    assert.equal(service.getStatus().lastTest.ok, false);
    assert.equal(service.getStatus().lastTest.code, "AI_CONNECTION_FAILED");
  });

  it("exposes a safe transient failure without writing or replacing the saved configuration", async function() {
    const store = createStore(config);
    const testStatusStore = createTestStatusStore({ testedAt: "2026-07-14T00:00:00.000Z", ok: true, code: "AI_CONNECTION_OK" });
    const service = createAiProviderService({
      configStore: store,
      testStatusStore: testStatusStore,
      now: function() { return "2026-07-15T02:00:00.000Z"; },
      aiClientFactory: function() { return { complete: async function() { throw new Error("provider-secret-key leaked"); } }; }
    });

    await assert.rejects(service.testConnection(config), function(error) {
      return error.code === "AI_CONNECTION_FAILED" && error.message === "AI connection test failed";
    });
    assert.equal(store.writes.length, 0);
    assert.deepStrictEqual(service.getStatus().lastTest, {
      testedAt: "2026-07-15T02:00:00.000Z", ok: false, code: "AI_CONNECTION_FAILED"
    });
    assert.deepStrictEqual(testStatusStore.read(), {
      testedAt: "2026-07-15T02:00:00.000Z", ok: false, code: "AI_CONNECTION_FAILED"
    });
    assert.equal(JSON.stringify(service.getStatus()).includes("provider-secret-key"), false);
  });

  it("records only a safe successful test result, supports clear, and fingerprints settings", async function() {
    const store = createStore(config);
    const testStatusStore = createTestStatusStore();
    const service = createAiProviderService({
      configStore: store,
      testStatusStore: testStatusStore,
      now: function() { return "2026-07-15T00:00:00.000Z"; },
      aiClientFactory: function() { return { complete: async function() { return "OK"; } }; }
    });
    const before = service.getFingerprint();
    const result = await service.testConnection(config);
    assert.deepStrictEqual(result, { testedAt: "2026-07-15T00:00:00.000Z", ok: true, code: "AI_CONNECTION_OK" });
    assert.deepStrictEqual(service.getStatus().lastTest, result);
    assert.equal(store.writes.length, 0);
    assert.equal(testStatusStore.writes.length, 1);
    assert.equal(service.getFingerprint(), before);
    assert.deepStrictEqual(service.clear(), { cleared: true });
    assert.deepStrictEqual(testStatusStore.read(), null);
    assert.equal(service.getStatus().configured, false);
  });

  it("does not report a remote test as successful when test status persistence fails", async function() {
    const store = createStore(config);
    const testStatusStore = {
      read: function() { return null; },
      write: function() { throw Object.assign(new Error("disk"), { code: "EIO" }); },
      clear: function() { return { cleared: true }; },
    };
    const service = createAiProviderService({
      configStore: store,
      testStatusStore: testStatusStore,
      aiClientFactory: function() { return { complete: async function() { return "OK"; } }; },
    });
    await assert.rejects(service.testConnection(config), { code: "AI_TEST_STATUS_PERSISTENCE_FAILED" });
    assert.equal(service.getStatus().lastTest.ok, false);
    assert.equal(service.getStatus().lastTest.code, "AI_TEST_STATUS_PERSISTENCE_FAILED");
  });

  it("tests a first draft without creating formal application configuration", async function() {
    const store = createStore();
    const testStatusStore = createTestStatusStore();
    const service = createAiProviderService({
      configStore: store,
      testStatusStore: testStatusStore,
      now: function() { return "2026-07-15T01:00:00.000Z"; },
      aiClientFactory: function() { return { complete: async function() { return "OK"; } }; }
    });

    const result = await service.testConnection(config);

    assert.deepStrictEqual(result, { testedAt: "2026-07-15T01:00:00.000Z", ok: true, code: "AI_CONNECTION_OK" });
    assert.deepStrictEqual(service.getStatus(), {
      source: "application", configured: false, baseUrl: "", model: "",
      timeoutMs: 60000, hasApiKey: false, apiKeyMask: "", lastTest: result
    });
    assert.equal(store.writes.length, 0);
    assert.deepStrictEqual(testStatusStore.read(), result);
  });

  it("blocks configuration mutations while a generation batch is running or stopping", function() {
    const store = createStore(config);
    const service = createAiProviderService({ configStore: store, getBatchState: function() { return { isBatchRunning: true }; } });
    for (const operation of ["save", "testConnection", "clear"]) {
      assert.throws(function() { service[operation](config); }, function(error) { return error.code === "AI_CONFIG_BUSY"; });
    }
  });
});
