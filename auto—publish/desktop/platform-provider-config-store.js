const defaultFs = require("node:fs");
const defaultPath = require("node:path");
const crypto = require("node:crypto");
const { reportDiagnostic } = require("../src/diagnostics/diagnostic-producer");

function providerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertAbsoluteDirectory(value) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0") || !defaultPath.isAbsolute(value)) {
    throw providerError("PLATFORM_CONFIG_PATH_INVALID", "Platform provider configuration path is invalid");
  }
  return defaultPath.resolve(value);
}

function assertFileName(value) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0") || defaultPath.basename(value) !== value || !/^[-a-zA-Z0-9_.]+\.json$/.test(value)) {
    throw providerError("PLATFORM_CONFIG_PATH_INVALID", "Platform provider configuration file name is invalid");
  }
  return value;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function typeMatches(value, definition) {
  if (!definition || !definition.type) return true;
  if (definition.type === "string") return typeof value === "string";
  if (definition.type === "integer") return Number.isInteger(value);
  if (definition.type === "number") return typeof value === "number" && Number.isFinite(value);
  if (definition.type === "boolean") return typeof value === "boolean";
  return false;
}

function validateSchemaInput(input, schema) {
  if (!isObject(input)) throw providerError("PLATFORM_CONFIG_INVALID", "Platform provider configuration is invalid");
  const allowed = new Set(Object.keys(schema));
  if (Object.keys(input).some((key) => !allowed.has(key))) throw providerError("PLATFORM_CONFIG_INVALID", "Platform provider configuration is invalid");
  const normalized = {};
  Object.keys(schema).forEach((key) => {
    const definition = schema[key] || {};
    let value = input[key];
    if (value === undefined) {
      if (Object.prototype.hasOwnProperty.call(definition, "default")) value = typeof definition.default === "function" ? definition.default() : definition.default;
      else if (definition.required) throw providerError("PLATFORM_CONFIG_INVALID", "Platform provider configuration is invalid");
      else return;
    }
    if (!typeMatches(value, definition)) throw providerError("PLATFORM_CONFIG_INVALID", "Platform provider configuration is invalid");
    if (definition.type === "string" && definition.nonEmpty && !value.trim()) throw providerError("PLATFORM_CONFIG_INVALID", "Platform provider configuration is invalid");
    if (definition.min !== undefined && value < definition.min) throw providerError("PLATFORM_CONFIG_INVALID", "Platform provider configuration is invalid");
    if (definition.max !== undefined && value > definition.max) throw providerError("PLATFORM_CONFIG_INVALID", "Platform provider configuration is invalid");
    if (typeof definition.validate === "function") {
      try {
        const result = definition.validate(value, normalized);
        if (result === false) throw new Error("invalid");
        if (result !== undefined && result !== true) value = result;
      } catch (_) {
        throw providerError("PLATFORM_CONFIG_INVALID", "Platform provider configuration is invalid");
      }
    }
    normalized[key] = value;
  });
  return normalized;
}

