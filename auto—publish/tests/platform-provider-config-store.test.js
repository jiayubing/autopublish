const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createPlatformProviderConfigStore } = require("../desktop/platform-provider-config-store");

function tempDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fakeSafeStorage(overrides) {
  return Object.assign({
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`cipher:${value}`, "utf8"),
    decryptString: (value) => Buffer.from(value).toString("utf8").slice("cipher:".length)
  }, overrides || {});
}

const schema = {
  apiKey: { type: "string", required: true },
  baseUrl: { type: "string", required: true },
  timeoutMs: { type: "integer", required: true, min: 1 }
};

const config = { apiKey: "fixture-secret", baseUrl: "https://media.example/api", timeoutMs: 30000 };

describe("platform provider config store", () => {
  it("encrypts secret fields and reads a versioned provider file", () => {
    const userDataPath = tempDirectory("auto-publish-provider-store-");
    try {
      const store = createPlatformProviderConfigStore({ userDataPath, fileName: "media-provider.json", schema, secretFields: ["apiKey"], safeStorage: fakeSafeStorage() });
      assert.deepStrictEqual(store.write(config), config);
      const disk = fs.readFileSync(path.join(userDataPath, "media-provider.json"), "utf8");
      assert.equal(disk.includes(config.apiKey), false);
      assert.deepStrictEqual(store.read(), config);
    } finally {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  it("validates schema before encryption and rejects unknown or partial input", () => {
    const userDataPath = tempDirectory("auto-publish-provider-store-");
    try {
      const store = createPlatformProviderConfigStore({ userDataPath, fileName: "media-provider.json", schema, secretFields: ["apiKey"], safeStorage: fakeSafeStorage() });
      assert.throws(() => store.write(Object.assign({}, config, { unknown: "nope" })), (error) => error.code === "PLATFORM_CONFIG_INVALID");
      assert.throws(() => store.write(Object.assign({}, config, { timeoutMs: 0 })), (error) => error.code === "PLATFORM_CONFIG_INVALID");
      assert.throws(() => store.write({ baseUrl: config.baseUrl, timeoutMs: config.timeoutMs }), (error) => error.code === "PLATFORM_CONFIG_INVALID");
      assert.equal(fs.existsSync(path.join(userDataPath, "media-provider.json")), false);
    } finally {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  it("fails closed for encryption, symlink and atomic-write failures", () => {
    const userDataPath = tempDirectory("auto-publish-provider-store-");
    try {
      const unavailable = createPlatformProviderConfigStore({ userDataPath, fileName: "media-provider.json", schema, secretFields: ["apiKey"], safeStorage: fakeSafeStorage({ isEncryptionAvailable: () => false }) });
      assert.throws(() => unavailable.write(config), (error) => error.code === "PLATFORM_CONFIG_ENCRYPTION_UNAVAILABLE");

      const filePath = path.join(userDataPath, "media-provider.json");
      fs.writeFileSync(filePath, "{}", "utf8");
      const symlinkFs = Object.assign({}, fs, { lstatSync: (target) => target === filePath ? { isSymbolicLink: () => true } : fs.lstatSync(target) });
      const symlinkStore = createPlatformProviderConfigStore({ userDataPath, fileName: "media-provider.json", schema, secretFields: ["apiKey"], safeStorage: fakeSafeStorage(), fs: symlinkFs });
      assert.throws(() => symlinkStore.read(), (error) => error.code === "PLATFORM_CONFIG_STORAGE_INVALID");
      fs.unlinkSync(filePath);

      const failingFs = Object.assign({}, fs, { renameSync: () => { throw new Error("rename failed"); } });
      const failingStore = createPlatformProviderConfigStore({ userDataPath, fileName: "media-provider.json", schema, secretFields: ["apiKey"], safeStorage: fakeSafeStorage(), fs: failingFs });
      assert.throws(() => failingStore.write(config), (error) => error.code === "PLATFORM_CONFIG_STORAGE_WRITE_FAILED");
      assert.equal(fs.existsSync(filePath), false);
    } finally {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  it("keeps separate provider files independently readable", () => {
    const userDataPath = tempDirectory("auto-publish-provider-store-");
    try {
      const make = (fileName) => createPlatformProviderConfigStore({ userDataPath, fileName, schema, secretFields: ["apiKey"], safeStorage: fakeSafeStorage() });
      const media = make("media-provider.json");
      const hepan = make("hepan-provider.json");
      media.write(config);
      hepan.write(Object.assign({}, config, { apiKey: "other-fixture-secret" }));
      fs.writeFileSync(media.filePath, "broken", "utf8");
      assert.throws(() => media.read(), (error) => error.code === "PLATFORM_CONFIG_STORAGE_INVALID");
      assert.equal(hepan.read().apiKey, "other-fixture-secret");
    } finally {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });
});
