"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createPlatformAccountInspector,
  fingerprint,
} = require("../desktop/services/platform-account-inspector");

test("platform account inspector binds only a verified remote identity to its explicit profile", async () => {
  const bindings = new Map();
  const inspector = createPlatformAccountInspector({
    adapters: {
      toutiao: {
        inspect: async () => ({
          verified: true,
          displayName: "fixture-account",
          remoteAccountId: "remote-123",
        }),
      },
    },
    operationalStore: {
      listAccountProfiles: () => [
        {
          accountProfileId: "account-1",
          platformId: "toutiao",
          displayName: "fixture-account",
        },
      ],
    },
    bindingStore: {
      get: (id) => bindings.get(id) || null,
      bind: (value) =>
        bindings.set(value.accountProfileId, {
          platformId: value.platformId,
          remoteFingerprint: value.remoteFingerprint,
        }),
    },
  });
  const result = await inspector.inspect({
    targetPlatformId: "toutiao",
    accountProfileId: "account-1",
  });
  assert.deepEqual(result, {
    verified: true,
    accountProfileId: "account-1",
    remoteFingerprint: fingerprint("toutiao", "remote-123"),
  });
  assert.equal(JSON.stringify(result).includes("remote-123"), false);
  assert.deepEqual(bindings.get("account-1"), {
    platformId: "toutiao",
    remoteFingerprint: fingerprint("toutiao", "remote-123"),
  });
});

test("platform account inspector prepares the session before inspecting identity", async () => {
  const bindings = new Map();
  const calls = [];
  const inspector = createPlatformAccountInspector({
    adapters: {
      toutiao: {
        prepare: async (task) =>
          calls.push(["ready", task]),
        inspect: async () => {
          calls.push(["inspect"]);
          return {
            verified: true,
            displayName: "fixture-account",
            remoteAccountId: "remote-123",
          };
        },
      },
    },
    operationalStore: {
      listAccountProfiles: () => [
        { accountProfileId: "account-1", platformId: "toutiao" },
      ],
    },
    bindingStore: {
      get: (id) => bindings.get(id) || null,
      bind: (value) => bindings.set(value.accountProfileId, value),
    },
  });

  const result = await inspector.inspect({
    targetPlatformId: "toutiao",
    accountProfileId: "account-1",
    preserveCurrentPage: true,
  });

  assert.equal(result.verified, true);
  assert.deepEqual(calls, [
    [
      "ready",
      {
        targetPlatformId: "toutiao",
        accountProfileId: "account-1",
        preserveCurrentPage: true,
      },
    ],
    ["inspect"],
  ]);
});

test("account inspection fails closed without calling inspectAccount when session readiness fails", async () => {
  let inspections = 0;
  const inspector = createPlatformAccountInspector({
    adapters: {
      toutiao: {
        prepare: async () => {
          const error = new Error("session unavailable");
          error.code = "PLAYWRIGHT_SESSION_NOT_OPEN";
          throw error;
        },
        inspect: async () => {
          inspections += 1;
          return {
            verified: true,
            displayName: "fixture-account",
            remoteAccountId: "remote-123",
          };
        },
      },
    },
    operationalStore: {
      listAccountProfiles: () => [
        { accountProfileId: "account-1", platformId: "toutiao" },
      ],
    },
    bindingStore: { get: () => null, bind: () => {} },
  });

  assert.deepEqual(
    await inspector.inspect({
      targetPlatformId: "toutiao",
      accountProfileId: "account-1",
    }),
    { verified: false },
  );
  assert.equal(inspections, 0);
});

test("account inspection uses the explicit prepare port for non-browser adapters", async () => {
  const calls = [];
  const inspector = createPlatformAccountInspector({
    adapters: {
      hepan: {
        prepare: async () => calls.push("session"),
        inspect: async () => {
          calls.push("inspect");
          return {
            verified: true,
            displayName: "fixture-account",
            remoteAccountId: "remote-123",
          };
        },
      },
    },
    operationalStore: {
      listAccountProfiles: () => [
        { accountProfileId: "account-1", platformId: "hepan" },
      ],
    },
    bindingStore: { get: () => null, bind: () => {} },
  });

  assert.equal(
    (await inspector.inspect({
      targetPlatformId: "hepan",
      accountProfileId: "account-1",
    })).verified,
    true,
  );
  assert.deepEqual(calls, ["session", "inspect"]);
});

test("platform account inspector fails closed for a missing or platform-mismatched profile", async () => {
  const inspector = createPlatformAccountInspector({
    adapters: {
      toutiao: {
        inspect: async () => ({
          verified: true,
          displayName: "remote-name",
          remoteAccountId: "remote-123",
        }),
      },
    },
    operationalStore: {
      listAccountProfiles: () => [
        {
          accountProfileId: "account-1",
          platformId: "lieju",
          displayName: "local-name",
        },
      ],
    },
    bindingStore: { get: () => null, bind: () => {} },
  });
  assert.deepEqual(
    await inspector.inspect({
      targetPlatformId: "toutiao",
      accountProfileId: "account-1",
    }),
    { verified: false },
  );
  assert.deepEqual(
    await inspector.inspect({
      targetPlatformId: "toutiao",
      accountProfileId: "missing",
    }),
    { verified: false },
  );
});

test("platform account inspector blocks a later remote account change for the same profile", async () => {
  const bindings = new Map([
    [
      "account-1",
      {
        platformId: "toutiao",
        remoteFingerprint: fingerprint("toutiao", "original"),
      },
    ],
  ]);
  const inspector = createPlatformAccountInspector({
    adapters: {
      toutiao: {
        inspect: async () => ({
          verified: true,
          displayName: "fixture-account",
          remoteAccountId: "replacement",
        }),
      },
    },
    operationalStore: {
      listAccountProfiles: () => [
        {
          accountProfileId: "account-1",
          platformId: "toutiao",
          displayName: "fixture-account",
        },
      ],
    },
    bindingStore: {
      get: (id) => bindings.get(id) || null,
      bind: () => {
        throw new Error("must not replace binding");
      },
    },
  });
  assert.deepEqual(
    await inspector.inspect({
      targetPlatformId: "toutiao",
      accountProfileId: "account-1",
    }),
    { verified: false },
  );
});
