const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const https = require("https");
const { AUTH_ERRORS, authError } = require("../../src/contracts/auth-contract");

const AUTH_BASE_URL = "https://auth.jiayubing.xyz";
const TERMINAL_SESSION_ERRORS = new Set([
  "AUTH_ACCOUNT_DISABLED",
  "AUTH_LICENSE_EXPIRED",
  "AUTH_NOT_ENTITLED",
  "AUTH_DEVICE_REVOKED",
  "AUTH_SESSION_EXPIRED",
  "AUTH_TOKEN_REUSE_DETECTED",
]);
const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];

function defaultRequest(input) {
  return new Promise((resolve, reject) => {
    const url = new URL(input.url);
    const body = input.body ? JSON.stringify(input.body) : "";
    const request = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: input.method || "GET",
      headers: Object.assign({ accept: "application/json", "content-type": "application/json", "content-length": Buffer.byteLength(body) }, input.headers || {}),
      timeout: 10000,
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => {
        let parsed = {};
        try { parsed = text ? JSON.parse(text) : {}; } catch (_) {}
        resolve({ statusCode: response.statusCode || 0, body: parsed });
      });
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

function createAuthService(options) {
  const opts = options || {};
  const request = opts.request || defaultRequest;
  const safeStorage = opts.safeStorage || null;
  const userDataPath = opts.userDataPath || null;
  const sessionFile = userDataPath ? path.join(userDataPath, "auth-session.json") : null;
  const deviceIdentity = opts.deviceIdentity || null;
  const deviceId = opts.deviceId || (deviceIdentity && typeof deviceIdentity.getDeviceId === "function" ? deviceIdentity.getDeviceId() : crypto.randomUUID());
  const deviceName = typeof opts.deviceName === "string" && opts.deviceName.trim() ? opts.deviceName.trim().slice(0, 80) : `${process.platform} device`;
  const appVersion = typeof opts.appVersion === "string" ? opts.appVersion.slice(0, 64) : "unknown";
  const now = typeof opts.now === "function" ? opts.now : Date.now;
  const setTimeoutFn = typeof opts.setTimeout === "function" ? opts.setTimeout : setTimeout;
  const clearTimeoutFn = typeof opts.clearTimeout === "function" ? opts.clearTimeout : clearTimeout;
  let accessToken = null;
  let refreshToken = null;
  let accessExpiresAt = 0;
  let refreshPromise = null;
  let refreshTimer = null;
  let retryTimer = null;
  let retryAttempt = 0;
  let sessionGeneration = 0;
  let disposed = false;
  let state = { authenticated: false, user: null, entitlements: [], device: null, errorCode: null, passwordChangeRequired: false, pendingLoginName: null, sessionStatus: "signed_out" };
  const listeners = new Set();

  function getState() { return JSON.parse(JSON.stringify(state)); }

  function notify() {
    const safe = getState();
    listeners.forEach((listener) => { try { listener(safe); } catch (_) {} });
  }

  function unrefTimer(timer) {
    if (timer && typeof timer.unref === "function") timer.unref();
    return timer;
  }

  function clearRefreshTimer() {
    if (refreshTimer) clearTimeoutFn(refreshTimer);
    refreshTimer = null;
  }

  function clearRetryTimer() {
    if (retryTimer) clearTimeoutFn(retryTimer);
    retryTimer = null;
  }

  function clearRefreshSchedules() {
    clearRefreshTimer();
    clearRetryTimer();
    retryAttempt = 0;
  }

  function loadRefreshToken() {
    if (!sessionFile || !safeStorage || typeof safeStorage.decryptString !== "function") return null;
    try {
      const record = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
      if (!record || typeof record.encryptedRefreshToken !== "string") return null;
      return safeStorage.decryptString(Buffer.from(record.encryptedRefreshToken, "base64"));
    } catch (_) { return null; }
  }

  function saveRefreshToken(token) {
    if (!sessionFile || !safeStorage || typeof safeStorage.encryptString !== "function" || (typeof safeStorage.isEncryptionAvailable === "function" && !safeStorage.isEncryptionAvailable())) return;
    try {
      fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
      const encrypted = safeStorage.encryptString(token).toString("base64");
      const temporary = `${sessionFile}.tmp-${process.pid}`;
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, encryptedRefreshToken: encrypted }) + "\n", { mode: 0o600 });
      fs.renameSync(temporary, sessionFile);
    } catch (_) {}
  }

  function clearStoredRefreshToken() {
    if (!sessionFile) return;
    try { fs.rmSync(sessionFile, { force: true }); } catch (_) {}
  }

  function isTerminalError(error) {
    return Boolean(error && TERMINAL_SESSION_ERRORS.has(error.code));
  }

  function setRecovering(error) {
    const code = error && error.code ? error.code : "AUTH_SERVICE_UNAVAILABLE";
    state = Object.assign({}, state, {
      authenticated: Boolean(state.authenticated || refreshToken),
      errorCode: code,
      sessionStatus: state.authenticated || refreshToken ? "recovering" : "signed_out",
    });
    notify();
    return getState();
  }

  function setUnauthenticatedError(error, pendingLoginName) {
    state = Object.assign({}, state, {
      authenticated: false,
      user: null,
      entitlements: [],
      device: null,
      errorCode: error && error.code ? error.code : "AUTH_SERVER_ERROR",
      passwordChangeRequired: Boolean(error && error.code === "AUTH_PASSWORD_CHANGE_REQUIRED"),
      pendingLoginName: pendingLoginName || null,
      sessionStatus: "signed_out",
    });
    notify();
    return getState();
  }

  function scheduleRefresh() {
    clearRefreshTimer();
    if (disposed || !refreshToken || !accessExpiresAt) return;
    const delay = Math.max(0, accessExpiresAt - now() - 60 * 1000);
    refreshTimer = unrefTimer(setTimeoutFn(() => {
      refreshTimer = null;
      void refresh().catch(() => {});
    }, delay));
  }

  function scheduleRetry() {
    if (disposed || !refreshToken || retryTimer) return;
    const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)];
    retryAttempt += 1;
    retryTimer = unrefTimer(setTimeoutFn(() => {
      retryTimer = null;
      void refresh().catch(() => {});
    }, delay));
  }

  function setAuthenticated(data, snapshot) {
    if (snapshot && (disposed || sessionGeneration !== snapshot.generation || (snapshot.refreshToken !== undefined && refreshToken !== snapshot.refreshToken))) return getState();
    sessionGeneration += 1;
    accessToken = data.accessToken || null;
    refreshToken = data.refreshToken || refreshToken;
    const parsedExpiry = data.accessExpiresAt ? Date.parse(data.accessExpiresAt) : 0;
    const expiresIn = Number(data.expiresIn);
    accessExpiresAt = parsedExpiry > 0 ? parsedExpiry : Number.isFinite(expiresIn) && expiresIn > 0 ? now() + expiresIn * 1000 : now() + 10 * 60 * 1000;
    state = { authenticated: true, user: data.user || null, entitlements: Array.isArray(data.entitlements) ? data.entitlements : [], device: data.device || null, errorCode: null, passwordChangeRequired: false, pendingLoginName: null, sessionStatus: "authenticated" };
    if (refreshToken) saveRefreshToken(refreshToken);
    clearRetryTimer();
    retryAttempt = 0;
    notify();
    scheduleRefresh();
    return getState();
  }

  function clearSession(errorCode, pendingLoginName) {
    sessionGeneration += 1;
    clearRefreshSchedules();
    accessToken = null;
    refreshToken = null;
    accessExpiresAt = 0;
    state = { authenticated: false, user: null, entitlements: [], device: null, errorCode: errorCode || null, passwordChangeRequired: errorCode === "AUTH_PASSWORD_CHANGE_REQUIRED", pendingLoginName: pendingLoginName || null, sessionStatus: "signed_out" };
    clearStoredRefreshToken();
    notify();
    return getState();
  }

  function mapResponse(response, route) {
    const body = response && response.body && response.body.data ? response.body.data : response && response.body;
    if (response && response.statusCode >= 200 && response.statusCode < 300 && body && body.accessToken) return body;
    const serverCode = response && response.body && response.body.error && response.body.error.code;
    const fallbackCode = response && response.statusCode === 401
      ? (route === "/v1/auth/refresh" || route === "/v1/auth/session" || route === "/v1/auth/entitlements" ? "AUTH_SESSION_EXPIRED" : "AUTH_INVALID_CREDENTIALS")
      : response && response.statusCode === 403 ? "AUTH_NOT_ENTITLED"
        : response && response.statusCode === 400 ? "AUTH_INPUT_INVALID" : "AUTH_SERVER_ERROR";
    const code = typeof serverCode === "string" && AUTH_ERRORS[serverCode] ? serverCode : fallbackCode;
    throw authError(code);
  }

  async function call(method, route, body, headers) {
    try {
      return mapResponse(await request({ url: `${AUTH_BASE_URL}${route}`, method, body, headers: headers || {} }), route);
    } catch (error) {
      if (error && error.code && AUTH_ERRORS[error.code]) throw error;
      throw authError("AUTH_SERVICE_UNAVAILABLE");
    }
  }

  async function login(loginName, password) {
    if (typeof loginName !== "string" || !loginName.trim() || typeof password !== "string" || !password) throw authError("AUTH_INPUT_INVALID");
    const operation = { generation: sessionGeneration + 1, refreshToken: refreshToken };
    sessionGeneration = operation.generation;
    clearRefreshSchedules();
    const hadSession = Boolean(refreshToken || state.authenticated);
    try {
      return setAuthenticated(await call("POST", "/v1/auth/login", { loginName: loginName.trim(), password, deviceId, deviceName, appVersion }), operation);
    } catch (error) {
      if (disposed || sessionGeneration !== operation.generation || refreshToken !== operation.refreshToken) throw error;
      if (isTerminalError(error) && hadSession) clearSession(error.code);
      else if (hadSession) setRecovering(error);
      else setUnauthenticatedError(error, error.code === "AUTH_PASSWORD_CHANGE_REQUIRED" ? loginName.trim() : null);
      throw error;
    }
  }

  async function changePassword(loginName, currentPassword, newPassword) {
    if (typeof loginName !== "string" || !loginName.trim() || typeof currentPassword !== "string" || !currentPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      throw authError("AUTH_INPUT_INVALID");
    }
    const operation = { generation: sessionGeneration + 1, refreshToken: refreshToken };
    sessionGeneration = operation.generation;
    try {
      return setAuthenticated(await call("POST", "/v1/auth/change-password", { loginName: loginName.trim(), currentPassword, newPassword, deviceId, deviceName, appVersion }), operation);
    } catch (error) {
      if (disposed || sessionGeneration !== operation.generation || refreshToken !== operation.refreshToken) throw error;
      if (isTerminalError(error)) clearSession(error.code);
      else setUnauthenticatedError(error, loginName.trim());
      throw error;
    }
  }

  async function refresh() {
    if (refreshPromise) return refreshPromise;
    if (disposed) throw authError("AUTH_REQUIRED");
    const token = refreshToken || loadRefreshToken();
    if (!token) throw authError("AUTH_REQUIRED");
    if (!refreshToken) refreshToken = token;
    const snapshot = { refreshToken: token, generation: sessionGeneration };
    let promise;
    promise = (async function() {
      try {
        const result = await call("POST", "/v1/auth/refresh", { refreshToken: token, deviceId, appVersion });
        return setAuthenticated(result, snapshot);
      } catch (error) {
        const current = !disposed && sessionGeneration === snapshot.generation && refreshToken === snapshot.refreshToken;
        if (current) {
          if (isTerminalError(error)) clearSession(error.code);
          else {
            setRecovering(error);
            scheduleRetry();
          }
        }
        throw error;
      }
    })();
    refreshPromise = promise;
    promise.then(() => {
      if (refreshPromise === promise) refreshPromise = null;
    }, () => {
      if (refreshPromise === promise) refreshPromise = null;
    });
    return promise;
  }

  async function initialize() {
    if (disposed) return getState();
    if (state.authenticated && accessToken && accessExpiresAt > now()) return getState();
    if (!refreshToken && !loadRefreshToken()) return getState();
    try { return await refresh(); } catch (_) { return getState(); }
  }

  async function logout() {
    const token = refreshToken;
    const currentAccessToken = accessToken;
    sessionGeneration += 1;
    clearRefreshSchedules();
    try {
      if (currentAccessToken || token) await request({ url: `${AUTH_BASE_URL}/v1/auth/logout`, method: "POST", body: { refreshToken: token }, headers: currentAccessToken ? { authorization: `Bearer ${currentAccessToken}` } : {} });
    } catch (_) {}
    return clearSession(null);
  }

  async function requireAuthenticated() {
    if (state.authenticated && accessToken && accessExpiresAt > now()) return accessToken;
    await refresh();
    if (state.authenticated && accessToken && accessExpiresAt > now()) return accessToken;
    throw authError("AUTH_REQUIRED");
  }

  function dispose() {
    disposed = true;
    sessionGeneration += 1;
    clearRefreshSchedules();
  }

  return {
    getState,
    getAccessToken: () => accessToken,
    login,
    changePassword,
    refresh,
    initialize,
    logout,
    requireAuthenticated,
    dispose,
    onStateChanged(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

module.exports = { createAuthService, AUTH_BASE_URL, AUTH_ERRORS, authError };
