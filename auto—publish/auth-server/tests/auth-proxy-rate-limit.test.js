const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { AuthDomain } = require("../src/auth-domain");
const { InMemoryAuthRepository } = require("../src/repositories/in-memory-auth-repository");
const { BoundedWindowLimiter } = require("../src/security/bounded-window-limiter");
const { LoginPolicy } = require("../src/security/login-policy");
const { SourceResolver } = require("../src/security/source-resolver");
const { createProxyConfiguration, ProxyConfigurationError } = require("../src/security/proxy-config-adapter");

class ManualClock {
  constructor(value) { this.value = value || 0; }
  now = () => this.value;
  advance(milliseconds) { this.value += milliseconds; }
}

function request(remoteAddress, headers) {
  return { socket: { remoteAddress }, headers: headers || {} };
}

function fakeDomain(clock, options) {
  return new AuthDomain(Object.assign({
    repository: new InMemoryAuthRepository(),
    now: clock.now,
    passwordVerifier: async () => false,
    passwordHasher: async () => "test-password-hash",
    rateLimitWindowMs: 100,
    rateLimitCapacity: 64,
    sourceRateLimitMaxAttempts: 1000,
    identityRateLimitMaxAttempts: 1000,
    combinationRateLimitMaxAttempts: 1000,
  }, options || {}));
}

describe("auth source resolver and proxy configuration", () => {
  it("ignores Forwarded and X-Forwarded-* when trust-proxy is missing", () => {
    const configuration = createProxyConfiguration();
    const resolver = new SourceResolver(configuration);
    const spoofed = resolver.resolve(request("192.0.2.10", {
      forwarded: "for=198.51.100.8",
      "x-forwarded-for": "198.51.100.8",
      "cf-connecting-ip": "198.51.100.8",
    }));
    const direct = resolver.resolve(request("192.0.2.10"));
    assert.deepEqual(spoofed, direct);
    assert.equal(spoofed.sourceConfidence, "direct");
    assert.equal(configuration.diagnostic.status, "missing");
    assert.equal(JSON.stringify(configuration.diagnostic).includes("198.51.100.8"), false);
    assert.throws(() => createProxyConfiguration({ header: "cf-connecting-ip", trustedProxyCidrs: ["10.0.0.0/8"] }), ProxyConfigurationError);
  });

  it("reads only the explicitly configured header from an explicitly trusted peer", () => {
    const configuration = createProxyConfiguration({
      header: "x-forwarded-for",
      trustedHops: 1,
      trustedProxyCidrs: ["10.0.0.0/8"],
    });
    const resolver = new SourceResolver(configuration);
    const forwarded = resolver.resolve(request("::ffff:10.2.3.4", { "x-forwarded-for": "198.51.100.8" }));
    const client = resolver.resolve(request("198.51.100.8"));
    const untrusted = resolver.resolve(request("192.0.2.10", { "x-forwarded-for": "198.51.100.8" }));
    assert.equal(forwarded.sourceConfidence, "trusted-forwarded");
    assert.equal(forwarded.sourceFingerprint, client.sourceFingerprint);
    assert.equal(untrusted.sourceConfidence, "direct");
    assert.notEqual(untrusted.sourceFingerprint, forwarded.sourceFingerprint);
    assert.equal(configuration.diagnostic.status, "valid");
  });

  it("parses Forwarded only when its rule, hop count, and peer range are explicit", () => {
    const configuration = createProxyConfiguration({
      header: "forwarded",
      trustedHops: 2,
      trustedProxyCidrs: ["2001:db8:10::/48"],
    });
    const resolver = new SourceResolver(configuration);
    const result = resolver.resolve(request("2001:db8:10::4", {
      forwarded: "for=198.51.100.8;proto=https, for=2001:db8:10::3",
    }));
    assert.equal(result.sourceConfidence, "trusted-forwarded");
    assert.equal(result.sourceFingerprint, resolver.resolve(request("198.51.100.8")).sourceFingerprint);
    const spoofed = resolver.resolve(request("2001:db8:10::4", {
      forwarded: "for=198.51.100.8, for=203.0.113.9",
    }));
    assert.equal(spoofed.sourceConfidence, "direct");
    const malformed = resolver.resolve(request("2001:db8:10::4", {
      forwarded: "for=198.51.100.8, for=not-an-ip",
    }));
    assert.equal(malformed.sourceConfidence, "direct");
    assert.throws(() => createProxyConfiguration(true), ProxyConfigurationError);
    assert.throws(() => createProxyConfiguration({ header: "x-forwarded-for", trustedProxyCidrs: ["10.0.0.0/8"] }), ProxyConfigurationError);
    assert.throws(() => createProxyConfiguration({ header: "x-forwarded-host", trustedHops: 1, trustedProxyCidrs: ["10.0.0.0/8"] }), ProxyConfigurationError);
  });
});

