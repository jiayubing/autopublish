import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSettingsFeature } from "../media-workbench/src/features/settings/settings-feature.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function adapters(overrides = {}) {
  const aiStatus = {
    source: "application",
    configured: false,
    baseUrl: "",
    model: "",
    timeoutMs: 60000,
    hasApiKey: false,
    apiKeyMask: "",
    lastTest: null,
  };
  const mediaStatus = {
    source: "application",
    configured: false,
    baseUrl: "",
    timeoutMs: 0,
    allowInsecure: false,
    transport: "未配置",
    apiKeyMask: "",
    lastTest: null,
  };
  const hepanStatus = {
    source: "application",
    configured: false,
    pythonConfigured: false,
    cookieConfigured: false,
    categoryId: 0,
    vendorConfigured: false,
    bundledVendorAvailable: false,
    siteOrigin: "",
    publishIntervalSeconds: 0,
    lastTest: null,
  };
  return {
    getAiStatus: async () => aiStatus,
    saveAi: async () => aiStatus,
    testAi: async () => ({ ok: true, testedAt: "2026-07-26T00:00:00.000Z" }),
    clearAi: async () => ({ cleared: true }),
    getMediaStatus: async () => mediaStatus,
    saveMedia: async () => mediaStatus,
    testMedia: async () => ({
      ok: true,
      testedAt: "2026-07-26T00:00:00.000Z",
      code: "MEDIA_CONNECTION_OK",
    }),
    clearMedia: async () => ({ cleared: true }),
    getHepanStatus: async () => hepanStatus,
    saveHepan: async () => hepanStatus,
    testHepan: async () => ({
      ok: true,
      testedAt: "2026-07-26T00:00:00.000Z",
      code: "HEPAN_CONNECTION_OK",
    }),
    clearHepan: async () => ({ cleared: true }),
    getLegacyStatus: async () => ({
      discover: {
        media: { available: false, sources: [] },
        hepan: { available: false, sources: [], cookiePathAvailable: false },
        sources: [],
        importable: false,
      },
      record: null,
    }),
    importLegacy: async () => ({}),
    getRuntimeDiagnostics: async () => null,
    runBrowserSelfCheck: async () => ({}),
    getStorageUsage: async () => null,
    cleanStorageCaches: async () => ({ blocked: false }),
    getGenerationBatchState: async () => null,
    subscribeGenerationBatchState: () => () => {},
    ...overrides,
  };
}

describe("Phase 06 settings feature", () => {
  it("does not consume or reinterpret the generation runtime event", () => {
    let generationReads = 0;
    const dependencies = adapters();
    Object.defineProperties(dependencies, {
      getGenerationBatchState: {
        get() {
          generationReads += 1;
          throw new Error("settings must not read generation runtime");
        },
      },
      subscribeGenerationBatchState: {
        get() {
          generationReads += 1;
          throw new Error("settings must not subscribe to generation runtime");
        },
      },
    });
    const feature = createSettingsFeature(dependencies);
    feature.setScope({ installationId: "desktop" });
    assert.equal(generationReads, 0);
    assert.equal("generationBusy" in feature.getSnapshot(), false);
  });

  it("keeps save and test command ownership independent while they overlap", async () => {
    const saving = deferred();
    const testing = deferred();
    const feature = createSettingsFeature(
      adapters({
        saveMedia: () => saving.promise,
        testMedia: () => testing.promise,
      }),
    );
    feature.setScope({ installationId: "desktop" });

    const saveRequest = feature.saveMedia({
      apiKey: "fixture",
      baseUrl: "https://example.test",
      timeoutMs: 30000,
    });
    const testRequest = feature.testMedia({
      apiKey: "fixture",
      baseUrl: "https://example.test",
      timeoutMs: 30000,
    });
    assert.equal(feature.getSnapshot().commands.saveMedia.busy, true);
    assert.equal(feature.getSnapshot().commands.testMedia.busy, true);

    saving.resolve({ configured: true });
    await saveRequest;
    assert.equal(feature.getSnapshot().commands.saveMedia.busy, false);
    assert.equal(feature.getSnapshot().commands.testMedia.busy, true);

    testing.resolve({ ok: true });
    await testRequest;
    assert.equal(feature.getSnapshot().commands.testMedia.busy, false);
  });

  it("converges command failure and ignores late results after dispose", async () => {
    const selfCheck = deferred();
    const feature = createSettingsFeature(
      adapters({
        runBrowserSelfCheck: () => selfCheck.promise,
        cleanStorageCaches: async () => {
          const error = new Error("unsafe raw error");
          error.code = "STORAGE_MAINTENANCE_BUSY";
          throw error;
        },
      }),
    );
    feature.setScope({ installationId: "desktop" });

    await feature.cleanStorageCaches();
    assert.equal(feature.getSnapshot().commands.cleanStorageCaches.busy, false);
    assert.equal(
      feature.getSnapshot().commands.cleanStorageCaches.error.code,
      "STORAGE_MAINTENANCE_BUSY",
    );
    assert.equal(
      JSON.stringify(feature.getSnapshot()).includes("unsafe raw error"),
      false,
    );

    const pending = feature.runBrowserSelfCheck();
    assert.equal(feature.getSnapshot().commands.runBrowserSelfCheck.busy, true);
    feature.dispose();
    selfCheck.resolve({ ok: true });
    await pending;
    assert.equal(
      feature.getSnapshot().commands.runBrowserSelfCheck.busy,
      false,
    );
  });

  it("lets a newer provider refresh supersede an older initial response", async () => {
    const initial = deferred();
    const manual = deferred();
    let calls = 0;
    const feature = createSettingsFeature(
      adapters({
        getAiStatus: () => (++calls === 1 ? initial.promise : manual.promise),
      }),
    );
    feature.setScope({ installationId: "desktop" });

    const older = feature.refreshAi("initial");
    const newer = feature.refreshAi("manual");
    manual.resolve({ configured: true, model: "new-model" });
    await newer;
    initial.resolve({ configured: false, model: "old-model" });
    await older;

    assert.equal(feature.getSnapshot().ai.data.model, "new-model");
    assert.equal(feature.getSnapshot().ai.query.loading, false);
    assert.equal(feature.getSnapshot().ai.query.reason, "manual");
  });

  it("exposes only named settings queries and commands with distinct state owners", () => {
    const feature = createSettingsFeature(adapters());
    feature.setScope({ installationId: "desktop" });
    const methods = [
      "refresh",
      "refreshAi",
      "refreshMedia",
      "refreshHepan",
      "refreshLegacy",
      "refreshRuntime",
      "refreshStorage",
      "saveAi",
      "testAi",
      "clearAi",
      "saveMedia",
      "testMedia",
      "clearMedia",
      "saveHepan",
      "testHepan",
      "clearHepanVendor",
      "clearHepan",
      "importLegacy",
      "runBrowserSelfCheck",
      "cleanStorageCaches",
    ];
    for (const name of methods)
      assert.equal(typeof feature[name], "function", name);
    assert.equal("dispatch" in feature, false);

    const commandNames = Object.keys(feature.getSnapshot().commands);
    assert.deepEqual(
      commandNames.sort(),
      [
        "cleanStorageCaches",
        "clearAi",
        "clearHepan",
        "clearHepanVendor",
        "clearMedia",
        "importLegacy",
        "runBrowserSelfCheck",
        "saveAi",
        "saveHepan",
        "saveMedia",
        "testAi",
        "testHepan",
        "testMedia",
      ].sort(),
    );
  });
});
