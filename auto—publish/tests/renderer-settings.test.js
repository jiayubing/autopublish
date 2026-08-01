const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  mapRuntimeCapabilityState,
} = require("../media-workbench/src/runtime-capability-state.cjs");

describe("renderer settings contract", function () {
  it("maps all runtime capability states without treating not_checked as unavailable", function () {
    assert.deepEqual(mapRuntimeCapabilityState({ state: "ready" }), {
      label: "\u53ef\u7528",
      tone: "ready",
    });
    assert.deepEqual(mapRuntimeCapabilityState({ state: "not_checked" }), {
      label: "\u672a\u68c0\u6d4b",
      tone: "not_checked",
    });
    assert.deepEqual(
      mapRuntimeCapabilityState({ state: "optional_unconfigured" }),
      {
        label:
          "\u672a\u914d\u7f6e\uff08\u4ec5\u5f71\u54cd\u6cb3\u7554\u6295\u7a3f\uff09",
        tone: "optional",
      },
    );
    assert.deepEqual(mapRuntimeCapabilityState({ state: "unavailable" }), {
      label: "\u4e0d\u53ef\u7528",
      tone: "unavailable",
    });
  });

  it("exposes storage maintenance and the safe browser self-check bridge", function () {
    const preload = fs.readFileSync(
      path.resolve(__dirname, "..", "desktop/preload.js"),
      "utf8",
    );
    const settings = fs.readFileSync(
      path.resolve(
        __dirname,
        "..",
        "media-workbench/src/components/SettingsView.tsx",
      ),
      "utf8",
    );
    assert.match(preload, /runtimeDiagnostics/);
    assert.match(preload, /runtime-diagnostics:get/);
    assert.match(preload, /runtime-diagnostics:browser-smoke/);
    assert.match(settings, /Playwright Node/);
    assert.match(settings, /Playwright CLI/);
    assert.match(settings, /运行浏览器自检/);
    assert.match(settings, /DOCX 解析/);
    assert.match(settings, /buildInfo|commit/);
    assert.doesNotMatch(settings, /MarkItDown/);
  });

  it("keeps cache cleanup guarded while exposing usage categories", function () {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "..",
        "media-workbench/src/components/SettingsView.tsx",
      ),
      "utf8",
    );
    const context = fs.readFileSync(
      path.resolve(
        __dirname,
        "..",
        "media-workbench/src/features/settings/settings-context.tsx",
      ),
      "utf8",
    );
    const bridge = fs.readFileSync(
      path.resolve(
        __dirname,
        "..",
        "media-workbench/src/bridge/settings.ts",
      ),
      "utf8",
    );
    const feature = fs.readFileSync(
      path.resolve(
        __dirname,
        "..",
        "media-workbench/src/features/settings/settings-feature.js",
      ),
      "utf8",
    );
    assert.match(context, /getStorageUsage/);
    assert.match(context, /cleanStorageCaches/);
    assert.doesNotMatch(context, /desktopConsole|storageMaintenance/);
    assert.match(bridge, /storageMaintenanceApi\(\)\.getUsage/);
    assert.match(bridge, /storageMaintenanceApi\(\)\.cleanCaches/);
    assert.match(source, /logs/);
    assert.match(source, /temporary/);
    assert.match(source, /docxCache|DOCX/);
    assert.match(source, /profiles|profile/);
    assert.match(source, /disabled=.*(?:active|busy)|active.*disabled=/s);
    assert.match(source, /feature\.cleanStorageCaches\(\)/);
    assert.match(feature, /owners\.cleanStorageCaches/);
    assert.match(feature, /adapters\.cleanStorageCaches/);
    assert.doesNotMatch(source, /clearAll/i);
  });

  it("organizes provider and system settings behind responsive navigation", function () {
    const settings = fs.readFileSync(
      path.resolve(
        __dirname,
        "..",
        "media-workbench/src/components/SettingsView.tsx",
      ),
      "utf8",
    );
    assert.match(settings, /SettingsNavigation/);
    assert.match(settings, /SettingsOverview/);
    assert.match(settings, /MediaProviderSettings/);
    assert.match(settings, /HepanProviderSettings/);
    assert.match(settings, /max-w-6xl/);
    assert.match(settings, /配置中心/);
    assert.doesNotMatch(settings, /Workspace settings/);
    assert.doesNotMatch(settings, /Open folder/);
  });
});
