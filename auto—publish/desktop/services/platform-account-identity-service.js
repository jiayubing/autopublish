"use strict";

const crypto = require("node:crypto");

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

function fingerprint(platformId, remoteAccountId) {
  return crypto
    .createHash("sha256")
    .update(`${platformId}\0${remoteAccountId}`, "utf8")
    .digest("hex");
}

function identityError(code, causeCode) {
  const error = new Error(code);
  error.code = code;
  const safeCause = safeCode(causeCode);
  if (safeCause) error.causeCode = safeCause;
  return error;
}

function createPlatformAccountIdentityService(options) {
  const value = options || {};
  const adapters = value.adapters || {};

  return Object.freeze({
    inspect: async function (input) {
      const task = input || {};
      const platformId = safeText(task.platformId, 64);
      const adapter = adapters[platformId];
      if (!platformId || !adapter || typeof adapter.inspect !== "function")
        throw identityError("PLATFORM_ACCOUNT_IDENTITY_UNAVAILABLE");
      try {
        if (typeof adapter.prepare === "function") {
          await adapter.prepare(
            Object.freeze({
              targetPlatformId: platformId,
              ...(safeText(task.accountProfileId, 160)
                ? { accountProfileId: safeText(task.accountProfileId, 160) }
                : {}),
              preserveCurrentPage: task.preserveCurrentPage === true,
            }),
          );
        }
        const evidence = await adapter.inspect();
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
        )
          throw identityError("PLATFORM_ACCOUNT_IDENTITY_UNVERIFIED");
        return Object.freeze({
          verified: true,
          platformId,
          displayName,
          remoteFingerprint: fingerprint(platformId, remoteAccountId),
        });
      } catch (error) {
        if (
          error &&
          [
            "PLATFORM_ACCOUNT_IDENTITY_UNAVAILABLE",
            "PLATFORM_ACCOUNT_IDENTITY_UNVERIFIED",
          ].includes(error.code)
        )
          throw error;
        throw identityError(
          "PLATFORM_ACCOUNT_IDENTITY_UNAVAILABLE",
          error && error.code,
        );
      }
    },
  });
}

module.exports = {
  createPlatformAccountIdentityService,
  fingerprint,
};
