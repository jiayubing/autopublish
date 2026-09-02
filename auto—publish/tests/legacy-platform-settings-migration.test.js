const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const { createRuntimeConfigStore } = require("../desktop/runtime-config-store");
const { createLegacyProviderSettingsMigration } = require("../desktop/runtime-config");
const { createPlatformSettingsService } = require("../desktop/services/platform-settings-service");
const { createMediaSettingsAdapter } = require("../desktop/services/platform-settings/media-settings-adapter");

function fakeSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
    decryptString: (value) => String(value).replace(/^encrypted:/, ""),
  };
}

function makeFixture(env = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autopublish-legacy-settings-"));
  const configRoot = path.join(root, "config");
  const workspaceRoot = path.join(root, "workspace");
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(configRoot, { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, ".env"),
    "XQW_API_KEY=workspace-media-key\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(configRoot, "runtime-config.json"),
    JSON.stringify({
      version: 1,
      values: {
        XQW_API_KEY: "application-media-key",
        XQW_BASE_URL: "https://legacy.example/api",
      },
    }) + "\n",
    "utf8",
  );
  const runtimeConfigStore = createRuntimeConfigStore({ configRoot });
  const service = createPlatformSettingsService({
    userDataPath: configRoot,
    safeStorage: fakeSafeStorage(),
    env,
    adapters: [createMediaSettingsAdapter()],
  });
  const migration = createLegacyProviderSettingsMigration({
    configRoot,
    workspaceRoot,
    runtimeConfigStore,
    platformSettingsService: service,
    clock: () => "2026-09-02T00:00:00.000Z",
  });
  return { root, configRoot, runtimeConfigStore, service, migration };
}

describe("legacy provider settings migration", () => {
  it("discovers only legacy media configuration", async () => {
    const fixture = makeFixture();
    try {
      const report = fixture.migration.discover();
      assert.equal(report.importable, true);
      assert.deepEqual(report.media.sources, [
        "application-runtime-config",
        "workspace-env",
      ]);
      assert.equal(Object.hasOwn(report, "hepan"), false);
      assert.equal(JSON.stringify(report).includes("application-media-key"), false);
      await assert.rejects(
        fixture.migration.importLegacy({ confirmed: false }),
        (error) =>
          error.code === "PLATFORM_CONFIG_MIGRATION_CONFIRMATION_REQUIRED",
      );
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("imports media credentials once and removes the retired runtime key", async () => {
    const fixture = makeFixture();
    try {
      const first = await fixture.migration.importLegacy({ confirmed: true });
      assert.deepEqual(first.imported, ["media"]);
      assert.equal(Object.hasOwn(first, "legacyCookieFilesRemain"), false);
      const disk = fs.readFileSync(
        path.join(fixture.configRoot, "media-provider.json"),
        "utf8",
      );
      assert.equal(disk.includes("application-media-key"), false);
      assert.equal(fixture.runtimeConfigStore.readLegacy().XQW_API_KEY, undefined);

      const second = await fixture.migration.importLegacy({ confirmed: true });
      assert.deepEqual(second.imported, []);
      assert.equal(
        second.entries.find((entry) => entry.platform === "media").status,
        "skipped-existing",
      );
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("does not persist an environment-controlled media configuration", async () => {
    const fixture = makeFixture({
      XQW_API_KEY: "environment-key",
      XQW_BASE_URL: "https://environment.example/api",
    });
    try {
      const result = await fixture.migration.importLegacy({ confirmed: true });
      assert.deepEqual(result.imported, []);
      assert.equal(
        result.entries.find((entry) => entry.platform === "media").status,
        "skipped-environment",
      );
      assert.equal(
        fs.existsSync(path.join(fixture.configRoot, "media-provider.json")),
        false,
      );
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
