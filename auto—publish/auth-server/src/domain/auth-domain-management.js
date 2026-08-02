const { AuthError } = require("../auth-errors");
const { normalizeExpiry } = require("./auth-policy-utils");
const {
  projectDevice,
  projectSession,
  projectUser,
} = require("./auth-projection");

class AuthDomainManagement {
  async createManagedUser(input) {
    const prepared = await this.accountPolicy.prepareCreate(input);
    return this._withMutation(() => this.accountPolicy.create(prepared));
  }

  async setUserEnabled(identifier, enabled) {
    return this._withMutation(() =>
      this.accountPolicy.setEnabled(identifier, enabled),
    );
  }

  async resetPassword(identifier, password) {
    const nextPassword = this.passwordPolicy.normalize(password);
    const passwordHash = await this.passwordHasher(
      nextPassword,
      this.passwordOptions,
    );
    return this._withMutation(() =>
      this.accountPolicy.applyPasswordReset(identifier, passwordHash),
    );
  }

  async setExpiry(identifier, expiresAt, permanent) {
    if (permanent !== true && expiresAt === undefined)
      throw new AuthError("AUTH_EXPIRY_REQUIRED");
    const normalized = normalizeExpiry(permanent ? null : expiresAt, false);
    return this._withMutation(() =>
      this.accountPolicy.setExpiry(identifier, normalized),
    );
  }

  async setDeviceLimit(identifier, maxDevices) {
    return this._withMutation(() =>
      this.accountPolicy.setDeviceLimit(identifier, maxDevices),
    );
  }

  async setNote(identifier, note) {
    return this._withMutation(() =>
      this.accountPolicy.setNote(identifier, note),
    );
  }

  async revokeDevice(identifier, deviceId) {
    return this._withMutation(() =>
      this.accountPolicy.revokeDevice(identifier, deviceId),
    );
  }

  async revokeSessions(identifier) {
    return this._withMutation(() =>
      this.accountPolicy.revokeSessions(identifier),
    );
  }

  listUsers() {
    return this.repository
      .listUsers()
      .map((user) => this.accountPolicy.project(user));
  }

  showUser(identifier) {
    const user = this.accountPolicy.findManaged(identifier);
    const activeCount = this.devicePolicy.activeCount(user.id);
    const devices = this.repository
      .listDevices(user.id)
      .map((device) => projectDevice(device, activeCount, user.maxDevices));
    const sessions = this.repository.listSessions(user.id).map(projectSession);
    return Object.assign(projectUser(user), {
      entitlements: this.entitlementPolicy.forUser(user.id),
      devices,
      sessions,
    });
  }

  listDevices(identifier) {
    const user = this.accountPolicy.findManaged(identifier);
    const activeCount = this.devicePolicy.activeCount(user.id);
    return this.repository
      .listDevices(user.id)
      .map((device) => projectDevice(device, activeCount, user.maxDevices));
  }

  listAudit(options) {
    return this.repository.listAuditEvents(options || {}).map((event) => ({
      id: event.id,
      eventCode: event.eventCode,
      userId: event.userId,
      deviceId: event.deviceId,
      sourceFingerprint: event.sourceFingerprint,
      resultCode: event.resultCode,
      createdAt: event.createdAt,
    }));
  }

  healthCheck() {
    return typeof this.repository.healthCheck === "function"
      ? this.repository.healthCheck()
      : true;
  }

  getLoginRateLimitStats() {
    return this.loginPolicy.getStats();
  }

  clearLoginRateLimitState() {
    return this.loginPolicy.clear();
  }
}

module.exports = { AuthDomainManagement };
