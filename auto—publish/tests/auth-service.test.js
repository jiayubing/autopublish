const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { createAuthService, AUTH_BASE_URL } = require("../desktop/services/auth-service");

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
});
