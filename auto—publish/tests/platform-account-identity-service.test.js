"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createPlatformAccountIdentityService,
  fingerprint,
} = require("../desktop/services/platform-account-identity-service");

test("identity service returns only opaque fingerprint evidence", async () => {
  const calls = [];
  const service = createPlatformAccountIdentityService({
    adapters: {
      lieju: {
        prepare: async (input) => calls.push(input),
        inspect: async () => ({
          verified: true,
          displayName: "remote account",
          remoteAccountId: "uid-123",
        }),
      },
    },
  });
  const result = await service.inspect({ platformId: "lieju", preserveCurrentPage: false });
  assert.deepEqual(result, {
    verified: true,
    platformId: "lieju",
    displayName: "remote account",
    remoteFingerprint: fingerprint("lieju", "uid-123"),
  });
  assert.equal(JSON.stringify(result).includes("uid-123"), false);
  assert.deepEqual(calls, [{ targetPlatformId: "lieju", preserveCurrentPage: false }]);
});

test("identity service preserves a safe transport cause code without leaking raw details", async () => {
  const service = createPlatformAccountIdentityService({
    adapters: {
      lieju: {
        prepare: async () => {
          const error = new Error("C:\\private\\state.json");
          error.code = "BROWSER_SESSION_STATE_LEASE_UNAVAILABLE";
          throw error;
        },
        inspect: async () => ({ verified: false }),
      },
    },
  });
  await assert.rejects(
    service.inspect({ platformId: "lieju" }),
    (error) =>
      error.code === "PLATFORM_ACCOUNT_IDENTITY_UNAVAILABLE" &&
      error.causeCode === "BROWSER_SESSION_STATE_LEASE_UNAVAILABLE" &&
      !error.message.includes("private"),
  );
});
