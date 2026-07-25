"use strict";
const domain = require("../../domain");

function safeError(code, category, message) {
  return { code, category, retryability: "manual-check", userMessage: message };
}
function createLegacyAdapterPublisher(options) {
  const value = options || {};
  if (!value.adapter || typeof value.adapter.publishArticle !== "function")
    throw new Error("Publisher adapter is required");
  return domain.validatePublisher({
    inspectAccount: async function () {
      return Object.freeze({
        accountProfileId: value.accountProfileId || "unknown-account",
        displayName: value.displayName || value.adapter.id || "Platform",
        verified: false,
      });
    },
    publish: async function (input, signal) {
      if (signal && signal.aborted)
        return {
          status: "failed",
          error: safeError("PUBLISH_ABORTED", "transport", "投稿已取消"),
        };
      let raw;
      try {
        raw = await value.adapter.publishArticle(
          { title: input.title, body: input.body },
          { autoSubmit: true, signal },
        );
      } catch (_) {
        return {
          status: "uncertain",
          error: safeError(
            "PUBLISHER_LEGACY_EXCEPTION",
            "remote",
            "无法确认远端投稿结果",
          ),
        };
      }
      if (raw && raw.status === "failed")
        return {
          status: "failed",
          error: safeError(
            raw.errorCode || "PUBLISHER_REJECTED",
            "remote",
            "远端拒绝投稿",
          ),
        };
      return {
        status: "uncertain",
        error: safeError(
          "PUBLISHER_EVIDENCE_REQUIRED",
          "remote",
          "缺少可验证的远端投稿证据",
        ),
      };
    },
  });
}
module.exports = { createLegacyAdapterPublisher };
