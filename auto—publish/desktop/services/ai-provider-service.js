const crypto = require("node:crypto");
const { createAiClient, validateAiConfig } = require("../../src/content/ai-client");
const { createAiProviderConfigStore } = require("../ai-provider-config-store");
const { createAiProviderTestStatusStore } = require("../ai-provider-test-status-store");

function providerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

const SAFE_CONFIG = ["baseUrl", "apiKey", "model", "timeoutMs"];

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function createMemoryTestStatusStore() {
  let value = null;
  return {
    read: function() { return value; },
    write: function(next) { value = Object.assign({}, next); return value; },
    clear: function() { value = null; return { cleared: true }; }
  };
}

function createAiProviderService(options) {
  const values = options || {};
  const configStore = values.configStore || createAiProviderConfigStore({
    userDataPath: values.userDataPath,
    safeStorage: values.safeStorage,
    fs: values.fs
  });
  const testStatusStore = values.testStatusStore || (values.userDataPath
    ? createAiProviderTestStatusStore({ userDataPath: values.userDataPath, fs: values.fs })
    : createMemoryTestStatusStore());
  const env = values.env || process.env;
  const aiClientFactory = values.aiClientFactory || createAiClient;
  const now = values.now || function() { return new Date().toISOString(); };
  const getBatchState = values.getBatchState || values.getGenerationState || function() { return {}; };
  let lastTransientTest = null;

  function environmentOverride() {
    const keys = ["AI_API_KEY", "AI_BASE_URL", "AI_MODEL", "AI_TIMEOUT_MS"];
    const present = keys.filter(function(key) { return hasOwn(env, key) && env[key] !== undefined && env[key] !== ""; });
    if (present.length === 0) return null;
    if (present.length !== keys.length) throw providerError("AI_CONFIG_INVALID", "AI provider configuration is invalid");
    return {
      apiKey: env.AI_API_KEY, baseUrl: env.AI_BASE_URL, model: env.AI_MODEL, timeoutMs: env.AI_TIMEOUT_MS,
      source: "environment", lastTest: null
    };
  }

  function applicationConfig() {
    return configStore.read();
  }

  function effectiveConfig() {
    const overridden = environmentOverride();
    if (overridden) return overridden;
    const stored = applicationConfig();
    return stored ? Object.assign({ source: "application" }, stored) : null;
  }

  function statusFor(config, source) {
    const lastTest = lastTransientTest || testStatusStore.read() || null;
    if (!config) {
      return { source: "application", configured: false, baseUrl: "", model: "", timeoutMs: 60000, hasApiKey: false, apiKeyMask: "", lastTest: lastTest };
    }
    return {
      source: source || config.source || "application",
      configured: true,
      baseUrl: config.baseUrl,
      model: config.model,
      timeoutMs: Number(config.timeoutMs),
      hasApiKey: Boolean(config.apiKey),
      apiKeyMask: config.apiKey ? "••••••••" : "",
      lastTest: lastTest
    };
  }

  function assertNotOverridden() {
    if (environmentOverride()) throw providerError("AI_CONFIG_ENV_OVERRIDE", "AI provider configuration is controlled by environment variables");
  }

  function assertNotBusy() {
    const state = getBatchState() || {};
    if (state.isBatchRunning || state.isStopPending || state.state === "running" || state.state === "stopping") {
      throw providerError("AI_CONFIG_BUSY", "AI provider configuration is unavailable while generation is running");
    }
  }

  function validate(input) {
    try {
      return validateAiConfig(input || {});
    } catch (_) {
      throw providerError("AI_CONFIG_INVALID", "AI provider configuration is invalid");
    }
  }

  function cleanInput(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw providerError("AI_CONFIG_INVALID", "AI provider configuration is invalid");
    return SAFE_CONFIG.reduce(function(result, key) {
      if (hasOwn(input, key)) result[key] = input[key];
      return result;
    }, {});
  }

  function save(input) {
    assertNotOverridden();
    assertNotBusy();
    const draft = cleanInput(input);
    const current = applicationConfig();
    if (draft.apiKey === "" && current && current.apiKey) draft.apiKey = current.apiKey;
    const config = validate(draft);
    configStore.write({ baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model, timeoutMs: config.timeoutMs });
    testStatusStore.clear();
    lastTransientTest = null;
    return statusFor(Object.assign({}, config, { lastTest: null }), "application");
  }

  function testConnection(input) {
    assertNotOverridden();
    assertNotBusy();
    const draftInput = cleanInput(input || {});
    const current = applicationConfig();
    if (draftInput.apiKey === "" && current && current.apiKey) draftInput.apiKey = current.apiKey;
    const config = validate(Object.keys(draftInput).length ? draftInput : (current || {}));
    function recordTest(result) {
      lastTransientTest = result;
      try { testStatusStore.write(result); } catch (_) {}
      return result;
    }

    let client;
    try {
      client = aiClientFactory({ apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model, timeoutMs: config.timeoutMs });
    } catch (_) {
      recordTest({ testedAt: now(), ok: false, code: "AI_CONNECTION_FAILED" });
      return Promise.reject(providerError("AI_CONNECTION_FAILED", "AI connection test failed"));
    }
    if (!client || typeof client.complete !== "function") {
      recordTest({ testedAt: now(), ok: false, code: "AI_CONNECTION_FAILED" });
      return Promise.reject(providerError("AI_CONNECTION_FAILED", "AI connection test failed"));
    }
    return Promise.resolve().then(function() {
      return client.complete([
        { role: "system", content: "Connection test" },
        { role: "user", content: "Reply with OK only" }
    ]);
    }).then(function() {
      const result = { testedAt: now(), ok: true, code: "AI_CONNECTION_OK" };
      recordTest(result);
      return result;
    }, function() {
      recordTest({ testedAt: now(), ok: false, code: "AI_CONNECTION_FAILED" });
      throw providerError("AI_CONNECTION_FAILED", "AI connection test failed");
    });
  }

  function clear() {
    assertNotOverridden();
    assertNotBusy();
    lastTransientTest = null;
    const result = configStore.clear();
    testStatusStore.clear();
    return result;
  }

  function getStatus() {
    const config = effectiveConfig();
    if (config) return statusFor(config, config.source);
    return statusFor(null);
  }

  function createClient() {
    const config = effectiveConfig();
    if (!config) throw providerError("AI_CONFIG_NOT_SET", "AI provider configuration is not set");
    const validated = validate(config);
    return aiClientFactory({ apiKey: validated.apiKey, baseUrl: validated.baseUrl, model: validated.model, timeoutMs: validated.timeoutMs });
  }

  function getFingerprint() {
    const overridden = environmentOverride();
    if (overridden) return crypto.createHash("sha256").update(JSON.stringify({ baseUrl: overridden.baseUrl, model: overridden.model, timeoutMs: Number(overridden.timeoutMs), apiKey: overridden.apiKey }), "utf8").digest("hex");
    if (typeof configStore.getFingerprint === "function") return configStore.getFingerprint();
    const config = applicationConfig();
    return config ? crypto.createHash("sha256").update(JSON.stringify({ baseUrl: config.baseUrl, model: config.model, timeoutMs: config.timeoutMs, apiKey: config.apiKey }), "utf8").digest("hex") : null;
  }

  return { getStatus: getStatus, save: save, testConnection: testConnection, clear: clear, createClient: createClient, getFingerprint: getFingerprint };
}

module.exports = { createAiProviderService };
