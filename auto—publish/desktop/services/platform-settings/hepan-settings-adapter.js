const defaultFs = require("node:fs");
const defaultPath = require("node:path");
const defaultOs = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { createPlatformProviderConfigStore } = require("../../platform-provider-config-store");
const { HEPAN_SITE_ORIGIN, resolveHepanScriptPath, resolveHepanVendorDir, withHepanVendorEnvironment, normalizeHepanCookie } = require("../../../src/platforms/hepan/runtime-paths");

const HEPAN_SELF_TEST_PAYLOAD = JSON.stringify({
  title: "Hepan payload self-test",
  contentHtml: "<p>payload self-test</p>",
  sourceStem: "hepan-self-test"
});
const HEPAN_CHECK_STAGES = new Set(["authentication", "publish_access", "upload_context", "dependency"]);
const HEPAN_UPLOAD_CONTEXTS = new Set(["available", "changed", "not_checked"]);
const HEPAN_TEMPORARY_FILE = /^\.hepan-(?:cookie-[0-9a-f-]{36}\.tmp|payload-[0-9a-f-]{36}\.json|payload-self-test-[0-9a-f-]{36}\.json)$/i;
const HEPAN_TEMPORARY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function adapterError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function safeAccount(value) {
  if (!value || typeof value !== "object") return undefined;
  const displayName = String(value.displayName == null ? "" : value.displayName)
    .trim()
    .replace(/\p{C}/gu, "");
  const uid = String(value.uid == null ? "" : value.uid).trim();
  if (!displayName || Array.from(displayName).length > 80 || !/^\d{1,20}$/.test(uid)) return undefined;
  return { displayName, uid };
}

function safeCheckPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const errorCode = typeof payload.errorCode === "string" && /^HEPAN_[A-Z0-9_]{1,80}$/.test(payload.errorCode) ? payload.errorCode : "";
  const stage = typeof payload.stage === "string" && HEPAN_CHECK_STAGES.has(payload.stage) ? payload.stage : undefined;
  const uploadContext = typeof payload.uploadContext === "string" && HEPAN_UPLOAD_CONTEXTS.has(payload.uploadContext) ? payload.uploadContext : "not_checked";
  const diagnostics = {
    authenticated: payload.authenticated === true,
    publishAccess: payload.publishAccess === true,
    uploadContext,
    ...(stage ? { stage } : {}),
    ...(safeAccount(payload.account) ? { account: safeAccount(payload.account) } : {})
  };
  const warnings = Array.isArray(payload.warnings)
    ? payload.warnings.filter((value) => typeof value === "string" && /^HEPAN_[A-Z0-9_]{1,80}$/.test(value)).slice(0, 8)
    : [];
  if (payload.ok === true && diagnostics.authenticated && diagnostics.publishAccess) {
    if (uploadContext === "changed" && !warnings.includes("HEPAN_UPLOAD_CONTEXT_CHANGED")) warnings.push("HEPAN_UPLOAD_CONTEXT_CHANGED");
    return {
      ok: true,
      code: "HEPAN_AUTH_OK",
      authenticated: true,
      publishAccess: true,
      uploadContext,
      ...(stage ? { stage } : {}),
      ...(warnings.length ? { warnings } : {}),
      ...(diagnostics.account ? { account: diagnostics.account } : {})
    };
  }
  if (errorCode) return { ok: false, errorCode, ...diagnostics, ...(warnings.length ? { warnings } : {}) };
  return null;
}

function assertPythonPath(value, io, path) {
  const text = String(value == null ? "" : value).trim();
  if (!text || text.includes("\0") || !path.isAbsolute(text)) throw adapterError("PLATFORM_CONFIG_INVALID", "Hepan Python path is invalid");
  let stat;
  try { stat = io.lstatSync(text); } catch (_) { throw adapterError("PLATFORM_CONFIG_INVALID", "Hepan Python path is invalid"); }
  if (stat.isSymbolicLink() || !stat.isFile()) throw adapterError("PLATFORM_CONFIG_INVALID", "Hepan Python path is invalid");
  return path.resolve(text);
}

function normalizeCategoryId(value) {
  const number = Number(value == null ? 121 : value);
  if (!Number.isInteger(number) || number < 1) throw adapterError("PLATFORM_CONFIG_INVALID", "Hepan category ID is invalid");
  return number;
}

function normalizePublishIntervalSeconds(value) {
  const number = value == null || value === "" ? 30 : Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 3600) {
    throw adapterError("PLATFORM_CONFIG_INVALID", "Hepan publish interval is invalid");
  }
  return number;
}

