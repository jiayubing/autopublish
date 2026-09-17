const FAILURE_CATEGORIES = Object.freeze({
  REQUEST: "request",
  ACCOUNT: "account",
  PERMISSION: "permission",
  QUOTA: "quota",
  CONTENT_REVIEW: "content_review",
  TEMPORARY: "temporary",
  UNKNOWN: "unknown",
});

const REASON_CATEGORIES = Object.freeze({
  REQUEST_INVALID: FAILURE_CATEGORIES.REQUEST,
  CREDENTIALS_INVALID: FAILURE_CATEGORIES.ACCOUNT,
  LOGIN_REQUIRED: FAILURE_CATEGORIES.ACCOUNT,
  ACCOUNT_UNAVAILABLE: FAILURE_CATEGORIES.ACCOUNT,
  PLAN_UNAVAILABLE: FAILURE_CATEGORIES.PERMISSION,
  PUBLISH_DISABLED: FAILURE_CATEGORIES.PERMISSION,
  QUOTA_EXHAUSTED: FAILURE_CATEGORIES.QUOTA,
  CONTENT_REJECTED: FAILURE_CATEGORIES.CONTENT_REVIEW,
  ARTICLE_REJECTED: FAILURE_CATEGORIES.CONTENT_REVIEW,
  RATE_LIMITED: FAILURE_CATEGORIES.TEMPORARY,
  REMOTE_SERVER_ERROR: FAILURE_CATEGORIES.TEMPORARY,
  GEO_API_TIMEOUT: FAILURE_CATEGORIES.TEMPORARY,
  GEO_API_UNAVAILABLE: FAILURE_CATEGORIES.TEMPORARY,
  PLATFORM_UNAVAILABLE: FAILURE_CATEGORIES.TEMPORARY,
});

const NEXT_STEPS = Object.freeze({
  [FAILURE_CATEGORIES.REQUEST]: "检查投稿信息后重试，或改投其他平台",
  [FAILURE_CATEGORIES.ACCOUNT]: "请先检查平台账号设置",
  [FAILURE_CATEGORIES.PERMISSION]: "请先检查平台账号权限或套餐",
  [FAILURE_CATEGORIES.QUOTA]: "额度恢复后可重新投稿，或改投其他平台",
  [FAILURE_CATEGORIES.CONTENT_REVIEW]: "建议重新生成，或改投其他平台",
  [FAILURE_CATEGORIES.TEMPORARY]: "稍后重新投稿，或改投其他平台",
  [FAILURE_CATEGORIES.UNKNOWN]: "请查看详情后决定后续处理",
});

function reasonToken(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toUpperCase();
  return normalized.startsWith("HEPAN_")
    ? normalized.slice("HEPAN_".length)
    : normalized;
}

export function deriveAttentionFailureCapabilities(item) {
  const value = item || {};
  const regularFailure = value.kind === "regular_platform_failed";
  const category =
    REASON_CATEGORIES[reasonToken(value.reasonCode)] ||
    FAILURE_CATEGORIES.UNKNOWN;
  const hasArticleIdentity = Boolean(value.clientId && value.articleId);
  const canEnterSubmission =
    regularFailure &&
    hasArticleIdentity &&
    Array.isArray(value.allowedActions) &&
    value.allowedActions.includes("open-submission");

  return Object.freeze({
    category,
    nextStep: NEXT_STEPS[category],
    canRegenerate:
      regularFailure &&
      category === FAILURE_CATEGORIES.CONTENT_REVIEW &&
      canEnterSubmission,
    canRepostToAnotherPlatform:
      canEnterSubmission && category !== FAILURE_CATEGORIES.UNKNOWN,
    needsAccountSettings:
      category === FAILURE_CATEGORIES.ACCOUNT ||
      category === FAILURE_CATEGORIES.PERMISSION,
  });
}

export { FAILURE_CATEGORIES };
