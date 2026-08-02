const fs = require("node:fs");
const path = require("node:path");
const {
  createPackagedRuntimeResolver,
} = require("../../infrastructure/runtime/packaged-runtime-resolver");
const HEPAN_SITE_ORIGIN = "https://www.hepan.com";

function isPackagedContext(options) {
  const values = options || {};
  if (typeof values.packaged === "boolean") return values.packaged;
  const environment = values.env || process.env;
  if (environment.AUTO_PUBLISH_PACKAGED !== undefined) {
    return environment.AUTO_PUBLISH_PACKAGED === "1";
  }
  return environment.ELECTRON_IS_PACKAGED === "1";
}

function normalizeHepanCookie(value) {
  let cookie = String(value == null ? "" : value).trim();
  if (/^cookie\s*:/i.test(cookie))
    cookie = cookie.replace(/^cookie\s*:/i, "").trim();
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
  const scriptPath =
    values.scriptPath || pathApi.join(__dirname, "hepan_publish.py");
  const packaged = isPackagedContext(values);
  const resolver = createPackagedRuntimeResolver({
    fs: io,
    path: pathApi,
    packaged,
    env: values.env,
    appRoot: values.appRoot,
    resourcesPath: values.resourcesPath || process.resourcesPath,
  });
  const root =
    packaged && typeof io.realpathSync === "function"
      ? resolver.resourcesPath
      : undefined;
  const result = resolver.tryResolve({
    name: "Hepan vendor directory",
    explicit: values.explicit,
    allowExplicitPackaged: true,
    packagedCandidates: [
      pathApi.join(
        resolver.resourcesPath,
        "app.asar.unpacked",
        "resources",
        "hepan",
        "vendor-pure",
      ),
    ],
    developmentCandidates: [
      pathApi.resolve(
        pathApi.dirname(scriptPath),
        "../../../resources/hepan/vendor-pure",
      ),
    ],
    root,
    directory: true,
    errorCode: "HEPAN_RUNTIME_VENDOR_UNAVAILABLE",
    message: "Hepan vendor directory is unavailable",
  });
  return result.ok ? result.value.path : "";
}

function resolveHepanScriptPath(options) {
  const values = options || {};
  const io = values.fs || fs;
  const pathApi = values.path || path;
  const packaged = isPackagedContext(values);
  if (values.scriptPath && values.development === true)
    return values.scriptPath;
  const resolver = createPackagedRuntimeResolver({
    fs: io,
    path: pathApi,
    packaged,
    env: values.env,
    appRoot: values.appRoot,
    resourcesPath: values.resourcesPath || process.resourcesPath,
  });
  const root =
    packaged && typeof io.realpathSync === "function"
      ? resolver.resourcesPath
      : undefined;
  const result = resolver.tryResolve({
    name: "Hepan Python script",
    packagedCandidates: [
      pathApi.join(
        resolver.resourcesPath,
        "app.asar.unpacked",
        "src",
        "platforms",
        "hepan",
        "hepan_publish.py",
      ),
    ],
    developmentCandidates: [pathApi.join(__dirname, "hepan_publish.py")],
    root,
    errorCode: "HEPAN_RUNTIME_SCRIPT_UNAVAILABLE",
    message: "Hepan packaged script is unavailable",
  });
  if (result.ok) return result.value.path;
  const error = new Error("Hepan packaged script is unavailable");
  error.code =
    result.error && result.error.code === "PACKAGED_ASAR_PATH_REJECTED"
      ? result.error.code
      : "HEPAN_RUNTIME_SCRIPT_UNAVAILABLE";
  throw error;
}

function withHepanVendorEnvironment(options, vendorDir) {
  if (!vendorDir) return options || {};
  return Object.assign({}, options || {}, {
    env: Object.assign({}, process.env, (options && options.env) || {}, {
      PYTHONPATH: vendorDir,
      PYTHONDONTWRITEBYTECODE: "1",
    }),
  });
}

module.exports = {
  HEPAN_SITE_ORIGIN,
  resolveHepanScriptPath,
  resolveHepanVendorDir,
  withHepanVendorEnvironment,
  normalizeHepanCookie,
};
