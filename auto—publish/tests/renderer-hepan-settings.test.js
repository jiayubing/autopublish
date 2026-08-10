const assert = require("node:assert/strict");
const test = require("node:test");

test("Hepan settings public feature exposes safe capability status without cookie material", async () => {
  const { createSettingsFeature } = await import(
    "../media-workbench/src/features/settings/settings-feature.js"
  );
  const feature = createSettingsFeature({
    getAiStatus: async () => ({}),
    getMediaStatus: async () => ({}),
    getHepanStatus: async () => ({
      siteOrigin: "https://hepan.example.invalid",
      cookieConfigured: true,
      lastTest: {
        authenticated: true,
        publishAccess: true,
        uploadContext: "changed",
        warnings: ["HEPAN_UPLOAD_CONTEXT_CHANGED"],
        account: { displayName: "fixture-user" },
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
  assert.deepEqual(snapshot.hepan.data.lastTest.warnings, [
    "HEPAN_UPLOAD_CONTEXT_CHANGED",
  ]);
  assert.equal(JSON.stringify(snapshot).includes("fixture-cookie"), false);
  feature.dispose();
});
