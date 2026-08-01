const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createMediaSettingsAdapter, DEFAULT_MEDIA_BASE_URL } = require("../desktop/services/platform-settings/media-settings-adapter");
const { createPlatformSettingsService } = require("../desktop/services/platform-settings-service");
const { createMediaResourceService } = require("../desktop/services/media-resource-service");

function store(initial) {
  let value = initial || null;
  return {
    writes: [],
    read: () => value,
    write(next) { value = Object.assign({}, next); this.writes.push(value); return value; },
    clear() { value = null; return { cleared: true }; }
  };
}

describe("media provider settings", () => {
  it("requires an explicit endpoint and explicit approval for HTTP transport", () => {
    const adapter = createMediaSettingsAdapter();
    assert.equal(DEFAULT_MEDIA_BASE_URL, "");
    const secure = adapter.validate({ apiKey: "fixture-media-key", baseUrl: "https://media.example.test", timeoutMs: 30000 });
    assert.equal(secure.timeoutMs, 30000);
    assert.equal(secure.allowInsecure, false);
    assert.equal(adapter.status(secure, { source: "application", lastTest: null }).transport, "secure");
    assert.throws(() => adapter.validate({ apiKey: "fixture-media-key", baseUrl: "http://provider.example", timeoutMs: 30000 }), (error) => error.code === "MEDIA_HTTP_CONFIRMATION_REQUIRED");
    const approvedHttp = adapter.validate({ apiKey: "fixture-media-key", baseUrl: "http://provider.example", timeoutMs: 30000, allowInsecure: true });
    assert.equal(approvedHttp.allowInsecure, true);
    assert.equal(adapter.status(approvedHttp, { source: "application", lastTest: null }).transport, "insecure");
    const saved = store();
    adapter.createStore = () => saved;
    const service = createPlatformSettingsService({ adapters: [adapter] });
    assert.throws(() => service.save("media", { apiKey: "fixture-media-key", baseUrl: "http://provider.example", timeoutMs: 30000 }), (error) => error.code === "MEDIA_HTTP_CONFIRMATION_REQUIRED");
  });

  it("requires the environment override to explicitly approve HTTP", () => {
    const adapter = createMediaSettingsAdapter();
    assert.throws(() => adapter.environment({ XQW_API_KEY: "fixture-key", XQW_BASE_URL: "http://provider.example" }), (error) => error.code === "MEDIA_HTTP_CONFIRMATION_REQUIRED");
    assert.equal(adapter.environment({ XQW_API_KEY: "fixture-key", XQW_BASE_URL: "http://provider.example", XQW_ALLOW_INSECURE: "1" }).allowInsecure, true);
    assert.equal(adapter.environment({ XQW_API_KEY: "fixture-key", XQW_BASE_URL: "http://provider.example", XQW_ALLOW_INSECURE: "true" }).allowInsecure, true);
    assert.throws(() => adapter.validate({ apiKey: "fixture-key", baseUrl: "http://provider.example", allowInsecure: "true" }), (error) => error.code === "MEDIA_HTTP_CONFIRMATION_REQUIRED");
  });

  it("saves without calling the network and tests balance without replacing the saved config", async () => {
    const saved = store();
    let calls = 0;
    const adapter = createMediaSettingsAdapter({ clientFactory: () => ({ getBalance: async () => { calls += 1; return { data: { balance: "12.30" } }; } }) });
    adapter.createStore = () => saved;
    const service = createPlatformSettingsService({ adapters: [adapter], now: () => "2026-07-17T02:00:00.000Z" });
    const config = { apiKey: "fixture-media-key", baseUrl: "https://media.example/api", timeoutMs: 30000 };
    const status = service.save("media", config);
    assert.equal(calls, 0);
    assert.equal(status.apiKeyMask, "fixt****-key");
    await assert.deepStrictEqual(await service.test("media"), { testedAt: "2026-07-17T02:00:00.000Z", ok: true, code: "MEDIA_CONNECTION_OK" });
    assert.equal(calls, 1);
    assert.equal(saved.writes.length, 1);
    assert.equal(JSON.stringify(service.getStatus("media")).includes("fixture-media-key"), false);
  });

  it("persists a reusable third-party identity and lets the operator replace it", () => {
    const saved = store();
    const adapter = createMediaSettingsAdapter();
    adapter.createStore = () => saved;
    const service = createPlatformSettingsService({ adapters: [adapter] });

    const first = service.save("media", {
      apiKey: "fixture-media-key",
      baseUrl: "https://media.example/api",
      timeoutMs: 30000,
      thirdPartyId: "长期标识-A",
    });
    assert.equal(first.thirdPartyId, "长期标识-A");
    assert.equal(service.getRuntimeConfig("media").thirdPartyId, "长期标识-A");

    const replaced = service.save("media", { thirdPartyId: "长期标识-B" });
    assert.equal(replaced.thirdPartyId, "长期标识-B");
    assert.equal(service.getRuntimeConfig("media").thirdPartyId, "长期标识-B");
    assert.equal(saved.writes.at(-1).apiKey, "fixture-media-key");
    assert.throws(
      () => service.save("media", { thirdPartyId: "x".repeat(129) }),
      (error) => error.code === "PLATFORM_CONFIG_INVALID",
    );
  });

  it("keeps environment credentials read-only and gives clear a stable missing-config runtime error", () => {
    const saved = store({ apiKey: "stored-key", baseUrl: "https://media.example/api", timeoutMs: 30000, allowInsecure: false });
    const adapter = createMediaSettingsAdapter();
    adapter.createStore = () => saved;
    const service = createPlatformSettingsService({ adapters: [adapter], env: { XQW_API_KEY: "environment-key", XQW_BASE_URL: "https://environment.example/api" } });
    assert.equal(service.getStatus("media").source, "environment");
    assert.equal(JSON.stringify(service.getStatus("media")).includes("environment-key"), false);
    assert.throws(() => service.clear("media"), (error) => error.code === "PLATFORM_CONFIG_ENV_OVERRIDE");
    const clearService = createPlatformSettingsService({ adapters: [Object.assign(adapter, { createStore: () => store() })] });
    clearService.clear("media");
    assert.throws(() => clearService.getRuntimeConfig("media"), (error) => error.code === "PLATFORM_CONFIG_NOT_SET");
  });

  it("resolves a fresh client for each resource operation while one refresh uses one snapshot", async () => {
    const clients = [
      { mediaList: async () => ({ data: [{ id: "old" }] }), getBalance: async () => ({ data: { balance: "1" } }) },
      { mediaList: async () => ({ data: [{ id: "new" }] }), getBalance: async () => ({ data: { balance: "2" } }) }
    ];
    let index = 0;
    let cachedResources = [];
    const service = createMediaResourceService({
      resourceStore: { getAll: () => null, setAll: (resources) => { cachedResources = resources; } },
      clientProvider: () => clients[index++]
    });
    const first = await service.refreshResources();
    const balance = await service.getBalance();
    assert.equal(first.resourceCount, 1);
    assert.equal(Object.hasOwn(first, "resources"), false);
    assert.equal(cachedResources[0].resourceId, "old");
    assert.equal(balance.balance, "2");
  });
});
