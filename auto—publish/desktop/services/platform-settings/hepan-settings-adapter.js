"use strict";

const { HEPAN_GEO_API_URL, createHepanGeoApiClient } = require("../../../src/platforms/hepan/api-client");

function fail(code) { const error = new Error(code); error.code = code; return error; }
function normalizeConfig(input) {
  const value = input || {};
  const uid = typeof value.uid === "string" && /^\d+$/.test(value.uid.trim()) ? Number(value.uid.trim()) : value.uid;
  const password = typeof value.password === "string" ? value.password : "";
  if (!Number.isSafeInteger(uid) || uid < 1 || password.length < 1 || password.length > 1024) throw fail("PLATFORM_CONFIG_INVALID");
  return Object.freeze({ uid, password });
}
function integer(value) { return Number.isSafeInteger(value) && value >= 0 ? value : undefined; }

function createHepanSettingsAdapter(context) {
  const value = context || {};
  const createClient = value.createHepanGeoApiClient || createHepanGeoApiClient;
  const client = createClient(value.apiClientOptions || {});
  const adapter = {
    id: "hepan",
    fileName: "hepan-geo-api-provider.json",
    secretFields: ["password"],
    schema: { uid: { type: "integer", required: true, min: 1 }, password: { type: "string", required: true, nonEmpty: true } },
    validate: normalizeConfig,
    status(config, statusContext) {
      const configured = Boolean(config);
      return { source: statusContext.source, configured, uid: configured ? config.uid : 0, uidConfigured: configured, passwordConfigured: configured && Boolean(config.password), apiUrl: HEPAN_GEO_API_URL, lastTest: statusContext.lastTest || null };
    },
    environment(env) {
      const source = env || {};
      if (!source.HEPAN_UID && !source.HEPAN_PASSWORD) return null;
      return normalizeConfig({ uid: source.HEPAN_UID, password: source.HEPAN_PASSWORD });
    },
    async test(config) {
      const response = await client.status(normalizeConfig(config));
      const data = response.data || {};
      if (!Number.isSafeInteger(data.uid) || data.uid < 1) throw fail("HEPAN_GEO_API_PROTOCOL_ERROR");
      const result = { ok: true, code: "HEPAN_GEO_API_OK", authenticated: true, publishAccess: true, stage: "publish_access", account: { displayName: `蓝色河畔 UID ${data.uid}`, uid: String(data.uid) } };
      if (typeof data.plan_name === "string" && data.plan_name.trim()) result.planName = data.plan_name.trim();
      const postLimit = integer(data.post_limit), usedCount = integer(data.used_count), remainingCount = integer(data.remaining_count);
      if (postLimit !== undefined) result.postLimit = postLimit;
      if (usedCount !== undefined) result.usedCount = usedCount;
      if (remainingCount !== undefined) result.remainingCount = remainingCount;
      return result;
    },
    createStore(storeOptions) {
      const { createPlatformProviderConfigStore } = require("../../platform-provider-config-store");
      return createPlatformProviderConfigStore({ ...(storeOptions || {}), fileName: "hepan-geo-api-provider.json", schema: adapter.schema, secretFields: adapter.secretFields });
    },
    errorCode(error) { return error && /^HEPAN_[A-Z0-9_]+$/.test(error.code || "") ? error.code : "HEPAN_GEO_API_UNAVAILABLE"; },
  };
  return adapter;
}
module.exports = { HEPAN_GEO_API_URL, createHepanSettingsAdapter };
