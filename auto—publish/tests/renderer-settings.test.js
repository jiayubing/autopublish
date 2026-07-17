const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("renderer storage settings contract", function() {
  it("exposes storage maintenance through the preload bridge", function() {
    const source = fs.readFileSync(path.resolve(__dirname, "..", "desktop/preload.js"), "utf8");
    assert.match(source, /storageMaintenance/);
    assert.match(source, /storage-maintenance:get-usage/);
    assert.match(source, /storage-maintenance:clean-caches/);
  });

  it("exposes independent runtime diagnostics and a safe browser self-check", function() {
    const preload = fs.readFileSync(path.resolve(__dirname, "..", "desktop/preload.js"), "utf8");
    const settings = fs.readFileSync(path.resolve(__dirname, "..", "media-workbench/src/components/SettingsView.tsx"), "utf8");
    assert.match(preload, /runtimeDiagnostics/);
    assert.match(preload, /runtime-diagnostics:get/);
    assert.match(preload, /runtime-diagnostics:browser-smoke/);
    assert.match(settings, /Playwright Node/);
    assert.match(settings, /Playwright CLI/);
    assert.match(settings, /运行浏览器自检/);
    assert.match(settings, /about:blank/);
  });

  it("exposes usage categories and a guarded cache cleanup command", function() {
    const source = fs.readFileSync(path.resolve(__dirname, "..", "media-workbench/src/components/SettingsView.tsx"), "utf8");
    assert.match(source, /storageMaintenance/);
    assert.match(source, /getUsage/);
    assert.match(source, /cleanCaches/);
    assert.match(source, /logs/);
    assert.match(source, /temporary|tmp/);
    assert.match(source, /docxCache|DOCX/);
    assert.match(source, /profiles|profile/);
    assert.match(source, /disabled=.*(?:active|busy)|active.*disabled=/s);
    assert.doesNotMatch(source, /全[部部].*清理|clearAll/i);
  });
});
