"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createPlatformAccountProfileService,
} = require("../desktop/services/platform-account-profile-service");

function fixture() {
  const profiles = new Map();
  const bindings = new Map();
  let sequence = 0;
  let remoteFingerprint = "a".repeat(64);
  const operationalStore = {
    createAccountProfile(input) {
      const profile = {
        accountProfileId: `account-${++sequence}`,
        platformId: input.platformId,
        displayName: input.displayName,
      };
      profiles.set(profile.accountProfileId, profile);
      return profile;
    },
    listAccountProfiles() {
      return [...profiles.values()];
    },
    deleteAccountProfile(input) {
      const profile = profiles.get(input.accountProfileId);
      if (!profile) {
        const error = new Error("ACCOUNT_PROFILE_NOT_FOUND");
        error.code = "ACCOUNT_PROFILE_NOT_FOUND";
        throw error;
      }
      profiles.delete(input.accountProfileId);
      return profile;
    },
  };
  const bindingStore = {
    get(id) {
      return bindings.get(id) || null;
    },
    bind(input) {
      bindings.set(input.accountProfileId, {
        platformId: input.platformId,
        remoteFingerprint: input.remoteFingerprint,
      });
      return bindings.get(input.accountProfileId);
    },
    remove(id) {
      return bindings.delete(id);
    },
  };
  const identityService = {
    async inspect(input) {
      return {
        verified: true,
        platformId: input.platformId,
        displayName: "remote",
        remoteFingerprint,
      };
    },
  };
  return {
    profiles,
    bindings,
    operationalStore,
    bindingStore,
    identityService,
    setRemoteFingerprint(value) {
      remoteFingerprint = value;
    },
  };
}

test("creating an account profile binds the verified remote identity before success", async () => {
  const state = fixture();
  const service = createPlatformAccountProfileService(state);
  const profile = await service.createAndBind({
    platformId: "lieju",
    displayName: "23",
  });
  assert.equal(profile.bindingStatus, "bound");
  assert.equal(state.profiles.size, 1);
  assert.deepEqual(state.bindings.get(profile.accountProfileId), {
    platformId: "lieju",
    remoteFingerprint: "a".repeat(64),
  });
});

test("binding failure rolls back the newly created local profile", async () => {
  const state = fixture();
  state.bindingStore.bind = () => {
    const error = new Error("binding unavailable");
    error.code = "PLATFORM_ACCOUNT_BINDING_STORAGE_UNAVAILABLE";
    throw error;
  };
  const service = createPlatformAccountProfileService(state);
  await assert.rejects(
    service.createAndBind({ platformId: "lieju", displayName: "broken" }),
    { code: "PLATFORM_ACCOUNT_BINDING_STORAGE_UNAVAILABLE" },
  );
  assert.equal(state.profiles.size, 0);
});

test("legacy unbound profile can be explicitly bound but an existing binding never silently changes", async () => {
  const state = fixture();
  const profile = state.operationalStore.createAccountProfile({
    platformId: "lieju",
    displayName: "legacy",
  });
  const service = createPlatformAccountProfileService(state);
  assert.equal(service.list()[0].bindingStatus, "unbound");
  assert.equal((await service.bindExisting({ accountProfileId: profile.accountProfileId })).bindingStatus, "bound");
  state.setRemoteFingerprint("b".repeat(64));
  await assert.rejects(
    service.bindExisting({ accountProfileId: profile.accountProfileId }),
    { code: "ACCOUNT_PROFILE_REMOTE_MISMATCH" },
  );
  assert.equal(
    state.bindings.get(profile.accountProfileId).remoteFingerprint,
    "a".repeat(64),
  );
});

test("deleting a profile removes it from the local profile list and clears its binding", async () => {
  const state = fixture();
  const service = createPlatformAccountProfileService(state);
  const profile = await service.createAndBind({ platformId: "lieju", displayName: "delete-me" });
  service.delete({ accountProfileId: profile.accountProfileId });
  assert.equal(service.list().length, 0);
  assert.equal(state.bindings.has(profile.accountProfileId), false);
});

test("queue admission can resolve only an already bound profile", async () => {
  const state = fixture();
  const service = createPlatformAccountProfileService(state);
  const legacy = state.operationalStore.createAccountProfile({
    platformId: "lieju",
    displayName: "legacy-unbound",
  });
  assert.throws(
    () => service.assertBound({ accountProfileId: legacy.accountProfileId, platformId: "lieju" }),
    { code: "ACCOUNT_PROFILE_NOT_BOUND" },
  );
  await service.bindExisting({ accountProfileId: legacy.accountProfileId });
  assert.deepEqual(
    service.assertBound({ accountProfileId: legacy.accountProfileId, platformId: "lieju" }),
    {
      accountProfileId: legacy.accountProfileId,
      platformId: "lieju",
      displayName: "legacy-unbound",
    },
  );
  assert.throws(
    () => service.assertBound({ accountProfileId: legacy.accountProfileId, platformId: "toutiao" }),
    { code: "ACCOUNT_PROFILE_PLATFORM_MISMATCH" },
  );
});
