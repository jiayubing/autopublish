const { createOpaqueToken, hashToken } = require("./token-service");
const { AuthError } = require("./auth-errors");
const { DEFAULT_PRODUCT } = require("./domain/auth-entitlement-policy");
const {
  DUMMY_PASSWORD_HASH,
  MIN_PASSWORD_LENGTH,
  PASSWORD_COST,
  PasswordPolicy,
  PASSWORD_MAX_MEMORY,
  ScryptLimiter,
  createPasswordHash,
  verifyPassword,
} = require("./domain/auth-password-policy");
const {
  projectDevice,
  projectEntitlements,
  projectUser,
  sanitizeDevice,
  sanitizeEntitlements,
  sanitizeUser,
} = require("./domain/auth-projection");
const {
  normalizeLoginName,
  nowIso,
  safeText,
} = require("./domain/auth-policy-utils");
const { composeAuthPolicies } = require("./domain/auth-domain-composition");
const { AuthDomainManagement } = require("./domain/auth-domain-management");
const { LoginPolicy } = require("./security/login-policy");

class AuthDomain extends AuthDomainManagement {
  constructor(options) {
    super();
    const opts = options || {};
    if (!opts.repository)
      throw new TypeError("AuthDomain requires a repository");
    this.repository = opts.repository;
    this.now = opts.now || (() => Date.now());
    composeAuthPolicies(this, opts);
    this.mutationTail = Promise.resolve();
  }

