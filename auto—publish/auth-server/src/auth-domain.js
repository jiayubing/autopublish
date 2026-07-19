const crypto = require("node:crypto");
const { createOpaqueToken, hashToken } = require("./token-service");

const PASSWORD_SCHEME = "scrypt";
const PASSWORD_COST = 32768;
const PASSWORD_BLOCK_SIZE = 8;
const PASSWORD_PARALLELISM = 1;
const PASSWORD_KEY_LENGTH = 32;
const MIN_PASSWORD_LENGTH = 6;
const PASSWORD_MAX_MEMORY = 64 * 1024 * 1024;
const DEFAULT_PRODUCT = "AutoPublish";
const DUMMY_PASSWORD_HASH = `${PASSWORD_SCHEME}$${PASSWORD_COST}$${PASSWORD_BLOCK_SIZE}$${PASSWORD_PARALLELISM}$autopublish-invalid-salt$${"0".repeat(PASSWORD_KEY_LENGTH * 2)}`;

const scrypt = require("node:util").promisify(crypto.scrypt);

class AuthError extends Error {
  constructor(code, details) {
    super(code);
    this.name = "AuthError";
    this.code = code;
    this.details = details || undefined;
  }
}

class ScryptLimiter {
  constructor(limit) {
    this.limit = Math.max(1, Number(limit) || 2);
    this.active = 0;
    this.queue = [];
  }

  run(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.pump();
    });
  }

  pump() {
    while (this.active < this.limit && this.queue.length) {
      const item = this.queue.shift();
      this.active += 1;
      Promise.resolve().then(item.task).then(item.resolve, item.reject).finally(() => {
        this.active -= 1;
        this.pump();
      });
    }
  }
}

function iso(now) {
  return new Date(now()).toISOString();
}

function safeText(value, maxLength) {
  if (value === undefined || value === null) return null;
  return String(value).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

function normalizeLoginName(value) {
  const loginName = typeof value === "string" ? value.trim() : "";
  if (!loginName || loginName.length > 128) throw new AuthError("AUTH_INPUT_INVALID");
  return loginName;
}

function normalizePassword(value) {
  if (typeof value !== "string" || value.length < MIN_PASSWORD_LENGTH || value.length > 256) throw new AuthError("AUTH_INPUT_INVALID");
  return value;
}

function normalizeExpiry(value, now, required) {
  if (value === null && !required) return null;
  if (value === undefined) {
    if (required) throw new AuthError("AUTH_EXPIRY_REQUIRED");
    return null;
  }
  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp)) throw new AuthError("AUTH_INPUT_INVALID");
  return new Date(timestamp).toISOString();
}

function isExpired(expiresAt, now) {
  return Boolean(expiresAt) && Date.parse(expiresAt) <= now();
}

function createPasswordHash(password, options) {
  const opts = options || {};
  const cost = Number(opts.cost || PASSWORD_COST);
  const blockSize = Number(opts.blockSize || PASSWORD_BLOCK_SIZE);
  const parallelism = Number(opts.parallelism || PASSWORD_PARALLELISM);
  const maxmem = Number(opts.maxmem || PASSWORD_MAX_MEMORY);
  const salt = (opts.randomBytes || crypto.randomBytes)(16).toString("base64url");
  const limiter = opts.limiter || new ScryptLimiter(1);
  return limiter.run(() => scrypt(String(password), salt, PASSWORD_KEY_LENGTH, {
    N: cost,
    r: blockSize,
    p: parallelism,
    maxmem,
  })).then((derived) => `${PASSWORD_SCHEME}$${cost}$${blockSize}$${parallelism}$${salt}$${derived.toString("hex")}`);
}

