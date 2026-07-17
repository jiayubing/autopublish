const fs = require("node:fs");
const path = require("node:path");

const APPLICATION_NAME = "AutoPublish";
const APPLICATION_ID = "com.autopublish.desktop";
const LEGACY_PACKAGE_NAMES = Object.freeze(["auto-publish-desktop", "AutoPublish Desktop"]);
const IMPORTABLE_FILES = Object.freeze(["workspace-location.json", "runtime-config.json", "ai-provider.json"]);
const LEGACY_RUNTIME_SECRET_KEYS = new Set(["XQW_API_KEY", "XQW_BASE_URL", "XQW_TIMEOUT_MS", "XQW_ALLOW_INSECURE", "HEPAN_COOKIE_PATH", "HEPAN_PYTHON", "HEPAN_VENDOR_DIR", "HEPAN_CATEGORY_ID"]);

function identityError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function configureApplicationIdentity(application) {
  if (!application) return;
  if (typeof application.setName === "function") application.setName(APPLICATION_NAME);
  if (typeof application.setAppUserModelId === "function") application.setAppUserModelId(APPLICATION_ID);
}

function legacyUserDataPaths(appDataPath, canonicalUserDataPath) {
  if (typeof appDataPath !== "string" || !path.isAbsolute(appDataPath)) return [];
  const canonical = path.resolve(canonicalUserDataPath || "");
  return LEGACY_PACKAGE_NAMES.map(function(name) { return path.resolve(appDataPath, name); })
    .filter(function(value) { return value !== canonical; });
}

function importLegacyApplicationConfig(options) {
  const values = options || {};
  const legacyRoot = path.resolve(values.legacyRoot || "");
  const canonicalRoot = path.resolve(values.canonicalRoot || "");
  if (!legacyRoot || !canonicalRoot || !path.isAbsolute(legacyRoot) || !path.isAbsolute(canonicalRoot)) throw identityError("APP_CONFIG_IMPORT_PATH_INVALID", "Application configuration paths are invalid");
  if (values.confirmed !== true) throw identityError("APP_CONFIG_IMPORT_CONFIRMATION_REQUIRED", "Legacy application configuration import requires explicit confirmation");
  if (fs.existsSync(canonicalRoot) && fs.readdirSync(canonicalRoot).length) throw identityError("APP_CONFIG_IMPORT_TARGET_NOT_EMPTY", "Canonical application configuration already exists");
  if (!fs.existsSync(legacyRoot)) throw identityError("APP_CONFIG_IMPORT_SOURCE_MISSING", "Legacy application configuration was not found");
  const imported = [];
  const staging = canonicalRoot + ".importing-" + process.pid + "-" + Date.now();
  try {
    fs.mkdirSync(staging, { recursive: true });
    IMPORTABLE_FILES.forEach(function(filename) {
      const source = path.join(legacyRoot, filename);
      if (!fs.existsSync(source)) return;
      const stat = fs.lstatSync(source);
      if (stat.isSymbolicLink() || !stat.isFile()) throw identityError("APP_CONFIG_IMPORT_SOURCE_INVALID", "Legacy application configuration is invalid");
      if (filename === "runtime-config.json") {
        let parsed;
        try { parsed = JSON.parse(fs.readFileSync(source, "utf8")); } catch (_) { parsed = null; }
        if (parsed && parsed.version === 1 && parsed.values && typeof parsed.values === "object" && !Array.isArray(parsed.values)) {
          const values = Object.assign({}, parsed.values);
          LEGACY_RUNTIME_SECRET_KEYS.forEach(function(key) { delete values[key]; });
          fs.writeFileSync(path.join(staging, filename), JSON.stringify({ version: 1, values: values }) + "\n", { encoding: "utf8", mode: 0o600 });
        } else {
          fs.copyFileSync(source, path.join(staging, filename));
        }
      } else {
        fs.copyFileSync(source, path.join(staging, filename));
      }
      imported.push(filename);
    });
    if (!imported.length) throw identityError("APP_CONFIG_IMPORT_SOURCE_EMPTY", "No importable legacy application configuration was found");
    fs.mkdirSync(canonicalRoot, { recursive: true });
    imported.forEach(function(filename) { fs.renameSync(path.join(staging, filename), path.join(canonicalRoot, filename)); });
    return { imported: imported, source: legacyRoot, target: canonicalRoot };
  } catch (error) {
    imported.forEach(function(filename) {
      try { if (fs.existsSync(path.join(canonicalRoot, filename))) fs.unlinkSync(path.join(canonicalRoot, filename)); } catch (_) {}
    });
    throw error;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

module.exports = { APPLICATION_NAME, APPLICATION_ID, LEGACY_PACKAGE_NAMES, IMPORTABLE_FILES, LEGACY_RUNTIME_SECRET_KEYS, configureApplicationIdentity, legacyUserDataPaths, importLegacyApplicationConfig };
