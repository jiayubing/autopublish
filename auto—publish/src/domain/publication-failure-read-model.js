"use strict";

const SAFE_REASON_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;

const SUMMARIES = Object.freeze({
  ARTICLE_REJECTED: "平台明确拒绝了这篇文章，请检查内容后从投稿入口重新发起。",
  CONTENT_REJECTED: "平台明确拒绝了这篇文章，请检查内容后从投稿入口重新发起。",
  LOGIN_REQUIRED:
    "平台账号或登录状态无法完成投稿，请检查后从投稿入口重新发起。",
  ACCOUNT_UNAVAILABLE: "平台账号当前不可用，请检查后从投稿入口重新发起。",
  PLATFORM_UNAVAILABLE: "平台当前无法接受投稿，请稍后从投稿入口重新发起。",
  HEPAN_REQUEST_INVALID: "投稿参数有误",
  HEPAN_CREDENTIALS_INVALID: "账号或密码错误",
  HEPAN_PLAN_UNAVAILABLE: "当前账号没有发帖权限或套餐已到期",
  HEPAN_QUOTA_EXHAUSTED: "当前周期发帖额度已用完",
  HEPAN_CONTENT_REJECTED: "内容审核未通过",
  HEPAN_PUBLISH_DISABLED: "平台暂时无法发布",
  HEPAN_RATE_LIMITED: "请求过于频繁，请稍后再试",
  HEPAN_REMOTE_SERVER_ERROR: "平台服务器异常，请稍后再试",
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
