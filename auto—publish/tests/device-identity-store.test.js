const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");
const { createDeviceIdentityStore } = require("../desktop/device-identity-store");

describe("persistent desktop device identity", () => {
  it("keeps one random installation identity across service launches", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "autopublish-device-"));
    try {
      const first = createDeviceIdentityStore({ userDataPath: root, randomUUID: () => "11111111-1111-4111-8111-111111111111", now: () => 0 });
      const second = createDeviceIdentityStore({ userDataPath: root, randomUUID: () => "22222222-2222-4222-8222-222222222222", now: () => 1 });
      assert.equal(first.getDeviceId(), "11111111-1111-4111-8111-111111111111");
      assert.equal(second.getDeviceId(), first.getDeviceId());
      assert.equal(JSON.parse(fs.readFileSync(path.join(root, "device-identity.json"), "utf8")).version, 1);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("fails closed when the identity file is malformed", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "autopublish-device-"));
    try {
      fs.writeFileSync(path.join(root, "device-identity.json"), "not-json");
      assert.throws(() => createDeviceIdentityStore({ userDataPath: root }).getDeviceId(), { code: "AUTH_DEVICE_ID_CORRUPTED" });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