function assertCookiePath(value, io, path) {
  const text = String(value == null ? "" : value).trim();
  if (!text || text.includes("\0") || !path.isAbsolute(text)) throw adapterError("PLATFORM_CONFIG_INVALID", "Hepan Cookie path is invalid");
  let stat;
  try { stat = io.lstatSync(text); } catch (_) { throw adapterError("PLATFORM_CONFIG_INVALID", "Hepan Cookie path is invalid"); }
  if (stat.isSymbolicLink() || !stat.isFile()) throw adapterError("PLATFORM_CONFIG_INVALID", "Hepan Cookie path is invalid");
  return path.resolve(text);
}

function cleanupExpiredHepanTemporaryFiles(options) {
  const values = options || {};
  const io = values.fs || defaultFs;
  const path = values.path || defaultPath;
  const now = typeof values.now === "function" ? values.now : () => Date.now();
  const maxAgeMs = Number.isSafeInteger(values.maxAgeMs) && values.maxAgeMs >= 0 ? values.maxAgeMs : HEPAN_TEMPORARY_MAX_AGE_MS;
  const tmpRoot = path.resolve(values.tmpRoot || path.join(values.localStateRoot || path.join(defaultOs.tmpdir(), "auto-publish-hepan-runtime"), "tmp"));
  const removed = [];
  let names;
  try { names = io.readdirSync(tmpRoot); } catch (_) { return { removed, skipped: 0 }; }
  let skipped = 0;
  names.forEach((name) => {
    if (!HEPAN_TEMPORARY_FILE.test(name)) { skipped += 1; return; }
    const candidate = path.resolve(tmpRoot, name);
    if (path.dirname(candidate) !== tmpRoot) { skipped += 1; return; }
    let stat;
    try { stat = io.lstatSync(candidate); } catch (_) { return; }
    if (!stat.isFile() || stat.isSymbolicLink() || now() - stat.mtimeMs < maxAgeMs) { skipped += 1; return; }
    try { io.unlinkSync(candidate); removed.push(name); } catch (_) { skipped += 1; }
  });
  return { removed, skipped };
}

