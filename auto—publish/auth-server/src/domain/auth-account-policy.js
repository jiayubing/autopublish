const { createOpaqueToken } = require("../token-service");
const { AuthError } = require("../auth-errors");
const {
  normalizeExpiry,
  normalizeLoginName,
  nowIso,
  safeText,
} = require("./auth-policy-utils");
const { projectUser } = require("./auth-projection");

class AccountPolicy {
  constructor(options) {
    const opts = options || {};
    if (!opts.repository)
      throw new TypeError("AccountPolicy requires a repository");
    this.repository = opts.repository;
    this.now = opts.now || (() => Date.now());
    this.passwordPolicy = opts.passwordPolicy;
    this.entitlementPolicy = opts.entitlementPolicy;
    this.devicePolicy = opts.devicePolicy;
    this.audit = typeof opts.audit === "function" ? opts.audit : () => {};
  }

  findByLogin(loginName) {
    return this.repository.findUserByLoginName(loginName);
  }

  findManaged(identifier) {
    if (!identifier) throw new AuthError("AUTH_USER_NOT_FOUND");
    const user =
      this.repository.findUserById(String(identifier)) ||
      this.repository.findUserByLoginName(String(identifier));
    if (!user) throw new AuthError("AUTH_USER_NOT_FOUND");
    return user;
  }

  project(user) {
    return Object.assign(projectUser(user), {
      entitlements: this.entitlementPolicy.forUser(user.id),
    });
  }

  async prepareCreate(input) {
    const request = input || {};
    const loginName = normalizeLoginName(request.loginName);
    const password = this.passwordPolicy.normalize(request.password);
    const role = request.role === undefined ? "user" : String(request.role);
    if (role !== "admin" && role !== "user")
      throw new AuthError("AUTH_INPUT_INVALID");
    const permanent = request.permanent === true;
    if (!permanent && request.expiresAt === undefined)
      throw new AuthError("AUTH_EXPIRY_REQUIRED");
    return {
      request,
      loginName,
      role,
      permanent,
      expiresAt: normalizeExpiry(permanent ? null : request.expiresAt, false),
      passwordHash: await this.passwordPolicy.hash(password),
    };
  }

  create(prepared) {
    const request = prepared.request || {};
    if (this.findByLogin(prepared.loginName))
      throw new AuthError("AUTH_USER_EXISTS");
    const createdAt = nowIso(this.now);
    const user = {
      id: createOpaqueToken(12),
      loginName: prepared.loginName,
      passwordHash: prepared.passwordHash,
      role: prepared.role,
      enabled: request.enabled === undefined ? true : Boolean(request.enabled),
      mustChangePassword:
        request.mustChangePassword === undefined
          ? prepared.role === "user"
          : Boolean(request.mustChangePassword),
      maxDevices:
        request.maxDevices === undefined ? 1 : Number(request.maxDevices),
      note: safeText(request.note, 512),
      failedLoginCount: 0,
      lockedUntil: null,
      createdAt,
      updatedAt: createdAt,
      lastLoginAt: null,
      passwordChangedAt: createdAt,
    };
    if (
      !Number.isInteger(user.maxDevices) ||
      user.maxDevices < 1 ||
      user.maxDevices > 10
    )
      throw new AuthError("AUTH_INPUT_INVALID");
    this.repository.createUser(user);
    this.entitlementPolicy.createForUser(user.id, {
      enabled:
        request.entitlementEnabled === undefined
          ? true
          : Boolean(request.entitlementEnabled),
      expiresAt: prepared.expiresAt,
      createdAt,
      updatedAt: createdAt,
    });
    this.audit("ACCOUNT_CREATED", user.id, null, null);
    return this.project(user);
  }

  setEnabled(identifier, enabled) {
    const user = this.findManaged(identifier);
    const nextEnabled = Boolean(enabled);
    const updatedAt = nowIso(this.now);
    this.repository.updateUser(user.id, { enabled: nextEnabled, updatedAt });
    if (!nextEnabled) {
      this.repository.revokeAllSessions(
        user.id,
        this.now(),
        "ACCOUNT_DISABLED",
      );
      this.audit("ACCOUNT_DISABLED", user.id, null, null);
    }
    return this.project(
      Object.assign({}, user, { enabled: nextEnabled, updatedAt }),
    );
  }

  applyPasswordReset(identifier, passwordHash) {
    const user = this.findManaged(identifier);
    const updatedAt = nowIso(this.now);
    this.repository.updateUser(user.id, {
      passwordHash,
      mustChangePassword: true,
      passwordChangedAt: updatedAt,
      failedLoginCount: 0,
      lockedUntil: null,
      updatedAt,
    });
    this.repository.revokeAllSessions(user.id, this.now(), "PASSWORD_RESET");
    this.audit("PASSWORD_RESET", user.id, null, null);
    return this.project(
      Object.assign({}, user, { mustChangePassword: true, updatedAt }),
    );
  }

  applyPasswordChange(user, passwordHash) {
    const changedAt = nowIso(this.now);
    this.repository.updateUser(user.id, {
      passwordHash,
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
      passwordChangedAt: changedAt,
      updatedAt: changedAt,
    });
    this.repository.revokeAllSessions(user.id, this.now(), "PASSWORD_CHANGED");
    return Object.assign({}, user, {
      passwordHash,
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
      passwordChangedAt: changedAt,
      updatedAt: changedAt,
    });
  }

  setExpiry(identifier, expiresAt) {
    const user = this.findManaged(identifier);
    const entitlements = this.entitlementPolicy.setExpiry(user.id, expiresAt);
    this.audit("ENTITLEMENT_UPDATED", user.id, null, null);
    return Object.assign(projectUser(user), { entitlements });
  }

  setDeviceLimit(identifier, maxDevices) {
    const limit = Number(maxDevices);
    if (!Number.isInteger(limit) || limit < 1 || limit > 10)
      throw new AuthError("AUTH_INPUT_INVALID");
    const user = this.findManaged(identifier);
    const updatedAt = nowIso(this.now);
    this.repository.updateUser(user.id, { maxDevices: limit, updatedAt });
    this.audit("DEVICE_LIMIT_UPDATED", user.id, null, null);
    return Object.assign(
      projectUser(Object.assign({}, user, { maxDevices: limit, updatedAt })),
      { entitlements: this.entitlementPolicy.forUser(user.id) },
    );
  }

  setNote(identifier, note) {
    const user = this.findManaged(identifier);
    const updatedAt = nowIso(this.now);
    const nextNote = safeText(note, 512);
    this.repository.updateUser(user.id, { note: nextNote, updatedAt });
    return Object.assign(
      projectUser(Object.assign({}, user, { note: nextNote, updatedAt })),
      { entitlements: this.entitlementPolicy.forUser(user.id) },
    );
  }

  revokeDevice(identifier, deviceId) {
    const user = this.findManaged(identifier);
    const device = this.devicePolicy.revoke(user, deviceId);
    return this.devicePolicy.project(device, user);
  }

  revokeSessions(identifier) {
    const user = this.findManaged(identifier);
    this.repository.revokeAllSessions(user.id, this.now(), "ADMIN_REVOKE");
    this.audit("SESSION_REVOKED", user.id, null, null, "ADMIN_REVOKE");
    return { userId: user.id, revoked: true };
  }
}

module.exports = { AccountPolicy };
