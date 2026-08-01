"use strict";

const { maskApiKey } = require("../../../src/platforms/media/config");
const {
  EndpointPolicy,
  MEDIA_SECURITY_STATUS,
  parseEndpoint,
} = require("../../../src/platforms/media/endpoint-policy");

const DEFAULT_MEDIA_TIMEOUT_MS = 30000;

function redactedEndpoint(value) {
  try {
    return parseEndpoint(value).endpoint;
  } catch (_) {
    return "";
  }
}

function safeLastTest(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.testedAt !== "string" || typeof value.code !== "string" || typeof value.ok !== "boolean") return null;
  const code = value.code.replace(/[^A-Za-z0-9_:-]/gu, "").slice(0, 128);
  if (!code) return null;
  return {
    testedAt: value.testedAt.slice(0, 64),
    ok: value.ok,
    code,
  };
}

function policyFor(config, options) {
  const values = options || {};
  if (values.confirmationAdapter && typeof values.confirmationAdapter.createPolicy === "function") {
    return values.confirmationAdapter.createPolicy({
      endpoint: config.baseUrl,
      allowInsecure: config.allowInsecure,
      insecureEndpoint: config.insecureEndpoint,
    });
  }
  return new EndpointPolicy({
    endpoint: config.baseUrl,
    allowInsecure: config.allowInsecure,
    insecureEndpoint: config.insecureEndpoint,
  });
}

function projectMediaSettings(config, context, options) {
  const value = config && typeof config === "object" && !Array.isArray(config) ? config : null;
  const state = context || {};
  let transport = MEDIA_SECURITY_STATUS.DISABLED;
  if (state.invalid) {
    transport = MEDIA_SECURITY_STATUS.INVALID;
  } else if (value) {
    try {
      transport = policyFor(value, options).securityStatus();
    } catch (_) {
      transport = MEDIA_SECURITY_STATUS.INVALID;
    }
  }
  const timeoutMs = Number.isInteger(value && value.timeoutMs) && value.timeoutMs >= 1000 && value.timeoutMs <= 300000
    ? value.timeoutMs
    : DEFAULT_MEDIA_TIMEOUT_MS;
  const apiKey = typeof (value && value.apiKey) === "string" ? value.apiKey : "";
  const thirdPartyId = typeof (value && value.thirdPartyId) === "string" && value.thirdPartyId.length <= 128
    ? value.thirdPartyId.replace(/[\x00-\x1f\x7f]/gu, "")
    : "";
  return {
    configured: Boolean(value) && !state.invalid,
    source: state.source === "environment" ? "environment" : "application",
    baseUrl: redactedEndpoint(value && value.baseUrl),
    timeoutMs,
    allowInsecure: transport === MEDIA_SECURITY_STATUS.INSECURE,
    transport,
    apiKeyMask: apiKey ? maskApiKey(apiKey) : "",
    ...(thirdPartyId ? { thirdPartyId } : {}),
    lastTest: safeLastTest(state.lastTest),
  };
}

module.exports = {
  DEFAULT_MEDIA_TIMEOUT_MS,
  MEDIA_SECURITY_STATUS,
  projectMediaSettings,
  redactedEndpoint,
};
