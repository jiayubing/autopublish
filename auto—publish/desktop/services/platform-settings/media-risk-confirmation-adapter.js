"use strict";

const {
  EndpointPolicy,
  parseEndpoint,
} = require("../../../src/platforms/media/endpoint-policy");

class MediaRiskConfirmationAdapter {
  constructor(options) {
    const values = options || {};
    this.clock = typeof values.clock === "function" ? values.clock : () => new Date().toISOString();
    this.records = new Map();
  }

  confirm(endpoint) {
    const parsed = parseEndpoint(endpoint);
    if (parsed.protocol !== "http:") return null;
    const record = Object.freeze({
      endpoint: parsed.endpoint,
      endpointKey: parsed.endpointKey,
      confirmedAt: String(this.clock()),
    });
    this.records.set(parsed.endpointKey, record);
    return record;
  }

  isConfirmed(endpoint, context) {
    let parsed;
    try {
      parsed = parseEndpoint(endpoint);
    } catch (_) {
      return false;
    }
    if (parsed.protocol !== "http:") return false;
    const values = context || {};
    const persisted = values.persistedEndpoint || values.confirmedEndpoint || "";
    if (persisted) {
      try {
        return parseEndpoint(persisted).endpointKey === parsed.endpointKey;
      } catch (_) {
        return false;
      }
    }
    return this.records.has(parsed.endpointKey);
  }

  invalidate(endpoint) {
    try {
      this.records.delete(parseEndpoint(endpoint).endpointKey);
    } catch (_) {}
  }

  clear() {
    this.records.clear();
  }

  createPolicy(options) {
    const values = options || {};
    const persistedEndpoint = values.insecureEndpoint || values.confirmedEndpoint || "";
    return new EndpointPolicy({
      endpoint: values.endpoint,
      allowInsecure: values.allowInsecure,
      insecureEndpoint: persistedEndpoint,
      confirmation: {
        isConfirmed: (endpoint, context) => this.isConfirmed(endpoint, {
          persistedEndpoint,
          endpoint,
          context,
        }),
      },
    });
  }
}

function createMediaRiskConfirmationAdapter(options) {
  return new MediaRiskConfirmationAdapter(options);
}

module.exports = {
  MediaRiskConfirmationAdapter,
  createMediaRiskConfirmationAdapter,
};
