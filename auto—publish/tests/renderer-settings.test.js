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
