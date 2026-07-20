const defaultFs = require("node:fs");
const defaultPath = require("node:path");
const defaultOs = require("node:os");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { createPlatformProviderConfigStore } = require("../../platform-provider-config-store");
const { resolveHepanVendorDir, withHepanVendorEnvironment } = require("../../../src/platforms/hepan/runtime-paths");

const HEPAN_SITE_ORIGIN = "https://www.hepan.com";
const HEPAN_SELF_TEST_PAYLOAD = JSON.stringify({
  title: "Hepan payload self-test",
  contentHtml: "<p>payload self-test</p>",
  sourceStem: "hepan-self-test"
});

function adapterError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
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

function createHepanSettingsAdapter(options) {
  const values = options || {};
  const io = values.fs || defaultFs;
  const path = values.path || defaultPath;
  const localStateRoot = values.localStateRoot || path.join(defaultOs.tmpdir(), "auto-publish-hepan-runtime");
  const scriptPath = values.scriptPath || path.resolve(__dirname, "../../../src/platforms/hepan/hepan_publish.py");
  const runCommand = values.runCommand || (async (command, args, commandOptions) => {
    const result = spawnSync(command, args, Object.assign({ encoding: "utf8", timeout: 120000, windowsHide: true }, commandOptions || {}));
    return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "", error: result.error || null };
  });
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
      const cookie = String(value.cookie == null ? "" : value.cookie).trim();
      if (!cookie) throw adapterError("PLATFORM_CONFIG_INVALID", "Hepan cookie is invalid");
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

      return withTemporaryCookie(config, async (cookiePath, imageDir) => {
        let login;
        try {
          login = await runCommand(config.pythonPath, [scriptPath, "--image-dir", imageDir, "--cookie-path", cookiePath, "--check-login", "--category-id", String(config.categoryId), ...(vendorDir ? ["--vendor-dir", vendorDir] : [])], withHepanVendorEnvironment({}, vendorDir));
        } catch (_) { throw adapterError("HEPAN_LOGIN_INVALID", "Hepan login test failed"); }
        const payload = parseJsonOutput(login && login.stdout);
        if (!login || login.error || login.status !== 0 || !payload || payload.ok !== true) throw adapterError("HEPAN_LOGIN_INVALID", "Hepan login test failed");
        return { ok: true, code: "HEPAN_LOGIN_OK" };
      }, io, path, localStateRoot);
    },
    errorCode(error) { return error && error.code && /^HEPAN_/.test(error.code) ? error.code : "HEPAN_CONNECTION_FAILED"; },
    withTemporaryCookie: (config, callback) => withTemporaryCookie(config, callback, io, path, localStateRoot),
    createTemporaryCookie: (config) => createTemporaryCookie(config, io, path, localStateRoot),
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
  const imageDir = path.join(tmpRoot, `.hepan-images-${crypto.randomUUID()}`);
  let createdRoot = false;
  try {
    if (!io.existsSync(tmpRoot)) { io.mkdirSync(tmpRoot, { recursive: true }); createdRoot = true; }
    io.mkdirSync(imageDir, { recursive: true });
    io.writeFileSync(cookiePath, String(config.cookie || ""), { encoding: "utf8", mode: 0o600 });
    return await callback(cookiePath, imageDir);
  } finally {
    try { if (io.existsSync(cookiePath)) io.unlinkSync(cookiePath); } catch (_) {}
    try { if (io.existsSync(imageDir)) io.rmSync(imageDir, { recursive: true, force: true }); } catch (_) {}
    if (createdRoot) {
      try { if (io.existsSync(tmpRoot) && io.readdirSync(tmpRoot).length === 0) io.rmdirSync(tmpRoot); } catch (_) {}
    }
  }
}

function createTemporaryCookie(config, io, path, localStateRoot) {
  const tmpRoot = path.join(localStateRoot, "tmp");
  const cookiePath = path.join(tmpRoot, `.hepan-cookie-${crypto.randomUUID()}.tmp`);
  io.mkdirSync(tmpRoot, { recursive: true });
  let cookie = String(config.cookie || "");
  if (!cookie && config.cookiePath) {
    try { cookie = io.readFileSync(config.cookiePath, "utf8").trim(); } catch (_) { throw adapterError("HEPAN_LOGIN_INVALID", "Hepan cookie is unavailable"); }
  }
  if (!cookie) throw adapterError("HEPAN_LOGIN_INVALID", "Hepan cookie is unavailable");
  io.writeFileSync(cookiePath, cookie, { encoding: "utf8", mode: 0o600 });
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

module.exports = { createHepanSettingsAdapter, HEPAN_SITE_ORIGIN };
