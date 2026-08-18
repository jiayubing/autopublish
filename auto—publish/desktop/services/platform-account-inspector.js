"use strict";

const {
  createPlatformAccountIdentityService,
  fingerprint,
} = require("./platform-account-identity-service");

function safeText(value, maximum) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  return normalized && normalized.length <= maximum ? normalized : "";
}

function safeCode(value) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{1,127}$/.test(value)
    ? value
    : null;
}

function createPlatformAccountInspector(options) {
  const value = options || {};
  const operationalStore = value.operationalStore;
  const bindingStore = value.bindingStore;
  const identityService =
    value.identityService ||
    createPlatformAccountIdentityService({ adapters: value.adapters || {} });
  if (
    !operationalStore ||
    typeof operationalStore.listAccountProfiles !== "function" ||
    !bindingStore ||
    typeof bindingStore.get !== "function" ||
    !identityService ||
    typeof identityService.inspect !== "function"
  ) {
    throw new Error("Platform account inspector requires account profiles");
  }

  return Object.freeze({
    inspect: async function (task) {
      const platformId = safeText(task && task.targetPlatformId, 64);
      const expectedProfileId = safeText(task && task.accountProfileId, 160);
      if (!platformId || !expectedProfileId)
        return Object.freeze({
          verified: false,
          reasonCode: "ACCOUNT_PROFILE_INPUT_INVALID",
        });
      const matching = operationalStore
        .listAccountProfiles()
        .filter(function (profile) {
          return (
            profile &&
            profile.accountProfileId === expectedProfileId &&
            profile.platformId === platformId
          );
        });
      if (matching.length !== 1)
        return Object.freeze({
          verified: false,
          reasonCode: "ACCOUNT_PROFILE_NOT_FOUND",
        });
      let binding;
      try {
        binding = bindingStore.get(expectedProfileId);
      } catch (error) {
        return Object.freeze({
          verified: false,
          reasonCode: "ACCOUNT_PROFILE_BINDING_UNAVAILABLE",
          ...(safeCode(error && error.code)
            ? { causeCode: safeCode(error.code) }
            : {}),
        });
      }
      if (!binding)
        return Object.freeze({
          verified: false,
          reasonCode: "ACCOUNT_PROFILE_NOT_BOUND",
        });
      if (binding.platformId !== platformId)
        return Object.freeze({
          verified: false,
          reasonCode: "ACCOUNT_PROFILE_BINDING_INVALID",
        });
      let identity;
      try {
        identity = await identityService.inspect({
          platformId,
          accountProfileId: expectedProfileId,
          preserveCurrentPage: task && task.preserveCurrentPage === true,
        });
      } catch (error) {
        return Object.freeze({
          verified: false,
          reasonCode: "ACCOUNT_PROFILE_IDENTITY_UNAVAILABLE",
          ...(safeCode(error && error.code)
            ? { causeCode: safeCode(error.code) }
            : {}),
          ...(safeCode(error && error.causeCode)
            ? { transportCauseCode: safeCode(error.causeCode) }
            : {}),
        });
      }
      if (
        !identity ||
        identity.verified !== true ||
        identity.platformId !== platformId ||
        typeof identity.remoteFingerprint !== "string" ||
        !identity.remoteFingerprint
      )
        return Object.freeze({
          verified: false,
          reasonCode: "ACCOUNT_PROFILE_IDENTITY_UNAVAILABLE",
        });
      if (identity.remoteFingerprint !== binding.remoteFingerprint)
        return Object.freeze({
          verified: false,
          reasonCode: "ACCOUNT_PROFILE_REMOTE_MISMATCH",
        });
      return Object.freeze({
        verified: true,
        accountProfileId: expectedProfileId,
        remoteFingerprint: identity.remoteFingerprint,
      });
    },
  });
}

module.exports = { createPlatformAccountInspector, fingerprint };
