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
        inspectAccount: async () => ({
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

test("platform account inspector fails closed for a missing or platform-mismatched profile", async () => {
  const inspector = createPlatformAccountInspector({
    adapters: {
      toutiao: {
        inspectAccount: async () => ({
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
        inspectAccount: async () => ({
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
