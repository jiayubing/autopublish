const { validateProxyCidr } = require("./source-resolver");

const SOURCE_HEADERS = new Set(["cf-connecting-ip", "x-forwarded-for", "forwarded"]);
const CONFIG_KEYS = new Set(["enabled", "header", "sourceHeader", "trustedHops", "trustedProxyCidrs", "trustedProxies"]);

class ProxyConfigurationError extends TypeError {
  constructor(message) {
    super(message);
    this.name = "ProxyConfigurationError";
    this.code = "AUTH_PROXY_CONFIG_INVALID";
  }
}

function createProxyConfiguration(value) {
  if (value === undefined || value === null || value === false) return missingConfiguration();
  if (value === true || typeof value === "string" || Array.isArray(value)) throw new ProxyConfigurationError("trust-proxy configuration must explicitly name a header, hop count, and trusted proxy range");
  if (typeof value !== "object") throw new ProxyConfigurationError("trust-proxy configuration must be an object");
  if (value.enabled === false) return missingConfiguration();
  if (Object.keys(value).some((key) => !CONFIG_KEYS.has(key))) throw new ProxyConfigurationError("trust-proxy configuration contains an unknown field");

  const header = normalizeHeader(value.header || value.sourceHeader);
  const trustedProxyCidrs = normalizeTrustedProxies(value.trustedProxyCidrs || value.trustedProxies);
  const trustedHops = normalizeHops(value.trustedHops);
  if (header === "cf-connecting-ip" && trustedHops !== 1) throw new ProxyConfigurationError("cf-connecting-ip only supports one explicitly trusted hop");

  const rules = Object.freeze({ header, trustedHops, trustedProxyCidrs: Object.freeze(trustedProxyCidrs.slice()) });
  return Object.freeze({
    enabled: true,
    rules,
    diagnostic: Object.freeze({
      code: "AUTH_TRUST_PROXY_CONFIG_VALID",
      status: "valid",
      message: "可信来源配置有效",
      trusted: true,
      header,
      trustedHops,
      trustedProxyCount: trustedProxyCidrs.length,
    }),
  });
}

function proxyConfigurationFromOptions(options, env) {
  const opts = options || {};
  const environment = env || process.env;
  if (opts.proxyConfig !== undefined && opts.trustProxy !== undefined) throw new ProxyConfigurationError("set only one of proxyConfig and trustProxy");
  if (opts.proxyConfig !== undefined) return createProxyConfiguration(opts.proxyConfig);
  if (opts.trustProxy !== undefined) return createProxyConfiguration(opts.trustProxy);
  if (environment && environment.AUTH_TRUST_PROXY_CONFIG) {
    let parsed;
    try { parsed = JSON.parse(environment.AUTH_TRUST_PROXY_CONFIG); } catch (_) { throw new ProxyConfigurationError("AUTH_TRUST_PROXY_CONFIG must be valid JSON"); }
    return createProxyConfiguration(parsed);
  }
  return createProxyConfiguration(undefined);
}

function missingConfiguration() {
  return Object.freeze({
    enabled: false,
    rules: null,
    diagnostic: Object.freeze({
      code: "AUTH_TRUST_PROXY_CONFIG_MISSING",
      status: "missing",
      message: "可信来源配置缺失",
      trusted: false,
    }),
  });
}

function normalizeHeader(value) {
  if (typeof value !== "string" || !SOURCE_HEADERS.has(value.trim().toLowerCase())) throw new ProxyConfigurationError("trust-proxy configuration must name a supported source header");
  return value.trim().toLowerCase();
}

function normalizeTrustedProxies(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) throw new ProxyConfigurationError("trust-proxy configuration must list one to sixteen trusted proxy CIDRs");
  const result = value.map((item) => {
    if (typeof item !== "string" || !validateProxyCidr(item.trim())) throw new ProxyConfigurationError("trust-proxy configuration contains an invalid trusted proxy CIDR");
    return item.trim();
  });
  if (new Set(result).size !== result.length) throw new ProxyConfigurationError("trust-proxy configuration contains duplicate trusted proxy CIDRs");
  return result;
}

function normalizeHops(value) {
  const hops = Number(value);
  if (!Number.isSafeInteger(hops) || hops < 1 || hops > 16) throw new ProxyConfigurationError("trust-proxy configuration must set trustedHops from 1 to 16");
  return hops;
}

module.exports = { createProxyConfiguration, proxyConfigurationFromOptions, ProxyConfigurationError, SOURCE_HEADERS };
