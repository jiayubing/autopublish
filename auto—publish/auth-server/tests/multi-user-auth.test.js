const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { AuthError } = require("../src/auth-domain");
const { createMemoryAuth, createUser } = require("./helpers");

describe("multi-user accounts, entitlement and first password change", () => {
  it("accepts the six-character compatibility password floor", async () => {
    const { domain, administration } = createMemoryAuth();
    await createUser(administration, "short-password", { password: "abc123" });
    const session = await domain.login({ loginName: "short-password", password: "abc123", deviceId: "short-device" });
    assert.equal(session.user.loginName, "short-password");
  });

  it("keeps users and sessions isolated", async () => {
    const { domain, administration } = createMemoryAuth();
    await createUser(administration, "user-a", { password: "user-a-password" });
    await createUser(administration, "user-b", { password: "user-b-password" });
    const a = await domain.login({ loginName: "user-a", password: "user-a-password", deviceId: "device-a" });
    const b = await domain.login({ loginName: "user-b", password: "user-b-password", deviceId: "device-b" });
    assert.notEqual(a.user.id, b.user.id);
    assert.notEqual(a.accessToken, b.accessToken);
    await assert.rejects(() => domain.login({ loginName: "user-a", password: "wrong-password", deviceId: "device-a" }), (error) => error.code === "AUTH_INVALID_CREDENTIALS");
    assert.equal((await domain.inspect(b.accessToken)).user.loginName, "user-b");
    await administration.execute({ type: "disable-user", loginName: "user-a" });
    await assert.rejects(() => domain.inspect(a.accessToken), (error) => error.code === "AUTH_SESSION_EXPIRED");
    assert.equal((await domain.inspect(b.accessToken)).user.loginName, "user-b");
  });

  it("enforces expiry and allows an explicit renewal", async () => {
    const { domain, administration } = createMemoryAuth();
    await createUser(administration, "expiring", { password: "expiry-password" });
    await administration.execute({ type: "set-expiry", loginName: "expiring", expiresAt: new Date(Date.now() - 1000).toISOString() });
    await assert.rejects(() => domain.login({ loginName: "expiring", password: "expiry-password", deviceId: "expiry-device" }), (error) => error.code === "AUTH_LICENSE_EXPIRED");
    await administration.execute({ type: "set-expiry", loginName: "expiring", permanent: true });
    assert.equal((await domain.login({ loginName: "expiring", password: "expiry-password", deviceId: "expiry-device" })).user.loginName, "expiring");
  });

  it("requires a temporary-password user to change password before a session", async () => {
    const { domain, administration } = createMemoryAuth();
    await createUser(administration, "new-user", { password: "temporary-password", mustChangePassword: true });
    await assert.rejects(() => domain.login({ loginName: "new-user", password: "temporary-password", deviceId: "new-device" }), (error) => error instanceof AuthError && error.code === "AUTH_PASSWORD_CHANGE_REQUIRED");
    const changed = await domain.changePassword({ loginName: "new-user", currentPassword: "temporary-password", newPassword: "permanent-password", deviceId: "new-device" });
    assert.equal(changed.user.mustChangePassword, false);
    assert.equal((await domain.login({ loginName: "new-user", password: "permanent-password", deviceId: "new-device" })).user.loginName, "new-user");
  });
});
