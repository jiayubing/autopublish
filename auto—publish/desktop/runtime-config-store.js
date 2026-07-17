const defaultFs = require("node:fs");
const defaultPath = require("node:path");
const crypto = require("node:crypto");

const FILE_NAME = "runtime-config.json";
const SUPPORTED_RUNTIME_CONFIG_KEYS = Object.freeze([
  "XQW_API_KEY",
  "XQW_BASE_URL",
  "PLAYWRIGHT_CLI_JS",
  "BROWSER_CHANNEL",
  "HEPAN_COOKIE_PATH",
  "HEPAN_VENDOR_DIR",
  "HEPAN_PYTHON",
  "AUTO_PUBLISH_NODE_EXEC_PATH"
]);

function configError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertDirectory(value) {
  if (typeof value !== "string" || value.trim() === "" || !defaultPath.isAbsolute(value) || value.includes("\0")) {
    throw configError("RUNTIME_CONFIG_PATH_INVALID", "Runtime configuration path is invalid");
  }
  return defaultPath.resolve(value);
}

function normalizeRuntimeConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw configError("RUNTIME_CONFIG_INVALID", "Runtime configuration is invalid");
  }
  const result = {};
  SUPPORTED_RUNTIME_CONFIG_KEYS.forEach(function(key) {
    if (input[key] === undefined || input[key] === null || input[key] === "") return;
    if (typeof input[key] !== "string" || input[key].includes("\0")) {
      throw configError("RUNTIME_CONFIG_INVALID", "Runtime configuration is invalid");
    }
    result[key] = input[key];
  });
  return result;
}

function createRuntimeConfigStore(options) {
  const values = options || {};
  const io = values.fs || defaultFs;
  const path = values.path || defaultPath;
  const configRoot = assertDirectory(values.configRoot || values.roamingConfig || values.userDataPath);
  const filePath = path.join(configRoot, FILE_NAME);

  function assertSafeFile() {
    try {
      const stat = io.lstatSync(filePath);
      if (stat.isSymbolicLink() || !stat.isFile()) throw configError("RUNTIME_CONFIG_STORAGE_INVALID", "Runtime configuration file is invalid");
      return stat;
    } catch (error) {
      if (error && error.code === "ENOENT") return null;
      if (error && error.code && error.code.startsWith("RUNTIME_CONFIG_")) throw error;
      throw configError("RUNTIME_CONFIG_STORAGE_INVALID", "Runtime configuration file is invalid");
    }
  }

  function read() {
    if (!assertSafeFile()) return {};
    let parsed;
    try { parsed = JSON.parse(io.readFileSync(filePath, "utf8")); } catch (_) {
      throw configError("RUNTIME_CONFIG_STORAGE_INVALID", "Runtime configuration file is invalid");
    }
    if (!parsed || parsed.version !== 1 || !parsed.values || typeof parsed.values !== "object" || Array.isArray(parsed.values)) {
      throw configError("RUNTIME_CONFIG_STORAGE_INVALID", "Runtime configuration file is invalid");
    }
    return normalizeRuntimeConfig(parsed.values);
  }

  function write(input) {
    const normalized = normalizeRuntimeConfig(input);
    try {
      assertSafeFile();
      io.mkdirSync(configRoot, { recursive: true });
      const directoryStat = io.lstatSync(configRoot);
      if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) throw new Error("config root is invalid");
      const temporaryPath = path.join(configRoot, "." + FILE_NAME + "." + crypto.randomUUID() + ".tmp");
      try {
        io.writeFileSync(temporaryPath, JSON.stringify({ version: 1, values: normalized }) + "\n", { encoding: "utf8", mode: 0o600 });
        io.renameSync(temporaryPath, filePath);
      } finally {
        try { if (io.existsSync(temporaryPath)) io.unlinkSync(temporaryPath); } catch (_) {}
      }
      return normalized;
    } catch (error) {
      if (error && error.code && error.code.startsWith("RUNTIME_CONFIG_")) throw error;
      throw configError("RUNTIME_CONFIG_STORAGE_WRITE_FAILED", "Runtime configuration could not be saved");
    }
  }

  function clear() {
    const stat = assertSafeFile();
    if (!stat) return { cleared: false };
    try { io.unlinkSync(filePath); return { cleared: true }; } catch (_) {
      throw configError("RUNTIME_CONFIG_STORAGE_WRITE_FAILED", "Runtime configuration could not be cleared");
    }
  }

  return { read, write, clear, filePath };
}

module.exports = {
  FILE_NAME,
  SUPPORTED_RUNTIME_CONFIG_KEYS,
  normalizeRuntimeConfig,
  createRuntimeConfigStore
};