describe("bounded login limiter", () => {
  it("enforces fixed TTL, LRU order, and bounded expiry metadata", () => {
    const clock = new ManualClock();
    const limiter = new BoundedWindowLimiter({ name: "fixture", now: clock.now, capacity: 2, windowMs: 100, maxAttempts: 2 });
    limiter.consume("a");
    limiter.consume("b");
    limiter.consume("a");
    limiter.consume("c");
    assert.equal(limiter.size, 2);
    assert.equal(limiter.getStats().evictions, 1);
    assert.equal(limiter.consume("a").count, 3);
    assert.equal(limiter.consume("a").allowed, false);
    clock.advance(100);
    assert.equal(limiter.getStats().entries, 0);
    assert.equal(limiter.getStats().expired, 2);
    assert.equal(limiter.consume("a").count, 1);

    for (let index = 0; index < 100000; index += 1) limiter.consume(`login-${index}`);
    assert.ok(limiter.getStats().entries <= 2);
    assert.ok(limiter.expiryHeap.length <= limiter.capacity * 2 + 32);
  });

  it("keeps source, identity, and combination buckets bounded for 100k identities", () => {
    const clock = new ManualClock();
    const policy = new LoginPolicy({
      now: clock.now,
      rateLimitWindowMs: 1000,
      rateLimitCapacity: 128,
      sourceRateLimitMaxAttempts: 1000000,
      identityRateLimitMaxAttempts: 1000000,
      combinationRateLimitMaxAttempts: 1000000,
    });
    for (let index = 0; index < 100000; index += 1) policy.begin({ loginName: `unknown-${index}`, sourceFingerprint: "nat-fingerprint" });
    const stats = policy.getStats();
    assert.equal(stats.source.entries, 1);
    assert.ok(stats.identity.entries <= 128);
    assert.ok(stats.combination.entries <= 128);
    assert.ok(policy.identityLimiter.expiryHeap.length <= 128 * 2 + 32);
    assert.ok(policy.combinationLimiter.expiryHeap.length <= 128 * 2 + 32);
  });

  it("keeps TTL metadata bounded when successful identities are cleared", () => {
    const clock = new ManualClock();
    const policy = new LoginPolicy({ now: clock.now, rateLimitCapacity: 128, rateLimitWindowMs: 1000 });
    for (let index = 0; index < 100000; index += 1) {
      const attempt = policy.begin({ loginName: `successful-${index}`, sourceFingerprint: "shared-nat" });
      policy.onSuccess(attempt);
    }
    assert.equal(policy.identityLimiter.size, 0);
    assert.equal(policy.combinationLimiter.size, 0);
    assert.ok(policy.identityLimiter.expiryHeap.length <= 32);
    assert.ok(policy.combinationLimiter.expiryHeap.length <= 32);
  });
});

describe("login policy integration", () => {
  it("separates shared NAT source pressure from identity buckets", () => {
    const policy = new LoginPolicy({
      sourceRateLimitMaxAttempts: 2,
      identityRateLimitMaxAttempts: 3,
      combinationRateLimitMaxAttempts: 3,
      rateLimitCapacity: 8,
    });
    assert.equal(policy.begin({ loginName: "user-a", sourceFingerprint: "shared-nat" }).allowed, true);
    assert.equal(policy.begin({ loginName: "user-b", sourceFingerprint: "shared-nat" }).allowed, true);
    assert.equal(policy.begin({ loginName: "user-c", sourceFingerprint: "shared-nat" }).allowed, false);
    const stats = policy.getStats();
    assert.equal(stats.source.entries, 1);
    assert.equal(stats.identity.entries, 3);
    assert.equal(stats.combination.entries, 3);
  });

  it("releases identity state on success, expires windows, supports manual clear, and restarts empty", async () => {
    const clock = new ManualClock();
    const domain = fakeDomain(clock, { rateLimitWindowMs: 100 });
    await assert.rejects(() => domain.login({ loginName: "missing", password: "wrong", sourceFingerprint: "source-a" }), (error) => error.code === "AUTH_INVALID_CREDENTIALS");
    assert.equal(domain.getLoginRateLimitStats().identity.entries, 1);
    assert.equal(domain.clearLoginRateLimitState() > 0, true);
    assert.equal(domain.getLoginRateLimitStats().identity.entries, 0);

    const administrationUser = await domain.createManagedUser({ loginName: "real-user", password: "correct-password", permanent: true, mustChangePassword: false });
    domain.passwordVerifier = async (password) => password === "correct-password";
    await domain.login({ loginName: administrationUser.loginName, password: "correct-password", deviceId: "device", sourceFingerprint: "source-a" });
    const afterSuccess = domain.getLoginRateLimitStats();
    assert.equal(afterSuccess.identity.entries, 0);
    assert.equal(afterSuccess.combination.entries, 0);
    assert.equal(afterSuccess.source.entries, 1);

    await assert.rejects(() => domain.login({ loginName: "expired-name", password: "wrong", sourceFingerprint: "source-b" }), (error) => error.code === "AUTH_INVALID_CREDENTIALS");
    clock.advance(100);
    assert.equal(domain.getLoginRateLimitStats().identity.entries, 0);
    const restarted = fakeDomain(clock, { rateLimitWindowMs: 100 });
    assert.equal(restarted.getLoginRateLimitStats().source.entries, 0);
  });

  it("handles concurrent non-scrypt login attempts without exceeding capacity", async () => {
    const clock = new ManualClock();
    const domain = fakeDomain(clock, { rateLimitCapacity: 16, sourceRateLimitMaxAttempts: 1000, identityRateLimitMaxAttempts: 1000, combinationRateLimitMaxAttempts: 1000 });
    const results = await Promise.allSettled(Array.from({ length: 64 }, (_, index) => domain.login({
      loginName: `concurrent-${index}`,
      password: "wrong-password",
      sourceFingerprint: "shared-source",
    })));
    assert.equal(results.every((result) => result.status === "rejected" && result.reason.code === "AUTH_INVALID_CREDENTIALS"), true);
    const stats = domain.getLoginRateLimitStats();
    assert.equal(stats.source.entries, 1);
    assert.ok(stats.identity.entries <= 16);
    assert.ok(stats.combination.entries <= 16);
  });
});
