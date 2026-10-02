"use strict";
const { geoError } = require("./geo-knowledge-schema");
const { coding: CODING_BASE_URL, standard: STANDARD_BASE_URL } = require("../domain/doubao-geo-endpoints.json");
const LEGACY_CODING_BASE_URL =
  "https://ark.cn-beijing.volces.com/api/coding/v3";
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
