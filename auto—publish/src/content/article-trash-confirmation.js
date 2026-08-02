const crypto = require("node:crypto");

function confirmationError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function createArticleTrashConfirmation(options) {
  const opts = options || {};
  const now =
    typeof opts.now === "function"
      ? opts.now
      : function () {
          return new Date().toISOString();
        };
  const ttlMs =
    Number.isFinite(opts.ttlMs) && opts.ttlMs > 0 ? opts.ttlMs : 5 * 60 * 1000;
  const makeToken =
    typeof opts.tokenGenerator === "function"
      ? opts.tokenGenerator
      : function () {
          return crypto.randomUUID();
        };
  const confirmations = new Map();

  function issue(binding, fingerprint) {
    const issuedAt = now();
    const issuedMs = Date.parse(issuedAt);
    if (Number.isNaN(issuedMs))
      throw confirmationError(
        "ARTICLE_PERMANENT_DELETE_CLOCK_INVALID",
        "Permanent deletion clock is invalid",
      );
    const expiresAt = new Date(issuedMs + ttlMs).toISOString();
    const token = String(makeToken());
    confirmations.set(
      token,
      Object.assign({}, binding, { token, fingerprint, issuedAt, expiresAt }),
    );
    return confirmations.get(token);
  }

  function get(token) {
    return confirmations.get(token) || null;
  }
  function remove(token) {
    confirmations.delete(token);
  }
  function invalidateBinding(binding) {
    confirmations.forEach(function (value, token) {
      if (
        value.clientId === binding.clientId &&
        value.articleId === binding.articleId
      )
        confirmations.delete(token);
    });
  }
  function assertLive(value, codePrefix) {
    const prefix = codePrefix || "ARTICLE_PERMANENT_DELETE";
    const executionAt = Date.parse(now());
    if (Number.isNaN(executionAt))
      throw confirmationError(
        prefix + "_CLOCK_INVALID",
        "Permanent deletion clock is invalid",
      );
    if (!value || executionAt >= Date.parse(value.expiresAt)) {
      if (value && value.token) confirmations.delete(value.token);
      throw confirmationError(
        prefix + "_CONFIRMATION_EXPIRED",
        "Permanent deletion confirmation has expired",
      );
    }
    return value;
  }

  return { issue, get, remove, invalidateBinding, assertLive };
}

module.exports = { createArticleTrashConfirmation };
