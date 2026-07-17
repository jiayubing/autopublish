const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createPlatformSettingsService } = require("../desktop/services/platform-settings-service");

function createStore(initial) {
  let value = initial ? Object.assign({}, initial) : null;
  const writes = [];
  return {
    writes,
    read: () => value && Object.assign({}, value),
    write: (next) => { value = Object.assign({}, next); writes.push(value); return value; },
    clear: () => { const existed = Boolean(value); value = null; return { cleared: existed }; }
  };
}

function adapter(store, overrides) {
  return Object.assign({
    id: "fixture",
    fileName: "fixture-provider.json",
    createStore: () => store,
    validate: (input) => {
      if (!input || typeof input.apiKey !== "string" || !input.apiKey.trim()) throw Object.assign(new Error("invalid"), { code: "PLATFORM_CONFIG_INVALID" });
      return { apiKey: input.apiKey.trim(), label: String(input.label || "Fixture") };
    },
    status: (config, context) => ({ configured: Boolean(config), source: context.source, label: config ? config.label : "", apiKeyMask: config ? "••••••••" : "", lastTest: context.lastTest || null }),
    environment: (env) => env.FIXTURE_SECRET ? { apiKey: env.FIXTURE_SECRET, label: "环境覆盖" } : null,
    test: async () => ({ ok: true }),
    errorCode: () => "PLATFORM_CONNECTION_FAILED"
  }, overrides || {});
}

describe("platform settings service", () => {
  it("exposes a small status interface without secrets and saves without testing", () => {
    const store = createStore();
    let testCalls = 0;
    const service = createPlatformSettingsService({ adapters: [adapter(store, { test: async () => { testCalls += 1; return { ok: true }; } })] });
    assert.equal(service.getStatus("fixture").configured, false);
    const status = service.save("fixture", { apiKey: "fixture-secret", label: "本地测试" });
    assert.deepStrictEqual(status, { configured: true, source: "application", label: "本地测试", apiKeyMask: "••••••••", lastTest: null });
    assert.equal(testCalls, 0);
    assert.equal(JSON.stringify(status).includes("fixture-secret"), false);
  });

  it("gives environment overrides read-only priority and exposes no override secret", async () => {
    const store = createStore({ apiKey: "stored-secret", label: "Stored" });
    const service = createPlatformSettingsService({ adapters: [adapter(store)], env: { FIXTURE_SECRET: "environment-secret" } });
    const status = service.getStatus("fixture");
    assert.equal(status.source, "environment");
    assert.equal(status.label, "环境覆盖");
    assert.equal(JSON.stringify(status).includes("environment-secret"), false);
    assert.throws(() => service.save("fixture", { apiKey: "new-secret" }), (error) => error.code === "PLATFORM_CONFIG_ENV_OVERRIDE");
    assert.throws(() => service.clear("fixture"), (error) => error.code === "PLATFORM_CONFIG_ENV_OVERRIDE");
    await assert.rejects(service.test("fixture"), (error) => error.code === "PLATFORM_CONFIG_ENV_OVERRIDE");
  });

  it("records safe test results and preserves the saved configuration on failure", async () => {
    const store = createStore({ apiKey: "stored-secret", label: "Stored" });
    const service = createPlatformSettingsService({
      adapters: [adapter(store, { test: async () => { throw Object.assign(new Error("secret and URL"), { code: "EXTERNAL_FAILURE" }); }, errorCode: () => "PLATFORM_CONNECTION_FAILED" })],
      now: () => "2026-07-17T00:00:00.000Z"
    });
    await assert.rejects(service.test("fixture"), (error) => error.code === "PLATFORM_CONNECTION_FAILED" && error.message === "Platform connection test failed");
    assert.deepStrictEqual(store.read(), { apiKey: "stored-secret", label: "Stored" });
    assert.deepStrictEqual(service.getStatus("fixture").lastTest, { testedAt: "2026-07-17T00:00:00.000Z", ok: false, code: "PLATFORM_CONNECTION_FAILED" });
  });

  it("blocks mutations while platform tasks are running but keeps status readable", async () => {
    const store = createStore({ apiKey: "stored-secret", label: "Stored" });
    const service = createPlatformSettingsService({ adapters: [adapter(store)], getTaskState: () => ({ isPlatformRunning: true }) });
    assert.equal(service.getStatus("fixture").configured, true);
    assert.throws(() => service.save("fixture", { apiKey: "new-secret" }), (error) => error.code === "PLATFORM_CONFIG_BUSY");
    assert.throws(() => service.clear("fixture"), (error) => error.code === "PLATFORM_CONFIG_BUSY");
    await assert.rejects(service.test("fixture"), (error) => error.code === "PLATFORM_CONFIG_BUSY");
  });

  it("returns a runtime snapshot only through the main-process interface", () => {
    const store = createStore({ apiKey: "stored-secret", label: "Stored" });
    const service = createPlatformSettingsService({ adapters: [adapter(store)] });
    assert.deepStrictEqual(service.getRuntimeConfig("fixture"), { apiKey: "stored-secret", label: "Stored" });
  });
});
