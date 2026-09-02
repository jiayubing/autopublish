const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  createHepanSettingsAdapter,
  HEPAN_GEO_API_URL,
} = require("../desktop/services/platform-settings/hepan-settings-adapter");
const {
  createPlatformSettingsService,
} = require("../desktop/services/platform-settings-service");

function fakeStore(initial) {
  let value = initial || null;
  return {
    read: () => value,
    write: (next) => { value = Object.assign({}, next); return value; },
    clear: () => { value = null; return { cleared: true }; },
  };
}

describe("Hepan GEO API provider settings", () => {
  it("stores UID plus password semantics and exposes only safe status", () => {
    const adapter = createHepanSettingsAdapter({
      createHepanGeoApiClient: () => ({ async status() { return { data: { uid: 12345 } }; } }),
    });
    const config = adapter.validate({ uid: 12345, password: "fixture-password" });
    assert.deepEqual(config, { uid: 12345, password: "fixture-password" });
    const status = adapter.status(config, { source: "application", lastTest: null });
    assert.equal(status.uid, 12345);
    assert.equal(status.passwordConfigured, true);
    assert.equal(status.apiUrl, HEPAN_GEO_API_URL);
    assert.equal(JSON.stringify(status).includes("fixture-password"), false);
    assert.throws(() => adapter.validate({ uid: 0, password: "fixture-password" }), (error) => error.code === "PLATFORM_CONFIG_INVALID");
  });

  it("supports HEPAN_UID and HEPAN_PASSWORD environment override", () => {
    const adapter = createHepanSettingsAdapter({
      createHepanGeoApiClient: () => ({ async status() {} }),
    });
    const config = adapter.environment({ HEPAN_UID: "2093208", HEPAN_PASSWORD: "fixture-password" });
    assert.equal(config.uid, 2093208);
    assert.equal(config.password, "fixture-password");
    assert.equal(adapter.environment({}), null);
  });

  it("tests account status and preserves quota diagnostics without persisting the test patch", async () => {
    const store = fakeStore({ uid: 12345, password: "stored-password" });
    let received;
    const base = createHepanSettingsAdapter({
      createHepanGeoApiClient: () => ({
        async status(config) {
          received = config;
          return { data: { uid: 12345, groupid: 20, plan_name: "GEO标准版", post_limit: 30, used_count: 7, remaining_count: 23 } };
        },
      }),
    });
    const service = createPlatformSettingsService({
      adapters: [Object.assign({}, base, { createStore: () => store })],
      now: () => "2026-09-02T01:00:00.000Z",
    });
    const result = await service.test("hepan", {});
    assert.equal(received.password, "stored-password");
    assert.deepEqual(result, {
      testedAt: "2026-09-02T01:00:00.000Z",
      ok: true,
      code: "HEPAN_GEO_API_OK",
      authenticated: true,
      publishAccess: true,
      stage: "publish_access",
      account: { displayName: "蓝色河畔 UID 12345", uid: "12345" },
      planName: "GEO标准版",
      postLimit: 30,
      usedCount: 7,
      remainingCount: 23,
    });
    assert.equal(JSON.stringify(service.getStatus("hepan")).includes("stored-password"), false);
  });
});
