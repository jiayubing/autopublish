"use strict";

const { load } = require("cheerio");

const domain = require("../../domain");
const { decodeLiejuHttpHtml } = require("./http-form-parser");

const DETAIL_PATH = /\/(?:[^\/?#]+\/)*([0-9]{1,20})\.html$/i;
const SUCCESS_PATTERN =
  /(?:发布|提交|投稿)成功|(?:publish|submit|submission)\s+success/i;
const REJECTION_PATTERN = [
  "发布失败",
  "提交失败",
  "投稿失败",
  "发布被拒绝",
  "提交被拒绝",
  "投稿被拒",
  "不能发布",
  "无法发布",
  "重复投稿",
  "标题不能为空",
  "内容不能为空",
  "publish failed",
  "submit failed",
  "submission failed",
  "cannot publish",
  "unable to publish",
  "title is required",
  "content is required",
  "rejected",
].join("|");

function accepted(identity) {
  return Object.freeze({ status: "accepted", ...identity });
}

function uncertain() {
  return Object.freeze({
    status: "uncertain",
    errorCode: "REMOTE_RESULT_UNKNOWN",
  });
}

function isLiejuHostname(value) {
  const hostname = String(value || "").toLowerCase();
  return hostname === "lieju.com" || hostname.endsWith(".lieju.com");
}

function normalizeLiejuDetailUrl(value) {
  const normalized = domain.normalizePublishedArticleUrl(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (!isLiejuHostname(url.hostname)) return null;
    const match = url.pathname.match(DETAIL_PATH);
    if (!match) return null;
    return Object.freeze({ remoteId: match[1], remoteUrl: normalized });
  } catch (_) {
    return null;
  }
}

function isLoginUrl(value) {
  try {
    const url = new URL(value);
    return isLiejuHostname(url.hostname) && /^\/login\/?$/i.test(url.pathname);
  } catch (_) {
    return false;
  }
}

function responseText(html) {
  const $ = load(html, { decodeEntities: true });
  $("script, style, template, noscript").remove();
  return $.root().text().replace(/\s+/g, " ").trim();
}

function detailLinkFromHtml(html, baseUrl) {
  const $ = load(html, { decodeEntities: true });
  $("script, style, template, noscript").remove();
  const links = $("a[href]").toArray();
  for (const link of links) {
    const href = $(link).attr("href");
    if (!href) continue;
    try {
      const identity = normalizeLiejuDetailUrl(
        new URL(href, baseUrl).toString(),
      );
      if (identity) return identity;
    } catch (_) {
      // Invalid markup cannot provide a verified remote identity.
    }
  }
  return null;
}

function classifyLiejuHttpSubmitResponse(response) {
  const value = response && typeof response === "object" ? response : {};
  if (value.status === 401 || value.status === 403)
    return Object.freeze({
      status: "group_blocked",
      errorCode: "LOGIN_REQUIRED",
      articleRecoverable: true,
    });

  if (isLoginUrl(value.redirectUrl) || isLoginUrl(value.url))
    return Object.freeze({
      status: "group_blocked",
      errorCode: "LOGIN_REQUIRED",
      articleRecoverable: true,
    });

  const redirectedIdentity = normalizeLiejuDetailUrl(value.redirectUrl);
  if (redirectedIdentity) return accepted(redirectedIdentity);
  const directIdentity = normalizeLiejuDetailUrl(value.url);
  if (directIdentity) return accepted(directIdentity);

  const decoded = decodeLiejuHttpHtml(value);
  const text = responseText(decoded.html);
  if (/(?:请先)?(?:登录|登陆)|\blogin\b/i.test(text))
    return Object.freeze({
      status: "group_blocked",
      errorCode: "LOGIN_REQUIRED",
      articleRecoverable: true,
    });
  if (/(?:验证码|人机验证|安全验证|滑块验证|captcha)/i.test(text))
    return Object.freeze({
      status: "group_blocked",
      errorCode: "CAPTCHA_REQUIRED",
      articleRecoverable: true,
    });
  if (/(?:风险控制|风控|访问过于频繁|操作过于频繁|请求过于频繁)/i.test(text))
    return Object.freeze({
      status: "group_blocked",
      errorCode: "RISK_CONTROL_REQUIRED",
      articleRecoverable: true,
    });
  if (new RegExp(REJECTION_PATTERN, "i").test(text))
    return Object.freeze({
      status: "article_rejected",
      errorCode: "REMOTE_REJECTED",
    });
  if (SUCCESS_PATTERN.test(text)) {
    const identity = detailLinkFromHtml(decoded.html, value.url);
    if (identity) return accepted(identity);
  }
  return uncertain();
}

module.exports = Object.freeze({
  classifyLiejuHttpSubmitResponse,
  normalizeLiejuDetailUrl,
});
