const defaultFs = require("node:fs");
const defaultPath = require("node:path");
const crypto = require("node:crypto");
const { reportDiagnostic } = require("../src/diagnostics/diagnostic-producer");

const FILE_NAME = "runtime-config.json";
const SUPPORTED_RUNTIME_CONFIG_KEYS = Object.freeze([
  "PLAYWRIGHT_CLI_JS",
  "BROWSER_CHANNEL",
  "AUTO_PUBLISH_NODE_EXEC_PATH",
  "LIEJU_SUBMISSION_MODE",
]);
const LEGACY_RUNTIME_CONFIG_KEYS = Object.freeze([
  "XQW_API_KEY",
  "XQW_BASE_URL",
  "XQW_TIMEOUT_MS",
  "XQW_ALLOW_INSECURE",
  "HEPAN_COOKIE_PATH",
  "HEPAN_PYTHON",
  "HEPAN_VENDOR_DIR",
  "HEPAN_CATEGORY_ID",
]);

function configError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertDirectory(value) {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    !defaultPath.isAbsolute(value) ||
    value.includes("\0")
  ) {
    throw configError(
      "RUNTIME_CONFIG_PATH_INVALID",
      "Runtime configuration path is invalid",
    );
  }
  return defaultPath.resolve(value);
}

function normalizeRuntimeConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw configError(
      "RUNTIME_CONFIG_INVALID",
      "Runtime configuration is invalid",
    );
  }
  const result = {};
  SUPPORTED_RUNTIME_CONFIG_KEYS.forEach(function (key) {
    if (input[key] === undefined || input[key] === null || input[key] === "")
      return;
    if (typeof input[key] !== "string" || input[key].includes("\0")) {
      throw configError(
        "RUNTIME_CONFIG_INVALID",
        "Runtime configuration is invalid",
      );
    }
    if (
      key === "LIEJU_SUBMISSION_MODE" &&
      !["auto", "playwright_only"].includes(input[key])
    ) {
      throw configError(
        "RUNTIME_CONFIG_INVALID",
        "Runtime configuration is invalid",
      );
    }
    result[key] = input[key];
  });
  return result;
}

function normalizeLegacyRuntimeConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw configError(
      "RUNTIME_CONFIG_INVALID",
      "Runtime configuration is invalid",
    );
  }
  const result = {};
  LEGACY_RUNTIME_CONFIG_KEYS.forEach(function (key) {
    if (input[key] === undefined || input[key] === null || input[key] === "")
      return;
    if (typeof input[key] !== "string" || input[key].includes("\0")) {
      throw configError(
        "RUNTIME_CONFIG_INVALID",
        "Runtime configuration is invalid",
      );
    }
    result[key] = input[key];
  });
  return result;
}

