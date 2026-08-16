"use strict";

function invalid(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function createPlatformSessionService(options) {
  const value = options || {};
  const adapters = value.adapters || {};
  function adapterFor(platformId) {
    if (typeof platformId !== "string" || !platformId || platformId.trim() !== platformId) throw invalid("PLATFORM_LOGIN_INPUT_INVALID");
    const adapter = adapters[platformId];
    if (!adapter || typeof adapter.open !== "function" || typeof adapter.check !== "function" || typeof adapter.save !== "function") throw invalid("PLATFORM_LOGIN_UNAVAILABLE");
    return adapter;
  }
  function assertCapability() {
    if (typeof value.assertPlaywrightAvailable === "function") value.assertPlaywrightAvailable();
  }
  return Object.freeze({
    supports: (platformId) => { try { adapterFor(platformId); return true; } catch (_) { return false; } },
    openLogin: async (platformId) => { assertCapability(); await adapterFor(platformId).open(); return { platformId, status: "opened" }; },
    checkLogin: async (platformId) => {
      assertCapability();
      const adapter = adapterFor(platformId);
      const authenticated = (await adapter.check()) === true;
      if (authenticated) await adapter.save();
      return { platformId, authenticated };
    },
  });
}

module.exports = { createPlatformSessionService };
