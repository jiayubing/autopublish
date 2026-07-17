const { createPlatformProviderConfigStore } = require("../platform-provider-config-store");

function settingsError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createPlatformSettingsService(options) {
  const values = options || {};
  const adapterList = Array.isArray(values.adapters) ? values.adapters : values.adapters && typeof values.adapters === "object" ? Object.keys(values.adapters).map((key) => values.adapters[key]) : [];
  const adapters = new Map(adapterList.map((adapter) => [adapter.id, adapter]));
  const stores = new Map();
  const tests = new Map();
  const env = values.env || process.env;
  const now = values.now || (() => new Date().toISOString());
  const getTaskState = values.getTaskState || values.getBatchState || (() => ({}));

  function getAdapter(platformId) {
    const adapter = adapters.get(platformId);
    if (!adapter) throw settingsError("PLATFORM_CONFIG_PLATFORM_NOT_FOUND", "Platform provider is not supported");
    return adapter;
  }

  function getStore(adapter) {
    if (!stores.has(adapter.id)) {
      const store = adapter.store || (typeof adapter.createStore === "function" ? adapter.createStore({
        userDataPath: values.userDataPath,
        safeStorage: values.safeStorage,
        fs: values.fs,
        path: values.path
      }) : createPlatformProviderConfigStore({
        userDataPath: values.userDataPath,
        safeStorage: values.safeStorage,
        fs: values.fs,
        path: values.path,
        fileName: adapter.fileName,
        schema: adapter.schema,
        secretFields: adapter.secretFields
      }));
      stores.set(adapter.id, store);
    }
    return stores.get(adapter.id);
  }

  function environmentConfig(adapter) {
    if (typeof adapter.environment !== "function") return null;
    const result = adapter.environment(env);
    return result || null;
  }

  function applicationConfig(adapter) {
    return getStore(adapter).read();
  }

  function effective(adapter) {
    const override = environmentConfig(adapter);
    if (override) return { config: override, source: "environment" };
    const stored = applicationConfig(adapter);
    return { config: stored, source: "application" };
  }

  function lastTest(adapter) {
    return tests.get(adapter.id) || null;
  }

  function safeStatus(adapter, config, source) {
    const context = { source, lastTest: lastTest(adapter) };
    let result = typeof adapter.status === "function" ? adapter.status(config, context) : { configured: Boolean(config), source, lastTest: context.lastTest };
    result = isObject(result) ? Object.assign({}, result) : {};
    ["apiKey", "cookie", "cookieValue", "secret", "secrets", "decrypted", "buffer", "sourcePath", "cookiePath", "pythonPath"].forEach((key) => { delete result[key]; });
    result.source = source;
    result.configured = Boolean(config);
    result.lastTest = context.lastTest;
    return result;
  }

  function assertAdapterMutable(adapter) {
    if (environmentConfig(adapter)) throw settingsError("PLATFORM_CONFIG_ENV_OVERRIDE", "Platform provider configuration is controlled by environment variables");
    const state = getTaskState() || {};
    if (state.isPlatformRunning || state.isBatchRunning || state.isStopPending || state.state === "running" || state.state === "stopping") {
      throw settingsError("PLATFORM_CONFIG_BUSY", "Platform provider configuration is unavailable while publishing is running");
    }
  }

  function validateDraft(adapter, input, current) {
    if (typeof adapter.validate !== "function") return input || current || {};
    try {
      const draft = Object.assign({}, current || {}, input || {});
      (adapter.secretFields || []).forEach((field) => {
        if (!input || !Object.prototype.hasOwnProperty.call(input, field)) return;
        if (typeof input[field] === "string" && input[field].trim() === "" && current && current[field]) draft[field] = current[field];
      });
      return adapter.validate(draft, current || null);
    } catch (error) {
      if (error && error.code === "PLATFORM_CONFIG_INVALID") throw error;
      throw settingsError("PLATFORM_CONFIG_INVALID", "Platform provider configuration is invalid");
    }
  }

  function getStatus(platformId) {
    const adapter = getAdapter(platformId);
    const result = effective(adapter);
    return safeStatus(adapter, result.config, result.source);
  }

  function save(platformId, input) {
    const adapter = getAdapter(platformId);
    assertAdapterMutable(adapter);
    const store = getStore(adapter);
    const normalized = validateDraft(adapter, input, applicationConfig(adapter));
    store.write(normalized);
    tests.delete(adapter.id);
    return safeStatus(adapter, normalized, "application");
  }

  async function test(platformId, input) {
    const adapter = getAdapter(platformId);
    assertAdapterMutable(adapter);
    const current = applicationConfig(adapter);
    const normalized = validateDraft(adapter, input, current);
    if (!normalized || !Object.keys(normalized).length) throw settingsError("PLATFORM_CONFIG_NOT_SET", "Platform provider configuration is not set");
    if (typeof adapter.test !== "function") throw settingsError("PLATFORM_CONNECTION_FAILED", "Platform connection test failed");
    try {
      const result = await adapter.test(normalized);
      const success = result === undefined || result === true || !result || result.ok !== false;
      if (!success) throw settingsError((result && result.code) || "PLATFORM_CONNECTION_FAILED", "Platform connection test failed");
      const record = { testedAt: now(), ok: true, code: (result && result.code) || "PLATFORM_CONNECTION_OK" };
      tests.set(adapter.id, record);
      return record;
    } catch (error) {
      const code = typeof adapter.errorCode === "function" ? adapter.errorCode(error) : error && error.code;
      const record = { testedAt: now(), ok: false, code: code || "PLATFORM_CONNECTION_FAILED" };
      tests.set(adapter.id, record);
      throw settingsError(record.code, "Platform connection test failed");
    }
  }

  function clear(platformId) {
    const adapter = getAdapter(platformId);
    assertAdapterMutable(adapter);
    tests.delete(adapter.id);
    return getStore(adapter).clear();
  }

  function getRuntimeConfig(platformId) {
    const adapter = getAdapter(platformId);
    const result = effective(adapter);
    if (!result.config) throw settingsError("PLATFORM_CONFIG_NOT_SET", "Platform provider configuration is not set");
    return result.config;
  }

  function getApplicationConfig(platformId) {
    const adapter = getAdapter(platformId);
    return applicationConfig(adapter);
  }

  function getAdapterForRuntime(platformId) {
    const adapter = getAdapter(platformId);
    const config = getRuntimeConfig(platformId);
    if (!config) throw settingsError("PLATFORM_CONFIG_NOT_SET", "Platform provider configuration is not set");
    return { adapter, config };
  }

  return { getStatus, getApplicationConfig, save, test, clear, getRuntimeConfig, getAdapterForRuntime };
}

module.exports = { createPlatformSettingsService };
