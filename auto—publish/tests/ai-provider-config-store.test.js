const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createAiProviderConfigStore } = require("../desktop/ai-provider-config-store");
const { createAiProviderTestStatusStore } = require("../desktop/ai-provider-test-status-store");

function createTempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-ai-store-"));
}

function fakeSafeStorage(overrides) {
  return Object.assign({
    isEncryptionAvailable: function() { return true; },
    encryptString: function(value) { return Buffer.from("cipher:" + value, "utf8"); },
    decryptString: function(value) { return Buffer.from(value).toString("utf8").slice("cipher:".length); }
  }, overrides || {});
}

const config = {
  baseUrl: "https://provider.example/v1",
  apiKey: "store-secret-key",
  model: "model-a",
  timeoutMs: 60000
};

describe("AI provider config store", function() {
  it("encrypts the API key in application userData and reads it back", function() {
    const userDataPath = createTempDirectory();
    try {
      const store = createAiProviderConfigStore({ userDataPath: userDataPath, safeStorage: fakeSafeStorage() });
      assert.deepStrictEqual(store.write(config), {
        baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model, timeoutMs: config.timeoutMs
      });
      const disk = fs.readFileSync(path.join(userDataPath, "ai-provider.json"), "utf8");
      assert.equal(disk.includes(config.apiKey), false);
      assert.deepStrictEqual(store.read(), {
        baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model, timeoutMs: config.timeoutMs
      });
    } finally {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  it("fails closed when safeStorage is unavailable", function() {
    const userDataPath = createTempDirectory();
    try {
      const store = createAiProviderConfigStore({
        userDataPath: userDataPath,
        safeStorage: fakeSafeStorage({ isEncryptionAvailable: function() { return false; } })
      });
      assert.throws(function() { store.write(config); }, function(error) { return error.code === "AI_CONFIG_ENCRYPTION_UNAVAILABLE"; });
      assert.equal(fs.existsSync(path.join(userDataPath, "ai-provider.json")), false);
    } finally {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  it("rejects corrupt, symlinked, and non-atomic configuration files", function() {
    const userDataPath = createTempDirectory();
    const otherPath = createTempDirectory();
    try {
      const store = createAiProviderConfigStore({ userDataPath: userDataPath, safeStorage: fakeSafeStorage() });
      fs.writeFileSync(path.join(userDataPath, "ai-provider.json"), "not-json", "utf8");
      assert.throws(function() { store.read(); }, function(error) { return error.code === "AI_CONFIG_STORAGE_INVALID"; });

      fs.rmSync(path.join(userDataPath, "ai-provider.json"));
      fs.writeFileSync(path.join(otherPath, "secret.json"), "{}", "utf8");
      const symlinkPath = path.join(userDataPath, "ai-provider.json");
      const symlinkFs = Object.assign({}, fs, {
        lstatSync: function(target) {
          if (target === symlinkPath) return { isSymbolicLink: function() { return true; } };
          return fs.lstatSync(target);
        }
      });
      const symlinkStore = createAiProviderConfigStore({ userDataPath: userDataPath, safeStorage: fakeSafeStorage(), fs: symlinkFs });
      assert.throws(function() { symlinkStore.clear(); }, function(error) { return error.code === "AI_CONFIG_STORAGE_INVALID"; });

      if (fs.existsSync(path.join(userDataPath, "ai-provider.json"))) fs.unlinkSync(path.join(userDataPath, "ai-provider.json"));
      const failingFs = Object.assign({}, fs, { renameSync: function() { throw new Error("rename failed"); } });
      const failingStore = createAiProviderConfigStore({ userDataPath: userDataPath, safeStorage: fakeSafeStorage(), fs: failingFs });
      assert.throws(function() { failingStore.write(config); }, function(error) { return error.code === "AI_CONFIG_STORAGE_WRITE_FAILED"; });
      assert.equal(fs.existsSync(path.join(userDataPath, "ai-provider.json")), false);
    } finally {
      fs.rmSync(userDataPath, { recursive: true, force: true });
      fs.rmSync(otherPath, { recursive: true, force: true });
    }
  });

  it("clears an absent configuration idempotently", function() {
    const userDataPath = createTempDirectory();
    try {
      const store = createAiProviderConfigStore({ userDataPath: userDataPath, safeStorage: fakeSafeStorage() });
      assert.deepStrictEqual(store.clear(), { cleared: false });
      assert.deepStrictEqual(store.clear(), { cleared: false });
    } finally {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  it("stores only a no-secret connection result outside formal provider configuration", function() {
    const userDataPath = createTempDirectory();
    try {
      const store = createAiProviderTestStatusStore({ userDataPath: userDataPath });
      const result = { testedAt: "2026-07-15T01:00:00.000Z", ok: true, code: "AI_CONNECTION_OK" };
      assert.deepStrictEqual(store.write(result), result);
      assert.deepStrictEqual(store.read(), result);
      assert.deepStrictEqual(JSON.parse(fs.readFileSync(store.filePath, "utf8")), result);
      assert.equal(fs.existsSync(path.join(userDataPath, "ai-provider.json")), false);
      assert.throws(function() {
        store.write({ testedAt: result.testedAt, ok: true, code: "AI_CONNECTION_OK", apiKey: "secret" });
      }, function(error) { return error.code === "AI_TEST_STATUS_INVALID"; });
      assert.deepStrictEqual(store.clear(), { cleared: true });
      assert.deepStrictEqual(store.clear(), { cleared: false });
    } finally {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });
});
