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
    if (!adapter || typeof adapter.openLogin !== "function" || typeof adapter.checkLogin !== "function" || typeof adapter.saveSession !== "function") throw invalid("PLATFORM_LOGIN_UNAVAILABLE");
    return adapter;
  }
  function assertCapability() {
    if (typeof value.assertPlaywrightAvailable === "function") value.assertPlaywrightAvailable();
  }
  return Object.freeze({
    supports: (platformId) => { try { adapterFor(platformId); return true; } catch (_) { return false; } },
    openLogin: async (platformId) => { assertCapability(); await adapterFor(platformId).openLogin(); return { platformId, status: "opened" }; },
    checkLogin: async (platformId) => {
      assertCapability();
      const adapter = adapterFor(platformId);
      if (typeof adapter.ensureSession === "function") await adapter.ensureSession();
      const authenticated = (await adapter.checkLogin()) === true;
      if (authenticated) await adapter.saveSession();
      return { platformId, authenticated };
    },
  });
}

module.exports = { createPlatformSessionService };
