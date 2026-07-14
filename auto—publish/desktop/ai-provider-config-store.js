const defaultFs = require("node:fs");
const defaultPath = require("node:path");
const crypto = require("node:crypto");

const FILE_NAME = "ai-provider.json";

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertUserDataPath(userDataPath) {
  if (typeof userDataPath !== "string" || !userDataPath.trim() || !defaultPath.isAbsolute(userDataPath)) {
    throw storeError("AI_CONFIG_USER_DATA_INVALID", "AI provider userData path is invalid");
  }
  return defaultPath.resolve(userDataPath);
}

function createAiProviderConfigStore(options) {
  const values = options || {};
  const io = values.fs || defaultFs;
  const path = values.path || defaultPath;
  const userDataPath = assertUserDataPath(values.userDataPath);
  const filePath = path.join(userDataPath, FILE_NAME);
  const safeStorage = values.safeStorage;

  function ensureEncryption() {
    if (!safeStorage || typeof safeStorage.isEncryptionAvailable !== "function" || !safeStorage.isEncryptionAvailable()) {
      throw storeError("AI_CONFIG_ENCRYPTION_UNAVAILABLE", "AI provider encryption is unavailable");
    }
  }

  function assertSafePath(target) {
    try {
      const stat = io.lstatSync(target);
      if (stat.isSymbolicLink()) throw storeError("AI_CONFIG_STORAGE_INVALID", "AI provider configuration file is invalid");
      return stat;
    } catch (error) {
      if (error && error.code === "ENOENT") return null;
      if (error && error.code && error.code.startsWith("AI_CONFIG_")) throw error;
      throw storeError("AI_CONFIG_STORAGE_INVALID", "AI provider configuration file is invalid");
    }
  }

  function readDisk() {
    const stat = assertSafePath(filePath);
    if (!stat) return null;
    let parsed;
    try {
      parsed = JSON.parse(io.readFileSync(filePath, "utf8"));
    } catch (_) {
      throw storeError("AI_CONFIG_STORAGE_INVALID", "AI provider configuration file is invalid");
    }
    if (!parsed || parsed.version !== 1 || typeof parsed.baseUrl !== "string" ||
        typeof parsed.encryptedApiKey !== "string" || !parsed.encryptedApiKey ||
        typeof parsed.model !== "string" || !Number.isFinite(Number(parsed.timeoutMs)) ||
        Number(parsed.timeoutMs) <= 0 || (parsed.lastTest !== null && typeof parsed.lastTest !== "object")) {
      throw storeError("AI_CONFIG_STORAGE_INVALID", "AI provider configuration file is invalid");
    }
    return parsed;
  }

  function decrypt(parsed) {
    ensureEncryption();
    try {
      const apiKey = safeStorage.decryptString(Buffer.from(parsed.encryptedApiKey, "base64"));
      if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("empty key");
      return {
        baseUrl: parsed.baseUrl,
        apiKey: apiKey,
        model: parsed.model,
        timeoutMs: Number(parsed.timeoutMs),
        lastTest: parsed.lastTest || null
      };
    } catch (_) {
      throw storeError("AI_CONFIG_STORAGE_INVALID", "AI provider configuration file is invalid");
    }
  }

  function read() {
    const parsed = readDisk();
    return parsed ? decrypt(parsed) : null;
  }

  function write(input) {
    ensureEncryption();
    const config = input || {};
    if (typeof config.apiKey !== "string" || !config.apiKey.trim()) {
      throw storeError("AI_CONFIG_INVALID", "AI provider configuration is invalid");
    }
    assertSafePath(filePath);
    try {
      io.mkdirSync(userDataPath, { recursive: true });
      const directoryStat = io.lstatSync(userDataPath);
      if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) throw new Error("userData is invalid");
      const encrypted = safeStorage.encryptString(config.apiKey);
      if (!Buffer.isBuffer(encrypted)) throw new Error("encrypted value is invalid");
      const disk = {
        version: 1,
        baseUrl: config.baseUrl,
        encryptedApiKey: encrypted.toString("base64"),
        model: config.model,
        timeoutMs: Number(config.timeoutMs),
        updatedAt: new Date().toISOString(),
        lastTest: config.lastTest === undefined ? null : config.lastTest
      };
      const temporaryPath = path.join(userDataPath, "." + FILE_NAME + "." + crypto.randomUUID() + ".tmp");
      try {
        io.writeFileSync(temporaryPath, JSON.stringify(disk), { encoding: "utf8", mode: 0o600 });
        io.renameSync(temporaryPath, filePath);
      } finally {
        try { if (io.existsSync(temporaryPath)) io.unlinkSync(temporaryPath); } catch (_) {}
      }
      return decrypt(disk);
    } catch (error) {
      if (error && error.code && error.code.startsWith("AI_CONFIG_")) throw error;
      throw storeError("AI_CONFIG_STORAGE_WRITE_FAILED", "AI provider configuration could not be saved");
    }
  }

  function clear() {
    const stat = assertSafePath(filePath);
    if (!stat) return { cleared: false };
    try {
      io.unlinkSync(filePath);
      return { cleared: true };
    } catch (_) {
      throw storeError("AI_CONFIG_STORAGE_WRITE_FAILED", "AI provider configuration could not be cleared");
    }
  }

  function getFingerprint() {
    const parsed = readDisk();
    if (!parsed) return null;
    return crypto.createHash("sha256").update(JSON.stringify({
      baseUrl: parsed.baseUrl, model: parsed.model, timeoutMs: Number(parsed.timeoutMs), encryptedApiKey: parsed.encryptedApiKey
    }), "utf8").digest("hex");
  }

  return { read: read, write: write, clear: clear, getFingerprint: getFingerprint, filePath: filePath };
}

module.exports = { createAiProviderConfigStore };
