"use strict";

const domain = require("../../src/domain");

function safeError(code, category, retryability, userMessage) {
  return { code, category, retryability, userMessage };
}
function remoteId(response) {
  const data = response && response.data || {};
  const nested = data && data.data || {};
  const value = data.order_nid || data.orderNid || nested.order_nid || nested.orderNid || response && (response.order_nid || response.orderNid);
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}
function explicitlyRejected(response) {
  const data = response && response.data || {};
  const code = response && (response.code !== undefined ? response.code : response.status);
  return !response || response.ok === false || response.success === false || data.ok === false || data.success === false || (Number.isFinite(Number(code)) && Number(code) >= 400);
}
function createMediaPublisher(options) {
  const value = options || {};
  if (typeof value.clientProvider !== "function" && typeof value.supplierProvider !== "function") throw new Error("Media publisher supplier provider is required");
  return Object.freeze({
    // Media targets carry a resource identity rather than an account profile;
    // account inspection is intentionally not used by PublicationWorkflow for
    // this target kind.
    inspectAccount: async function() { return { verified: false }; },
    publish: async function(input) {
      const target = domain.parsePublicationTarget(input.target);
      if (target.kind !== "media") return { status: "failed", error: safeError("MEDIA_TARGET_REQUIRED", "validation", "never", "媒体目标无效") };
      if (typeof value.supplierProvider === "function") {
        return publishThroughSupplier(value, input, target);
      }
      let response;
      try {
        const configuredThirdId = typeof value.thirdIdProvider === "function" ? value.thirdIdProvider() : null;
        const thirdId = typeof configuredThirdId === "string" && configuredThirdId.trim() ? configuredThirdId.trim() : input.attemptId;
        response = await value.clientProvider().sendArticle({ resourceId: target.mediaResourceId, title: input.title, content: input.body, thirdId });
      } catch (_) {
        return { status: "uncertain", error: safeError("MEDIA_REMOTE_UNCERTAIN", "transport", "manual-check", "无法确认媒体投稿结果") };
      }
      if (explicitlyRejected(response)) return { status: "failed", error: safeError("MEDIA_REMOTE_REJECTED", "remote", "safe", "媒体投稿被远端拒绝") };
      const id = remoteId(response);
      if (!id) return { status: "uncertain", error: safeError("MEDIA_ORDER_EVIDENCE_REQUIRED", "remote", "manual-check", "未获得可核验订单凭证") };
      return { status: "submitted", evidence: { articleId: input.articleId, attemptId: input.attemptId, targetKey: domain.publicationTargetKey(target), remoteId: id } };
    },
  });
}

async function publishThroughSupplier(options, input, target) {
  let result;
  try {
    const configured = typeof options.systemSubmissionIdProvider === "function"
      ? options.systemSubmissionIdProvider()
      : typeof options.thirdIdProvider === "function"
        ? options.thirdIdProvider()
        : null;
    const systemSubmissionId = typeof configured === "string" && configured.trim()
      ? configured.trim()
      : input.attemptId;
    const supplier = options.supplierProvider();
    if (!supplier || typeof supplier.createOrder !== "function") {
      return { status: "uncertain", error: safeError("MEDIA_REMOTE_UNCERTAIN", "transport", "manual-check", "无法确认媒体投稿结果") };
    }
    result = await supplier.createOrder({
      mediaResourceId: target.mediaResourceId,
      title: input.title,
      htmlBody: input.body,
      ...(typeof input.remark === "string" && input.remark.trim() ? { remark: input.remark.trim() } : {}),
      systemSubmissionId,
    });
  } catch (_) {
    return { status: "uncertain", error: safeError("MEDIA_REMOTE_UNCERTAIN", "transport", "manual-check", "无法确认媒体投稿结果") };
  }

  if (result && result.kind === "order_created" && result.orderId) {
    return {
      status: "submitted",
      evidence: {
        articleId: input.articleId,
        attemptId: input.attemptId,
        targetKey: domain.publicationTargetKey(target),
        remoteId: result.orderId,
      },
    };
  }
  if (result && result.kind === "order_rejected") {
    return { status: "failed", error: safeError("MEDIA_REMOTE_REJECTED", "remote", "safe", "媒体投稿被远端拒绝") };
  }
  return { status: "uncertain", error: safeError("MEDIA_REMOTE_UNCERTAIN", "transport", "manual-check", "无法确认媒体投稿结果") };
}
module.exports = { createMediaPublisher };
