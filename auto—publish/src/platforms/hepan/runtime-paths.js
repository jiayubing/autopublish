const fs = require("node:fs");
const path = require("node:path");
const HEPAN_SITE_ORIGIN = "https://www.hepan.com";

function normalizeHepanCookie(value) {
  let cookie = String(value == null ? "" : value).trim();
  if (/^cookie\s*:/i.test(cookie)) cookie = cookie.replace(/^cookie\s*:/i, "").trim();
  if (!cookie || /[\0\r\n]/.test(cookie)) {
    const error = new Error("Hepan cookie is invalid");
    error.code = "HEPAN_COOKIE_REJECTED";
    throw error;
  }
  return cookie;
}

function resolveHepanVendorDir(options) {
  const values = options || {};
  const io = values.fs || fs;
  const pathApi = values.path || path;
  const scriptPath = values.scriptPath || pathApi.join(__dirname, "hepan_publish.py");
  const candidates = [];
  if (values.explicit) candidates.push(values.explicit);
  if (process.resourcesPath) {
    candidates.push(pathApi.join(process.resourcesPath, "app.asar.unpacked", "resources", "hepan", "vendor-pure"));
    candidates.push(pathApi.join(process.resourcesPath, "app", "resources", "hepan", "vendor-pure"));
  }
  candidates.push(pathApi.resolve(pathApi.dirname(scriptPath), "../../../resources/hepan/vendor-pure"));
  return candidates.find((candidate) => {
    try { return io.lstatSync(candidate).isDirectory(); } catch (_) { return false; }
  }) || "";
}

function resolveHepanScriptPath(options) {
  const values = options || {};
  const io = values.fs || fs;
  const pathApi = values.path || path;
  if (values.scriptPath && values.development === true) return values.scriptPath;
  const packaged = values.packaged === true || (values.packaged !== false && Boolean(process.resourcesPath));
  const candidate = packaged
    ? pathApi.join(process.resourcesPath || "", "app.asar.unpacked", "src", "platforms", "hepan", "hepan_publish.py")
    : pathApi.join(__dirname, "hepan_publish.py");
  try {
    const stat = io.lstatSync(candidate);
    if (stat.isFile() && (typeof stat.isSymbolicLink !== "function" || !stat.isSymbolicLink())) return candidate;
  } catch (_) {}
  const error = new Error("Hepan packaged script is unavailable");
  error.code = "HEPAN_RUNTIME_SCRIPT_UNAVAILABLE";
  throw error;
}

function withHepanVendorEnvironment(options, vendorDir) {
  if (!vendorDir) return options || {};
  return Object.assign({}, options || {}, {
    env: Object.assign({}, process.env, options && options.env || {}, { PYTHONPATH: vendorDir, PYTHONDONTWRITEBYTECODE: "1" })
  });
}

module.exports = { HEPAN_SITE_ORIGIN, resolveHepanScriptPath, resolveHepanVendorDir, withHepanVendorEnvironment, normalizeHepanCookie };