function verifyPassword(password, encoded, options) {
  const parts = String(encoded || "").split("$");
  if (parts.length !== 6 || parts[0] !== PASSWORD_SCHEME) return Promise.resolve(false);
  const cost = Number(parts[1]);
  const blockSize = Number(parts[2]);
  const parallelism = Number(parts[3]);
  if (!Number.isSafeInteger(cost) || !Number.isSafeInteger(blockSize) || !Number.isSafeInteger(parallelism) || !parts[4] || !/^[0-9a-f]+$/i.test(parts[5])) return Promise.resolve(false);
  const limiter = (options && options.limiter) || new ScryptLimiter(1);
  return limiter.run(() => scrypt(String(password), parts[4], parts[5].length / 2, {
    N: cost,
    r: blockSize,
    p: parallelism,
    maxmem: Number((options && options.maxmem) || PASSWORD_MAX_MEMORY),
  })).then((derived) => {
    const actual = Buffer.from(parts[5], "hex");
    return actual.length === derived.length && crypto.timingSafeEqual(actual, derived);
  }).catch(() => false);
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    loginName: user.loginName,
    role: user.role,
    enabled: Boolean(user.enabled),
    mustChangePassword: Boolean(user.mustChangePassword),
    maxDevices: Number(user.maxDevices),
    note: user.note || null,
  };
}

function sanitizeEntitlements(entitlements) {
  return (Array.isArray(entitlements) ? entitlements : []).map((item) => ({
    product: item.product,
    enabled: Boolean(item.enabled),
    expiresAt: item.expiresAt || null,
  }));
}

function sanitizeDevice(device, activeCount, maxDevices) {
  return {
    id: device.id,
    displayName: device.displayName || null,
    appVersion: device.appVersion || null,
    registered: true,
    revokedAt: device.revokedAt || null,
    firstSeenAt: device.firstSeenAt,
    lastSeenAt: device.lastSeenAt,
    deviceCount: activeCount,
    maxDevices,
  };
}

class AuthDomain {
  constructor(options) {
    const opts = options || {};
    if (!opts.repository) throw new TypeError("AuthDomain requires a repository");
    this.repository = opts.repository;
    this.now = opts.now || (() => Date.now());
    this.accessTtlMs = Number(opts.accessTtlMs || 15 * 60 * 1000);
    this.refreshTtlMs = Number(opts.refreshTtlMs || 30 * 24 * 60 * 60 * 1000);
    this.loginFailureThreshold = Number(opts.loginFailureThreshold || 5);
    this.loginLockMs = Number(opts.loginLockMs || 15 * 60 * 1000);
    this.rateLimitWindowMs = Number(opts.rateLimitWindowMs || 60 * 1000);
    this.rateLimitMaxAttempts = Number(opts.rateLimitMaxAttempts || 12);
    this.maxSessionsPerUser = Number(opts.maxSessionsPerUser || 10);
    this.maxSessionsPerDevice = Number(opts.maxSessionsPerDevice || 3);
    this.passwordLimiter = opts.passwordLimiter || new ScryptLimiter(Number(opts.maxConcurrentPasswordComputations || 2));
    this.passwordOptions = {
      cost: Number(opts.passwordCost || PASSWORD_COST),
      blockSize: PASSWORD_BLOCK_SIZE,
      parallelism: PASSWORD_PARALLELISM,
      maxmem: PASSWORD_MAX_MEMORY,
      limiter: this.passwordLimiter,
    };
    this.sourceAttempts = new Map();
    this.mutationTail = Promise.resolve();
  }

