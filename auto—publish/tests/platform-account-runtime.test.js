"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createPlatformAccountRuntimeAdapters,
} = require("../desktop/services/platform-account-runtime");

test("Hepan account inspection uses the configured settings test result", async () => {
  let calls = 0;
  const adapters = createPlatformAccountRuntimeAdapters({
    accountInspectionPorts: [
      {
        id: "hepan",
        port: { prepare: async () => undefined, inspect: async () => ({ verified: false }) },
      },
    ],
    platformSettingsService: {
      test: async (platformId, input) => {
        calls += 1;
        assert.equal(platformId, "hepan");
        assert.deepEqual(input, {});
        return {
          ok: true,
          account: { uid: "12345", displayName: "fixture-hepan" },
        };
      },
    },
  });

  assert.deepEqual(await adapters.hepan.inspect(), {
    verified: true,
    remoteAccountId: "12345",
    displayName: "fixture-hepan",
  });
  assert.equal(calls, 1);
});

test("Hepan account inspection fails closed for an unsafe settings result", async () => {
  const adapters = createPlatformAccountRuntimeAdapters({
    accountInspectionPorts: [{ id: "hepan", port: { prepare: async () => undefined, inspect: async () => ({ verified: false }) } }],
    platformSettingsService: {
      test: async () => ({
        ok: true,
        account: { uid: "not-a-number", displayName: "fixture" },
      }),
    },
  });
  assert.deepEqual(await adapters.hepan.inspect(), { verified: false });
});
