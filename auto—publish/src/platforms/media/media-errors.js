"use strict";

const MEDIA_ERROR_DEFINITIONS = Object.freeze({
  MEDIA_ENDPOINT_REQUIRED: {
    category: "validation",
    retryability: "never",
    message: "媒体服务 endpoint 未配置",
  },
  MEDIA_CONFIG_INVALID: {
    category: "validation",
    retryability: "never",
    message: "媒体服务配置无效",
  },
  MEDIA_HTTP_CONFIRMATION_REQUIRED: {
    category: "validation",
    retryability: "never",
    message: "媒体 HTTP endpoint 需要针对当前地址的显式风险确认",
  },
  MEDIA_REDIRECT_REJECTED: {
    category: "transport",
    retryability: "never",
    message: "媒体服务重定向已拒绝",
  },
  MEDIA_TLS_CERTIFICATE_ERROR: {
    category: "transport",
    retryability: "manual-check",
    message: "媒体服务 TLS 证书校验失败",
  },
  MEDIA_TLS_HOSTNAME_MISMATCH: {
    category: "transport",
    retryability: "manual-check",
    message: "媒体服务 TLS 主机名校验失败",
  },
  MEDIA_CONNECT_TIMEOUT: {
    category: "transport",
    retryability: "safe",
    message: "媒体服务连接超时",
  },
  MEDIA_READ_TIMEOUT: {
    category: "transport",
    retryability: "manual-check",
    message: "媒体服务读取超时",
  },
  MEDIA_NETWORK_ERROR: {
    category: "transport",
    retryability: "manual-check",
    message: "媒体服务网络请求失败",
  },
  MEDIA_SERVER_ERROR: {
    category: "remote",
    retryability: "safe",
    message: "媒体服务暂时异常",
  },
  MEDIA_REMOTE_REJECTED: {
    category: "remote",
    retryability: "never",
    message: "媒体服务拒绝了请求",
  },
  MEDIA_PROTOCOL_ERROR: {
    category: "transport",
    retryability: "manual-check",
    message: "媒体服务响应格式无效",
  },
  MEDIA_TRANSPORT_UNAVAILABLE: {
    category: "internal",
    retryability: "manual-check",
    message: "媒体传输能力不可用",
  },
  MEDIA_CONNECTION_FAILED: {
    category: "transport",
    retryability: "safe",
    message: "媒体服务连接测试失败",
  },
  MEDIA_SUPPLIER_INPUT_INVALID: {
    category: "validation",
    retryability: "never",
    message: "媒体供应商请求参数无效",
  },
  MEDIA_SUPPLIER_PORT_UNAVAILABLE: {
    category: "validation",
    retryability: "manual-check",
    message: "媒体供应商端口不可用",
  },
  MEDIA_SUPPLIER_PROTOCOL_ERROR: {
    category: "transport",
    retryability: "manual-check",
    message: "媒体供应商响应格式无效",
  },
  MEDIA_SUPPLIER_REJECTED: {
    category: "remote",
    retryability: "never",
    message: "媒体供应商拒绝了请求",
  },
  MEDIA_SUPPLIER_TRANSPORT_ERROR: {
    category: "transport",
    retryability: "manual-check",
    message: "媒体供应商传输失败",
  },
});

const MEDIA_ERROR_CODES = new Set(Object.keys(MEDIA_ERROR_DEFINITIONS));

function safeDiagnostics(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const output = {};
  if (Number.isInteger(value.status) && value.status >= 100 && value.status <= 599) {
    output.status = value.status;
  }
  if (["connect", "read", "response"].includes(value.phase)) {
    output.phase = value.phase;
  }
  if (typeof value.path === "string" && /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{1,160}$/u.test(value.path)) {
    output.path = value.path;
  }
  if (value.redirect === true) output.redirect = true;
  return Object.keys(output).length ? Object.freeze(output) : undefined;
}

function createMediaError(code, message, diagnostics) {
  const definition = MEDIA_ERROR_DEFINITIONS[code] || MEDIA_ERROR_DEFINITIONS.MEDIA_NETWORK_ERROR;
  const error = new Error(message || definition.message);
  error.code = code;
  error.category = definition.category;
  error.retryability = definition.retryability;
  const safe = safeDiagnostics(diagnostics);
  if (safe) error.diagnostics = safe;
  return error;
}

function isKnownMediaError(error) {
  return Boolean(error && typeof error.code === "string" && MEDIA_ERROR_CODES.has(error.code));
}

function errorSignals(error) {
  const codes = [];
  const messages = [];
  const visited = new Set();
  let current = error;
  for (let depth = 0; current && depth < 5 && !visited.has(current); depth += 1) {
    visited.add(current);
    if (typeof current.code === "string") codes.push(current.code.toUpperCase());
    if (typeof current.message === "string") messages.push(current.message.toLowerCase());
    current = current.cause;
  }
  return { codes, message: messages.join(" ") };
}

function hasAny(values, candidates) {
  return values.some((value) => candidates.includes(value));
}

function classifyMediaTransportError(error, phase, diagnostics) {
  if (isKnownMediaError(error)) {
    if (error.category && error.retryability) return error;
    return createMediaError(error.code, error.message, error.diagnostics || diagnostics);
  }
  const signals = errorSignals(error);
  const normalizedPhase = phase || (error && error.phase) || "connect";
  const details = Object.assign({}, diagnostics, { phase: normalizedPhase });

  if (
    hasAny(signals.codes, [
      "ERR_TLS_CERT_ALTNAME_INVALID",
      "ERR_TLS_HOSTNAME_MISMATCH",
      "CERT_HOSTNAME_MISMATCH",
    ]) ||
    /hostname|host name|altname|does not match/.test(signals.message)
  ) {
    return createMediaError("MEDIA_TLS_HOSTNAME_MISMATCH", undefined, details);
  }

  if (
    hasAny(signals.codes, [
      "CERT_HAS_EXPIRED",
      "CERT_UNTRUSTED",
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "SELF_SIGNED_CERT_IN_CHAIN",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "ERR_TLS_CERT_INVALID",
      "CERT_REVOKED",
    ]) ||
    /certificate|self-signed|unable to verify|cert chain/.test(signals.message)
  ) {
    return createMediaError("MEDIA_TLS_CERTIFICATE_ERROR", undefined, details);
  }

  const timeout =
    hasAny(signals.codes, [
      "ETIMEDOUT",
      "ESOCKETTIMEDOUT",
      "ECONNABORTED",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_HEADERS_TIMEOUT",
      "UND_ERR_BODY_TIMEOUT",
      "ERR_BODY_TIMEOUT",
    ]) ||
    /timed? ?out|timeout|aborted/.test(signals.message) ||
    hasAny(signals.codes, ["ABORT_ERR", "ABORTERROR"]);
  if (timeout) {
    return createMediaError(
      normalizedPhase === "read" ? "MEDIA_READ_TIMEOUT" : "MEDIA_CONNECT_TIMEOUT",
      undefined,
      details,
    );
  }

  return createMediaError("MEDIA_NETWORK_ERROR", undefined, details);
}

module.exports = {
  MEDIA_ERROR_DEFINITIONS,
  MEDIA_ERROR_CODES,
  createMediaError,
  isKnownMediaError,
  classifyMediaTransportError,
};
