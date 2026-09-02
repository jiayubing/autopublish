"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createPlatform,
} = require("../src/platforms/hepan/platform");

test("Hepan account inspection uses the configured settings test result", async () => {
  let calls = 0;
  const platform = createPlatform({
    getPlatformSettingsService: () => ({
      test: async (platformId, input) => {
        calls += 1;
        assert.equal(platformId, "hepan");
        assert.deepEqual(input, {});
        return {
          ok: true,
          account: { uid: "12345", displayName: "fixture-hepan" },
        };
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
      test: async () => ({
        ok: true,
        account: { uid: "not-a-number", displayName: "fixture" },
      }),
    }),
  });
  assert.deepEqual(await platform.accountInspection.inspect(), { verified: false });
});
