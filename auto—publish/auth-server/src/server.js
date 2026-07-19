const http = require("http");
const { createAuthStore } = require("./auth-store");

const SAFE_ERRORS = {
  INVALID_CREDENTIALS: [401, "AUTH_INVALID_CREDENTIALS", "登录名或密码错误"],
  ACCOUNT_DISABLED: [403, "AUTH_ACCOUNT_DISABLED", "账号已禁用"],
  SESSION_EXPIRED: [401, "AUTH_SESSION_EXPIRED", "认证会话已失效"],
  NOT_ENTITLED: [403, "AUTH_NOT_ENTITLED", "当前账号没有产品授权"],
  INPUT: [400, "AUTH_INPUT_INVALID", "认证请求无效"],
  NOT_FOUND: [404, "AUTH_NOT_FOUND", "认证接口不存在"],
  INTERNAL: [500, "AUTH_SERVER_ERROR", "认证服务暂时不可用"],
};

function json(response, statusCode, body) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "content-length": Buffer.byteLength(payload) });
  response.end(payload);
}

function errorResponse(response, key) {
  const [status, code, message] = SAFE_ERRORS[key] || SAFE_ERRORS.INTERNAL;
  return json(response, status, { ok: false, error: { code, message } });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; if (body.length > 32768) reject(new Error("body too large")); });
    request.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch (_) { reject(new Error("invalid json")); } });
    request.on("error", reject);
  });
}

function bearer(request) {
  const value = request.headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function productEntitled(entitlements) {
  return Array.isArray(entitlements) && entitlements.some((item) => item.product === "AutoPublish" && item.enabled === true && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()));
}

function createAuthServer(options) {
  const opts = options || {};
  const store = opts.store || createAuthStore({ filePath: process.env.AUTH_DB_PATH });
  const logger = typeof opts.logger === "function" ? opts.logger : () => {};
  const attempts = new Map();

  function publicSession(session) {
    return { accessToken: session.accessToken, refreshToken: session.refreshToken, accessExpiresAt: session.accessExpiresAt, refreshExpiresAt: session.refreshExpiresAt, user: session.user, entitlements: session.entitlements };
  }

  async function handle(request, response) {
    const url = new URL(request.url, "http://127.0.0.1");
    try {
      if (request.method === "GET" && url.pathname === "/healthz") return json(response, 200, { ok: true, service: "autopublish-auth" });
      if (request.method === "POST" && url.pathname === "/v1/auth/login") {
        const input = await readBody(request);
        if (typeof input.loginName !== "string" || typeof input.password !== "string" || !input.loginName || !input.password) return errorResponse(response, "INPUT");
        const key = input.loginName.slice(0, 128);
        const lastAttempt = attempts.get(key) || 0;
        if (Date.now() - lastAttempt < 250) return errorResponse(response, "INVALID_CREDENTIALS");
        attempts.set(key, Date.now());
        const authenticated = store.authenticate(input.loginName, input.password);
        if (!authenticated) {
          const user = store.findUser(input.loginName);
          return errorResponse(response, user && !user.enabled ? "ACCOUNT_DISABLED" : "INVALID_CREDENTIALS");
        }
        if (!productEntitled(authenticated.entitlements)) return errorResponse(response, "NOT_ENTITLED");
        return json(response, 200, { ok: true, data: publicSession(Object.assign(store.createSession(authenticated.user.id, input.deviceId), authenticated)) });
      }
      if (request.method === "POST" && url.pathname === "/v1/auth/refresh") {
        const input = await readBody(request);
        if (typeof input.refreshToken !== "string" || !input.refreshToken) return errorResponse(response, "INPUT");
        const session = store.rotateRefreshToken(input.refreshToken, input.deviceId);
        if (!session || !productEntitled(session.entitlements)) return errorResponse(response, "SESSION_EXPIRED");
        return json(response, 200, { ok: true, data: publicSession(session) });
      }
      if (request.method === "POST" && url.pathname === "/v1/auth/logout") {
        const input = await readBody(request);
        const token = bearer(request) || input.refreshToken;
        if (token) { store.revokeByAccessToken(token); store.revokeByRefreshToken(token); }
        return json(response, 200, { ok: true, data: { loggedOut: true } });
      }
      if ((request.method === "GET" && (url.pathname === "/v1/auth/session" || url.pathname === "/v1/auth/entitlements"))) {
        const current = store.getSessionByAccessToken(bearer(request));
        if (!current) return errorResponse(response, "SESSION_EXPIRED");
        const entitlements = current.user.entitlements || [];
        if (!productEntitled(entitlements)) return errorResponse(response, "NOT_ENTITLED");
        const data = url.pathname.endsWith("entitlements") ? { entitlements } : { user: { id: current.user.id, loginName: current.user.loginName }, entitlements };
        return json(response, 200, { ok: true, data });
      }
      return errorResponse(response, "NOT_FOUND");
    } catch (error) {
      logger({ code: "AUTH_REQUEST_FAILED", method: request.method, path: url.pathname });
      return errorResponse(response, "INTERNAL");
    }
  }

  const server = http.createServer((request, response) => { void handle(request, response); });
  return { server, store, handle };
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3180);
  const app = createAuthServer();
  app.server.listen(port, "127.0.0.1", () => { process.stdout.write(`auth-server listening on 127.0.0.1:${port}\n`); });
}

module.exports = { createAuthServer, SAFE_ERRORS };