function createHepanSettingsAdapter(options) {
  const values = options || {};
  const io = values.fs || defaultFs;
  const path = values.path || defaultPath;
  const localStateRoot = values.localStateRoot || path.join(defaultOs.tmpdir(), "auto-publish-hepan-runtime");
  const scriptPath = values.scriptPath || resolveHepanScriptPath({ path });
  const runCommand = values.runCommand || ((command, args, commandOptions) => new Promise((resolve) => {
    const settings = Object.assign({ windowsHide: true }, commandOptions || {});
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => { if (!settled) { settled = true; resolve(result); } };
    let child;
    try { child = spawn(command, args, settings); } catch (error) { finish({ status: null, stdout, stderr, error }); return; }
    child.stdout && child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr && child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", (error) => finish({ status: null, stdout, stderr, error }));
    child.once("close", (status) => finish({ status, stdout, stderr, error: null }));
    const timeoutMs = Number.isInteger(settings.timeout) ? settings.timeout : 120000;
    const timer = setTimeout(() => { try { child.kill(); } catch (_) {} finish({ status: null, stdout, stderr, error: Object.assign(new Error("HEPAN_PROCESS_TIMEOUT"), { code: "ETIMEDOUT" }) }); }, timeoutMs);
    child.once("close", () => clearTimeout(timer));
  }));
  const adapter = {
    id: "hepan",
    fileName: "hepan-provider.json",
    schema: {
      pythonPath: { type: "string", required: true, nonEmpty: true },
      cookie: { type: "string", required: true, nonEmpty: true },
      categoryId: { type: "integer", required: true, min: 1, default: 121 },
      vendorDir: { type: "string", required: false, clearable: true, clearValue: "" },
      publishIntervalSeconds: { type: "integer", required: true, min: 0, max: 3600, default: 30 },
      siteOrigin: { type: "string", required: true, default: HEPAN_SITE_ORIGIN }
    },
    secretFields: ["cookie"],
    clearableFields: ["vendorDir"],
    createStore: (storeOptions) => createPlatformProviderConfigStore({ ...storeOptions, fileName: "hepan-provider.json", schema: adapter.schema, secretFields: adapter.secretFields }),
    validate(input) {
      const value = input || {};
      const pythonPath = assertPythonPath(value.pythonPath, io, path);
      let cookie;
      try { cookie = normalizeHepanCookie(value.cookie); } catch (_) { throw adapterError("PLATFORM_CONFIG_INVALID", "Hepan cookie is invalid"); }
      const vendorDir = value.vendorDir == null || value.vendorDir === "" ? "" : String(value.vendorDir).trim();
      if (vendorDir && (!path.isAbsolute(vendorDir) || vendorDir.includes("\0"))) throw adapterError("PLATFORM_CONFIG_INVALID", "Hepan vendor directory is invalid");
      return {
        pythonPath,
        cookie,
        categoryId: normalizeCategoryId(value.categoryId),
        vendorDir,
        publishIntervalSeconds: normalizePublishIntervalSeconds(value.publishIntervalSeconds),
        siteOrigin: HEPAN_SITE_ORIGIN
      };
    },
    environment(env) {
      const source = env || process.env;
      const pythonPath = typeof source.HEPAN_PYTHON === "string" ? source.HEPAN_PYTHON.trim() : "";
      const cookiePath = typeof source.HEPAN_COOKIE_PATH === "string" ? source.HEPAN_COOKIE_PATH.trim() : "";
      if (!pythonPath && !cookiePath) return null;
      if (!pythonPath || !cookiePath) throw adapterError("PLATFORM_CONFIG_INVALID", "Hepan environment configuration is invalid");
      return {
        pythonPath: assertPythonPath(pythonPath, io, path),
        cookiePath: assertCookiePath(cookiePath, io, path),
        categoryId: normalizeCategoryId(source.HEPAN_CATEGORY_ID),
        vendorDir: source.HEPAN_VENDOR_DIR || "",
        publishIntervalSeconds: normalizePublishIntervalSeconds(source.HEPAN_PUBLISH_INTERVAL_SECONDS),
        siteOrigin: HEPAN_SITE_ORIGIN
      };
    },
    status(config, context) {
      const value = config || {};
      return {
        configured: Boolean(config),
        source: context.source,
        pythonConfigured: Boolean(value.pythonPath),
        cookieConfigured: Boolean(value.cookie || value.cookiePath),
        categoryId: value.categoryId || 121,
        vendorConfigured: Boolean(value.vendorDir),
        bundledVendorAvailable: Boolean(bundledVendorDir),
        publishIntervalSeconds: normalizePublishIntervalSeconds(value.publishIntervalSeconds),
        siteOrigin: HEPAN_SITE_ORIGIN,
        lastTest: context.lastTest || null
      };
    },
    async test(config) {
      const vendorDir = config.vendorDir || bundledVendorDir;
      await withTemporaryPayload(async (payloadPath) => {
        let selfTest;
        try {
          selfTest = await runCommand(config.pythonPath, [scriptPath, "--validate-payload", payloadPath], withHepanVendorEnvironment({}, vendorDir));
        } catch (error) {
          if (error && ["ENOENT", "EACCES", "ETIMEDOUT"].includes(error.code)) throw adapterError("HEPAN_PYTHON_UNAVAILABLE", "Hepan Python is unavailable");
          throw adapterError("HEPAN_PAYLOAD_RUNTIME_FAILED", "Hepan payload self-test failed");
        }
        const payload = parseJsonOutput(selfTest && selfTest.stdout);
        if (selfTest && selfTest.error) throw adapterError("HEPAN_PYTHON_UNAVAILABLE", "Hepan Python is unavailable");
        if (!selfTest || selfTest.status !== 0 || !payload || payload.ok !== true) {
          throw adapterError("HEPAN_PAYLOAD_RUNTIME_FAILED", "Hepan payload self-test failed");
        }
      }, io, path, localStateRoot);

      let version;
      try { version = await runCommand(config.pythonPath, ["--version"], {}); } catch (_) { throw adapterError("HEPAN_PYTHON_UNAVAILABLE", "Hepan Python is unavailable"); }
      if (version && (version.error || version.status !== 0)) throw adapterError("HEPAN_PYTHON_UNAVAILABLE", "Hepan Python is unavailable");

      let imports;
      try { imports = await runCommand(config.pythonPath, ["-c", "import requests; import bs4"], withHepanVendorEnvironment({}, vendorDir)); } catch (_) { throw adapterError("HEPAN_DEPENDENCY_MISSING", "Hepan Python dependencies are missing"); }
      if (imports && (imports.error || imports.status !== 0)) throw adapterError("HEPAN_DEPENDENCY_MISSING", "Hepan Python dependencies are missing");

      return withTemporaryCookie(config, async (cookiePath) => {
        let login;
        try {
          login = await runCommand(config.pythonPath, [scriptPath, "--cookie-path", cookiePath, "--check-login", "--category-id", String(config.categoryId), ...(vendorDir ? ["--vendor-dir", vendorDir] : [])], withHepanVendorEnvironment({}, vendorDir));
        } catch (_) { throw adapterError("HEPAN_CHECK_RUNTIME_FAILED", "Hepan login test failed"); }
        const payload = safeCheckPayload(parseJsonOutput(login && login.stdout));
        if (payload && payload.ok === true) return payload;
        if (payload && payload.errorCode) {
          const error = adapterError(payload.errorCode, "Hepan capability check failed");
          error.diagnostics = payload;
          throw error;
        }
        if (login && login.error) throw adapterError("HEPAN_CHECK_RUNTIME_FAILED", "Hepan login test failed");
        throw adapterError("HEPAN_CHECK_RUNTIME_FAILED", "Hepan login test failed");
      }, io, path, localStateRoot);
    },
    errorCode(error) { return error && error.code && /^HEPAN_/.test(error.code) ? error.code : "HEPAN_CONNECTION_FAILED"; },
    withTemporaryCookie: (config, callback) => withTemporaryCookie(config, callback, io, path, localStateRoot),
    createTemporaryCookie: (config) => createTemporaryCookie(config, io, path, localStateRoot),
    cleanupExpiredTemporaryFiles: (cleanupOptions) => cleanupExpiredHepanTemporaryFiles(Object.assign({}, cleanupOptions || {}, { fs: io, path, localStateRoot })),
    siteOrigin: HEPAN_SITE_ORIGIN
  };
  const bundledVendorDir = resolveHepanVendorDir({ fs: io, path, scriptPath, explicit: values.bundledVendorDir });
  return adapter;
}

