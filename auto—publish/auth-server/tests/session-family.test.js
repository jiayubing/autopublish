const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { createMemoryAuth, createUser } = require("./helpers");

describe("refresh token families", () => {
  it("rotates once and revokes the family on old-token reuse", async () => {
    const { domain, administration, repository } = createMemoryAuth();
    await createUser(administration, "session-user", { password: "session-password" });
    const first = await domain.login({ loginName: "session-user", password: "session-password", deviceId: "session-device" });
    const rotated = await domain.refresh({ refreshToken: first.refreshToken, deviceId: "session-device" });
    assert.notEqual(rotated.refreshToken, first.refreshToken);
    await assert.rejects(() => domain.refresh({ refreshToken: first.refreshToken, deviceId: "session-device" }), (error) => error.code === "AUTH_TOKEN_REUSE_DETECTED");
    await assert.rejects(() => domain.inspect(rotated.accessToken), (error) => error.code === "AUTH_SESSION_EXPIRED");
    assert.ok(repository.getData().auditEvents.some((event) => event.eventCode === "TOKEN_REUSE_DETECTED"));
    assert.ok(repository.getData().auditEvents.every((event) => !JSON.stringify(event).includes(first.refreshToken)));
  });

  it("allows only one concurrent refresh and treats the loser as a replay", async () => {
    const { domain, administration } = createMemoryAuth();
    await createUser(administration, "concurrent-session", { password: "concurrent-password" });
    const first = await domain.login({ loginName: "concurrent-session", password: "concurrent-password", deviceId: "concurrent-device" });
    const results = await Promise.allSettled([
      domain.refresh({ refreshToken: first.refreshToken, deviceId: "concurrent-device" }),
      domain.refresh({ refreshToken: first.refreshToken, deviceId: "concurrent-device" }),
    ]);
    assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(results.filter((item) => item.status === "rejected" && item.reason.code === "AUTH_TOKEN_REUSE_DETECTED").length, 1);
  });
});
