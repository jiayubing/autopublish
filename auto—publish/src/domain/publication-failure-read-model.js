"use strict";

const SAFE_REASON_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;

const SUMMARIES = Object.freeze({
  ARTICLE_REJECTED: "平台明确拒绝了这篇文章，请检查内容后从投稿入口重新发起。",
  CONTENT_REJECTED: "平台明确拒绝了这篇文章，请检查内容后从投稿入口重新发起。",
  LOGIN_REQUIRED: "平台账号或登录状态无法完成投稿，请检查后从投稿入口重新发起。",
  ACCOUNT_UNAVAILABLE: "平台账号当前不可用，请检查后从投稿入口重新发起。",
  PLATFORM_UNAVAILABLE: "平台当前无法接受投稿，请稍后从投稿入口重新发起。",
});

function projectRegularPublicationFailure(reasonCode) {
  const code =
    typeof reasonCode === "string" && SAFE_REASON_CODE.test(reasonCode)
      ? reasonCode
      : "PUBLICATION_FAILURE_UNKNOWN";
  return Object.freeze({
    reasonCode: code,
    reasonSummary:
      SUMMARIES[code] ||
      "投稿未被平台接受，请检查投稿信息后从统一投稿入口重新发起。",
  });
}

module.exports = Object.freeze({ projectRegularPublicationFailure });
