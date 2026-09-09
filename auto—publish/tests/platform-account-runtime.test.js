"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createPlatform,
} = require("../src/platforms/hepan/platform");

test("Hepan account inspection remains available when user settings tests are busy", async () => {
  let calls = 0;
  const platform = createPlatform({
    getPlatformSettingsService: () => ({
      test: () => { throw Object.assign(new Error("busy"), { code: "PLATFORM_CONFIG_BUSY" }); },
      getAdapterForRuntime: (platformId) => {
        assert.equal(platformId, "hepan");
        return { config: { uid: 12345 }, adapter: { test: async (input) => {
        calls += 1;
        assert.deepEqual(input, { uid: 12345 });
        return {
          ok: true,
          account: { uid: "12345", displayName: "fixture-hepan" },
        };
      } } };
      },
    }),
  });

  assert.deepEqual(await platform.accountInspection.inspect(), {
    verified: true,
    remoteAccountId: "12345",
    displayName: "fixture-hepan",
  });
  assert.equal(calls, 1);
});

test("Hepan account inspection fails closed for an unsafe settings result", async () => {
  const platform = createPlatform({
    workspacePaths: { tmp: "C:\\synthetic-tmp" },
    getPlatformSettingsService: () => ({
      getAdapterForRuntime: () => ({ config: {}, adapter: { test: async () => ({
        ok: true,
        account: { uid: "not-a-number", displayName: "fixture" },
      }) } }),
    }),
  });
  assert.deepEqual(await platform.accountInspection.inspect(), { verified: false });
});
