"use strict";

const { createMediaError } = require("./media-errors");

const REDIRECT_MODE = "manual";
const MEDIA_SECURITY_STATUS = Object.freeze({
  SECURE: "secure",
  INSECURE: "insecure",
  INVALID: "invalid",
  DISABLED: "disabled",
});

function parseEndpoint(value) {
  const text = String(value == null ? "" : value).trim();
  if (!text) throw createMediaError("MEDIA_ENDPOINT_REQUIRED");
  let parsed;
  try {
    parsed = new URL(text);
  } catch (_) {
    throw createMediaError("MEDIA_CONFIG_INVALID");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw createMediaError("MEDIA_CONFIG_INVALID");
  }
  if (!parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw createMediaError("MEDIA_CONFIG_INVALID");
  }
  const pathname = parsed.pathname.replace(/\/+$/u, "");
  const endpoint = `${parsed.protocol}//${parsed.host}${pathname}`;
  return Object.freeze({
    endpoint,
    endpointKey: endpoint,
    origin: parsed.origin,
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || "",
  });
}

function policyError(code, message, diagnostics) {
  return createMediaError(code, message, diagnostics);
}

class EndpointPolicy {
  constructor(options) {
    const values = options || {};
    const parsed = parseEndpoint(values.endpoint !== undefined ? values.endpoint : values.baseUrl);
    this.endpoint = parsed.endpoint;
    this.endpointKey = parsed.endpointKey;
    this.origin = parsed.origin;
    this.protocol = parsed.protocol;
    this.hostname = parsed.hostname;
    this.port = parsed.port;
    this.allowInsecure = values.allowInsecure === true;
    this.redirect = REDIRECT_MODE;

    let confirmedEndpoint = values.insecureEndpoint || values.confirmedEndpoint || "";
    if (confirmedEndpoint) confirmedEndpoint = parseEndpoint(confirmedEndpoint).endpointKey;
    this.confirmedEndpoint = confirmedEndpoint || "";
    if (values.confirmation && typeof values.confirmation.isConfirmed === "function") {
      this.confirmation = values.confirmation;
    } else {
      this.confirmation = {
        isConfirmed: (candidate) =>
          this.allowInsecure &&
          (!this.confirmedEndpoint || this.confirmedEndpoint === candidate),
      };
    }
  }

  isSecure() {
    return this.protocol === "https:";
  }

  isHttp() {
    return this.protocol === "http:";
  }

  isConfirmed() {
    if (!this.isHttp() || !this.allowInsecure) return false;
    return this.confirmation.isConfirmed(this.endpointKey, {
      endpoint: this.endpointKey,
      origin: this.origin,
      protocol: this.protocol,
      port: this.port,
    }) === true;
  }

  securityStatus() {
    if (this.isSecure()) return MEDIA_SECURITY_STATUS.SECURE;
    return this.isConfirmed()
      ? MEDIA_SECURITY_STATUS.INSECURE
      : MEDIA_SECURITY_STATUS.INVALID;
  }

  assertCanSend() {
    if (this.isHttp() && !this.isConfirmed()) {
      throw policyError(
        "MEDIA_HTTP_CONFIRMATION_REQUIRED",
        "HTTP baseUrl 必须显式设置 allowInsecure=true",
      );
    }
    return this;
  }

  resolveRequestUrl(path) {
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || /[?#]/u.test(path)) {
      throw policyError("MEDIA_CONFIG_INVALID");
    }
    let resolved;
    try {
      resolved = new URL(`${this.endpoint}${path}`);
    } catch (_) {
      throw policyError("MEDIA_CONFIG_INVALID");
    }
    if (resolved.origin !== this.origin) throw policyError("MEDIA_CONFIG_INVALID");
    return resolved.href;
  }

  authorize(path) {
    this.assertCanSend();
    return Object.freeze({
      policy: this,
      url: this.resolveRequestUrl(path),
      endpoint: this.endpoint,
      origin: this.origin,
      redirect: this.redirect,
    });
  }

  assertAuthorized(decision) {
    if (!decision || decision.policy !== this || decision.endpoint !== this.endpoint) {
      throw policyError("MEDIA_CONFIG_INVALID");
    }
    this.assertCanSend();
    return decision;
  }

  isSameEndpoint(value) {
    try {
      return parseEndpoint(value).endpointKey === this.endpointKey;
    } catch (_) {
      return false;
    }
  }

  describe() {
    return Object.freeze({
      endpoint: this.endpoint,
      origin: this.origin,
      protocol: this.protocol,
      port: this.port,
      allowInsecure: this.allowInsecure,
      redirect: this.redirect,
      securityStatus: this.securityStatus(),
    });
  }
}

function createEndpointPolicy(options) {
  return new EndpointPolicy(options);
}

module.exports = {
  EndpointPolicy,
  createEndpointPolicy,
  parseEndpoint,
  MEDIA_SECURITY_STATUS,
  REDIRECT_MODE,
};
