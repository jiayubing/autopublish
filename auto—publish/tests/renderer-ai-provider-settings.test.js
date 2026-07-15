const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MW = path.join(ROOT, "media-workbench", "src");

function readSource(relativePath) {
  return fs.readFileSync(path.join(MW, relativePath), "utf8");
}

describe("renderer AI provider settings", function() {
  it("exposes the Task 5 provider IPC through typed renderer helpers", function() {
    const api = readSource("electron-api.ts");
    const types = readSource("types.ts");

    ["getAiProviderStatus", "saveAiProviderConfig", "testAiProviderConnection", "clearAiProviderConfig"].forEach(function(name) {
      assert.match(api, new RegExp(`export (async )?function ${name}`), name);
    });
    assert.match(api, /aiProvider/);
    assert.match(types, /interface AiProviderStatus/);
    assert.match(types, /hasApiKey: boolean/);
    assert.match(types, /apiKeyMask: string/);
  });

  it("keeps the provider UI on safe status fields and validates the URL locally", function() {
    const settings = readSource("components/AiProviderSettings.tsx");

    assert.match(settings, /hasApiKey/);
    assert.match(settings, /apiKeyMask/);
    assert.match(settings, /validateAiProviderBaseUrl/);
    assert.match(settings, /https:/);
    assert.match(settings, /localhost/);
    assert.match(settings, /chat\/completions/);
    assert.doesNotMatch(settings, /status\.apiKey(?!Mask)/);
    assert.doesNotMatch(settings, /value=\{status\.[^}]*apiKey/);
    assert.doesNotMatch(settings, /\bfetch\s*\(/);
  });

  it("covers source, confirmations, cost warning, and generation busy state", function() {
    const settings = readSource("components/AiProviderSettings.tsx");

    assert.match(settings, /source/);
    assert.match(settings, /window\.confirm/);
    assert.match(settings, /handleSave[\s\S]*window\.confirm/);
    assert.match(settings, /handleTest[\s\S]*window\.confirm/);
    assert.match(settings, /handleClear[\s\S]*window\.confirm/);
    assert.match(settings, /可能产生少量费用/);
    assert.match(settings, /running/);
    assert.match(settings, /stopping/);
    assert.match(settings, /content:generation-batch-state/);
    assert.match(settings, /disabled=\{[^}]*busy/);
  });

  it("keeps long provider URLs inside the settings layout", function() {
    const css = readSource("index.css");
    assert.match(css, /overflow-wrap:\s*anywhere/);
    assert.match(css, /word-break:\s*break-all/);
  });

  it("mounts provider settings as an independent Settings section", function() {
    const settingsView = readSource("components/SettingsView.tsx");
    assert.match(settingsView, /AiProviderSettings/);
    assert.match(settingsView, /<AiProviderSettings\s*\/>/);
  });

  it("uses the existing preload batch state channel to disable provider mutations", function() {
    const api = readSource("electron-api.ts");
    const preload = fs.readFileSync(path.join(ROOT, "desktop", "preload.js"), "utf8");

    assert.match(preload, /batch:\s*\{/);
    assert.match(preload, /getState:\s*function\(\)\s*\{\s*return ipcRenderer\.invoke\("desktop:get-state"\)/);
    assert.match(preload, /onState:\s*function\(listener\)/);
    assert.match(api, /interface DesktopConsoleBatch/);
    assert.match(api, /batch:\s*DesktopConsoleBatch/);
    assert.match(api, /window\.desktopConsole!\.batch\.getState\(\)/);
    assert.match(api, /window\.desktopConsole!\.batch\.onState\(listener\)/);
  });
});