  async _withMutation(callback) {
    const previous = this.mutationTail;
    let release;
    this.mutationTail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const run = () => callback();
      return await (typeof this.repository.transaction === "function"
        ? this.repository.transaction(run)
        : run());
    } finally {
      release();
    }
  }

  _nowIso() {
    return nowIso(this.now);
  }

  _userByLogin(loginName) {
    return this.accountPolicy.findByLogin(loginName);
  }

  _assertEnabled(user) {
    const code = this.loginPolicy.classifyAccount(user);
    if (code) throw new AuthError(code);
  }

  _assertEntitled(entitlements) {
    return this.entitlementPolicy.assertActive(entitlements);
  }

  _assertUserUsable(user, entitlements) {
    this._assertEnabled(user);
    this._assertEntitled(entitlements);
  }

  _audit(eventCode, userId, deviceId, sourceFingerprint, resultCode) {
    this.repository.addAuditEvent({
      id: createOpaqueToken(12),
      eventCode,
      userId: userId || null,
      deviceId: deviceId || null,
      sourceFingerprint: sourceFingerprint
        ? hashToken(safeText(sourceFingerprint, 256)).slice(0, 24)
        : null,
      resultCode: resultCode || null,
      createdAt: this._nowIso(),
    });
  }

  _publicSession(tokens, user, entitlements, device) {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessExpiresAt: tokens.session.accessExpiresAt,
      refreshExpiresAt: tokens.session.refreshExpiresAt,
      user: projectUser(user),
      entitlements: projectEntitlements(entitlements),
      device: projectDevice(
        device,
        this.devicePolicy.activeCount(user.id),
        Number(user.maxDevices),
      ),
    };
  }

  async login(input) {
    const request = input || {};
    const loginName = normalizeLoginName(request.loginName);
    this.passwordPolicy.validateLoginSecret(request.password);
    const attempt = this.loginPolicy.begin({
      loginName,
      sourceFingerprint: request.sourceFingerprint,
    });
    if (!attempt.allowed) throw new AuthError("AUTH_RATE_LIMITED");
    const user = this._userByLogin(loginName);
    const passwordHash = user ? user.passwordHash : DUMMY_PASSWORD_HASH;
    const validPassword = await this.passwordVerifier(
      request.password,
      passwordHash,
      this.passwordOptions,
    );
    return this._withMutation(() => {
      const current = this._userByLogin(loginName);
      if (!current || !validPassword) {
        const failure = this.loginPolicy.recordFailure(current);
        if (current && failure.update)
          this.repository.updateUser(
            current.id,
            Object.assign({}, failure.update, { updatedAt: this._nowIso() }),
          );
        this._audit(
          failure.eventCode,
          current && current.enabled ? current.id : null,
          null,
          request.sourceFingerprint,
          failure.code,
        );
        throw new AuthError(failure.code);
      }
      const entitlements = this.entitlementPolicy.forUser(current.id);
      this._assertUserUsable(current, entitlements);
      const updatedAt = this._nowIso();
      this.repository.updateUser(current.id, {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: updatedAt,
        updatedAt,
      });
      this.loginPolicy.onSuccess(attempt);
      if (current.mustChangePassword) {
        this._audit(
          "LOGIN_SUCCEEDED",
          current.id,
          null,
          request.sourceFingerprint,
          "AUTH_PASSWORD_CHANGE_REQUIRED",
        );
        return { passwordChangeRequired: true, user: current, entitlements };
      }
      const registered = this.devicePolicy.register(current, request);
      const tokens = this.sessionPolicy.create(current, registered.device);
      this._audit(
        "LOGIN_SUCCEEDED",
        current.id,
        registered.device.id,
        request.sourceFingerprint,
      );
      return {
        session: this._publicSession(
          tokens,
          current,
          entitlements,
          registered.device,
        ),
      };
    })
      .then((result) => {
        if (result.passwordChangeRequired)
          throw new AuthError("AUTH_PASSWORD_CHANGE_REQUIRED", {
            user: projectUser(result.user),
          });
        return result.session;
      })
      .catch(async (error) => {
        if (
          error instanceof AuthError &&
          ["AUTH_DEVICE_LIMIT_REACHED", "AUTH_DEVICE_REVOKED"].includes(
            error.code,
          )
        ) {
          try {
            await this._withMutation(() =>
              this._audit(
                error.code === "AUTH_DEVICE_LIMIT_REACHED"
                  ? "DEVICE_LIMIT_REJECTED"
                  : "DEVICE_REVOKED",
                user && user.id,
                null,
                request.sourceFingerprint,
                error.code,
              ),
            );
          } catch (_) {
            /* preserve the stable domain error */
          }
        }
        throw error;
      });
  }

  _accessSession(accessToken) {
    const session = this.sessionPolicy.access(accessToken);
    const user = this.repository.findUserById(session.userId);
    if (!user) throw new AuthError("AUTH_SESSION_EXPIRED");
    const entitlements = this.entitlementPolicy.forUser(user.id);
    this._assertUserUsable(user, entitlements);
    const device = this.devicePolicy.find(session.deviceId);
    if (!device || device.revokedAt) throw new AuthError("AUTH_DEVICE_REVOKED");
    return { session, user, entitlements, device };
  }

  async inspect(accessToken) {
    return this._withMutation(() => {
      const current = this._accessSession(accessToken);
      if (current.user.mustChangePassword)
        throw new AuthError("AUTH_PASSWORD_CHANGE_REQUIRED", {
          user: projectUser(current.user),
        });
      return {
        user: projectUser(current.user),
        entitlements: current.entitlements,
        device: projectDevice(
          current.device,
          this.devicePolicy.activeCount(current.user.id),
          current.user.maxDevices,
        ),
      };
    });
  }

  async refresh(input) {
    const request = input || {};
    if (typeof request.refreshToken !== "string" || !request.refreshToken)
      throw new AuthError("AUTH_INPUT_INVALID");
    return this._withMutation(() => {
      this.sessionPolicy.cleanupUsedTokens();
      const existing = this.sessionPolicy.refresh(request.refreshToken);
      if (!existing) throw new AuthError("AUTH_SESSION_EXPIRED");
      if (existing.revokedAt) {
        const revokedDevice = this.devicePolicy.find(existing.deviceId);
        if (revokedDevice && revokedDevice.revokedAt)
          throw new AuthError("AUTH_DEVICE_REVOKED");
        const used = this.repository.findUsedRefreshToken(
          hashToken(request.refreshToken),
        );
        if (used) {
          this.repository.revokeFamily(
            used.familyId,
            this.now(),
            "TOKEN_REUSE",
          );
          this._audit(
            "TOKEN_REUSE_DETECTED",
            used.userId,
            used.deviceId,
            request.sourceFingerprint,
            "AUTH_TOKEN_REUSE_DETECTED",
          );
          return { tokenReuseDetected: true };
        }
        throw new AuthError("AUTH_SESSION_EXPIRED");
      }
      if (Date.parse(existing.refreshExpiresAt) <= this.now()) {
        this.repository.revokeSession(existing.id, this.now(), "EXPIRED");
        throw new AuthError("AUTH_SESSION_EXPIRED");
      }
      const user = this.repository.findUserById(existing.userId);
      if (!user) throw new AuthError("AUTH_SESSION_EXPIRED");
      const entitlements = this.entitlementPolicy.forUser(user.id);
      this._assertUserUsable(user, entitlements);
      const device = this.devicePolicy.find(existing.deviceId);
      if (!device || device.revokedAt)
        throw new AuthError("AUTH_DEVICE_REVOKED");
      if (
        request.deviceId !== undefined &&
        this.devicePolicy.key(request.deviceId).hash !== device.deviceKeyHash
      )
        throw new AuthError("AUTH_SESSION_EXPIRED");
      const updatedAt = this._nowIso();
      const refreshedDevice = this.devicePolicy.touch(
        device,
        request,
        updatedAt,
      );
      const tokens = this.sessionPolicy.rotate(
        existing,
        request.refreshToken,
        user,
        refreshedDevice,
      );
      this._audit(
        "SESSION_REFRESHED",
        user.id,
        device.id,
        request.sourceFingerprint,
      );
      return this._publicSession(tokens, user, entitlements, refreshedDevice);
    }).then((result) => {
      if (result && result.tokenReuseDetected)
        throw new AuthError("AUTH_TOKEN_REUSE_DETECTED");
      return result;
    });
  }

  async logout(input) {
    const request = input || {};
    return this._withMutation(() => {
      let revoked = false;
      const accessSession = this.sessionPolicy.revokeByToken(
        request.accessToken,
        "access",
        "LOGOUT",
      );
      if (accessSession) {
        this._audit(
          "SESSION_REVOKED",
          accessSession.userId,
          accessSession.deviceId,
          request.sourceFingerprint,
          "LOGOUT",
        );
        revoked = true;
      }
      const refreshSession = this.sessionPolicy.revokeByToken(
        request.refreshToken,
        "refresh",
        "LOGOUT",
      );
      if (refreshSession) {
        this._audit(
          "SESSION_REVOKED",
          refreshSession.userId,
          refreshSession.deviceId,
          request.sourceFingerprint,
          "LOGOUT",
        );
        revoked = true;
      }
      return { loggedOut: true, revoked };
    });
  }

  async changePassword(input) {
    const request = input || {};
    const newPassword = this.passwordPolicy.normalize(request.newPassword);
    const accessToken = request.accessToken || null;
    let currentUser;
    let currentDevice;
    if (accessToken) {
      const current = await this.inspectForPasswordChange(accessToken);
      currentUser = current.user;
      currentDevice = current.device;
    } else {
      const loginName = normalizeLoginName(request.loginName);
      if (typeof request.currentPassword !== "string")
        throw new AuthError("AUTH_INVALID_CREDENTIALS");
      const found = this._userByLogin(loginName);
      const valid = await this.passwordVerifier(
        request.currentPassword,
        found ? found.passwordHash : DUMMY_PASSWORD_HASH,
        this.passwordOptions,
      );
      if (!found || !valid) throw new AuthError("AUTH_INVALID_CREDENTIALS");
      this._assertEnabled(found);
      this._assertEntitled(this.entitlementPolicy.forUser(found.id));
      if (!found.mustChangePassword)
        throw new AuthError("AUTH_SESSION_EXPIRED");
      currentUser = found;
    }
    if (typeof request.currentPassword === "string") {
      const valid = await this.passwordVerifier(
        request.currentPassword,
        currentUser.passwordHash,
        this.passwordOptions,
      );
      if (!valid) throw new AuthError("AUTH_INVALID_CREDENTIALS");
    }
    if (request.currentPassword === newPassword)
      throw new AuthError("AUTH_INPUT_INVALID");
    const passwordHash = await this.passwordHasher(
      newPassword,
      this.passwordOptions,
    );
    return this._withMutation(() => {
      const user = this.repository.findUserById(currentUser.id);
      if (!user) throw new AuthError("AUTH_SESSION_EXPIRED");
      this._assertEnabled(user);
      const entitlements = this.entitlementPolicy.forUser(user.id);
      this._assertEntitled(entitlements);
      const changedUser = this.accountPolicy.applyPasswordChange(
        user,
        passwordHash,
      );
      const registered = currentDevice
        ? { device: currentDevice }
        : this.devicePolicy.register(changedUser, request);
      const tokens = this.sessionPolicy.create(changedUser, registered.device);
      this._audit(
        "PASSWORD_CHANGED",
        user.id,
        registered.device.id,
        request.sourceFingerprint,
      );
      return this._publicSession(
        tokens,
        changedUser,
        entitlements,
        registered.device,
      );
    });
  }

  async inspectForPasswordChange(accessToken) {
    return this._withMutation(() => this._accessSession(accessToken));
  }
}

module.exports = {
  AuthDomain,
  AuthError,
  DEFAULT_PRODUCT,
  DUMMY_PASSWORD_HASH,
  LoginPolicy,
  MIN_PASSWORD_LENGTH,
  PASSWORD_COST,
  PASSWORD_MAX_MEMORY,
  PasswordPolicy,
  ScryptLimiter,
  createPasswordHash,
  projectDevice,
  projectEntitlements,
  projectUser,
  sanitizeDevice,
  sanitizeEntitlements,
  sanitizeUser,
  verifyPassword,
};
