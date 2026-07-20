const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const { createAuthService, AUTH_BASE_URL } = require("../desktop/services/auth-service");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return { promise, resolve, reject };
}

function encryptedSession() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value, "utf8"),
    decryptString: (value) => value.toString("utf8"),
  };
}

function authenticatedResponse(refreshToken, expiresAt) {
  return { statusCode: 200, body: { accessToken: `access-${refreshToken}`, refreshToken, accessExpiresAt: expiresAt, user: { id: refreshToken, loginName: refreshToken }, entitlements: [] } };
}

describe("J4125 auth service client", function() {
  it("uses the fixed HTTPS endpoint and keeps access tokens in memory", async function() {
    const calls = [];
    const service = createAuthService({
      request: async (request) => { calls.push(request); return { statusCode: 200, body: { accessToken: "access", refreshToken: "refresh", user: { id: "admin", loginName: "admin" }, entitlements: [] } }; },
      safeStorage: { isEncryptionAvailable: () => false },
    });
    await service.login("admin", "password");
    assert.equal(AUTH_BASE_URL, "https://auth.jiayubing.xyz");
    assert.equal(calls[0].url, "https://auth.jiayubing.xyz/v1/auth/login");
    assert.equal(service.getAccessToken(), "access");
    assert.equal(JSON.stringify(service.getState()).includes("refresh"), false);
  });

  it("maps server failures to fixed non-sensitive error codes", async function() {
    const service = createAuthService({ request: async () => ({ statusCode: 401, body: { error: "password hash details C:\\private\\db" } }) });
    await assert.rejects(() => service.login("admin", "bad"), (error) => error.code === "AUTH_INVALID_CREDENTIALS" && !error.message.includes("private"));
  });

  it("preserves stable lock and rate-limit codes regardless of HTTP status", async function() {
    const locked = createAuthService({ request: async () => ({ statusCode: 423, body: { error: { code: "AUTH_ACCOUNT_LOCKED", message: "internal detail" } } }) });
    await assert.rejects(() => locked.login("admin", "password"), (error) => error.code === "AUTH_ACCOUNT_LOCKED");
    const limited = createAuthService({ request: async () => ({ statusCode: 429, body: { error: { code: "AUTH_RATE_LIMITED" } } }) });
    await assert.rejects(() => limited.login("admin", "password"), (error) => error.code === "AUTH_RATE_LIMITED");
  });

  it("allows the six-character password floor for password replacement", async function() {
    const service = createAuthService({ request: async () => ({ statusCode: 200, body: { accessToken: "access", refreshToken: "refresh", user: { loginName: "admin" }, entitlements: [] } }) });
    await service.changePassword("admin", "old-password", "abc123");
    assert.equal(service.getState().authenticated, true);
  });

  it("coalesces concurrent protected calls into one refresh request", async function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "autopublish-auth-concurrency-"));
    let currentTime = Date.now();
    const refreshResponse = deferred();
    let refreshCalls = 0;
    const service = createAuthService({
      userDataPath: root,
      safeStorage: encryptedSession(),
      now: () => currentTime,
      request: async (input) => {
        if (input.url.endsWith("/login")) return authenticatedResponse("refresh-1", new Date(currentTime + 3600000).toISOString());
        refreshCalls += 1;
        return refreshResponse.promise;
      },
    });
    try {
      await service.login("admin", "password");
      currentTime += 3600001;
      const calls = Array.from({ length: 20 }, () => service.requireAuthenticated());
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(refreshCalls, 1);
      refreshResponse.resolve(authenticatedResponse("refresh-2", new Date(currentTime + 3600000).toISOString()));
      const tokens = await Promise.all(calls);
      assert.deepEqual(new Set(tokens), new Set(["access-refresh-2"]));
    } finally {
      service.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps the encrypted refresh token and account state through temporary failures", async function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "autopublish-auth-recovery-"));
    let currentTime = Date.now();
    let refreshAvailable = false;
    const service = createAuthService({
      userDataPath: root,
      safeStorage: encryptedSession(),
      now: () => currentTime,
      request: async (input) => {
        if (input.url.endsWith("/login")) return authenticatedResponse("refresh-1", new Date(currentTime + 3600000).toISOString());
        if (!refreshAvailable) throw new Error("network down");
        return authenticatedResponse("refresh-2", new Date(currentTime + 3600000).toISOString());
      },
    });
    try {
      await service.login("admin", "password");
      currentTime += 3600001;
      await assert.rejects(() => service.requireAuthenticated(), (error) => error.code === "AUTH_SERVICE_UNAVAILABLE");
      assert.equal(fs.existsSync(path.join(root, "auth-session.json")), true);
      assert.equal(service.getState().authenticated, true);
      assert.equal(service.getState().sessionStatus, "recovering");
      assert.equal(service.getState().user.loginName, "refresh-1");
      refreshAvailable = true;
      await service.requireAuthenticated();
      assert.equal(service.getState().sessionStatus, "authenticated");
    } finally {
      service.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("clears the session only for a terminal refresh error and ignores stale responses", async function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "autopublish-auth-generation-"));
    let currentTime = Date.now();
    const oldRefresh = deferred();
    let mode = "old";
    const service = createAuthService({
      userDataPath: root,
      safeStorage: encryptedSession(),
      now: () => currentTime,
      request: async (input) => {
        if (input.url.endsWith("/login")) return authenticatedResponse("refresh-new", new Date(currentTime + 3600000).toISOString());
        if (mode === "old") return oldRefresh.promise;
        return { statusCode: 401, body: { error: { code: "AUTH_SESSION_EXPIRED" } } };
      },
    });
    try {
      await service.login("admin", "password");
      currentTime += 3600001;
      const stale = service.refresh();
      await new Promise((resolve) => setImmediate(resolve));
      await service.login("new-admin", "password");
      oldRefresh.resolve(authenticatedResponse("refresh-old", new Date(currentTime + 3600000).toISOString()));
      await stale;
      assert.equal(service.getState().user.loginName, "refresh-new");
      mode = "terminal";
      currentTime += 3600001;
      await assert.rejects(() => service.requireAuthenticated(), (error) => error.code === "AUTH_SESSION_EXPIRED");
      assert.equal(service.getState().authenticated, false);
      assert.equal(service.getState().errorCode, "AUTH_SESSION_EXPIRED");
      assert.equal(fs.existsSync(path.join(root, "auth-session.json")), false);
    } finally {
      service.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("refreshes before expiry, unrefs timers, and backs off temporary failures", async function() {
    const timers = [];
    const cleared = [];
    let currentTime = Date.now();
    const service = createAuthService({
      safeStorage: encryptedSession(),
      now: () => currentTime,
      setTimeout: (callback, delay) => {
        const timer = { callback, delay, unrefCalled: false, unref() { this.unrefCalled = true; } };
        timers.push(timer);
        return timer;
      },
      clearTimeout: (timer) => cleared.push(timer),
      request: async (input) => input.url.endsWith("/login")
        ? authenticatedResponse("refresh-1", new Date(currentTime + 120000).toISOString())
        : (() => { throw new Error("temporary outage"); })(),
    });
    await service.login("admin", "password");
    assert.equal(timers[0].delay, 60000);
    assert.equal(timers[0].unrefCalled, true);
    timers[0].callback();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(service.getState().sessionStatus, "recovering");
    assert.equal(timers.at(-1).delay, 5000);
    service.dispose();
    assert.equal(cleared.length > 0, true);
  });
});
