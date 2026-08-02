const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const { AuthDomain } = require("../src/auth-domain");
const {
  InMemoryAuthRepository,
} = require("../src/repositories/in-memory-auth-repository");
const {
  projectDevice,
  projectEntitlements,
  projectSession,
  projectUser,
} = require("../src/domain/auth-projection");

describe("AuthDomain policy facade contract", () => {
  it("keeps auth operations behind the facade without SQL or HTTP policy knowledge", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../src/auth-domain.js"),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /node:sqlite|\bSELECT\b|\bINSERT\b|writeHead|response\.end/,
    );
    assert.doesNotMatch(
      source,
      /function\s+(createPasswordHash|verifyPassword|sanitizeUser|sanitizeDevice|sanitizeEntitlements)\b/,
    );
    const domain = new AuthDomain({
      repository: new InMemoryAuthRepository(),
      passwordVerifier: async () => false,
    });
    for (const method of [
      "login",
      "refresh",
      "inspect",
      "logout",
      "changePassword",
      "createManagedUser",
      "setUserEnabled",
      "resetPassword",
      "setExpiry",
      "setDeviceLimit",
      "revokeDevice",
      "revokeSessions",
    ]) {
      assert.equal(typeof domain[method], "function", method);
    }
  });

  it("projects safe user, entitlement, device and session DTOs", () => {
    const user = projectUser({
      id: "user-id",
      loginName: "fixture-user",
      role: "user",
      enabled: true,
      mustChangePassword: false,
      maxDevices: 1,
      note: null,
      passwordHash: "secret-hash",
    });
    const entitlements = projectEntitlements([
      {
        product: "AutoPublish",
        enabled: true,
        expiresAt: null,
        token: "secret-token",
      },
    ]);
    const device = projectDevice(
      {
        id: "device-id",
        displayName: "fixture",
        appVersion: "1",
        deviceKeyHash: "secret-device-hash",
        revokedAt: null,
        firstSeenAt: "2026-01-01T00:00:00.000Z",
        lastSeenAt: "2026-01-01T00:00:00.000Z",
      },
      1,
      1,
    );
    const session = projectSession({
      id: "session-id",
      familyId: "family-id",
      deviceId: "device-id",
      accessTokenHash: "secret-access-hash",
      refreshTokenHash: "secret-refresh-hash",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
      revokedAt: null,
      revokeReason: null,
    });
    const serialized = JSON.stringify({ user, entitlements, device, session });
    assert.equal(serialized.includes("secret-hash"), false);
    assert.equal(serialized.includes("secret-token"), false);
    assert.equal(serialized.includes("secret-device-hash"), false);
    assert.equal(serialized.includes("secret-access-hash"), false);
    assert.equal(serialized.includes("secret-refresh-hash"), false);
    assert.equal(user.loginName, "fixture-user");
    assert.equal(device.deviceCount, 1);
    assert.equal(session.familyId, "family-id");
  });
});
