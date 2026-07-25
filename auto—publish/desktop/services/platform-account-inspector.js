"use strict";

const crypto = require("node:crypto");

function safeText(value, maximum) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  return normalized && normalized.length <= maximum ? normalized : "";
}

function fingerprint(platformId, remoteAccountId) {
  return crypto
    .createHash("sha256")
    .update(`${platformId}\0${remoteAccountId}`, "utf8")
    .digest("hex");
}

function createPlatformAccountInspector(options) {
  const value = options || {};
  const adapters = value.adapters || {};
  const operationalStore = value.operationalStore;
  const bindingStore = value.bindingStore;
  if (
    !operationalStore ||
    typeof operationalStore.listAccountProfiles !== "function" ||
    !bindingStore ||
    typeof bindingStore.get !== "function" ||
    typeof bindingStore.bind !== "function"
  ) {
    throw new Error("Platform account inspector requires account profiles");
  }

  return Object.freeze({
    inspect: async function (task) {
      const platformId = safeText(task && task.targetPlatformId, 64);
      const expectedProfileId = safeText(task && task.accountProfileId, 160);
      const adapter = adapters[platformId];
      if (
        !platformId ||
        !expectedProfileId ||
        !adapter ||
        typeof adapter.inspectAccount !== "function"
      ) {
        return Object.freeze({ verified: false });
      }
      let evidence;
      try {
        evidence = await adapter.inspectAccount();
      } catch (_) {
        return Object.freeze({ verified: false });
      }
      const displayName = safeText(evidence && evidence.displayName, 128);
      const remoteAccountId = safeText(
        evidence && evidence.remoteAccountId,
        128,
      );
      if (
        !evidence ||
        evidence.verified !== true ||
        !displayName ||
        !remoteAccountId
      ) {
        return Object.freeze({ verified: false });
      }
      const matching = operationalStore
        .listAccountProfiles()
        .filter(function (profile) {
          return (
            profile &&
            profile.accountProfileId === expectedProfileId &&
            profile.platformId === platformId
          );
        });
      if (matching.length !== 1) return Object.freeze({ verified: false });
      const remoteFingerprint = fingerprint(platformId, remoteAccountId);
      const binding = bindingStore.get(expectedProfileId);
      if (
        binding &&
        (binding.platformId !== platformId ||
          binding.remoteFingerprint !== remoteFingerprint)
      )
        return Object.freeze({ verified: false });
      if (!binding) {
        try {
          bindingStore.bind({
            accountProfileId: expectedProfileId,
            platformId,
            remoteFingerprint,
          });
        } catch (_) {
          return Object.freeze({ verified: false });
        }
      }
      return Object.freeze({
        verified: true,
        accountProfileId: expectedProfileId,
        remoteFingerprint,
      });
    },
  });
}

module.exports = { createPlatformAccountInspector, fingerprint };
