const { createOpaqueToken, hashToken } = require("../token-service");
const { AuthError } = require("../auth-errors");
const { nowIso, positiveNumber } = require("./auth-policy-utils");

class SessionPolicy {
  constructor(options) {
    const opts = options || {};
    if (!opts.repository)
      throw new TypeError("SessionPolicy requires a repository");
    this.repository = opts.repository;
    this.now = opts.now || (() => Date.now());
    this.accessTtlMs = positiveNumber(opts.accessTtlMs, 15 * 60 * 1000);
    this.refreshTtlMs = positiveNumber(
      opts.refreshTtlMs,
      30 * 24 * 60 * 60 * 1000,
    );
    this.maxSessionsPerUser = positiveNumber(opts.maxSessionsPerUser, 10);
    this.maxSessionsPerDevice = positiveNumber(opts.maxSessionsPerDevice, 3);
  }

  create(user, device, familyId) {
    this.prune(user.id, device.id);
    const createdAt = this.now();
    const accessToken = createOpaqueToken(32);
    const refreshToken = createOpaqueToken(48);
    const session = {
      id: createOpaqueToken(12),
      familyId: familyId || createOpaqueToken(16),
      userId: user.id,
      deviceId: device.id,
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshToken),
      accessExpiresAt: new Date(createdAt + this.accessTtlMs).toISOString(),
      refreshExpiresAt: new Date(createdAt + this.refreshTtlMs).toISOString(),
      createdAt: new Date(createdAt).toISOString(),
      lastSeenAt: new Date(createdAt).toISOString(),
      rotatedAt: null,
      revokedAt: null,
      revokeReason: null,
    };
    this.repository.createSession(session);
    return { accessToken, refreshToken, session };
  }

  access(accessToken) {
    if (typeof accessToken !== "string" || !accessToken)
      throw new AuthError("AUTH_SESSION_EXPIRED");
    const session = this.repository.findSessionByAccessHash(
      hashToken(accessToken),
    );
    if (
      !session ||
      session.revokedAt ||
      Date.parse(session.accessExpiresAt) <= this.now()
    )
      throw new AuthError("AUTH_SESSION_EXPIRED");
    return session;
  }

  refresh(refreshToken) {
    return this.repository.findSessionByRefreshHash(hashToken(refreshToken));
  }

  cleanupUsedTokens() {
    if (typeof this.repository.cleanupUsedRefreshTokens === "function")
      this.repository.cleanupUsedRefreshTokens(this.now());
  }

  rotate(existing, refreshToken, user, device) {
    const tokenHash = hashToken(refreshToken);
    const updatedAt = nowIso(this.now);
    this.repository.revokeSession(existing.id, this.now(), "ROTATED");
    this.repository.markUsedRefreshToken({
      tokenHash,
      familyId: existing.familyId,
      userId: user.id,
      deviceId: device.id,
      usedAt: updatedAt,
      expiresAt: existing.refreshExpiresAt,
    });
    return this.create(user, device, existing.familyId);
  }

  revoke(session, reason) {
    if (!session || session.revokedAt) return false;
    this.repository.revokeSession(session.id, this.now(), reason || "LOGOUT");
    return true;
  }

  revokeByToken(token, kind, reason) {
    if (typeof token !== "string" || !token) return null;
    const hash = hashToken(token);
    const session =
      kind === "refresh"
        ? this.repository.findSessionByRefreshHash(hash)
        : this.repository.findSessionByAccessHash(hash);
    if (!session || !this.revoke(session, reason)) return null;
    return session;
  }

  prune(userId, deviceId) {
    const active = this.repository.listActiveSessions(userId);
    const deviceSessions = active
      .filter((session) => session.deviceId === deviceId)
      .sort((left, right) =>
        String(left.createdAt).localeCompare(String(right.createdAt)),
      );
    while (deviceSessions.length >= this.maxSessionsPerDevice) {
      const oldest = deviceSessions.shift();
      this.repository.revokeSession(oldest.id, this.now(), "SESSION_LIMIT");
    }
    const remaining = this.repository
      .listActiveSessions(userId)
      .sort((left, right) =>
        String(left.createdAt).localeCompare(String(right.createdAt)),
      );
    while (remaining.length >= this.maxSessionsPerUser) {
      const oldest = remaining.shift();
      this.repository.revokeSession(oldest.id, this.now(), "SESSION_LIMIT");
    }
  }
}

module.exports = { SessionPolicy };
