const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, it } = require('node:test');

const { createRuntimeConfigStore } = require('../desktop/runtime-config-store');
const { createLegacyProviderSettingsMigration } = require('../desktop/runtime-config');
const { createPlatformSettingsService } = require('../desktop/services/platform-settings-service');
const { createMediaSettingsAdapter } = require('../desktop/services/platform-settings/media-settings-adapter');
const { createHepanSettingsAdapter } = require('../desktop/services/platform-settings/hepan-settings-adapter');

function fakeSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: (value) => String(value).replace(/^encrypted:/, '')
  };
}

function makeFixture(env = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autopublish-legacy-settings-'));
  const configRoot = path.join(root, 'config');
  const workspaceRoot = path.join(root, 'workspace');
  const runtimeConfigStore = createRuntimeConfigStore({ configRoot });
  const pythonPath = path.join(root, 'python.exe');
  const cookiePath = path.join(root, 'legacy-cookie.txt');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.writeFileSync(pythonPath, 'fake python executable', 'utf8');
  fs.writeFileSync(cookiePath, 'legacy-cookie-value', 'utf8');
  fs.writeFileSync(path.join(workspaceRoot, '.env'), [
    'XQW_API_KEY=workspace-media-key',
    'HEPAN_COOKIE_PATH=' + cookiePath,
    'HEPAN_PYTHON=' + pythonPath
  ].join('\n') + '\n', 'utf8');
  fs.mkdirSync(configRoot, { recursive: true });
  fs.writeFileSync(path.join(configRoot, 'runtime-config.json'), JSON.stringify({ version: 1, values: {
    XQW_API_KEY: 'application-media-key',
    XQW_BASE_URL: 'https://legacy.example/api',
    HEPAN_COOKIE_PATH: cookiePath,
    HEPAN_PYTHON: pythonPath
  } }) + '\n', 'utf8');
  const service = createPlatformSettingsService({
    userDataPath: configRoot,
    safeStorage: fakeSafeStorage(),
    env,
    adapters: [createMediaSettingsAdapter(), createHepanSettingsAdapter({ localStateRoot: path.join(root, 'local') })]
  });
  const migration = createLegacyProviderSettingsMigration({ configRoot, workspaceRoot, runtimeConfigStore, platformSettingsService: service, clock: () => '2026-07-17T00:00:00.000Z' });
  return { root, configRoot, workspaceRoot, runtimeConfigStore, service, migration, cookiePath };
}

describe('legacy platform settings migration', function() {
  it('reports only safe availability metadata and requires explicit confirmation', async function() {
    const fixture = makeFixture();
    try {
      const report = fixture.migration.discover();
      assert.equal(report.importable, true);
      assert.deepEqual(report.media.sources, ['application-runtime-config', 'workspace-env']);
      assert.deepEqual(report.hepan.sources, ['application-runtime-config', 'workspace-env']);
      assert.equal(JSON.stringify(report).includes('application-media-key'), false);
      assert.equal(JSON.stringify(report).includes('legacy-cookie-value'), false);
      assert.equal(JSON.stringify(report).includes(fixture.cookiePath), false);
      await assert.rejects(() => fixture.migration.importLegacy({ confirmed: false }), (error) => error.code === 'PLATFORM_CONFIG_MIGRATION_CONFIRMATION_REQUIRED');
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('imports legacy values into encrypted provider stores, removes old runtime secrets, and is idempotent', async function() {
    const fixture = makeFixture();
    try {
      const first = await fixture.migration.importLegacy({ confirmed: true });
      assert.deepEqual(first.imported, ['media']);
      const mediaDisk = fs.readFileSync(path.join(fixture.configRoot, 'media-provider.json'), 'utf8');
      assert.equal(mediaDisk.includes('application-media-key'), false);
      assert.equal(fs.existsSync(path.join(fixture.configRoot, 'hepan-geo-api-provider.json')), false);
      assert.equal(fixture.runtimeConfigStore.readLegacy().XQW_API_KEY, undefined);
      assert.notEqual(fixture.runtimeConfigStore.readLegacy().HEPAN_COOKIE_PATH, undefined);
      assert.equal(fs.existsSync(fixture.cookiePath), true);
      assert.equal(first.legacyCookieFilesRemain, true);
      assert.equal(
        first.entries.find((entry) => entry.platform === 'hepan').status,
        'skipped-incompatible'
      );
      assert.equal(
        first.entries.find((entry) => entry.platform === 'hepan').code,
        'HEPAN_LEGACY_COOKIE_INCOMPATIBLE'
      );
      assert.equal(JSON.stringify(first.record).includes('legacy-cookie-value'), false);

      const second = await fixture.migration.importLegacy({ confirmed: true });
      assert.deepEqual(second.imported, []);
      assert.deepEqual(
        second.entries.map((entry) => entry.status).sort(),
        ['skipped-existing', 'skipped-incompatible']
      );
      assert.equal(fixture.service.getStatus('media').apiKeyMask, 'appl****-key');
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('does not persist an environment override during explicit legacy import', async function() {
    const fixture = makeFixture({ XQW_API_KEY: 'environment-key', XQW_BASE_URL: 'https://environment.example/api' });
    try {
      const result = await fixture.migration.importLegacy({ confirmed: true });
      assert.equal(result.imported.includes('media'), false);
      assert.equal(result.entries.find((entry) => entry.platform === 'media').status, 'skipped-environment');
      assert.equal(fs.existsSync(path.join(fixture.configRoot, 'media-provider.json')), false);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
