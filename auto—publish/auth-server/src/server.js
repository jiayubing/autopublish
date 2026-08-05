const http = require("node:http");
const path = require("node:path");
const { AuthDomain } = require("./auth-domain");
const { AuthError } = require("./auth-errors");
const { AuthAdministration } = require("./auth-administration");
const {
  SqliteAuthRepository,
} = require("./repositories/sqlite-auth-repository");
const {
  proxyConfigurationFromOptions,
} = require("./security/proxy-config-adapter");
const { SourceResolver } = require("./security/source-resolver");
const { createHttpHealthHandler } = require("./health/http-health-handler");
const { createLivenessProbe } = require("./health/liveness-probe");
const { createRepositoryProbe } = require("./health/repository-probe");
const { createIntegrityRunner } = require("./health/integrity-runner");
const { classifyHealthError } = require("./health/health-diagnostic-mapper");

const HEALTH_COMPATIBILITY_PATH = "/healthz";

const SAFE_ERRORS = {
  AUTH_INVALID_CREDENTIALS: [
    401,
    "AUTH_INVALID_CREDENTIALS",
    "登录名或密码错误",
  ],
  AUTH_ACCOUNT_DISABLED: [403, "AUTH_ACCOUNT_DISABLED", "账号已禁用"],
  AUTH_ACCOUNT_LOCKED: [423, "AUTH_ACCOUNT_LOCKED", "账号暂时锁定"],
  AUTH_LICENSE_EXPIRED: [403, "AUTH_LICENSE_EXPIRED", "产品授权已到期"],
  AUTH_NOT_ENTITLED: [403, "AUTH_NOT_ENTITLED", "当前账号没有产品授权"],
  AUTH_DEVICE_LIMIT_REACHED: [
    403,
    "AUTH_DEVICE_LIMIT_REACHED",
    "已达到设备名额，请联系管理员释放旧设备",
  ],
  AUTH_DEVICE_REVOKED: [403, "AUTH_DEVICE_REVOKED", "设备已被撤销"],
  AUTH_PASSWORD_CHANGE_REQUIRED: [
    403,
    "AUTH_PASSWORD_CHANGE_REQUIRED",
    "首次登录必须修改密码",
  ],
  AUTH_SESSION_EXPIRED: [401, "AUTH_SESSION_EXPIRED", "认证会话已失效"],
  AUTH_TOKEN_REUSE_DETECTED: [
    401,
    "AUTH_TOKEN_REUSE_DETECTED",
    "检测到会话凭证重复使用，请重新登录",
  ],
  AUTH_RATE_LIMITED: [429, "AUTH_RATE_LIMITED", "请求过于频繁，请稍后再试"],
  AUTH_INPUT_INVALID: [400, "AUTH_INPUT_INVALID", "认证请求无效"],
  AUTH_NOT_FOUND: [404, "AUTH_NOT_FOUND", "认证接口不存在"],
  AUTH_SERVICE_UNAVAILABLE: [
    503,
    "AUTH_SERVICE_UNAVAILABLE",
    "认证服务暂时不可用",
  ],
  AUTH_SERVER_ERROR: [500, "AUTH_SERVICE_UNAVAILABLE", "认证服务暂时不可用"],
};

function json(response, statusCode, body) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

function errorResponse(response, errorOrCode) {
  const code =
    typeof errorOrCode === "string"
      ? errorOrCode
      : errorOrCode && errorOrCode.code;
  const [status, stableCode, message] =
    SAFE_ERRORS[code] || SAFE_ERRORS.AUTH_SERVICE_UNAVAILABLE;
  const body = { ok: false, error: { code: stableCode, message } };
  if (
    code === "AUTH_PASSWORD_CHANGE_REQUIRED" &&
    errorOrCode &&
    errorOrCode.details &&
    errorOrCode.details.user
  )
    body.data = { user: errorOrCode.details.user };
  return json(response, status, body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bodyBytes = 0;
    let oversized = false;
    let settled = false;
    const fail = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    request.on("data", (chunk) => {
      if (oversized) return;
      bodyBytes += Buffer.byteLength(chunk);
      if (bodyBytes > 32768) {
        oversized = true;
        body = "";
        return;
      }
      body += chunk;
    });
    request.on("end", () => {
      if (settled) return;
      if (oversized) return fail(new AuthError("AUTH_INPUT_INVALID"));
      try {
        settled = true;
        resolve(body ? JSON.parse(body) : {});
      } catch (_) {
        fail(new AuthError("AUTH_INPUT_INVALID"));
      }
    });
    request.on("error", fail);
  });
}