  async _withMutation(callback) {
    const previous = this.mutationTail;
    let release;
    this.mutationTail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      const run = () => callback();
      return await (typeof this.repository.transaction === "function" ? this.repository.transaction(run) : run());
    } finally {
      release();
    }
  }

  _nowIso() { return iso(this.now); }

  _sourceKey(loginName, sourceFingerprint) {
    const source = safeText(sourceFingerprint || "unknown", 256) || "unknown";
    return `${loginName}:${hashToken(source).slice(0, 24)}`;
  }

  _recordSourceAttempt(key) {
    const current = this.sourceAttempts.get(key) || [];
    const cutoff = this.now() - this.rateLimitWindowMs;
    const next = current.filter((timestamp) => timestamp > cutoff);
    next.push(this.now());
    this.sourceAttempts.set(key, next);
    return next.length;
  }

  _clearSourceAttempt(key) { this.sourceAttempts.delete(key); }

  _userByLogin(loginName) { return this.repository.findUserByLoginName(loginName); }

  _entitlements(userId) { return sanitizeEntitlements(this.repository.getEntitlements(userId)); }

  _assertEntitled(entitlements) {
    const entitlement = entitlements.find((item) => item.product === DEFAULT_PRODUCT);
    if (!entitlement || !entitlement.enabled) throw new AuthError("AUTH_NOT_ENTITLED");
    if (isExpired(entitlement.expiresAt, this.now)) throw new AuthError("AUTH_LICENSE_EXPIRED");
    return entitlement;
  }

  _assertEnabled(user) {
    if (!user || !user.enabled) throw new AuthError("AUTH_ACCOUNT_DISABLED");
    if (user.lockedUntil && Date.parse(user.lockedUntil) > this.now()) throw new AuthError("AUTH_ACCOUNT_LOCKED");
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
      sourceFingerprint: sourceFingerprint ? hashToken(safeText(sourceFingerprint, 256)).slice(0, 24) : null,
      resultCode: resultCode || null,
      createdAt: this._nowIso(),
    });
  }

  _deviceKey(deviceId) {
    const value = deviceId === undefined || deviceId === null || deviceId === "" ? "legacy-installation" : String(deviceId);
    if (value.length > 256) throw new AuthError("AUTH_INPUT_INVALID");
    return { value, hash: hashToken(value) };
  }

  _registerDevice(user, input) {
    const key = this._deviceKey(input.deviceId);
    const nowIso = this._nowIso();
    let device = this.repository.findDeviceByKeyHash(user.id, key.hash);
    if (device && device.revokedAt) {
      this._audit("DEVICE_REVOKED", user.id, device.id, input.sourceFingerprint, "AUTH_DEVICE_REVOKED");
      throw new AuthError("AUTH_DEVICE_REVOKED");
    }
    const activeDevices = this.repository.listDevices(user.id, { activeOnly: true });
    if (!device && activeDevices.length >= Number(user.maxDevices)) {
      this._audit("DEVICE_LIMIT_REJECTED", user.id, null, input.sourceFingerprint, "AUTH_DEVICE_LIMIT_REACHED");
      throw new AuthError("AUTH_DEVICE_LIMIT_REACHED");
    }
    if (!device) {
      device = {
        id: createOpaqueToken(12),
        userId: user.id,
        deviceKeyHash: key.hash,
        displayName: safeText(input.deviceName, 128),
        appVersion: safeText(input.appVersion, 64),
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        revokedAt: null,
      };
      this.repository.createDevice(device);
      this._audit("DEVICE_REGISTERED", user.id, device.id, input.sourceFingerprint);
    } else {
      this.repository.updateDevice(device.id, {
        displayName: safeText(input.deviceName, 128) || device.displayName || null,
        appVersion: safeText(input.appVersion, 64) || device.appVersion || null,
        lastSeenAt: nowIso,
      });
      device = Object.assign({}, device, {
        displayName: safeText(input.deviceName, 128) || device.displayName || null,
        appVersion: safeText(input.appVersion, 64) || device.appVersion || null,
        lastSeenAt: nowIso,
      });
    }
    return { device, deviceKey: key };
  }

  _pruneSessions(userId, deviceId) {
    const active = this.repository.listActiveSessions(userId);
    const deviceSessions = active.filter((session) => session.deviceId === deviceId).sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
    while (deviceSessions.length >= this.maxSessionsPerDevice) {
      const oldest = deviceSessions.shift();
      this.repository.revokeSession(oldest.id, this.now(), "SESSION_LIMIT");
    }
    const remaining = this.repository.listActiveSessions(userId).sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
    while (remaining.length >= this.maxSessionsPerUser) {
      const oldest = remaining.shift();
      this.repository.revokeSession(oldest.id, this.now(), "SESSION_LIMIT");
    }
  }

  _createSession(user, device, familyId) {
    this._pruneSessions(user.id, device.id);
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

  _publicSession(tokens, user, entitlements, device) {
    const activeDevices = this.repository.listDevices(user.id, { activeOnly: true });
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessExpiresAt: tokens.session.accessExpiresAt,
      refreshExpiresAt: tokens.session.refreshExpiresAt,
      user: sanitizeUser(user),
      entitlements: sanitizeEntitlements(entitlements),
      device: sanitizeDevice(device, activeDevices.length, Number(user.maxDevices)),
    };
  }

  async login(input) {
    const request = input || {};
    const loginName = normalizeLoginName(request.loginName);
    if (typeof request.password !== "string" || request.password.length === 0 || request.password.length > 256) throw new AuthError("AUTH_INPUT_INVALID");
    const sourceKey = this._sourceKey(loginName, request.sourceFingerprint);
    if (this._recordSourceAttempt(sourceKey) > this.rateLimitMaxAttempts) {
      throw new AuthError("AUTH_RATE_LIMITED");
    }
    const user = this._userByLogin(loginName);
    const passwordHash = user ? user.passwordHash : DUMMY_PASSWORD_HASH;
    const validPassword = await verifyPassword(request.password, passwordHash, this.passwordOptions);
    return this._withMutation(() => {
      const current = this._userByLogin(loginName);
      if (!current || !validPassword) {
        if (current && current.enabled) {
          const failedLoginCount = Number(current.failedLoginCount || 0) + 1;
          const lockedUntil = failedLoginCount >= this.loginFailureThreshold ? new Date(this.now() + this.loginLockMs).toISOString() : null;
          this.repository.updateUser(current.id, { failedLoginCount, lockedUntil, updatedAt: this._nowIso() });
          this._audit(lockedUntil ? "ACCOUNT_LOCKED" : "LOGIN_FAILED", current.id, null, request.sourceFingerprint, lockedUntil ? "AUTH_ACCOUNT_LOCKED" : "AUTH_INVALID_CREDENTIALS");
          if (lockedUntil) throw new AuthError("AUTH_ACCOUNT_LOCKED");
        } else {
          this._audit("LOGIN_FAILED", null, null, request.sourceFingerprint, "AUTH_INVALID_CREDENTIALS");
        }
        throw new AuthError("AUTH_INVALID_CREDENTIALS");
      }
      this._assertEnabled(current);
      const entitlements = this._entitlements(current.id);
      this._assertEntitled(entitlements);
      const updatedAt = this._nowIso();
      this.repository.updateUser(current.id, {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: updatedAt,
        updatedAt,
      });
      this._clearSourceAttempt(sourceKey);
      if (current.mustChangePassword) {
        this._audit("LOGIN_SUCCEEDED", current.id, null, request.sourceFingerprint, "AUTH_PASSWORD_CHANGE_REQUIRED");
        return { passwordChangeRequired: true, user: current, entitlements };
      }
      const registered = this._registerDevice(current, request);
      const tokens = this._createSession(current, registered.device);
      this._audit("LOGIN_SUCCEEDED", current.id, registered.device.id, request.sourceFingerprint);
      return { session: this._publicSession(tokens, current, entitlements, registered.device) };
    }).then((result) => {
      if (result.passwordChangeRequired) throw new AuthError("AUTH_PASSWORD_CHANGE_REQUIRED", { user: sanitizeUser(result.user) });
      return result.session;
    }).catch(async (error) => {
      if (error instanceof AuthError && ["AUTH_DEVICE_LIMIT_REACHED", "AUTH_DEVICE_REVOKED"].includes(error.code)) {
        try {
          await this._withMutation(() => this._audit(error.code === "AUTH_DEVICE_LIMIT_REACHED" ? "DEVICE_LIMIT_REJECTED" : "DEVICE_REVOKED", user && user.id, null, request.sourceFingerprint, error.code));
        } catch (_) { /* preserve the stable domain error */ }
      }
      throw error;
    });
  }

  _accessSession(accessToken) {
    if (typeof accessToken !== "string" || !accessToken) throw new AuthError("AUTH_SESSION_EXPIRED");
    const result = this.repository.findSessionByAccessHash(hashToken(accessToken));
    if (!result || result.revokedAt || Date.parse(result.accessExpiresAt) <= this.now()) throw new AuthError("AUTH_SESSION_EXPIRED");
    const user = this.repository.findUserById(result.userId);
    if (!user) throw new AuthError("AUTH_SESSION_EXPIRED");
    this._assertEnabled(user);
    const entitlements = this._entitlements(user.id);
    this._assertEntitled(entitlements);
    const device = this.repository.findDeviceById(result.deviceId);
    if (!device || device.revokedAt) throw new AuthError("AUTH_DEVICE_REVOKED");
    return { session: result, user, entitlements, device };
  }

  async inspect(accessToken) {
    return this._withMutation(() => {
      const current = this._accessSession(accessToken);
      if (current.user.mustChangePassword) throw new AuthError("AUTH_PASSWORD_CHANGE_REQUIRED", { user: sanitizeUser(current.user) });
      return { user: sanitizeUser(current.user), entitlements: current.entitlements, device: sanitizeDevice(current.device, this.repository.listDevices(current.user.id, { activeOnly: true }).length, current.user.maxDevices) };
    });
  }

  async refresh(input) {
    const request = input || {};
    if (typeof request.refreshToken !== "string" || !request.refreshToken) throw new AuthError("AUTH_INPUT_INVALID");
    return this._withMutation(() => {
      if (typeof this.repository.cleanupUsedRefreshTokens === "function") this.repository.cleanupUsedRefreshTokens(this.now());
      const tokenHash = hashToken(request.refreshToken);
      const existing = this.repository.findSessionByRefreshHash(tokenHash);
      if (!existing) throw new AuthError("AUTH_SESSION_EXPIRED");
      if (existing.revokedAt) {
        const revokedDevice = this.repository.findDeviceById(existing.deviceId);
        if (revokedDevice && revokedDevice.revokedAt) throw new AuthError("AUTH_DEVICE_REVOKED");
        const used = this.repository.findUsedRefreshToken(tokenHash);
        if (used) {
          this.repository.revokeFamily(used.familyId, this.now(), "TOKEN_REUSE");
          this._audit("TOKEN_REUSE_DETECTED", used.userId, used.deviceId, request.sourceFingerprint, "AUTH_TOKEN_REUSE_DETECTED");
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
      this._assertEnabled(user);
      const entitlements = this._entitlements(user.id);
      this._assertEntitled(entitlements);
      const device = this.repository.findDeviceById(existing.deviceId);
      if (!device || device.revokedAt) throw new AuthError("AUTH_DEVICE_REVOKED");
      if (request.deviceId !== undefined && this._deviceKey(request.deviceId).hash !== device.deviceKeyHash) throw new AuthError("AUTH_SESSION_EXPIRED");
      const updatedAt = this._nowIso();
      this.repository.revokeSession(existing.id, this.now(), "ROTATED");
      this.repository.markUsedRefreshToken({ tokenHash, familyId: existing.familyId, userId: user.id, deviceId: device.id, usedAt: updatedAt, expiresAt: existing.refreshExpiresAt });
      this.repository.updateDevice(device.id, { lastSeenAt: updatedAt, displayName: safeText(request.deviceName, 128) || device.displayName || null, appVersion: safeText(request.appVersion, 64) || device.appVersion || null });
      const refreshedDevice = Object.assign({}, device, { lastSeenAt: updatedAt, displayName: safeText(request.deviceName, 128) || device.displayName || null, appVersion: safeText(request.appVersion, 64) || device.appVersion || null });
      const tokens = this._createSession(user, refreshedDevice, existing.familyId);
      this._audit("SESSION_REFRESHED", user.id, device.id, request.sourceFingerprint);
      return this._publicSession(tokens, user, entitlements, refreshedDevice);
    }).then((result) => {
      if (result && result.tokenReuseDetected) throw new AuthError("AUTH_TOKEN_REUSE_DETECTED");
      return result;
    });
  }

  async logout(input) {
    const request = input || {};
    return this._withMutation(() => {
      let revoked = false;
      if (request.accessToken) {
        const session = this.repository.findSessionByAccessHash(hashToken(request.accessToken));
        if (session && !session.revokedAt) {
          this.repository.revokeSession(session.id, this.now(), "LOGOUT");
          this._audit("SESSION_REVOKED", session.userId, session.deviceId, request.sourceFingerprint, "LOGOUT");
          revoked = true;
        }
      }
      if (request.refreshToken) {
        const session = this.repository.findSessionByRefreshHash(hashToken(request.refreshToken));
        if (session && !session.revokedAt) {
          this.repository.revokeSession(session.id, this.now(), "LOGOUT");
          this._audit("SESSION_REVOKED", session.userId, session.deviceId, request.sourceFingerprint, "LOGOUT");
          revoked = true;
        }
      }
      return { loggedOut: true, revoked };
    });
  }

  async changePassword(input) {
    const request = input || {};
    const newPassword = normalizePassword(request.newPassword);
    const accessToken = request.accessToken || null;
    let currentUser;
    let currentDevice;
    let entitlements;
    if (accessToken) {
      const current = await this.inspectForPasswordChange(accessToken);
      currentUser = current.user;
      currentDevice = current.device;
      entitlements = current.entitlements;
    } else {
      const loginName = normalizeLoginName(request.loginName);
      if (typeof request.currentPassword !== "string") throw new AuthError("AUTH_INVALID_CREDENTIALS");
      const found = this._userByLogin(loginName);
      const valid = await verifyPassword(request.currentPassword, found ? found.passwordHash : DUMMY_PASSWORD_HASH, this.passwordOptions);
      if (!found || !valid) throw new AuthError("AUTH_INVALID_CREDENTIALS");
      this._assertEnabled(found);
      entitlements = this._entitlements(found.id);
      this._assertEntitled(entitlements);
      if (!found.mustChangePassword) throw new AuthError("AUTH_SESSION_EXPIRED");
      currentUser = found;
    }
    if (typeof request.currentPassword === "string") {
      const valid = await verifyPassword(request.currentPassword, currentUser.passwordHash, this.passwordOptions);
      if (!valid) throw new AuthError("AUTH_INVALID_CREDENTIALS");
    }
    if (request.currentPassword === newPassword) throw new AuthError("AUTH_INPUT_INVALID");
    const passwordHash = await createPasswordHash(newPassword, this.passwordOptions);
    return this._withMutation(() => {
      const user = this.repository.findUserById(currentUser.id);
      if (!user) throw new AuthError("AUTH_SESSION_EXPIRED");
      this._assertEnabled(user);
      const freshEntitlements = this._entitlements(user.id);
      this._assertEntitled(freshEntitlements);
      const changedAt = this._nowIso();
      this.repository.updateUser(user.id, { passwordHash, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, passwordChangedAt: changedAt, updatedAt: changedAt });
      this.repository.revokeAllSessions(user.id, this.now(), "PASSWORD_CHANGED");
      const registered = currentDevice ? { device: currentDevice } : this._registerDevice(user, request);
      const tokens = this._createSession(user, registered.device);
      this._audit("PASSWORD_CHANGED", user.id, registered.device.id, request.sourceFingerprint);
      return this._publicSession(tokens, Object.assign({}, user, { mustChangePassword: false }), freshEntitlements, registered.device);
    });
  }

  async inspectForPasswordChange(accessToken) {
    return this._withMutation(() => {
      const current = this._accessSession(accessToken);
      return current;
    });
  }

  async createManagedUser(input) {
    const request = input || {};
    const loginName = normalizeLoginName(request.loginName);
    const password = normalizePassword(request.password);
    const role = request.role === undefined ? "user" : String(request.role);
    if (role !== "admin" && role !== "user") throw new AuthError("AUTH_INPUT_INVALID");
    const permanent = request.permanent === true;
    if (!permanent && request.expiresAt === undefined) throw new AuthError("AUTH_EXPIRY_REQUIRED");
    const expiresAt = normalizeExpiry(permanent ? null : request.expiresAt, this.now, false);
    const passwordHash = await createPasswordHash(password, this.passwordOptions);
    return this._withMutation(() => {
      if (this._userByLogin(loginName)) throw new AuthError("AUTH_USER_EXISTS");
      const createdAt = this._nowIso();
      const user = {
        id: createOpaqueToken(12),
        loginName,
        passwordHash,
        role,
        enabled: request.enabled === undefined ? true : Boolean(request.enabled),
        mustChangePassword: request.mustChangePassword === undefined ? role === "user" : Boolean(request.mustChangePassword),
        maxDevices: request.maxDevices === undefined ? 1 : Number(request.maxDevices),
        note: safeText(request.note, 512),
        failedLoginCount: 0,
        lockedUntil: null,
        createdAt,
        updatedAt: createdAt,
        lastLoginAt: null,
        passwordChangedAt: createdAt,
      };
      if (!Number.isInteger(user.maxDevices) || user.maxDevices < 1 || user.maxDevices > 10) throw new AuthError("AUTH_INPUT_INVALID");
      this.repository.createUser(user);
      this.repository.upsertEntitlement({ userId: user.id, product: DEFAULT_PRODUCT, enabled: request.entitlementEnabled === undefined ? true : Boolean(request.entitlementEnabled), expiresAt, createdAt, updatedAt: createdAt });
      this._audit("ACCOUNT_CREATED", user.id, null, null);
      return Object.assign(sanitizeUser(user), { entitlements: this._entitlements(user.id) });
    });
  }

  async setUserEnabled(identifier, enabled) {
    return this._withMutation(() => {
      const user = this._findManagedUser(identifier);
      const updatedAt = this._nowIso();
      this.repository.updateUser(user.id, { enabled: Boolean(enabled), updatedAt });
      if (!enabled) {
        this.repository.revokeAllSessions(user.id, this.now(), "ACCOUNT_DISABLED");
        this._audit("ACCOUNT_DISABLED", user.id, null, null);
      }
      return Object.assign(sanitizeUser(Object.assign({}, user, { enabled: Boolean(enabled), updatedAt })), { entitlements: this._entitlements(user.id) });
    });
  }

  async resetPassword(identifier, password) {
    const nextPassword = normalizePassword(password);
    const passwordHash = await createPasswordHash(nextPassword, this.passwordOptions);
    return this._withMutation(() => {
      const user = this._findManagedUser(identifier);
      const updatedAt = this._nowIso();
      this.repository.updateUser(user.id, { passwordHash, mustChangePassword: true, passwordChangedAt: updatedAt, failedLoginCount: 0, lockedUntil: null, updatedAt });
      this.repository.revokeAllSessions(user.id, this.now(), "PASSWORD_RESET");
      this._audit("PASSWORD_RESET", user.id, null, null);
      return Object.assign(sanitizeUser(Object.assign({}, user, { mustChangePassword: true, updatedAt })), { entitlements: this._entitlements(user.id) });
    });
  }

  async setExpiry(identifier, expiresAt, permanent) {
    if (permanent !== true && expiresAt === undefined) throw new AuthError("AUTH_EXPIRY_REQUIRED");
    const normalized = normalizeExpiry(permanent ? null : expiresAt, this.now, false);
    return this._withMutation(() => {
      const user = this._findManagedUser(identifier);
      const updatedAt = this._nowIso();
      this.repository.upsertEntitlement({ userId: user.id, product: DEFAULT_PRODUCT, enabled: true, expiresAt: normalized, createdAt: updatedAt, updatedAt });
      this._audit("ENTITLEMENT_UPDATED", user.id, null, null);
      return Object.assign(sanitizeUser(user), { entitlements: this._entitlements(user.id) });
    });
  }

  async setDeviceLimit(identifier, maxDevices) {
    const limit = Number(maxDevices);
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new AuthError("AUTH_INPUT_INVALID");
    return this._withMutation(() => {
      const user = this._findManagedUser(identifier);
      const updatedAt = this._nowIso();
      this.repository.updateUser(user.id, { maxDevices: limit, updatedAt });
      this._audit("DEVICE_LIMIT_UPDATED", user.id, null, null);
      return Object.assign(sanitizeUser(Object.assign({}, user, { maxDevices: limit, updatedAt })), { entitlements: this._entitlements(user.id) });
    });
  }

  async setNote(identifier, note) {
    return this._withMutation(() => {
      const user = this._findManagedUser(identifier);
      const updatedAt = this._nowIso();
      this.repository.updateUser(user.id, { note: safeText(note, 512), updatedAt });
      return Object.assign(sanitizeUser(Object.assign({}, user, { note: safeText(note, 512), updatedAt })), { entitlements: this._entitlements(user.id) });
    });
  }

  async revokeDevice(identifier, deviceId) {
    return this._withMutation(() => {
      const user = this._findManagedUser(identifier);
      const device = this.repository.findDeviceById(String(deviceId || ""));
      if (!device || device.userId !== user.id) throw new AuthError("AUTH_DEVICE_NOT_FOUND");
      this.repository.revokeDevice(device.id, this.now());
      this.repository.revokeDeviceSessions(device.id, this.now(), "DEVICE_REVOKED");
      this._audit("DEVICE_REVOKED", user.id, device.id, null);
      return sanitizeDevice(Object.assign({}, device, { revokedAt: this._nowIso() }), this.repository.listDevices(user.id, { activeOnly: true }).length, user.maxDevices);
    });
  }

  async revokeSessions(identifier) {
    return this._withMutation(() => {
      const user = this._findManagedUser(identifier);
      this.repository.revokeAllSessions(user.id, this.now(), "ADMIN_REVOKE");
      this._audit("SESSION_REVOKED", user.id, null, null, "ADMIN_REVOKE");
      return { userId: user.id, revoked: true };
    });
  }

  _findManagedUser(identifier) {
    if (!identifier) throw new AuthError("AUTH_USER_NOT_FOUND");
    const user = this.repository.findUserById(String(identifier)) || this.repository.findUserByLoginName(String(identifier));
    if (!user) throw new AuthError("AUTH_USER_NOT_FOUND");
    return user;
  }

  listUsers() {
    return this.repository.listUsers().map((user) => Object.assign(sanitizeUser(user), { entitlements: this._entitlements(user.id) }));
  }

  showUser(identifier) {
    const user = this._findManagedUser(identifier);
    const devices = this.repository.listDevices(user.id).map((device) => sanitizeDevice(device, this.repository.listDevices(user.id, { activeOnly: true }).length, user.maxDevices));
    const sessions = this.repository.listSessions(user.id).map((session) => ({ id: session.id, familyId: session.familyId, deviceId: session.deviceId, createdAt: session.createdAt, lastSeenAt: session.lastSeenAt, revokedAt: session.revokedAt, revokeReason: session.revokeReason }));
    return Object.assign(sanitizeUser(user), { entitlements: this._entitlements(user.id), devices, sessions });
  }

  listDevices(identifier) {
    const user = this._findManagedUser(identifier);
    const activeCount = this.repository.listDevices(user.id, { activeOnly: true }).length;
    return this.repository.listDevices(user.id).map((device) => sanitizeDevice(device, activeCount, user.maxDevices));
  }

  listAudit(options) {
    return this.repository.listAuditEvents(options || {}).map((event) => ({ id: event.id, eventCode: event.eventCode, userId: event.userId, deviceId: event.deviceId, sourceFingerprint: event.sourceFingerprint, resultCode: event.resultCode, createdAt: event.createdAt }));
  }

  healthCheck() {
    return typeof this.repository.healthCheck === "function" ? this.repository.healthCheck() : true;
  }
}

module.exports = {
  AuthDomain,
  AuthError,
  ScryptLimiter,
  createPasswordHash,
  verifyPassword,
  sanitizeUser,
  sanitizeEntitlements,
  DEFAULT_PRODUCT,
  PASSWORD_COST,
  MIN_PASSWORD_LENGTH,
};
