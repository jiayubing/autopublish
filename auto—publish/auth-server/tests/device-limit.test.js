const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { createMemoryAuth, createUser } = require("./helpers");

describe("device registration and device slots", () => {
  it("does not consume a second slot for the same stable device and releases a revoked one", async () => {
    const { domain, administration } = createMemoryAuth();
    await createUser(administration, "device-user", { password: "device-password", maxDevices: 1 });
    const first = await domain.login({ loginName: "device-user", password: "device-password", deviceId: "stable-a", deviceName: "Office PC" });
    const repeated = await domain.login({ loginName: "device-user", password: "device-password", deviceId: "stable-a", deviceName: "Office PC" });
    assert.equal(repeated.device.deviceCount, 1);
    await assert.rejects(() => domain.login({ loginName: "device-user", password: "device-password", deviceId: "device-b" }), (error) => error.code === "AUTH_DEVICE_LIMIT_REACHED");
    const device = (await administration.query({ type: "list-devices", loginName: "device-user" }))[0];
    await administration.execute({ type: "revoke-device", loginName: "device-user", deviceId: device.id });
    await assert.rejects(() => domain.refresh({ refreshToken: first.refreshToken, deviceId: "stable-a" }), (error) => error.code === "AUTH_DEVICE_REVOKED");
    const second = await domain.login({ loginName: "device-user", password: "device-password", deviceId: "device-b" });
    assert.equal(second.device.deviceCount, 1);
  });
});
