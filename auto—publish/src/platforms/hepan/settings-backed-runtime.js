"use strict";

const crypto = require("node:crypto");
const domain = require("../../domain");
const { createHepanGeoApiClient } = require("./api-client");
const { toHepanBbcode } = require("./bbcode");

function fail(code) { const error = new Error(code); error.code = code; return error; }
function requireSettingsService(provider) {
  const service = typeof provider === "function" ? provider() : null;
  if (!service || typeof service.getAdapterForRuntime !== "function") throw fail("HEPAN_CONFIG_NOT_SET");
  return service;
}
function idempotencyKey(attemptId) {
  return `autopublish-${crypto.createHash("sha256").update(String(attemptId), "utf8").digest("hex").slice(0, 40)}`;
}
function validAid(value) { return Number.isSafeInteger(value) && value > 0; }
function mapPublishError(error) {
  const code = error && error.code;
  if (["HEPAN_REQUEST_INVALID", "HEPAN_CONTENT_REJECTED"].includes(code))
    return Object.freeze({ status: "article_rejected", errorCode: code === "HEPAN_CONTENT_REJECTED" ? "HEPAN_CONTENT_REJECTED" : "REGULAR_CONTENT_INVALID" });
  if (["HEPAN_CREDENTIALS_INVALID", "HEPAN_PLAN_UNAVAILABLE", "HEPAN_QUOTA_EXHAUSTED", "HEPAN_PUBLISH_DISABLED", "HEPAN_RATE_LIMITED", "HEPAN_CONFIG_NOT_SET"].includes(code))
    return Object.freeze({ status: "group_blocked", errorCode: code, articleRecoverable: true });
  return Object.freeze({ status: "uncertain", errorCode: typeof code === "string" && /^HEPAN_[A-Z0-9_]+$/.test(code) ? code : "REMOTE_RESULT_UNKNOWN" });
}

function createHepanSettingsBackedRuntime(options) {
  const value = options || {};
  const getSettingsService = value.getPlatformSettingsService;
  const createClient = value.createHepanGeoApiClient || createHepanGeoApiClient;
  const apiClient = createClient(value.apiClientOptions || {});
  function runtimeConfig() {
    const runtime = requireSettingsService(getSettingsService).getAdapterForRuntime("hepan");
    if (!runtime || !runtime.config) throw fail("HEPAN_CONFIG_NOT_SET");
    return runtime.config;
  }
  return Object.freeze({
    regularSubmission: Object.freeze({
      async preparePlatformSubmission(claim) {
        const evidence = domain.createTextOnlyPreparedSubmissionEvidenceV1(claim);
        if ([...evidence.title].length > 80) throw fail("REGULAR_CONTENT_INVALID");
        const message = toHepanBbcode(evidence.body);
        if (!message) throw fail("REGULAR_CONTENT_INVALID");
        const publishInput = Object.freeze({ subject: evidence.title, message, idempotencyKey: idempotencyKey(evidence.attemptId) });
        let consumed = false;
        return domain.createPreparedSubmission({
          preparedSubmissionEvidenceV1: evidence,
          async submitPreparedPublication() {
            if (consumed) return Object.freeze({ status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" });
            consumed = true;
            try {
              const response = await apiClient.publish(runtimeConfig(), publishInput);
              const data = response.data || {};
              if (!validAid(data.aid)) return Object.freeze({ status: "uncertain", errorCode: "HEPAN_GEO_API_PROTOCOL_ERROR" });
              const remoteId = String(data.aid);
              const remoteUrl = typeof data.url === "string" && data.url.trim() ? data.url.trim() : undefined;
              if (data.review_status === "published") return Object.freeze({ status: "accepted", remoteId, ...(remoteUrl ? { remoteUrl } : {}) });
              if (["pending", "draft"].includes(data.review_status)) return Object.freeze({ status: "remote_pending", errorCode: "HEPAN_REMOTE_PENDING", remoteId });
              if (data.review_status === "rejected") return Object.freeze({ status: "article_rejected", errorCode: "HEPAN_CONTENT_REJECTED" });
              if (data.review_status === "deleted") return Object.freeze({ status: "article_rejected", errorCode: "HEPAN_REMOTE_DELETED" });
              return Object.freeze({ status: "uncertain", errorCode: "HEPAN_REVIEW_STATUS_UNKNOWN" });
            } catch (error) { return mapPublishError(error); }
          },
        });
      },
    }),
    accountInspection: Object.freeze({
      async prepare() {},
      async inspect() {
        const settingsService =
          typeof getSettingsService === "function" ? getSettingsService() : null;
        if (!settingsService || typeof settingsService.test !== "function")
          throw fail("HEPAN_CONFIG_NOT_SET");
        const result = await settingsService.test("hepan", {});
        const account = result && result.ok === true ? result.account : null;
        const remoteAccountId =
          account && /^\d{1,20}$/.test(String(account.uid || ""))
            ? String(account.uid)
            : "";
        if (!remoteAccountId) return Object.freeze({ verified: false });
        const displayName =
          typeof account.displayName === "string" && account.displayName.trim()
            ? account.displayName.trim()
            : `蓝色河畔 UID ${remoteAccountId}`;
        return Object.freeze({
          verified: true,
          remoteAccountId,
          displayName,
        });
      },
    }),
  });
}
module.exports = { createHepanSettingsBackedRuntime, idempotencyKey };