function bearer(request) {
  const value = request.headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function assertPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AuthError("AUTH_INPUT_INVALID");
  return value;
}

function allowFields(input, fields) {
  assertPlainObject(input);
  const allowed = new Set(fields);
  if (Object.keys(input).some((key) => !allowed.has(key)))
    throw new AuthError("AUTH_INPUT_INVALID");
  return input;
}

function unavailableRepository(filePath, startupError) {
  const failure = Object.assign(new Error("database unavailable"), {
    code: classifyHealthError(startupError).code,
  });
  const fail = () => {
    throw failure;
  };
  return new Proxy(
    { filePath, probeReadiness: fail, healthCheck: fail, close() {} },
    {
      get(target, property) {
        if (property in target) return target[property];
        if (typeof property === "symbol") return undefined;
        return fail;
      },
    },
  );
}

function createAuthServer(options) {
  const opts = options || {};
  const proxyConfiguration = proxyConfigurationFromOptions(opts);
  const sourceResolver = new SourceResolver(proxyConfiguration);
  const databasePath =
    opts.filePath ||
    process.env.AUTH_DB_PATH ||
    path.join(process.cwd(), "data", "auth.db");
  let repository = opts.repository;
  if (!repository) {
    try {
      repository = new SqliteAuthRepository({
        filePath: databasePath,
        skipIntegrity: true,
      });
    } catch (error) {
      repository = unavailableRepository(databasePath, error);
    }
  }
  const domain =
    opts.domain ||
    new AuthDomain({
      repository,
      now: opts.now,
      accessTtlMs: opts.accessTtlMs,
      refreshTtlMs: opts.refreshTtlMs,
      maxConcurrentPasswordComputations: opts.maxConcurrentPasswordComputations,
      loginFailureThreshold: opts.loginFailureThreshold,
      loginLockMs: opts.loginLockMs,
      rateLimitWindowMs: opts.rateLimitWindowMs,
      rateLimitMaxAttempts: opts.rateLimitMaxAttempts,
      rateLimitCapacity: opts.rateLimitCapacity,
      rateLimitMaxKeys: opts.rateLimitMaxKeys,
      sourceRateLimitCapacity: opts.sourceRateLimitCapacity,
      identityRateLimitCapacity: opts.identityRateLimitCapacity,
      combinationRateLimitCapacity: opts.combinationRateLimitCapacity,
      sourceRateLimitMaxAttempts: opts.sourceRateLimitMaxAttempts,
      identityRateLimitMaxAttempts: opts.identityRateLimitMaxAttempts,
      combinationRateLimitMaxAttempts: opts.combinationRateLimitMaxAttempts,
      sourceRateLimitTtlMs: opts.sourceRateLimitTtlMs,
      identityRateLimitTtlMs: opts.identityRateLimitTtlMs,
      combinationRateLimitTtlMs: opts.combinationRateLimitTtlMs,
      passwordVerifier: opts.passwordVerifier || opts.verifyPassword,
      passwordHasher: opts.passwordHasher || opts.createPasswordHash,
    });
  const administration =
    opts.administration || new AuthAdministration({ repository, domain });
  const logger = typeof opts.logger === "function" ? opts.logger : () => {};
  const livenessProbe =
    opts.livenessProbe || createLivenessProbe(opts.livenessOptions);
  const repositoryProbe =
    opts.readinessProbe || createRepositoryProbe({ repository });
  const healthHandler =
    opts.healthHandler ||
    createHttpHealthHandler({
      livenessProbe,
      readinessProbe: repositoryProbe,
      clock: opts.healthClock,
      compatibilityPath: HEALTH_COMPATIBILITY_PATH,
    });
  const integrityRunner =
    opts.integrityRunner ||
    createIntegrityRunner({
      databasePath: repository.filePath || databasePath,
      defaultTimeoutMs: opts.integrityTimeoutMs,
      policy: opts.maintenancePolicy,
    });

  function getDiagnostics() {
    return {
      proxy: Object.assign({}, proxyConfiguration.diagnostic),
      loginRateLimit:
        typeof domain.getLoginRateLimitStats === "function"
          ? domain.getLoginRateLimitStats()
          : null,
    };
  }

  async function handle(request, response) {
    const url = new URL(request.url, "http://127.0.0.1");
    try {
      const health = await healthHandler.handle(request.method, url.pathname);
      if (health) return json(response, health.statusCode, health.body);
      const sourceFingerprint =
        sourceResolver.resolve(request).sourceFingerprint;
      if (request.method === "POST" && url.pathname === "/v1/auth/login") {
        const input = allowFields(await readBody(request), [
          "loginName",
          "password",
          "deviceId",
          "deviceName",
          "appVersion",
        ]);
        const session = await domain.login(
          Object.assign({}, input, { sourceFingerprint }),
        );
        return json(response, 200, { ok: true, data: session });
      }
      if (request.method === "POST" && url.pathname === "/v1/auth/refresh") {
        const input = allowFields(await readBody(request), [
          "refreshToken",
          "deviceId",
          "appVersion",
        ]);
        const session = await domain.refresh(
          Object.assign({}, input, { sourceFingerprint }),
        );
        return json(response, 200, { ok: true, data: session });
      }
      if (request.method === "POST" && url.pathname === "/v1/auth/logout") {
        const input = allowFields(await readBody(request), ["refreshToken"]);
        const result = await domain.logout({
          accessToken: bearer(request),
          refreshToken: input.refreshToken,
          sourceFingerprint,
        });
        return json(response, 200, { ok: true, data: result });
      }
      if (
        request.method === "POST" &&
        url.pathname === "/v1/auth/change-password"
      ) {
        const input = allowFields(await readBody(request), [
          "loginName",
          "currentPassword",
          "newPassword",
          "deviceId",
          "deviceName",
          "appVersion",
        ]);
        const session = await domain.changePassword(
          Object.assign({}, input, {
            accessToken: bearer(request) || undefined,
            sourceFingerprint,
          }),
        );
        return json(response, 200, { ok: true, data: session });
      }
      if (
        request.method === "GET" &&
        (url.pathname === "/v1/auth/session" ||
          url.pathname === "/v1/auth/entitlements")
      ) {
        const current = await domain.inspect(bearer(request));
        const data = url.pathname.endsWith("entitlements")
          ? { entitlements: current.entitlements }
          : {
              user: current.user,
              entitlements: current.entitlements,
              device: current.device,
            };
        return json(response, 200, { ok: true, data });
      }
      return errorResponse(response, "AUTH_NOT_FOUND");
    } catch (error) {
      if (
        error instanceof AuthError ||
        (error && typeof error.code === "string" && SAFE_ERRORS[error.code])
      )
        return errorResponse(response, error);
      logger({
        code: "AUTH_REQUEST_FAILED",
        method: request.method,
        path: url.pathname,
      });
      return errorResponse(response, "AUTH_SERVICE_UNAVAILABLE");
    }
  }

  const server = http.createServer((request, response) => {
    void handle(request, response);
  });
  return {
    server,
    repository,
    domain,
    administration,
    handle,
    sourceResolver,
    proxyConfiguration,
    getDiagnostics,
    diagnostics: getDiagnostics(),
    healthHandler,
    livenessProbe,
    repositoryProbe,
    integrityRunner,
  };
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3180);
  const host = process.env.HOST || "127.0.0.1";
  try {
    const app = createAuthServer();
    app.server.listen(port, host, () => {
      process.stdout.write(`auth-server listening on ${host}:${port}\n`);
    });
  } catch (_) {
    process.stderr.write(
      "AUTH_SERVICE_UNAVAILABLE: authentication database initialization failed\n",
    );
    process.exitCode = 1;
  }
}

module.exports = {
  createAuthServer,
  SAFE_ERRORS,
  allowFields,
  errorResponse,
  HEALTH_COMPATIBILITY_PATH,
};
