const { mapHealthError, mapHealthResult } = require("./health-diagnostic-mapper");

const ROUTES = Object.freeze({
  "/healthz": "liveness",
  "/healthz/live": "liveness",
  "/livez": "liveness",
  "/healthz/ready": "readiness",
  "/readyz": "readiness",
});

function clockMs(clock) {
  const value = typeof clock === "function" ? clock() : Date.now();
  if (value instanceof Date) return value.getTime();
  return Number.isFinite(Number(value)) ? Number(value) : Date.now();
}

class HttpHealthHandler {
  constructor(options) {
    const opts = options || {};
    this.liveness = opts.livenessProbe;
    this.readiness = opts.readinessProbe;
    this.clock = opts.clock || Date.now;
    this.routes = Object.assign({}, ROUTES);
    if (typeof opts.compatibilityPath === "string" && opts.compatibilityPath) this.routes[opts.compatibilityPath] = "liveness";
  }

  async handle(method, pathname) {
    if (method !== "GET" || !this.routes[pathname]) return null;
    const operation = this.routes[pathname];
    const startedAt = clockMs(this.clock);
    const probe = operation === "liveness" ? this.liveness : this.readiness;
    let result;
    try {
      if (!probe || typeof probe.check !== "function") result = { ok: false, errorCode: "AUTH_DB_UNAVAILABLE" };
      else result = await Promise.resolve(probe.check());
    } catch (error) {
      result = { ok: false, error };
    }
    const durationMs = Math.max(0, clockMs(this.clock) - startedAt);
    const mapped = result && result.ok === false
      ? mapHealthError(result.error || result.errorCode, { operation, time: startedAt, durationMs })
      : mapHealthResult(result, { operation, time: startedAt, durationMs });
    return { statusCode: mapped.ok ? 200 : 503, body: mapped };
  }
}

function createHttpHealthHandler(options) { return new HttpHealthHandler(options); }

module.exports = { HttpHealthHandler, createHttpHealthHandler, ROUTES };
