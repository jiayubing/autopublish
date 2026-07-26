"use strict";

function createPlatformAccountRuntimeAdapters(options) {
  const value = options || {};
  const loadedPlatforms = Array.isArray(value.loadedPlatforms)
    ? value.loadedPlatforms
    : [];
  const settingsService = value.platformSettingsService;
  const adapters = {};
  loadedPlatforms.forEach((platform) => {
    if (platform && typeof platform.id === "string") adapters[platform.id] = platform;
  });

  const hepan = adapters.hepan;
  if (
    hepan &&
    settingsService &&
    typeof settingsService.test === "function"
  ) {
    adapters.hepan = Object.assign({}, hepan, {
      inspectAccount: async function () {
        try {
          const result = await settingsService.test("hepan", {});
          const account = result && result.account;
          if (
            !result ||
            result.ok !== true ||
            !account ||
            typeof account.uid !== "string" ||
            !/^\d{1,20}$/.test(account.uid) ||
            typeof account.displayName !== "string" ||
            !account.displayName.trim()
          ) {
            return { verified: false };
          }
          return {
            verified: true,
            remoteAccountId: account.uid,
            displayName: account.displayName,
          };
        } catch (_) {
          return { verified: false };
        }
      },
    });
  }
  return adapters;
}

module.exports = { createPlatformAccountRuntimeAdapters };
