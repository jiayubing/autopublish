const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEVICE_IDENTITY_VERSION = 1;

function deviceIdentityError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isValidIdentity(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    value.version === DEVICE_IDENTITY_VERSION &&
    typeof value.deviceId === "string" && /^[0-9a-f-]{36}$/i.test(value.deviceId) &&
    typeof value.createdAt === "string" && !Number.isNaN(Date.parse(value.createdAt));
}

function createDeviceIdentityStore(options) {
  const opts = options || {};
  const userDataPath = opts.userDataPath;
  if (typeof userDataPath !== "string" || !userDataPath.trim()) {
    throw deviceIdentityError("AUTH_DEVICE_ID_UNAVAILABLE", "设备身份存储位置不可用");
  }
  const fsApi = opts.fs || fs;
  const randomUUID = opts.randomUUID || crypto.randomUUID;
  const now = opts.now || (() => Date.now());
  const filePath = opts.filePath || path.join(userDataPath, "device-identity.json");

  function read() {
    if (!fsApi.existsSync(filePath)) return null;
    let record;
    try {
      record = JSON.parse(fsApi.readFileSync(filePath, "utf8"));
    } catch (_) {
      throw deviceIdentityError("AUTH_DEVICE_ID_CORRUPTED", "本机设备身份文件损坏，请确认后重新生成设备身份");
    }
    if (!isValidIdentity(record)) {
      throw deviceIdentityError("AUTH_DEVICE_ID_CORRUPTED", "本机设备身份文件无效，请确认后重新生成设备身份");
    }
    return record;
  }

  function create() {
    const record = { version: DEVICE_IDENTITY_VERSION, deviceId: randomUUID(), createdAt: new Date(now()).toISOString() };
    if (!isValidIdentity(record)) throw deviceIdentityError("AUTH_DEVICE_ID_UNAVAILABLE", "无法创建本机设备身份");
    fsApi.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
      fsApi.writeFileSync(temporary, `${JSON.stringify(record)}\n`, { mode: 0o600 });
      fsApi.renameSync(temporary, filePath);
    } catch (error) {
      try { fsApi.rmSync(temporary, { force: true }); } catch (_) {}
      throw deviceIdentityError("AUTH_DEVICE_ID_UNAVAILABLE", "无法保存本机设备身份");
    }
    return record;
  }

  function getIdentity() {
    return read() || create();
  }

  return {
    filePath,
    getIdentity,
    getDeviceId: () => getIdentity().deviceId,
  };
}

module.exports = { createDeviceIdentityStore, DEVICE_IDENTITY_VERSION };
