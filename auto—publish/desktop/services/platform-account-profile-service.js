"use strict";

const { reportDiagnostic } = require("../../src/diagnostics/diagnostic-producer");

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function safeText(value, maximum) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  return normalized && normalized.length <= maximum ? normalized : "";
}

function createPlatformAccountProfileService(options) {
  const value = options || {};
  const operationalStore = value.operationalStore;
  const bindingStore = value.bindingStore;
  const identityService = value.identityService;
  if (
    !operationalStore ||
    typeof operationalStore.createAccountProfile !== "function" ||
    typeof operationalStore.listAccountProfiles !== "function" ||
    typeof operationalStore.deleteAccountProfile !== "function" ||
    !bindingStore ||
    typeof bindingStore.get !== "function" ||
    typeof bindingStore.bind !== "function" ||
    typeof bindingStore.remove !== "function" ||
    !identityService ||
    typeof identityService.inspect !== "function"
  )
    throw fail("PLATFORM_ACCOUNT_PROFILE_SERVICE_INVALID");

  function profileById(accountProfileId) {
    const id = safeText(accountProfileId, 160);
    const profile = operationalStore
      .listAccountProfiles()
      .find((item) => item && item.accountProfileId === id);
    if (!profile) throw fail("ACCOUNT_PROFILE_NOT_FOUND");
    return profile;
  }

  function present(profile) {
    const binding = bindingStore.get(profile.accountProfileId);
    const bound = Boolean(
      binding &&
        binding.platformId === profile.platformId &&
        typeof binding.remoteFingerprint === "string" &&
        /^[a-f0-9]{64}$/.test(binding.remoteFingerprint),
    );
    return Object.freeze({
      ...profile,
      bindingStatus: bound ? "bound" : "unbound",
    });
  }

  function assertBound(input) {
    const data = input || {};
    const profile = profileById(data.accountProfileId);
    const platformId = safeText(data.platformId, 64);
    if (platformId && profile.platformId !== platformId)
      throw fail("ACCOUNT_PROFILE_PLATFORM_MISMATCH");
    const binding = bindingStore.get(profile.accountProfileId);
    if (!binding) throw fail("ACCOUNT_PROFILE_NOT_BOUND");
    if (binding.platformId !== profile.platformId)
      throw fail("ACCOUNT_PROFILE_BINDING_INVALID");
    return Object.freeze({
      accountProfileId: profile.accountProfileId,
      platformId: profile.platformId,
      displayName: profile.displayName,
      ...(profile.createdAt ? { createdAt: profile.createdAt } : {}),
    });
  }

  async function createAndBind(input) {
    const data = input || {};
    const platformId = safeText(data.platformId, 64);
    const displayName = safeText(data.displayName, 128);
    if (!platformId || !displayName)
      throw fail("ACCOUNT_PROFILE_CONFIRMATION_REQUIRED");
    const identity = await identityService.inspect({
      platformId,
      preserveCurrentPage: false,
    });
    const profile = operationalStore.createAccountProfile({
      platformId,
      displayName,
    });
    try {
      bindingStore.bind({
        accountProfileId: profile.accountProfileId,
        platformId,
        remoteFingerprint: identity.remoteFingerprint,
      });
    } catch (error) {
      try {
        operationalStore.deleteAccountProfile({
          accountProfileId: profile.accountProfileId,
        });
      } catch (_) {
        throw fail("ACCOUNT_PROFILE_CREATE_NEEDS_REPAIR");
      }
      throw error;
    }
    return present(profile);
  }

  async function bindExisting(input) {
    const data = input || {};
    const profile = profileById(data.accountProfileId);
    const existing = bindingStore.get(profile.accountProfileId);
    const identity = await identityService.inspect({
      platformId: profile.platformId,
      accountProfileId: profile.accountProfileId,
      preserveCurrentPage: false,
    });
    if (existing) {
      if (
        existing.platformId !== profile.platformId ||
        existing.remoteFingerprint !== identity.remoteFingerprint
      )
        throw fail("ACCOUNT_PROFILE_REMOTE_MISMATCH");
      return present(profile);
    }
    bindingStore.bind({
      accountProfileId: profile.accountProfileId,
      platformId: profile.platformId,
      remoteFingerprint: identity.remoteFingerprint,
    });
    return present(profile);
  }

  function deleteProfile(input) {
    const profile = profileById(input && input.accountProfileId);
    const deleted = operationalStore.deleteAccountProfile({
      accountProfileId: profile.accountProfileId,
    });
    try {
      bindingStore.remove(profile.accountProfileId);
    } catch (error) {
      reportDiagnostic({
        code: "PLATFORM_ACCOUNT_BINDING_DELETE_CLEANUP_FAILED",
        module: "platform-account-profile-service",
        category: "storage",
        metadata: {
          operation: "delete-account-profile",
          causeCode:
            error && typeof error.code === "string" ? error.code : "UNKNOWN",
        },
      });
    }
    return Object.freeze({
      accountProfileId: deleted.accountProfileId,
      platformId: deleted.platformId,
      displayName: deleted.displayName,
    });
  }

  return Object.freeze({
    list: function () {
      return Object.freeze(operationalStore.listAccountProfiles().map(present));
    },
    createAndBind,
    bindExisting,
    assertBound,
    delete: deleteProfile,
  });
}

module.exports = { createPlatformAccountProfileService };
