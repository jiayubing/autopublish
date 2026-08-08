"use strict";

const domain = require("../../src/domain");

function safeError(code, category, retryability, userMessage) {
  return { code, category, retryability, userMessage };
}
function missingSystemSubmissionId() {
  return {
    kind: "order_rejected",
    error: safeError(
      "MEDIA_SYSTEM_SUBMISSION_ID_REQUIRED",
      "validation",
      "never",
      "媒体投稿缺少全局系统投稿标识，已阻止下单",
    ),
  };
}
function invalidMediaConfiguration(code) {
  return {
    kind: "configuration_error",
    error: safeError(
      code || "MEDIA_CONFIG_INVALID",
      "validation",
      "never",
      "媒体服务配置无效，未发起投稿请求",
    ),
  };
}
function invalidMediaInput(code) {
  return {
    kind: "invalid_input",
    error: safeError(
      code || "MEDIA_SUPPLIER_INPUT_INVALID",
      "validation",
      "never",
      "媒体投稿输入无效，未发起投稿请求",
    ),
  };
}
function remoteId(response) {
  const data = (response && response.data) || {};
  const nested = (data && data.data) || {};
  const value =
    data.order_nid ||
    data.orderNid ||
    nested.order_nid ||
    nested.orderNid ||
    (response && (response.order_nid || response.orderNid));
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}
function explicitlyRejected(response) {
  const data = (response && response.data) || {};
  const code =
    response && (response.code !== undefined ? response.code : response.status);
  return (
    !response ||
    response.ok === false ||
    response.success === false ||
    data.ok === false ||
    data.success === false ||
    (Number.isFinite(Number(code)) && Number(code) >= 400)
  );
}
function createMediaPublisher(options) {
  const value = options || {};
  if (
    typeof value.clientProvider !== "function" &&
    typeof value.supplierProvider !== "function"
  )
    throw new Error("Media publisher supplier provider is required");
  return Object.freeze({
    // Media targets carry a resource identity rather than an account profile;
    // account inspection is intentionally not used by PublicationWorkflow for
    // this target kind.
    inspectAccount: async function () {
      return { verified: false };
    },
    publish: async function (input) {
      const target = domain.parsePublicationTarget(input.target);
      if (target.kind !== "media")
        return {
          kind: "invalid_input",
          error: safeError(
            "MEDIA_TARGET_REQUIRED",
            "validation",
            "never",
            "媒体目标无效",
          ),
        };
      if (typeof value.supplierProvider === "function") {
        return publishThroughSupplier(value, input, target);
      }
      let response;
      try {
        const configuredThirdId =
          typeof value.thirdIdProvider === "function"
            ? value.thirdIdProvider()
            : null;
        const thirdId =
          typeof configuredThirdId === "string" && configuredThirdId.trim()
            ? configuredThirdId.trim()
            : null;
        if (!thirdId) return missingSystemSubmissionId();
        response = await value
          .clientProvider()
          .sendArticle({
            resourceId: target.mediaResourceId,
            title: input.title,
            content: input.body,
            thirdId,
          });
      } catch (_) {
        return {
          kind: "uncertain",
          error: safeError(
            "MEDIA_REMOTE_UNCERTAIN",
            "transport",
            "manual-check",
            "无法确认媒体投稿结果",
          ),
        };
      }
      if (explicitlyRejected(response))
        return {
          kind: "order_rejected",
          error: safeError(
            "MEDIA_REMOTE_REJECTED",
            "remote",
            "safe",
            "媒体投稿被远端拒绝",
          ),
        };
      const id = remoteId(response);
      if (!id)
        return {
          kind: "uncertain",
          error: safeError(
            "MEDIA_ORDER_EVIDENCE_REQUIRED",
            "remote",
            "manual-check",
            "未获得可核验订单凭证",
          ),
        };
      return {
        kind: "order_created",
        orderId: id,
      };
    },
  });
}

async function publishThroughSupplier(options, input, target) {
  let result;
  let configured;
  try {
    configured =
      typeof options.systemSubmissionIdProvider === "function"
        ? options.systemSubmissionIdProvider()
        : typeof options.thirdIdProvider === "function"
          ? options.thirdIdProvider()
          : null;
  } catch (_) {
    return invalidMediaConfiguration();
  }
  const systemSubmissionId =
    typeof configured === "string" && configured.trim()
      ? configured.trim()
      : null;
  if (!systemSubmissionId) return missingSystemSubmissionId();
  let supplier;
  try {
    supplier = options.supplierProvider();
  } catch (_) {
    return invalidMediaConfiguration();
  }
  if (!supplier || typeof supplier.createOrder !== "function")
    return invalidMediaConfiguration("MEDIA_SUPPLIER_PORT_UNAVAILABLE");
  try {
    result = await supplier.createOrder({
      mediaResourceId: target.mediaResourceId,
      title: input.title,
      htmlBody: input.body,
      ...(typeof input.remark === "string" && input.remark.trim()
        ? { remark: input.remark.trim() }
        : {}),
      systemSubmissionId,
    });
  } catch (_) {
    return {
      kind: "uncertain",
      error: safeError(
        "MEDIA_REMOTE_UNCERTAIN",
        "transport",
        "manual-check",
        "无法确认媒体投稿结果",
      ),
    };
  }

  if (result && result.kind === "order_created" && result.orderId) {
    return {
      kind: "order_created",
      orderId: String(result.orderId),
    };
  }
  if (result && result.kind === "order_rejected") {
    return {
      kind: "order_rejected",
      error: safeError(
        "MEDIA_REMOTE_REJECTED",
        "remote",
        "safe",
        "媒体投稿被远端拒绝",
      ),
    };
  }
  if (result && result.kind === "configuration_error") {
    return invalidMediaConfiguration(result.error && result.error.code);
  }
  if (result && result.kind === "invalid_input") {
    return invalidMediaInput(result.error && result.error.code);
  }
  return {
    kind: "uncertain",
    error: safeError(
      "MEDIA_REMOTE_UNCERTAIN",
      "transport",
      "manual-check",
      "无法确认媒体投稿结果",
    ),
  };
}
module.exports = { createMediaPublisher };
