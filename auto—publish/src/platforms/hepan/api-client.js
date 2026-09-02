"use strict";

const HEPAN_GEO_API_URL = "https://www.hepan.com/geoapi/api.php";
const DEFAULT_TIMEOUT_MS = 30000;
const BUSINESS_ERRORS = Object.freeze({
  1001: "HEPAN_REQUEST_INVALID",
  1002: "HEPAN_CREDENTIALS_INVALID",
  1003: "HEPAN_PLAN_UNAVAILABLE",
  1004: "HEPAN_QUOTA_EXHAUSTED",
  1005: "HEPAN_CONTENT_REJECTED",
  1006: "HEPAN_PUBLISH_DISABLED",
  1007: "HEPAN_RATE_LIMITED",
  2000: "HEPAN_REMOTE_SERVER_ERROR",
});

function fail(code, requestId) {
  const error = new Error(code);
  error.code = code;
  if (typeof requestId === "string" && requestId.length > 0 && requestId.length <= 128 && !/[\u0000-\u001f\u007f]/.test(requestId))
    error.requestId = requestId;
  return error;
}

function credentials(config) {
  const value = config || {};
  if (!Number.isSafeInteger(value.uid) || value.uid < 1 || typeof value.password !== "string" || !value.password)
    throw fail("HEPAN_CONFIG_NOT_SET");
  return { uid: value.uid, password: value.password };
}

function createHepanGeoApiClient(options) {
  const value = options || {};
  const fetchImpl = value.fetch || globalThis.fetch;
  const apiUrl = value.apiUrl || HEPAN_GEO_API_URL;
  const timeoutMs = Number.isSafeInteger(value.timeoutMs) && value.timeoutMs >= 1000 && value.timeoutMs <= 120000
    ? value.timeoutMs
    : DEFAULT_TIMEOUT_MS;
  if (typeof fetchImpl !== "function") throw fail("HEPAN_GEO_API_UNAVAILABLE");

  async function request(action, payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (timer && typeof timer.unref === "function") timer.unref();
    let response;
    try {
      response = await fetchImpl(apiUrl, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(Object.assign({ action }, payload || {})),
        signal: controller.signal,
      });
    } catch (error) {
      throw fail(error && error.name === "AbortError" ? "HEPAN_GEO_API_TIMEOUT" : "HEPAN_GEO_API_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
    }
    if (!response || response.ok !== true) throw fail("HEPAN_GEO_API_UNAVAILABLE");
    let result;
    try { result = await response.json(); }
    catch (_) { throw fail("HEPAN_GEO_API_PROTOCOL_ERROR"); }
    if (!result || typeof result !== "object" || Array.isArray(result)) throw fail("HEPAN_GEO_API_PROTOCOL_ERROR");
    const requestId = typeof result.request_id === "string" ? result.request_id : undefined;
    if (result.success !== true || result.code !== 0) {
      const businessCode = Number(result.code);
      throw fail(BUSINESS_ERRORS[businessCode] || "HEPAN_GEO_API_PROTOCOL_ERROR", requestId);
    }
    if (!result.data || typeof result.data !== "object" || Array.isArray(result.data))
      throw fail("HEPAN_GEO_API_PROTOCOL_ERROR", requestId);
    return Object.freeze({ data: Object.freeze(Object.assign({}, result.data)), requestId: requestId || null });
  }

  return Object.freeze({
    async status(config) { return request("status", credentials(config)); },
    async publish(config, input) {
      const article = input || {};
      return request("publish", Object.assign({}, credentials(config), {
        subject: article.subject,
        message: article.message,
        ...(typeof article.tags === "string" && article.tags.trim() ? { tags: article.tags.trim() } : {}),
        idempotency_key: article.idempotencyKey,
      }));
    },
    async result(config, aid) {
      if (!Number.isSafeInteger(aid) || aid < 1) throw fail("HEPAN_REQUEST_INVALID");
      return request("result", Object.assign({}, credentials(config), { aid }));
    },
  });
}

module.exports = { HEPAN_GEO_API_URL, createHepanGeoApiClient };
