const fs = require("node:fs");
const { createPlatformProviderConfigStore } = require("../../platform-provider-config-store");
const {
  classifyMediaTransportError,
  createMediaError,
} = require("../../../src/platforms/media/media-errors");
const { parseEndpoint } = require("../../../src/platforms/media/endpoint-policy");
const { createMediaRiskConfirmationAdapter } = require("./media-risk-confirmation-adapter");
const {
  DEFAULT_MEDIA_TIMEOUT_MS,
  projectMediaSettings,
} = require("./media-settings-projection");

// A production endpoint is intentionally not guessed. Operators must supply
// the endpoint and explicitly acknowledge an HTTP transport when needed.
const DEFAULT_MEDIA_BASE_URL = "";

function adapterError(code, message, cause) {
  const error = /^MEDIA_[A-Z0-9_]+$/u.test(code)
    ? createMediaError(code, message)
    : Object.assign(new Error(message || code), {
        code,
        category: "validation",
        retryability: "never",
      });
  if (cause && cause.category) error.category = cause.category;
  if (cause && cause.retryability) error.retryability = cause.retryability;
  if (cause && cause.diagnostics) error.diagnostics = cause.diagnostics;
  return error;
}

function normalizeTimeout(value) {
  const number = Number(value == null ? DEFAULT_MEDIA_TIMEOUT_MS : value);
  if (!Number.isInteger(number) || number < 1000 || number > 300000) {
    throw adapterError("MEDIA_CONFIG_INVALID");
  }
  return number;
}

function normalizeThirdPartyId(value) {
  const text = String(value == null ? "" : value).trim();
  if (text.length > 128 || /[\x00-\x1f\x7f]/u.test(text)) throw adapterError("PLATFORM_CONFIG_INVALID");
  return text;
}

function endpointFor(value) {
  try {
    return parseEndpoint(value);
  } catch (error) {
    throw adapterError(error.code || "MEDIA_CONFIG_INVALID");
  }
}

function hasExplicitApproval(input, patch, current) {
  if (!patch) return !current && input.allowInsecure === true;
  return Object.prototype.hasOwnProperty.call(patch, "allowInsecure") && patch.allowInsecure === true;
}

function createMediaSettingsAdapter(options) {
  const values = options || {};
  const io = values.fs || fs;
  const riskConfirmation = values.riskConfirmation || createMediaRiskConfirmationAdapter();
  const adapter = {
    id: "media",
    fileName: "media-provider.json",
    schema: {
      apiKey: { type: "string", required: true, nonEmpty: true },
      baseUrl: { type: "string", required: true, nonEmpty: true },
      timeoutMs: { type: "integer", required: true, min: 1000, max: 300000 },
      allowInsecure: { type: "boolean", default: false },
      insecureEndpoint: { type: "string", default: "" },
      thirdPartyId: { type: "string", default: "", validate: normalizeThirdPartyId },
    },
    secretFields: ["apiKey"],
    createStore: (storeOptions) => createPlatformProviderConfigStore({
      ...storeOptions,
      fileName: "media-provider.json",
      schema: adapter.schema,
      secretFields: adapter.secretFields,
    }),
    validate(input, current, patch) {
      const value = input || {};
      const apiKey = String(value.apiKey == null ? "" : value.apiKey).trim();
      if (!apiKey) throw adapterError("MEDIA_CONFIG_INVALID");
      const endpoint = endpointFor(value.baseUrl);
      const timeoutMs = normalizeTimeout(value.timeoutMs);
      const thirdPartyId = normalizeThirdPartyId(value.thirdPartyId);
      const allowInsecure = value.allowInsecure === true;
      if (endpoint.protocol !== "http:") {
        return {
          apiKey,
          baseUrl: endpoint.endpoint,
          timeoutMs,
          allowInsecure: false,
          insecureEndpoint: "",
          thirdPartyId,
        };
      }

      const explicit = hasExplicitApproval(value, patch, current);
      const persisted = current && current.allowInsecure === true && current.insecureEndpoint === endpoint.endpointKey;
      const remembered = riskConfirmation.isConfirmed(endpoint.endpointKey, {
        persistedEndpoint: persisted ? current.insecureEndpoint : "",
      });
      if (!allowInsecure || (!explicit && !persisted && !remembered)) {
        throw adapterError("MEDIA_HTTP_CONFIRMATION_REQUIRED");
      }
      if (explicit) riskConfirmation.confirm(endpoint.endpointKey);
      return {
        apiKey,
        baseUrl: endpoint.endpoint,
        timeoutMs,
        allowInsecure: true,
        insecureEndpoint: endpoint.endpointKey,
        thirdPartyId,
      };
    },
    environment(env) {
      const source = env || process.env;
      const hasKey = typeof source.XQW_API_KEY === "string" && source.XQW_API_KEY.trim() !== "";
      const hasBase = typeof source.XQW_BASE_URL === "string" && source.XQW_BASE_URL.trim() !== "";
      if (!hasKey && !hasBase) return null;
      if (!hasKey) throw adapterError("MEDIA_CONFIG_INVALID");
      const allowInsecure = /^(1|true)$/iu.test(String(source.XQW_ALLOW_INSECURE == null ? "" : source.XQW_ALLOW_INSECURE).trim());
      return adapter.validate({
        apiKey: source.XQW_API_KEY,
        baseUrl: hasBase ? source.XQW_BASE_URL : DEFAULT_MEDIA_BASE_URL,
        timeoutMs: source.XQW_TIMEOUT_MS || DEFAULT_MEDIA_TIMEOUT_MS,
        allowInsecure,
        thirdPartyId: source.XQW_THIRD_ID || "",
      });
    },
    status(config, context) {
      return projectMediaSettings(config, context, { confirmationAdapter: riskConfirmation });
    },
    createClient(config) {
      const { MediaClient } = require("../../../src/platforms/media/media-client");
      const normalized = adapter.validate(config, config, {});
      const endpointPolicy = riskConfirmation.createPolicy({
        endpoint: normalized.baseUrl,
        allowInsecure: normalized.allowInsecure,
        insecureEndpoint: normalized.insecureEndpoint,
      });
      const clientInput = Object.assign({}, normalized, { endpointPolicy });
      return (values.clientFactory || ((input) => new MediaClient(input)))(clientInput);
    },
    async test(config) {
      try {
        await adapter.createClient(config).getBalance();
        return { ok: true, code: "MEDIA_CONNECTION_OK" };
      } catch (error) {
        const diagnostic = classifyMediaTransportError(error, error && error.diagnostics && error.diagnostics.phase);
        throw adapterError(diagnostic.code || "MEDIA_CONNECTION_FAILED", "Media provider connection test failed", diagnostic);
      }
    },
    errorCode(error) {
      return error && typeof error.code === "string" && /^MEDIA_[A-Z0-9_]+$/u.test(error.code)
        ? error.code
        : "MEDIA_CONNECTION_FAILED";
    },
    isPythonPath: () => false,
    fs: io,
    defaultBaseUrl: DEFAULT_MEDIA_BASE_URL,
    riskConfirmation,
  };
  return adapter;
}

module.exports = {
  createMediaSettingsAdapter,
  DEFAULT_MEDIA_BASE_URL,
  DEFAULT_MEDIA_TIMEOUT_MS,
};
