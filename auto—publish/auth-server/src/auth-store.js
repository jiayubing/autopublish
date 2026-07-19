const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createOpaqueToken, hashToken } = require("./token-service");

const PASSWORD_SCHEME = "scrypt";
const PASSWORD_COST = 32768;
const PASSWORD_BLOCK_SIZE = 8;
const PASSWORD_PARALLELISM = 1;

function ensureDirectory(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
}

function readJson(filename) {
  try { return JSON.parse(fs.readFileSync(filename, "utf8")); } catch (_) { return { version: 1, users: [], sessions: [], audit: [] }; }
}

function createAuthStore(options) {
  const opts = options || {};
  const filePath = opts.filePath || path.join(process.cwd(), "data", "auth.json");
  const now = opts.now || (() => Date.now());
  const randomBytes = opts.randomBytes || crypto.randomBytes;
  const accessTtlMs = opts.accessTtlMs || 15 * 60 * 1000;
  const refreshTtlMs = opts.refreshTtlMs || 30 * 24 * 60 * 60 * 1000;
  let data = readJson(filePath);
  if (!Array.isArray(data.users)) data.users = [];
  if (!Array.isArray(data.sessions)) data.sessions = [];
  if (!Array.isArray(data.audit)) data.audit = [];

  function save() {
    ensureDirectory(filePath);
    const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(temporary, filePath);
  }

  function hashPassword(password, salt) {
    const actualSalt = salt || randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(String(password), actualSalt, 32, { N: PASSWORD_COST, r: PASSWORD_BLOCK_SIZE, p: PASSWORD_PARALLELISM, maxmem: 64 * 1024 * 1024 }).toString("hex");
    return `${PASSWORD_SCHEME}$${PASSWORD_COST}$${PASSWORD_BLOCK_SIZE}$${PASSWORD_PARALLELISM}$${actualSalt}$${hash}`;
  }

  function verifyPassword(password, encoded) {
    const parts = String(encoded || "").split("$");
    if (parts.length !== 6 || parts[0] !== PASSWORD_SCHEME) return false;
    const expected = hashPassword(password, parts[4]).split("$").pop();
    const actual = parts[5];
    const left = Buffer.from(expected, "hex");
    const right = Buffer.from(actual, "hex");
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  }

  function findUser(loginName) {
    return data.users.find((user) => user.loginName === loginName) || null;
  }

  function createAdmin(loginName, password) {
    if (findUser(loginName)) throw Object.assign(new Error("Administrator already exists"), { code: "ADMIN_EXISTS" });
    const user = { id: createOpaqueToken(12), loginName, passwordHash: hashPassword(password), enabled: true, entitlements: [{ product: "AutoPublish", enabled: true, expiresAt: null }], createdAt: new Date(now()).toISOString(), lastLoginAt: null };
    data.users.push(user);
    save();
    return sanitizeUser(user);
  }

  function updatePassword(loginName, password) {
    const user = findUser(loginName);
    if (!user) throw Object.assign(new Error("Administrator not found"), { code: "ADMIN_NOT_FOUND" });
    user.passwordHash = hashPassword(password);
    revokeAllSessions(user.id);
    save();
    return sanitizeUser(user);
  }

  function setEnabled(loginName, enabled) {
    const user = findUser(loginName);
    if (!user) throw Object.assign(new Error("Administrator not found"), { code: "ADMIN_NOT_FOUND" });
    user.enabled = Boolean(enabled);
    if (!user.enabled) revokeAllSessions(user.id);
    save();
    return sanitizeUser(user);
  }

  function sanitizeUser(user) {
    return { id: user.id, loginName: user.loginName, enabled: Boolean(user.enabled) };
  }

  function getEntitlements(user) {
    return Array.isArray(user.entitlements) ? user.entitlements.map((item) => ({ product: item.product, enabled: Boolean(item.enabled), expiresAt: item.expiresAt || null })) : [];
  }

  function authenticate(loginName, password) {
    const user = findUser(loginName);
    if (!user || !user.enabled || !verifyPassword(password, user.passwordHash)) return null;
    user.lastLoginAt = new Date(now()).toISOString();
    save();
    return { user: sanitizeUser(user), entitlements: getEntitlements(user) };
  }

  function createSession(userId, deviceId) {
    const accessToken = createOpaqueToken(32);
    const refreshToken = createOpaqueToken(48);
    const createdAt = now();
    const session = { id: createOpaqueToken(12), userId, deviceId: String(deviceId || "unknown").slice(0, 128), accessTokenHash: hashToken(accessToken), refreshTokenHash: hashToken(refreshToken), accessExpiresAt: createdAt + accessTtlMs, refreshExpiresAt: createdAt + refreshTtlMs, revokedAt: null, createdAt };
    data.sessions.push(session);
    data.sessions = data.sessions.filter((item) => item.userId !== userId || !item.revokedAt).slice(-10);
    save();
    return { accessToken, refreshToken, accessExpiresAt: new Date(session.accessExpiresAt).toISOString(), refreshExpiresAt: new Date(session.refreshExpiresAt).toISOString(), session };
  }

  function getUserById(userId) { return data.users.find((user) => user.id === userId) || null; }

  function getSessionByAccessToken(token) {
    const session = data.sessions.find((item) => item.accessTokenHash === hashToken(token) && !item.revokedAt) || null;
    if (!session || session.accessExpiresAt <= now()) return null;
    const user = getUserById(session.userId);
    if (!user || !user.enabled) return null;
    return { session, user };
  }

  function rotateRefreshToken(refreshToken, deviceId) {
    const existing = data.sessions.find((item) => item.refreshTokenHash === hashToken(refreshToken) && !item.revokedAt) || null;
    if (!existing || existing.refreshExpiresAt <= now()) return null;
    const user = getUserById(existing.userId);
    if (!user || !user.enabled) return null;
    existing.revokedAt = now();
    save();
    return Object.assign(createSession(user.id, deviceId || existing.deviceId), { user: sanitizeUser(user), entitlements: getEntitlements(user) });
  }

  function revokeByRefreshToken(refreshToken) {
    const session = data.sessions.find((item) => item.refreshTokenHash === hashToken(refreshToken) && !item.revokedAt);
    if (!session) return false;
    session.revokedAt = now();
    save();
    return true;
  }

  function revokeByAccessToken(accessToken) {
    const session = data.sessions.find((item) => item.accessTokenHash === hashToken(accessToken) && !item.revokedAt);
    if (!session) return false;
    session.revokedAt = now();
    save();
    return true;
  }

  function revokeAllSessions(userId) {
    data.sessions.filter((session) => session.userId === userId && !session.revokedAt).forEach((session) => { session.revokedAt = now(); });
    save();
  }

  return { authenticate, createSession, getSessionByAccessToken, rotateRefreshToken, revokeByRefreshToken, revokeByAccessToken, revokeAllSessions, createAdmin, updatePassword, setEnabled, findUser, save, getData: () => JSON.parse(JSON.stringify(data)) };
}

module.exports = { createAuthStore, hashPassword: (password) => crypto.scryptSync(String(password), "autopublish-test-salt", 32, { N: PASSWORD_COST, r: PASSWORD_BLOCK_SIZE, p: PASSWORD_PARALLELISM }).toString("hex") };
