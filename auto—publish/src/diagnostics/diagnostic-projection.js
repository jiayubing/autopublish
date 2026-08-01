"use strict";

const {
  parseDiagnosticRecord,
  CATEGORIES,
  isSafeDiagnosticText,
} = require("./diagnostic-schema");

const DEFAULT_MESSAGES = Object.freeze({
  validation: "输入或配置未通过校验，请检查后重试。",
  authentication: "登录状态未通过校验，请重新登录。",
  transport: "运行环境通信失败，请检查诊断信息。",
  remote: "远端操作未完成，请根据任务状态处理。",
  storage: "本地存储操作未完成，请检查诊断信息。",
  conflict: "当前操作与已有任务冲突，请根据任务状态处理。",
  internal: "操作未能安全完成，请检查诊断信息。",
});

function safeMessage(value, fallback) {
  return isSafeDiagnosticText(value, 256)
    ? value.trim()
    : fallback;
}

function projectDiagnostic(input, options) {
  const record = parseDiagnosticRecord(input);
  const opts = options || {};
  const messages = opts.messages || {};
  const userMessage = safeMessage(
    messages[record.code],
    DEFAULT_MESSAGES[record.category] || DEFAULT_MESSAGES.internal,
  );
  return Object.freeze({
    diagnosticId: record.diagnosticId,
    userMessage,
    summary: Object.freeze({
      code: record.code,
      category: CATEGORIES.has(record.category) ? record.category : "internal",
    }),
  });
}

function projectDiagnostics(records, options) {
  if (!Array.isArray(records)) return Object.freeze([]);
  const limit = Number.isSafeInteger(options && options.limit) && options.limit > 0
    ? Math.min(options.limit, 100)
    : 100;
  const result = [];
  records.slice(-limit).forEach(function (record) {
    try { result.push(projectDiagnostic(record, options)); } catch (_) {}
  });
  return Object.freeze(result);
}

module.exports = {
  DEFAULT_MESSAGES,
  projectDiagnostic,
  projectDiagnostics,
};