function createRuntimeConfigStore(options) {
  const values = options || {};
  const io = values.fs || defaultFs;
  const path = values.path || defaultPath;
  const configRoot = assertDirectory(
    values.configRoot || values.roamingConfig || values.userDataPath,
  );
  const filePath = path.join(configRoot, FILE_NAME);

  function assertSafeFile() {
    try {
      const stat = io.lstatSync(filePath);
      if (stat.isSymbolicLink() || !stat.isFile())
        throw configError(
          "RUNTIME_CONFIG_STORAGE_INVALID",
          "Runtime configuration file is invalid",
        );
      return stat;
    } catch (error) {
      if (error && error.code === "ENOENT") return null;
      if (error && error.code && error.code.startsWith("RUNTIME_CONFIG_"))
        throw error;
      throw configError(
        "RUNTIME_CONFIG_STORAGE_INVALID",
        "Runtime configuration file is invalid",
      );
    }
  }

  function read() {
    if (!assertSafeFile()) return {};
    let parsed;
    try {
      parsed = JSON.parse(io.readFileSync(filePath, "utf8"));
    } catch (_) {
      throw configError(
        "RUNTIME_CONFIG_STORAGE_INVALID",
        "Runtime configuration file is invalid",
      );
    }
    if (
      !parsed ||
      parsed.version !== 1 ||
      !parsed.values ||
      typeof parsed.values !== "object" ||
      Array.isArray(parsed.values)
    ) {
      throw configError(
        "RUNTIME_CONFIG_STORAGE_INVALID",
        "Runtime configuration file is invalid",
      );
    }
    return normalizeRuntimeConfig(parsed.values);
  }

  function readLegacy() {
    if (!assertSafeFile()) return {};
    let parsed;
    try {
      parsed = JSON.parse(io.readFileSync(filePath, "utf8"));
    } catch (_) {
      throw configError(
        "RUNTIME_CONFIG_STORAGE_INVALID",
        "Runtime configuration file is invalid",
      );
    }
    if (
      !parsed ||
      parsed.version !== 1 ||
      !parsed.values ||
      typeof parsed.values !== "object" ||
      Array.isArray(parsed.values)
    ) {
      throw configError(
        "RUNTIME_CONFIG_STORAGE_INVALID",
        "Runtime configuration file is invalid",
      );
    }
    return Object.assign(
      {},
      normalizeRuntimeConfig(parsed.values),
      normalizeLegacyRuntimeConfig(parsed.values),
    );
  }

  function removeKeys(keys) {
    const remove = new Set(Array.isArray(keys) ? keys : []);
    if (!remove.size || !assertSafeFile()) return { changed: false };
    let parsed;
    try {
      parsed = JSON.parse(io.readFileSync(filePath, "utf8"));
    } catch (_) {
      throw configError(
        "RUNTIME_CONFIG_STORAGE_INVALID",
        "Runtime configuration file is invalid",
      );
    }
    if (
      !parsed ||
      parsed.version !== 1 ||
      !parsed.values ||
      typeof parsed.values !== "object" ||
      Array.isArray(parsed.values)
    ) {
      throw configError(
        "RUNTIME_CONFIG_STORAGE_INVALID",
        "Runtime configuration file is invalid",
      );
    }
    const values = Object.assign({}, parsed.values);
    let changed = false;
    remove.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        delete values[key];
        changed = true;
      }
    });
    if (!changed) return { changed: false };
    try {
      const temporaryPath = path.join(
        configRoot,
        "." + FILE_NAME + "." + crypto.randomUUID() + ".tmp",
      );
      try {
        io.writeFileSync(
          temporaryPath,
          JSON.stringify({
            version: 1,
            values: normalizeRuntimeConfig(values),
          }) + "\n",
          { encoding: "utf8", mode: 0o600 },
        );
        io.renameSync(temporaryPath, filePath);
      } finally {
        try {
          if (io.existsSync(temporaryPath)) io.unlinkSync(temporaryPath);
        } catch (_) {
          reportDiagnostic({
            code: "RUNTIME_CONFIG_TEMP_CLEANUP_FAILED",
            module: "runtime-config-store",
            category: "storage",
            metadata: {
              operation: "remove-keys",
              phase: "cleanup",
              action: "unlink",
            },
          });
        }
      }
    } catch (error) {
      if (error && error.code && error.code.startsWith("RUNTIME_CONFIG_"))
        throw error;
      throw configError(
        "RUNTIME_CONFIG_STORAGE_WRITE_FAILED",
        "Runtime configuration could not be saved",
      );
    }
    return { changed: true };
  }

  function write(input) {
    const normalized = normalizeRuntimeConfig(input);
    try {
      assertSafeFile();
      io.mkdirSync(configRoot, { recursive: true });
      const directoryStat = io.lstatSync(configRoot);
      if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory())
        throw new Error("config root is invalid");
      const temporaryPath = path.join(
        configRoot,
        "." + FILE_NAME + "." + crypto.randomUUID() + ".tmp",
      );
      try {
        io.writeFileSync(
          temporaryPath,
          JSON.stringify({ version: 1, values: normalized }) + "\n",
          { encoding: "utf8", mode: 0o600 },
        );
        io.renameSync(temporaryPath, filePath);
      } finally {
        try {
          if (io.existsSync(temporaryPath)) io.unlinkSync(temporaryPath);
        } catch (_) {
          reportDiagnostic({
            code: "RUNTIME_CONFIG_TEMP_CLEANUP_FAILED",
            module: "runtime-config-store",
            category: "storage",
            metadata: {
              operation: "write",
              phase: "cleanup",
              action: "unlink",
            },
          });
        }
      }
      return normalized;
    } catch (error) {
      if (error && error.code && error.code.startsWith("RUNTIME_CONFIG_"))
        throw error;
      throw configError(
        "RUNTIME_CONFIG_STORAGE_WRITE_FAILED",
        "Runtime configuration could not be saved",
      );
    }
  }

  function clear() {
    const stat = assertSafeFile();
    if (!stat) return { cleared: false };
    try {
      io.unlinkSync(filePath);
      return { cleared: true };
    } catch (_) {
      throw configError(
        "RUNTIME_CONFIG_STORAGE_WRITE_FAILED",
        "Runtime configuration could not be cleared",
      );
    }
  }

  return { read, readLegacy, removeKeys, write, clear, filePath };
}

module.exports = {
  FILE_NAME,
  SUPPORTED_RUNTIME_CONFIG_KEYS,
  LEGACY_RUNTIME_CONFIG_KEYS,
  normalizeRuntimeConfig,
  normalizeLegacyRuntimeConfig,
  createRuntimeConfigStore,
};
