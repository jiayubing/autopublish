const fs = require("node:fs");
const path = require("node:path");
const { maskApiKey } = require("../../../src/platforms/media/config");
const { createPlatformProviderConfigStore } = require("../../platform-provider-config-store");

const DEFAULT_MEDIA_BASE_URL = "http://8.138.187.158:8082";
const DEFAULT_MEDIA_TIMEOUT_MS = 30000;

function adapterError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeBaseUrl(value) {
  const text = String(value == null ? "" : value).trim().replace(/\/+$/, "");
  if (!text || !/^https?:\/\//i.test(text) || /[?#]/.test(text)) throw adapterError("PLATFORM_CONFIG_INVALID", "Media provider configuration is invalid");
  try { new URL(text); } catch (_) { throw adapterError("PLATFORM_CONFIG_INVALID", "Media provider configuration is invalid"); }
  return text;
}

function normalizeTimeout(value) {
  const number = Number(value == null ? DEFAULT_MEDIA_TIMEOUT_MS : value);
  if (!Number.isInteger(number) || number < 1000 || number > 300000) throw adapterError("PLATFORM_CONFIG_INVALID", "Media provider configuration is invalid");
  return number;
}

function createMediaSettingsAdapter(options) {
  const values = options || {};
  const io = values.fs || fs;
  const adapter = {
    id: "media",
    fileName: "media-provider.json",
    schema: {
      apiKey: { type: "string", required: true, nonEmpty: true },
      baseUrl: { type: "string", required: true, nonEmpty: true },
      timeoutMs: { type: "integer", required: true, min: 1000, max: 300000 },
      allowInsecure: { type: "boolean", default: false }
    },
    secretFields: ["apiKey"],
    createStore: (storeOptions) => createPlatformProviderConfigStore({
      ...storeOptions,
      fileName: "media-provider.json",
      schema: adapter.schema,
      secretFields: adapter.secretFields
    }),
    validate(input) {
      const value = input || {};
      const apiKey = String(value.apiKey == null ? "" : value.apiKey).trim();
      if (!apiKey) throw adapterError("PLATFORM_CONFIG_INVALID", "Media provider configuration is invalid");
      const baseUrl = normalizeBaseUrl(value.baseUrl || DEFAULT_MEDIA_BASE_URL);
      const timeoutMs = normalizeTimeout(value.timeoutMs);
      const allowInsecure = Boolean(value.allowInsecure);
      if (/^http:\/\//i.test(baseUrl) && baseUrl !== DEFAULT_MEDIA_BASE_URL && !allowInsecure) {
        throw adapterError("PLATFORM_CONFIG_INVALID", "HTTP media provider addresses require explicit confirmation");
      }
      return { apiKey, baseUrl, timeoutMs, allowInsecure };
    },
    environment(env) {
      const source = env || process.env;
      const hasKey = typeof source.XQW_API_KEY === "string" && source.XQW_API_KEY.trim() !== "";
      const hasBase = typeof source.XQW_BASE_URL === "string" && source.XQW_BASE_URL.trim() !== "";
      if (!hasKey && !hasBase) return null;
      if (!hasKey) throw adapterError("PLATFORM_CONFIG_INVALID", "Media provider environment configuration is invalid");
      return adapter.validate({ apiKey: source.XQW_API_KEY, baseUrl: source.XQW_BASE_URL || DEFAULT_MEDIA_BASE_URL, timeoutMs: source.XQW_TIMEOUT_MS || DEFAULT_MEDIA_TIMEOUT_MS, allowInsecure: source.XQW_ALLOW_INSECURE === "1" });
    },
    status(config, context) {
      const value = config || {};
      return {
        configured: Boolean(config),
        source: context.source,
        baseUrl: value.baseUrl || "",
        timeoutMs: value.timeoutMs || DEFAULT_MEDIA_TIMEOUT_MS,
        allowInsecure: Boolean(value.allowInsecure),
        transport: value.baseUrl && /^http:\/\//i.test(value.baseUrl) ? "不加密连接" : "HTTPS",
        apiKeyMask: value.apiKey ? maskApiKey(value.apiKey) : "",
        lastTest: context.lastTest || null
      };
    },
    createClient(config) {
      const { MediaClient } = require("../../../src/platforms/media/media-client");
      return (values.clientFactory || ((input) => new MediaClient(input)))(config);
    },
    async test(config) {
      try {
        await adapter.createClient(config).getBalance();
        return { ok: true, code: "MEDIA_CONNECTION_OK" };
      } catch (error) {
        throw adapterError("MEDIA_CONNECTION_FAILED", "Media provider connection test failed");
      }
    },
    errorCode(error) { return error && error.code === "MEDIA_CONNECTION_FAILED" ? error.code : "MEDIA_CONNECTION_FAILED"; },
    isPythonPath: () => false,
    fs: io,
    defaultBaseUrl: DEFAULT_MEDIA_BASE_URL
  };
  return adapter;
}

module.exports = { createMediaSettingsAdapter, DEFAULT_MEDIA_BASE_URL, DEFAULT_MEDIA_TIMEOUT_MS };
