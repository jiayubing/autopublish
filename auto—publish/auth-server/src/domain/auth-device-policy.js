const { createOpaqueToken, hashToken } = require("../token-service");
const { AuthError } = require("../auth-errors");
const { projectDevice } = require("./auth-projection");
const { nowIso, safeText } = require("./auth-policy-utils");

class DevicePolicy {
  constructor(options) {
    const opts = options || {};
    if (!opts.repository)
      throw new TypeError("DevicePolicy requires a repository");
    this.repository = opts.repository;
    this.now = opts.now || (() => Date.now());
    this.audit = typeof opts.audit === "function" ? opts.audit : () => {};
  }

  key(deviceId) {
    const value =
      deviceId === undefined || deviceId === null || deviceId === ""
        ? "legacy-installation"
        : String(deviceId);
    if (value.length > 256) throw new AuthError("AUTH_INPUT_INVALID");
    return { value, hash: hashToken(value) };
  }

  activeCount(userId) {
    return this.repository.listDevices(userId, { activeOnly: true }).length;
  }

  project(device, user) {
    return projectDevice(
      device,
      this.activeCount(user.id),
      Number(user.maxDevices),
    );
  }

  register(user, input) {
    const request = input || {};
    const key = this.key(request.deviceId);
    const now = this.now();
    const timestamp = new Date(now).toISOString();
    let device = this.repository.findDeviceByKeyHash(user.id, key.hash);
    if (device && device.revokedAt) {
      this.audit(
        "DEVICE_REVOKED",
        user.id,
        device.id,
        request.sourceFingerprint,
        "AUTH_DEVICE_REVOKED",
      );
      throw new AuthError("AUTH_DEVICE_REVOKED");
    }
    if (!device && this.activeCount(user.id) >= Number(user.maxDevices)) {
      this.audit(
        "DEVICE_LIMIT_REJECTED",
        user.id,
        null,
        request.sourceFingerprint,
        "AUTH_DEVICE_LIMIT_REACHED",
      );
      throw new AuthError("AUTH_DEVICE_LIMIT_REACHED");
    }
    if (!device) {
      device = {
        id: createOpaqueToken(12),
        userId: user.id,
        deviceKeyHash: key.hash,
        displayName: safeText(request.deviceName, 128),
        appVersion: safeText(request.appVersion, 64),
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
        revokedAt: null,
      };
      this.repository.createDevice(device);
      this.audit(
        "DEVICE_REGISTERED",
        user.id,
        device.id,
        request.sourceFingerprint,
      );
    } else {
      device = this.touch(device, request, timestamp);
    }
    return { device, deviceKey: key };
  }

  touch(device, input, timestamp) {
    const request = input || {};
    const patch = {
      displayName:
        safeText(request.deviceName, 128) || device.displayName || null,
      appVersion: safeText(request.appVersion, 64) || device.appVersion || null,
      lastSeenAt: timestamp || nowIso(this.now),
    };
    this.repository.updateDevice(device.id, patch);
    return Object.assign({}, device, patch);
  }

  find(deviceId) {
    return this.repository.findDeviceById(deviceId);
  }

  revoke(user, deviceId) {
    const device = this.find(String(deviceId || ""));
    if (!device || device.userId !== user.id)
      throw new AuthError("AUTH_DEVICE_NOT_FOUND");
    const revokedAt = this.now();
    this.repository.revokeDevice(device.id, revokedAt);
    this.repository.revokeDeviceSessions(
      device.id,
      revokedAt,
      "DEVICE_REVOKED",
    );
    this.audit("DEVICE_REVOKED", user.id, device.id, null);
    return Object.assign({}, device, {
      revokedAt: new Date(revokedAt).toISOString(),
    });
  }
}

module.exports = { DevicePolicy };
