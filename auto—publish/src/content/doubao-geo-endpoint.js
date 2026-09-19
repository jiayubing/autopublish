"use strict";
const { geoError } = require("./geo-knowledge-schema");
const CODING_BASE_URL = "https://ark.cn-beijing.volces.com/api/plan/v3";
const LEGACY_CODING_BASE_URL =
  "https://ark.cn-beijing.volces.com/api/coding/v3";
const STANDARD_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
function normalizeGeoBaseUrl(value) {
  if (typeof value !== "string") throw geoError("GEO_CONFIG_INVALID");
  const baseUrl = value.trim().replace(/\/$/, "");
  if (![CODING_BASE_URL, STANDARD_BASE_URL].includes(baseUrl))
    throw geoError("GEO_CONFIG_INVALID");
  return baseUrl;
}
module.exports = {
  CODING_BASE_URL,
  LEGACY_CODING_BASE_URL,
  STANDARD_BASE_URL,
  normalizeGeoBaseUrl,
};
