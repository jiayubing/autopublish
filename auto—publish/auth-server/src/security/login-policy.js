const { hashToken } = require("../token-service");
const { BoundedWindowLimiter } = require("./bounded-window-limiter");

class LoginPolicy {
  constructor(options) {
    const opts = options || {};
    this.now = typeof opts.now === "function" ? opts.now : () => Date.now();
    this.loginFailureThreshold = positiveInteger(opts.loginFailureThreshold, 5);
    this.loginLockMs = positiveNumber(opts.loginLockMs, 15 * 60 * 1000);
    const legacyMax = opts.rateLimitMaxAttempts;
    const legacyCapacity = opts.rateLimitCapacity ?? opts.rateLimitMaxKeys ?? opts.maxRateLimitKeys;
    const windowMs = positiveNumber(opts.rateLimitWindowMs, 60 * 1000);
    const capacity = positiveInteger(legacyCapacity, 4096);
    this.sourceLimiter = opts.sourceLimiter || new BoundedWindowLimiter({
      name: "source",
      now: this.now,
      capacity: positiveInteger(opts.sourceRateLimitCapacity, capacity),
      windowMs,
      ttlMs: positiveNumber(opts.sourceRateLimitTtlMs, windowMs),
      maxAttempts: positiveInteger(opts.sourceRateLimitMaxAttempts, legacyMax === undefined ? 60 : legacyMax),
    });
    this.identityLimiter = opts.identityLimiter || new BoundedWindowLimiter({
      name: "identity",
      now: this.now,
      capacity: positiveInteger(opts.identityRateLimitCapacity, capacity),
      windowMs,
      ttlMs: positiveNumber(opts.identityRateLimitTtlMs, windowMs),
      maxAttempts: positiveInteger(opts.identityRateLimitMaxAttempts, legacyMax === undefined ? 12 : legacyMax),
    });
    this.combinationLimiter = opts.combinationLimiter || new BoundedWindowLimiter({
      name: "combination",
      now: this.now,
      capacity: positiveInteger(opts.combinationRateLimitCapacity, capacity),
      windowMs,
      ttlMs: positiveNumber(opts.combinationRateLimitTtlMs, windowMs),
      maxAttempts: positiveInteger(opts.combinationRateLimitMaxAttempts, legacyMax === undefined ? 12 : legacyMax),
    });
  }

  begin(input) {
    const request = input || {};
    const loginName = normalizeIdentity(request.loginName);
    const sourceFingerprint = normalizeSource(request.sourceFingerprint);
    const sourceKey = key("source", sourceFingerprint);
    const identityKey = key("identity", loginName);
    const combinationKey = key("combination", `${loginName}\0${sourceFingerprint}`);
    const source = this.sourceLimiter.consume(sourceKey);
    const identity = this.identityLimiter.consume(identityKey);
    const combination = this.combinationLimiter.consume(combinationKey);
    return {
      allowed: source.allowed && identity.allowed && combination.allowed,
      source,
      identity,
      combination,
      keys: { sourceKey, identityKey, combinationKey },
    };
  }

  onSuccess(attempt) {
    if (!attempt || !attempt.keys) return;
    this.identityLimiter.clear(attempt.keys.identityKey, attempt.identity && attempt.identity.version);
    this.combinationLimiter.clear(attempt.keys.combinationKey, attempt.combination && attempt.combination.version);
  }

  classifyAccount(user) {
    if (!user || !user.enabled) return "AUTH_ACCOUNT_DISABLED";
    if (user.lockedUntil && Date.parse(user.lockedUntil) > this.now()) return "AUTH_ACCOUNT_LOCKED";
    return null;
  }

  recordFailure(user) {
    if (!user || !user.enabled) return { code: "AUTH_INVALID_CREDENTIALS", eventCode: "LOGIN_FAILED" };
    const failedLoginCount = Number(user.failedLoginCount || 0) + 1;
    const locked = failedLoginCount >= this.loginFailureThreshold;
    return {
      code: locked ? "AUTH_ACCOUNT_LOCKED" : "AUTH_INVALID_CREDENTIALS",
      eventCode: locked ? "ACCOUNT_LOCKED" : "LOGIN_FAILED",
      update: {
        failedLoginCount,
        lockedUntil: locked ? new Date(this.now() + this.loginLockMs).toISOString() : null,
      },
    };
  }

  clear() {
    return this.sourceLimiter.clearAll() + this.identityLimiter.clearAll() + this.combinationLimiter.clearAll();
  }

  getStats() {
    return {
      source: this.sourceLimiter.getStats(),
      identity: this.identityLimiter.getStats(),
      combination: this.combinationLimiter.getStats(),
    };
  }
}

function normalizeIdentity(value) {
  const identity = typeof value === "string" ? value.trim() : "";
  if (!identity || identity.length > 128) throw new TypeError("login identity must be a non-empty string of at most 128 characters");
  return identity;
}

function normalizeSource(value) {
  const source = typeof value === "string" ? value.trim() : "unknown";
  return source ? source.slice(0, 256) : "unknown";
}

function key(scope, value) {
  return `${scope}:${hashToken(value).slice(0, 48)}`;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

module.exports = { LoginPolicy };