function createPlatformProviderConfigStore(options) {
  const values = options || {};
  const io = values.fs || defaultFs;
  const path = values.path || defaultPath;
  const userDataPath = assertAbsoluteDirectory(values.userDataPath || values.configRoot);
  const fileName = assertFileName(values.fileName);
  const filePath = path.join(userDataPath, fileName);
  const schema = isObject(values.schema) ? values.schema : {};
  const secretFields = Array.isArray(values.secretFields) ? Array.from(new Set(values.secretFields)) : [];
  if (secretFields.some((field) => !Object.prototype.hasOwnProperty.call(schema, field))) {
    throw providerError("PLATFORM_CONFIG_INVALID", "Platform provider secret schema is invalid");
  }

  function ensureEncryption() {
    if (!values.safeStorage || typeof values.safeStorage.isEncryptionAvailable !== "function" || !values.safeStorage.isEncryptionAvailable()) {
      throw providerError("PLATFORM_CONFIG_ENCRYPTION_UNAVAILABLE", "Platform provider encryption is unavailable");
    }
  }

  function assertSafeRoot() {
    try {
      const stat = io.lstatSync(userDataPath);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw providerError("PLATFORM_CONFIG_STORAGE_INVALID", "Platform provider configuration storage is invalid");
    } catch (error) {
      if (error && error.code === "ENOENT") return null;
      if (error && error.code && error.code.startsWith("PLATFORM_CONFIG_")) throw error;
      throw providerError("PLATFORM_CONFIG_STORAGE_INVALID", "Platform provider configuration storage is invalid");
    }
    return true;
  }

  function assertSafeFile() {
    try {
      const stat = io.lstatSync(filePath);
      if (stat.isSymbolicLink() || !stat.isFile()) throw providerError("PLATFORM_CONFIG_STORAGE_INVALID", "Platform provider configuration file is invalid");
      return stat;
    } catch (error) {
      if (error && error.code === "ENOENT") return null;
      if (error && error.code && error.code.startsWith("PLATFORM_CONFIG_")) throw error;
      throw providerError("PLATFORM_CONFIG_STORAGE_INVALID", "Platform provider configuration file is invalid");
    }
  }

  function decryptSecrets(disk) {
    ensureEncryption();
    const result = {};
    secretFields.forEach((field) => {
      if (!disk.secrets || typeof disk.secrets[field] !== "string" || !disk.secrets[field]) throw providerError("PLATFORM_CONFIG_STORAGE_INVALID", "Platform provider configuration file is invalid");
      try {
        result[field] = values.safeStorage.decryptString(Buffer.from(disk.secrets[field], "base64"));
      } catch (_) {
        throw providerError("PLATFORM_CONFIG_STORAGE_INVALID", "Platform provider configuration file is invalid");
      }
    });
    return result;
  }

  function read() {
    if (!assertSafeFile()) return null;
    let disk;
    try { disk = JSON.parse(io.readFileSync(filePath, "utf8")); } catch (_) { throw providerError("PLATFORM_CONFIG_STORAGE_INVALID", "Platform provider configuration file is invalid"); }
    if (!isObject(disk) || disk.version !== 1 || !isObject(disk.values) || !isObject(disk.secrets)) throw providerError("PLATFORM_CONFIG_STORAGE_INVALID", "Platform provider configuration file is invalid");
    const decoded = Object.assign({}, disk.values, decryptSecrets(disk));
    try { return validateSchemaInput(decoded, schema); } catch (_) { throw providerError("PLATFORM_CONFIG_STORAGE_INVALID", "Platform provider configuration file is invalid"); }
  }

  function write(input) {
    const config = validateSchemaInput(input, schema);
    ensureEncryption();
    assertSafeFile();
    try {
      if (assertSafeRoot() === null) io.mkdirSync(userDataPath, { recursive: true });
      assertSafeRoot();
      const encrypted = {};
      const plain = {};
      secretFields.forEach((field) => {
        try {
          const encoded = values.safeStorage.encryptString(config[field]);
          if (!Buffer.isBuffer(encoded)) throw new Error("invalid encrypted value");
          encrypted[field] = encoded.toString("base64");
        } catch (_) {
          throw providerError("PLATFORM_CONFIG_ENCRYPTION_UNAVAILABLE", "Platform provider encryption is unavailable");
        }
      });
      Object.keys(config).forEach((key) => { if (!secretFields.includes(key)) plain[key] = config[key]; });
      const temporaryPath = path.join(userDataPath, `.${fileName}.${crypto.randomUUID()}.tmp`);
      try {
        io.writeFileSync(temporaryPath, JSON.stringify({ version: 1, values: plain, secrets: encrypted, updatedAt: new Date().toISOString() }) + "\n", { encoding: "utf8", mode: 0o600 });
        io.renameSync(temporaryPath, filePath);
      } finally {
        try {
          if (io.existsSync(temporaryPath)) io.unlinkSync(temporaryPath);
        } catch (_) {
          reportDiagnostic({
            code: "PLATFORM_CONFIG_TEMP_CLEANUP_FAILED",
            module: "platform-provider-config-store",
            category: "storage",
            metadata: { operation: "write", phase: "cleanup", action: "unlink" },
          });
        }
      }
      return config;
    } catch (error) {
      if (error && error.code && error.code.startsWith("PLATFORM_CONFIG_")) throw error;
      throw providerError("PLATFORM_CONFIG_STORAGE_WRITE_FAILED", "Platform provider configuration could not be saved");
    }
  }

  function clear() {
    const stat = assertSafeFile();
    if (!stat) return { cleared: false };
    try { io.unlinkSync(filePath); return { cleared: true }; } catch (_) { throw providerError("PLATFORM_CONFIG_STORAGE_WRITE_FAILED", "Platform provider configuration could not be cleared"); }
  }

  return { read, write, clear, filePath };
}

module.exports = { createPlatformProviderConfigStore };
