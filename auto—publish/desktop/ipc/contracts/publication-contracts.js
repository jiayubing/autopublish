const {
  arrayField,
  defineContract,
  enumField,
  exactObject,
  literalField,
  optionalField,
  stringField,
} = require("./registry");

const code = stringField({
  min: 1,
  max: 128,
  pattern: /^[A-Z0-9][A-Z0-9_.:-]*$/u,
});
const safeText = (max, min = 0) =>
  stringField({ min, max, pattern: /^[^\x00-\x1f\x7f\\]*$/u });
const remoteUrl = stringField({
  min: 1,
  max: 2048,
  pattern: /^https?:\/\/[^\s\\]+$/u,
});
const regularAttemptId = stringField({
  min: 1,
  max: 200,
  pattern: /^[A-Za-z0-9_.:-]+$/u,
});
const confirmationToken = stringField({
  min: 1,
  max: 256,
  pattern: /^[A-Za-z0-9_.:-]+$/u,
});
const regularTimestamp = safeText(64, 1);

const COMMON_ERRORS = {
  AUTH_REQUIRED: {
    category: "authentication",
    retryability: "never",
    userMessage: "请先完成登录后再继续。",
  },
  IPC_REQUEST_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "发布记录请求无效，请刷新页面后重试。",
  },
  IPC_RESULT_INVALID: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "发布记录结果未通过安全校验，请刷新后重试。",
  },
  IPC_INTERNAL: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "发布记录操作未能安全完成，请检查诊断信息。",
  },
};
const OWNED_ERRORS = {
  REGULAR_OUTCOME_SERVICE_UNAVAILABLE: "普通平台结果核对服务不可用。",
  REGULAR_OUTCOME_INPUT_INVALID: "普通平台结果核对输入无效。",
  REGULAR_OUTCOME_RESULT_INVALID: "普通平台结果核对输出无效。",
  REGULAR_OUTCOME_CONFIRMATION_REQUIRED: "普通平台结果核对需要明确确认。",
  REGULAR_SUBMISSION_ATTEMPT_NOT_FOUND: "普通平台投稿尝试不存在。",
  REGULAR_UNCERTAIN_RESOLUTION_NOT_AVAILABLE: "普通平台结果当前不可核对。",
  REGULAR_UNCERTAIN_EVIDENCE_INSUFFICIENT: "普通平台结果缺少可绑定证据。",
  REGULAR_UNCERTAIN_RESOLUTION_TOKEN_STALE:
    "普通平台核对令牌已失效，请重新准备。",
  REGULAR_UNCERTAIN_RESOLUTION_STATE_STALE: "普通平台事实已变化，请重新准备。",
  REGULAR_UNCERTAIN_RESOLUTION_OPPOSITE: "普通平台结果已按相反决定收口。",
  REGULAR_MANUAL_POSITIVE_EVIDENCE_REQUIRED: "确认已接受需要安全人工证据。",
  REGULAR_MANUAL_NEGATIVE_EVIDENCE_REQUIRED: "确认未接受需要安全人工证据。",
  REGULAR_OUTCOME_TIME_INVALID: "普通平台结果时间无效。",
  REGULAR_OUTCOME_CONFLICT: "普通平台结果存在事实冲突。",
  REGULAR_OUTCOME_EVIDENCE_INVALID: "普通平台结果证据无效。",
};
const errors = Object.freeze({
  ...COMMON_ERRORS,
  ...Object.fromEntries(
    Object.entries(OWNED_ERRORS).map(([errorCode, userMessage]) => [
      errorCode,
      { category: "validation", retryability: "never", userMessage },
    ]),
  ),
});
const errorCodes = Object.freeze(Object.keys(errors));
const directArgs = (args) => args[0] || {};
const directInput = (payload) => [payload];

const publicationContracts = Object.freeze([
  defineContract({
    capability: "publication.prepareRegularUncertainResolution",
    channel: "publication:prepare-regular-uncertain-resolution",
    feature: "content",
    kind: "command",
    request: exactObject({
      regularPublicationAttemptId: regularAttemptId,
    }),
    success: exactObject({
      regularPublicationAttemptId: regularAttemptId,
      confirmationToken,
      expiresAt: regularTimestamp,
      actions: arrayField(
        enumField(["confirm_accepted", "confirm_not_accepted"]),
        { min: 1, max: 2 },
      ),
      observationFingerprint: stringField({ min: 1, max: 128 }),
      preparedEvidenceFingerprint: stringField({ min: 1, max: 128 }),
    }),
    fromArgs: directArgs,
    toArgs: directInput,
    errors,
    errorCodes,
  }),
  defineContract({
    capability: "publication.confirmRegularAccepted",
    channel: "publication:confirm-regular-accepted",
    feature: "content",
    kind: "command",
    request: exactObject({
      regularPublicationAttemptId: regularAttemptId,
      confirmationToken,
      manualPositiveEvidence: exactObject({
        observedAt: regularTimestamp,
        remoteUrl: optionalField(remoteUrl),
      }),
      confirmed: literalField(true),
    }),
    success: exactObject({
      attemptId: regularAttemptId,
      status: enumField(["published"]),
      idempotent: optionalField("boolean"),
      firstWins: optionalField("boolean"),
    }),
    fromArgs: directArgs,
    toArgs: directInput,
    errors,
    errorCodes,
  }),
  defineContract({
    capability: "publication.confirmRegularNotAccepted",
    channel: "publication:confirm-regular-not-accepted",
    feature: "content",
    kind: "command",
    request: exactObject({
      regularPublicationAttemptId: regularAttemptId,
      confirmationToken,
      manualNegativeEvidence: exactObject({
        reasonCode: code,
        observedAt: regularTimestamp,
      }),
      confirmed: literalField(true),
    }),
    success: exactObject({
      attemptId: regularAttemptId,
      status: enumField(["not_accepted"]),
      idempotent: optionalField("boolean"),
      firstWins: optionalField("boolean"),
    }),
    fromArgs: directArgs,
    toArgs: directInput,
    errors,
    errorCodes,
  }),
]);

module.exports = { publicationContracts };
