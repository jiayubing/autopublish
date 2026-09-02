const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createHepanSettingsAdapter } = require("../desktop/services/platform-settings/hepan-settings-adapter");
const { createPlatformSettingsService } = require("../desktop/services/platform-settings-service");

function createStore(initial) {
  let value = initial ? Object.assign({}, initial) : null;
  return {
    read: () => value && Object.assign({}, value),
    write: (next) => { value = Object.assign({}, next); return Object.assign({}, value); },
    clear: () => { value = null; return { cleared: true }; },
  };
}

function fixture(env) {
  const store = createStore({ uid: 12345, password: "existing-password" });
  const base = createHepanSettingsAdapter({
    createHepanGeoApiClient: () => ({
      async status(config) {
        return { data: { uid: config.uid, plan_name: "GEO标准版", post_limit: 30, used_count: 2, remaining_count: 28 } };
      },
    }),
  });
  const service = createPlatformSettingsService({
    adapters: [Object.assign({}, base, { createStore: () => store })],
    env: env || {},
    now: () => "2026-09-02T01:00:00.000Z",
  });
  return { store, service };
}

describe("Hepan GEO API settings patch contract", () => {
  it("can update UID while preserving the encrypted password field", () => {
    const value = fixture();
    value.service.save("hepan", { uid: 67890 });
    assert.deepEqual(value.store.read(), { uid: 67890, password: "existing-password" });
  });

  it("can rotate only the password while retaining UID", () => {
    const value = fixture();
    value.service.save("hepan", { password: "replacement-password" });
    assert.equal(value.store.read().uid, 12345);
    assert.equal(value.store.read().password, "replacement-password");
  });

  it("uses the same patch merge for test without persisting the test patch", async () => {
    const value = fixture();
    const before = value.store.read();
    const result = await value.service.test("hepan", { uid: 54321 });
    assert.equal(result.account.uid, "54321");
    assert.deepEqual(value.store.read(), before);
  });

  it("keeps environment configuration read-only", async () => {
    const value = fixture({ HEPAN_UID: "2093208", HEPAN_PASSWORD: "environment-password" });
    const status = value.service.getStatus("hepan");
    assert.equal(status.source, "environment");
    assert.equal(status.uid, 2093208);
    assert.equal(JSON.stringify(status).includes("environment-password"), false);
    assert.throws(() => value.service.save("hepan", { uid: 999 }), (error) => error.code === "PLATFORM_CONFIG_ENV_OVERRIDE");
    await assert.rejects(value.service.test("hepan", {}), (error) => error.code === "PLATFORM_CONFIG_ENV_OVERRIDE");
  });
});
