"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createPlatformAccountInspector,
  fingerprint,
} = require("../desktop/services/platform-account-inspector");

function profile() {
  return {
    accountProfileId: "account-1",
    platformId: "toutiao",
    displayName: "fixture-account",
  };
}

test("platform account inspector verifies an existing binding without writing a new binding", async () => {
  let writes = 0;
  const expected = fingerprint("toutiao", "remote-123");
  const inspector = createPlatformAccountInspector({
    identityService: {
      inspect: async () => ({
        verified: true,
        platformId: "toutiao",
        displayName: "fixture-account",
        remoteFingerprint: expected,
      }),
    },
    operationalStore: { listAccountProfiles: () => [profile()] },
    bindingStore: {
      get: () => ({ platformId: "toutiao", remoteFingerprint: expected }),
      bind: () => { writes += 1; },
    },
  });
  assert.deepEqual(
    await inspector.inspect({
      targetPlatformId: "toutiao",
      accountProfileId: "account-1",
    }),
    {
      verified: true,
      accountProfileId: "account-1",
      remoteFingerprint: expected,
    },
  );
  assert.equal(writes, 0);
});

test("platform account inspector fails closed for an unbound legacy profile and never auto-binds", async () => {
  let identityCalls = 0;
  const inspector = createPlatformAccountInspector({
    identityService: {
      inspect: async () => {
        identityCalls += 1;
        return {
          verified: true,
          platformId: "toutiao",
          displayName: "fixture-account",
          remoteFingerprint: "a".repeat(64),
        };
      },
    },
    operationalStore: { listAccountProfiles: () => [profile()] },
    bindingStore: { get: () => null },
  });
  assert.deepEqual(
    await inspector.inspect({
      targetPlatformId: "toutiao",
      accountProfileId: "account-1",
    }),
    { verified: false, reasonCode: "ACCOUNT_PROFILE_NOT_BOUND" },
  );
  assert.equal(identityCalls, 0);
});

test("platform account inspector blocks a later remote account change for the same profile", async () => {
  const inspector = createPlatformAccountInspector({
    identityService: {
      inspect: async () => ({
        verified: true,
        platformId: "toutiao",
        displayName: "replacement",
        remoteFingerprint: fingerprint("toutiao", "replacement"),
      }),
    },
    operationalStore: { listAccountProfiles: () => [profile()] },
    bindingStore: {
      get: () => ({
        platformId: "toutiao",
        remoteFingerprint: fingerprint("toutiao", "original"),
      }),
    },
  });
  assert.deepEqual(
    await inspector.inspect({
      targetPlatformId: "toutiao",
      accountProfileId: "account-1",
    }),
    { verified: false, reasonCode: "ACCOUNT_PROFILE_REMOTE_MISMATCH" },
  );
});

test("platform account inspector preserves the underlying identity failure code", async () => {
  const inspector = createPlatformAccountInspector({
    identityService: {
      inspect: async () => {
        const error = new Error("PLATFORM_ACCOUNT_IDENTITY_UNAVAILABLE");
        error.code = "PLATFORM_ACCOUNT_IDENTITY_UNAVAILABLE";
        error.causeCode = "BROWSER_SESSION_STATE_LEASE_UNAVAILABLE";
        throw error;
      },
    },
    operationalStore: { listAccountProfiles: () => [profile()] },
    bindingStore: {
      get: () => ({
        platformId: "toutiao",
        remoteFingerprint: "a".repeat(64),
      }),
    },
  });
  assert.deepEqual(
    await inspector.inspect({
      targetPlatformId: "toutiao",
      accountProfileId: "account-1",
    }),
    {
      verified: false,
      reasonCode: "ACCOUNT_PROFILE_IDENTITY_UNAVAILABLE",
      causeCode: "PLATFORM_ACCOUNT_IDENTITY_UNAVAILABLE",
      transportCauseCode: "BROWSER_SESSION_STATE_LEASE_UNAVAILABLE",
    },
  );
});

test("platform account inspector forwards preserveCurrentPage to the identity owner", async () => {
  const calls = [];
  const expected = "a".repeat(64);
  const inspector = createPlatformAccountInspector({
    identityService: {
      inspect: async (input) => {
        calls.push(input);
        return {
          verified: true,
          platformId: "toutiao",
          displayName: "fixture-account",
          remoteFingerprint: expected,
        };
      },
    },
    operationalStore: { listAccountProfiles: () => [profile()] },
    bindingStore: {
      get: () => ({ platformId: "toutiao", remoteFingerprint: expected }),
    },
  });
  await inspector.inspect({
    targetPlatformId: "toutiao",
    accountProfileId: "account-1",
    preserveCurrentPage: true,
  });
  assert.deepEqual(calls, [
    {
      platformId: "toutiao",
      accountProfileId: "account-1",
      preserveCurrentPage: true,
    },
  ]);
});
