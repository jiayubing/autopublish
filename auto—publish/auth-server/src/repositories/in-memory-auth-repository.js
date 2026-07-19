function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class InMemoryAuthRepository {
  constructor(options) {
    const opts = options || {};
    this.state = clone(opts.state || {
      users: [],
      entitlements: [],
      devices: [],
      sessions: [],
      usedRefreshTokens: [],
      auditEvents: [],
    });
  }

  transaction(callback) {
    const snapshot = clone(this.state);
    try {
      return callback();
    } catch (error) {
      this.state = snapshot;
      throw error;
    }
  }

  createUser(user) { this.state.users.push(clone(user)); return clone(user); }
  findUserByLoginName(loginName) { return clone(this.state.users.find((user) => user.loginName === loginName) || null); }
  findUserById(id) { return clone(this.state.users.find((user) => user.id === id) || null); }
  listUsers() { return clone(this.state.users); }
  updateUser(id, patch) {
    const user = this.state.users.find((item) => item.id === id);
    if (!user) return null;
    Object.assign(user, clone(patch));
    return clone(user);
  }

  upsertEntitlement(entitlement) {
    const found = this.state.entitlements.find((item) => item.userId === entitlement.userId && item.product === entitlement.product);
    if (found) Object.assign(found, clone(entitlement));
    else this.state.entitlements.push(clone(entitlement));
    return clone(found || entitlement);
  }

  getEntitlements(userId) { return clone(this.state.entitlements.filter((item) => item.userId === userId)); }

  createDevice(device) { this.state.devices.push(clone(device)); return clone(device); }
  findDeviceById(id) { return clone(this.state.devices.find((device) => device.id === id) || null); }
  findDeviceByKeyHash(userId, deviceKeyHash) { return clone(this.state.devices.find((device) => device.userId === userId && device.deviceKeyHash === deviceKeyHash) || null); }
  listDevices(userId, options) {
    const devices = this.state.devices.filter((device) => device.userId === userId && (!(options && options.activeOnly) || !device.revokedAt));
    return clone(devices);
  }
  updateDevice(id, patch) {
    const device = this.state.devices.find((item) => item.id === id);
    if (!device) return null;
    Object.assign(device, clone(patch));
    return clone(device);
  }
  revokeDevice(id, revokedAt) { return this.updateDevice(id, { revokedAt: new Date(revokedAt).toISOString() }); }

  createSession(session) { this.state.sessions.push(clone(session)); return clone(session); }
  findSessionByAccessHash(hash) { return clone(this.state.sessions.find((session) => session.accessTokenHash === hash) || null); }
  findSessionByRefreshHash(hash) { return clone(this.state.sessions.find((session) => session.refreshTokenHash === hash) || null); }
  listActiveSessions(userId, deviceId) { return clone(this.state.sessions.filter((session) => session.userId === userId && !session.revokedAt && (!deviceId || session.deviceId === deviceId))); }
  listSessions(userId) { return clone(this.state.sessions.filter((session) => session.userId === userId)); }
  revokeSession(id, revokedAt, reason) {
    const patch = { revokedAt: new Date(revokedAt).toISOString(), revokeReason: reason || null };
    if (reason === "ROTATED") patch.rotatedAt = new Date(revokedAt).toISOString();
    return this.updateSession(id, patch);
  }
  updateSession(id, patch) {
    const session = this.state.sessions.find((item) => item.id === id);
    if (!session) return null;
    const cleanPatch = clone(patch);
    Object.keys(cleanPatch).forEach((key) => { if (cleanPatch[key] === undefined) delete cleanPatch[key]; });
    Object.assign(session, cleanPatch);
    return clone(session);
  }
  revokeAllSessions(userId, revokedAt, reason) { this.state.sessions.filter((session) => session.userId === userId && !session.revokedAt).forEach((session) => this.updateSession(session.id, { revokedAt: new Date(revokedAt).toISOString(), revokeReason: reason || null })); }
  revokeDeviceSessions(deviceId, revokedAt, reason) { this.state.sessions.filter((session) => session.deviceId === deviceId && !session.revokedAt).forEach((session) => this.updateSession(session.id, { revokedAt: new Date(revokedAt).toISOString(), revokeReason: reason || null })); }
  revokeFamily(familyId, revokedAt, reason) { this.state.sessions.filter((session) => session.familyId === familyId && !session.revokedAt).forEach((session) => this.updateSession(session.id, { revokedAt: new Date(revokedAt).toISOString(), revokeReason: reason || null })); }

  markUsedRefreshToken(item) {
    if (!this.state.usedRefreshTokens.some((token) => token.tokenHash === item.tokenHash)) this.state.usedRefreshTokens.push(clone(item));
  }
  findUsedRefreshToken(tokenHash) { return clone(this.state.usedRefreshTokens.find((token) => token.tokenHash === tokenHash) || null); }
  cleanupUsedRefreshTokens(now) {
    const timestamp = new Date(now).toISOString();
    this.state.usedRefreshTokens = this.state.usedRefreshTokens.filter((token) => token.expiresAt > timestamp);
  }

  addAuditEvent(event) { this.state.auditEvents.push(clone(event)); return clone(event); }
  listAuditEvents(options) {
    let events = this.state.auditEvents.slice();
    if (options.userId) events = events.filter((event) => event.userId === options.userId);
    if (options.limit) events = events.slice(-Math.min(Number(options.limit), 500));
    return clone(events);
  }

  healthCheck() { return true; }
  getData() { return clone(this.state); }
  close() {}
}

function createInMemoryAuthRepository(options) { return new InMemoryAuthRepository(options); }

module.exports = { InMemoryAuthRepository, createInMemoryAuthRepository };
