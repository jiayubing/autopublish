const assert = require("node:assert/strict");
const test = require("node:test");

test("Hepan settings public feature exposes safe GEO API account status without password material", async () => {
  const { createSettingsFeature } = await import(
    "../media-workbench/src/features/settings/settings-feature.js"
  );
  const feature = createSettingsFeature({
    getAiStatus: async () => ({}),
    getMediaStatus: async () => ({}),
    getHepanStatus: async () => ({
      uid: 12345,
      uidConfigured: true,
      passwordConfigured: true,
      apiUrl: "https://www.hepan.com/geoapi/api.php",
      lastTest: {
        ok: true,
        code: "HEPAN_GEO_API_OK",
        authenticated: true,
        publishAccess: true,
        account: { displayName: "蓝色河畔 UID 12345", uid: "12345" },
        planName: "GEO标准版",
        postLimit: 30,
        usedCount: 7,
        remainingCount: 23,
      },
    }),
    getLegacyStatus: async () => ({}),
    getRuntimeDiagnostics: async () => ({}),
    getStorageUsage: async () => ({}),
  });
  feature.setScope({ installationId: "installation-1" });
  await feature.refreshHepan("manual");
  const snapshot = feature.getSnapshot();
  assert.equal(snapshot.hepan.data.lastTest.publishAccess, true);
  assert.equal(snapshot.hepan.data.lastTest.remainingCount, 23);
  assert.equal(JSON.stringify(snapshot).includes("fixture-password"), false);
  feature.dispose();
});