async function withTemporaryPayload(callback, io, path, localStateRoot) {
  const tmpRoot = path.join(localStateRoot, "tmp");
  const payloadPath = path.join(tmpRoot, `.hepan-payload-self-test-${crypto.randomUUID()}.json`);
  let createdRoot = false;
  try {
    if (!io.existsSync(tmpRoot)) { io.mkdirSync(tmpRoot, { recursive: true }); createdRoot = true; }
    io.writeFileSync(payloadPath, HEPAN_SELF_TEST_PAYLOAD, { encoding: "utf8", mode: 0o600 });
    return await callback(payloadPath);
  } finally {
    try { if (io.existsSync(payloadPath)) io.unlinkSync(payloadPath); } catch (_) {}
    if (createdRoot) {
      try { if (io.existsSync(tmpRoot) && io.readdirSync(tmpRoot).length === 0) io.rmdirSync(tmpRoot); } catch (_) {}
    }
  }
}

async function withTemporaryCookie(config, callback, io, path, localStateRoot) {
  const tmpRoot = path.join(localStateRoot, "tmp");
  const cookiePath = path.join(tmpRoot, `.hepan-cookie-${crypto.randomUUID()}.tmp`);
  let createdRoot = false;
  try {
    if (!io.existsSync(tmpRoot)) { io.mkdirSync(tmpRoot, { recursive: true }); createdRoot = true; }
    io.writeFileSync(cookiePath, normalizeHepanCookie(config.cookie || ""), { encoding: "utf8", mode: 0o600 });
    return await callback(cookiePath);
  } finally {
    try { if (io.existsSync(cookiePath)) io.unlinkSync(cookiePath); } catch (_) {}
    if (createdRoot) {
      try { if (io.existsSync(tmpRoot) && io.readdirSync(tmpRoot).length === 0) io.rmdirSync(tmpRoot); } catch (_) {}
    }
  }
}

function createTemporaryCookie(config, io, path, localStateRoot) {
  const tmpRoot = path.join(localStateRoot, "tmp");
  const cookiePath = path.join(tmpRoot, `.hepan-cookie-${crypto.randomUUID()}.tmp`);
  const existed = io.existsSync(tmpRoot);
  io.mkdirSync(tmpRoot, { recursive: true });
  try {
    let cookie = String(config.cookie || "");
    if (!cookie && config.cookiePath) {
      try { cookie = io.readFileSync(config.cookiePath, "utf8").trim(); } catch (_) { throw adapterError("HEPAN_COOKIE_REJECTED", "Hepan cookie is unavailable"); }
    }
    cookie = normalizeHepanCookie(cookie);
    io.writeFileSync(cookiePath, cookie, { encoding: "utf8", mode: 0o600 });
  } catch (error) {
    try { if (!existed && io.existsSync(tmpRoot) && io.readdirSync(tmpRoot).length === 0) io.rmdirSync(tmpRoot); } catch (_) {}
    throw error;
  }
  let cleaned = false;
  return {
    cookiePath,
    cleanup: () => {
      if (cleaned) return;
      cleaned = true;
      try { if (io.existsSync(cookiePath)) io.unlinkSync(cookiePath); } catch (_) {}
      try { if (io.existsSync(tmpRoot) && io.readdirSync(tmpRoot).length === 0) io.rmdirSync(tmpRoot); } catch (_) {}
    }
  };
}

function parseJsonOutput(output) {
  const lines = String(output || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch (_) {}
  }
  return null;
}

module.exports = { createHepanSettingsAdapter, cleanupExpiredHepanTemporaryFiles, HEPAN_SITE_ORIGIN };
