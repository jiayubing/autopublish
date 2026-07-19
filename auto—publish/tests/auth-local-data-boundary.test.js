const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { createAuthService } = require("../desktop/services/auth-service");

describe("auth request local-data boundary", () => {
  it("sends only authentication metadata and never workspace content", async () => {
    const calls = [];
    const service = createAuthService({
      deviceId: "11111111-1111-4111-8111-111111111111",
      deviceName: "Windows device",
      appVersion: "1.0.1",
      request: async (input) => {
        calls.push(input);
        return { statusCode: 200, body: { data: { accessToken: "access", refreshToken: "refresh", accessExpiresAt: new Date(Date.now() + 60000).toISOString(), refreshExpiresAt: new Date(Date.now() + 60000).toISOString(), user: { loginName: "user-a" }, entitlements: [] } } };
      }
    });
    await service.login("user-a", "temporary password");
    await service.refresh();
    await service.changePassword("user-a", "temporary password", "a sufficiently long new password");
    await service.logout();
    assert.deepEqual(Object.keys(calls[0].body).sort(), ["appVersion", "deviceId", "deviceName", "loginName", "password"]);
    assert.deepEqual(Object.keys(calls[1].body).sort(), ["appVersion", "deviceId", "refreshToken"]);
    assert.deepEqual(Object.keys(calls[2].body).sort(), ["appVersion", "currentPassword", "deviceId", "deviceName", "loginName", "newPassword"]);
    assert.deepEqual(Object.keys(calls[3].body).sort(), ["refreshToken"]);
    const forbidden = /workspacePath|clientId|articleId|title|content|queue|publication|cookie|apiKey|prompt/i;
    assert.doesNotMatch(JSON.stringify(calls), forbidden);
  });
});
