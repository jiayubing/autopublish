const { AccountPolicy } = require("./auth-account-policy");
const { DevicePolicy } = require("./auth-device-policy");
const { EntitlementPolicy } = require("./auth-entitlement-policy");
const { PasswordPolicy } = require("./auth-password-policy");
const { SessionPolicy } = require("./auth-session-policy");
const { LoginPolicy } = require("../security/login-policy");

function composeAuthPolicies(domain, options) {
  const opts = options || {};
  domain.loginFailureThreshold = Number(opts.loginFailureThreshold || 5);
  domain.loginLockMs = Number(opts.loginLockMs || 15 * 60 * 1000);
  domain.passwordPolicy = new PasswordPolicy({
    limiter: opts.passwordLimiter,
    maxConcurrentPasswordComputations: opts.maxConcurrentPasswordComputations,
    passwordCost: opts.passwordCost,
    verifier: opts.passwordVerifier || opts.verifyPassword,
    hasher: opts.passwordHasher || opts.createPasswordHash,
  });
  domain.passwordLimiter = domain.passwordPolicy.limiter;
  domain.passwordOptions = domain.passwordPolicy.options;
  domain.passwordVerifier =
    opts.passwordVerifier ||
    opts.verifyPassword ||
    ((password, encoded, passwordOptions) =>
      domain.passwordPolicy.verify(password, encoded, passwordOptions));
  domain.passwordHasher =
    opts.passwordHasher ||
    opts.createPasswordHash ||
    ((password, passwordOptions) =>
      domain.passwordPolicy.hash(password, passwordOptions));
  domain.loginPolicy =
    opts.loginPolicy ||
    new LoginPolicy({
      now: domain.now,
      loginFailureThreshold: domain.loginFailureThreshold,
      loginLockMs: domain.loginLockMs,
      rateLimitWindowMs: opts.rateLimitWindowMs,
      rateLimitMaxAttempts: opts.rateLimitMaxAttempts,
      rateLimitCapacity: opts.rateLimitCapacity,
      rateLimitMaxKeys: opts.rateLimitMaxKeys,
      maxRateLimitKeys: opts.maxRateLimitKeys,
      sourceRateLimitCapacity: opts.sourceRateLimitCapacity,
      identityRateLimitCapacity: opts.identityRateLimitCapacity,
      combinationRateLimitCapacity: opts.combinationRateLimitCapacity,
      sourceRateLimitMaxAttempts: opts.sourceRateLimitMaxAttempts,
      identityRateLimitMaxAttempts: opts.identityRateLimitMaxAttempts,
      combinationRateLimitMaxAttempts: opts.combinationRateLimitMaxAttempts,
      sourceRateLimitTtlMs: opts.sourceRateLimitTtlMs,
      identityRateLimitTtlMs: opts.identityRateLimitTtlMs,
      combinationRateLimitTtlMs: opts.combinationRateLimitTtlMs,
      sourceLimiter: opts.sourceLimiter,
      identityLimiter: opts.identityLimiter,
      combinationLimiter: opts.combinationLimiter,
    });
  domain.entitlementPolicy = new EntitlementPolicy({
    repository: domain.repository,
    now: domain.now,
  });
  domain.devicePolicy = new DevicePolicy({
    repository: domain.repository,
    now: domain.now,
    audit: (...args) => domain._audit(...args),
  });
  domain.sessionPolicy = new SessionPolicy({
    repository: domain.repository,
    now: domain.now,
    accessTtlMs: opts.accessTtlMs,
    refreshTtlMs: opts.refreshTtlMs,
    maxSessionsPerUser: opts.maxSessionsPerUser,
    maxSessionsPerDevice: opts.maxSessionsPerDevice,
  });
  domain.accountPolicy = new AccountPolicy({
    repository: domain.repository,
    now: domain.now,
    passwordPolicy: {
      normalize: (password) => domain.passwordPolicy.normalize(password),
      hash: (password) =>
        domain.passwordHasher(password, domain.passwordOptions),
    },
    entitlementPolicy: domain.entitlementPolicy,
    sessionPolicy: domain.sessionPolicy,
    devicePolicy: domain.devicePolicy,
    audit: (...args) => domain._audit(...args),
  });
}

module.exports = { composeAuthPolicies };
