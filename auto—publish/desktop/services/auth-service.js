const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const https = require("https");

const AUTH_BASE_URL = "https://auth.jiayubing.xyz";
const AUTH_ERRORS = {
  AUTH_REQUIRED: "请先登录",
  AUTH_INVALID_CREDENTIALS: "登录名或密码错误",
  AUTH_ACCOUNT_DISABLED: "账号已禁用",
  AUTH_SESSION_EXPIRED: "登录已失效，请重新登录",
  AUTH_NOT_ENTITLED: "当前账号没有 AutoPublish 使用授权",
  AUTH_SERVICE_UNAVAILABLE: "认证服务暂时不可达，请检查网络后重试",
  AUTH_SERVER_ERROR: "认证服务暂时不可用，请稍后重试",
  AUTH_INPUT_INVALID: "登录信息无效",
};

function authError(code) {
  const error = new Error(AUTH_ERRORS[code] || AUTH_ERRORS.AUTH_SERVER_ERROR);
  error.code = code;
  return error;
}

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
  const deviceId = opts.deviceId || crypto.randomUUID();
  let accessToken = null;
  let refreshToken = null;
  let accessExpiresAt = 0;
  let state = { authenticated: false, user: null, entitlements: [], errorCode: null };
  const listeners = new Set();

  function getState() { return JSON.parse(JSON.stringify(state)); }

  function notify() {
    const safe = getState();
    listeners.forEach((listener) => { try { listener(safe); } catch (_) {} });
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

  function setAuthenticated(data) {
    accessToken = data.accessToken || null;
    refreshToken = data.refreshToken || refreshToken;
    accessExpiresAt = data.accessExpiresAt ? Date.parse(data.accessExpiresAt) : Date.now() + 10 * 60 * 1000;
    state = { authenticated: true, user: data.user || null, entitlements: Array.isArray(data.entitlements) ? data.entitlements : [], errorCode: null };
    if (refreshToken) saveRefreshToken(refreshToken);
    notify();
    return getState();
  }

  function clearSession(errorCode) {
    accessToken = null;
    refreshToken = null;
    accessExpiresAt = 0;
    state = { authenticated: false, user: null, entitlements: [], errorCode: errorCode || null };
    clearStoredRefreshToken();
    notify();
    return getState();
  }

  function mapResponse(response, route) {
    const body = response && response.body && response.body.data ? response.body.data : response && response.body;
    if (response && response.statusCode >= 200 && response.statusCode < 300 && body && body.accessToken) return body;
    const code = response && response.statusCode === 401 ? ((response.body && response.body.error && response.body.error.code) || (route === "/v1/auth/refresh" || route === "/v1/auth/session" || route === "/v1/auth/entitlements" ? "AUTH_SESSION_EXPIRED" : "AUTH_INVALID_CREDENTIALS"))
      : response && response.statusCode === 403 ? ((response.body && response.body.error && response.body.error.code) || "AUTH_NOT_ENTITLED")
      : response && response.statusCode === 400 ? "AUTH_INPUT_INVALID" : "AUTH_SERVER_ERROR";
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
    try {
      return setAuthenticated(await call("POST", "/v1/auth/login", { loginName: loginName.trim(), password, deviceId }));
    } catch (error) {
      clearSession(error.code === "AUTH_SESSION_EXPIRED" ? "AUTH_INVALID_CREDENTIALS" : error.code);
      throw error;
    }
  }

  async function refresh() {
    const token = refreshToken || loadRefreshToken();
    if (!token) throw authError("AUTH_REQUIRED");
    try {
      const result = await call("POST", "/v1/auth/refresh", { refreshToken: token, deviceId });
      return setAuthenticated(result);
    } catch (error) {
      clearSession(error.code === "AUTH_SESSION_EXPIRED" ? "AUTH_SESSION_EXPIRED" : error.code);
      throw error;
    }
  }

  async function initialize() {
    if (state.authenticated && accessToken && accessExpiresAt > Date.now()) return getState();
    if (!refreshToken && !loadRefreshToken()) return getState();
    try { return await refresh(); } catch (_) { return getState(); }
  }

  async function logout() {
    try {
      if (accessToken || refreshToken) await request({ url: `${AUTH_BASE_URL}/v1/auth/logout`, method: "POST", body: { refreshToken }, headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {} });
    } catch (_) {}
    return clearSession(null);
  }

  async function requireAuthenticated() {
    if (state.authenticated && accessToken && accessExpiresAt > Date.now()) return accessToken;
    try { await refresh(); return accessToken; } catch (_) { throw authError("AUTH_REQUIRED"); }
  }

  return {
    getState,
    getAccessToken: () => accessToken,
    login,
    refresh,
    initialize,
    logout,
    requireAuthenticated,
    onStateChanged(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

module.exports = { createAuthService, AUTH_BASE_URL, AUTH_ERRORS, authError };
