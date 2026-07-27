const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MW = path.join(ROOT, "media-workbench", "src");

function readSource(relativePath) {
  return fs.readFileSync(path.join(MW, relativePath), "utf8");
}

function readFunction(source, name) {
  const start = source.indexOf(`const ${name} =`);
  const end = source.indexOf("\n  const ", start + 1);
  return source.slice(start, end === -1 ? source.length : end);
}

describe("renderer AI provider settings", function () {
  it("exposes the Task 5 provider IPC through typed renderer helpers", function () {
    const api = readSource("bridge/settings.ts");
    const types = readSource("types.ts");

    [
      "getAiProviderStatus",
      "saveAiProviderConfig",
      "testAiProviderConnection",
      "clearAiProviderConfig",
    ].forEach(function (name) {
      assert.match(api, new RegExp(`export (async )?function ${name}`), name);
    });
    assert.match(api, /aiProvider/);
    assert.match(types, /interface AiProviderStatus/);
    assert.match(types, /hasApiKey: boolean/);
    assert.match(types, /apiKeyMask: string/);
  });

  it("keeps the provider UI on safe status fields and validates the URL locally", function () {
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

  it("confirms only connection tests and clearing through the renderer host", function () {
    const settings = readSource("components/AiProviderSettings.tsx");
    const save = readFunction(settings, "handleSave");
    const test = readFunction(settings, "handleTest");
    const clear = readFunction(settings, "handleClear");

    assert.match(settings, /source/);
    assert.match(test, /useConfirmation|confirm\(\{/);
    assert.match(clear, /useConfirmation|confirm\(\{/);
    assert.doesNotMatch(settings, /window\.confirm/);
    assert.doesNotMatch(save, /confirm\(\{/);
    assert.match(settings, /completion/);
  });

  it("refreshes safe status after a rejected connection test while retaining the UI error", function () {
    const settings = readSource("components/AiProviderSettings.tsx");
    const feature = readSource("features/settings/settings-feature.js");
    const test = readFunction(settings, "handleTest");
    assert.match(test, /feature\.testAi\(currentInput\(\)\)/);
    assert.match(feature, /owners\.testAi/);
    assert.match(feature, /adapters\.testAi/);
    assert.match(feature, /runQuery\(["']ai["'], ["']command-result["']\)/);
    assert.match(feature, /owner\.finalize\(token,\s*\{\s*error: safeError/);
  });

  it("leaves generation runtime ownership in the generation feature", function () {
    const settings = readSource("components/AiProviderSettings.tsx");
    const context = readSource("features/settings/settings-context.tsx");
    const feature = readSource("features/settings/settings-feature.js");

    assert.doesNotMatch(settings, /snapshot\.generationBusy/);
    assert.doesNotMatch(context, /getGenerationBatchState/);
    assert.doesNotMatch(context, /subscribeGenerationBatchState/);
    assert.doesNotMatch(feature, /isGenerationBusy|generationBusy/);
    assert.doesNotMatch(
      settings,
      /bridge\/content|content:generation-batch-state/,
    );
  });

  it("keeps long provider URLs inside the settings layout", function () {
    const css = readSource("index.css");
    assert.match(css, /overflow-wrap:\s*anywhere/);
    assert.match(css, /word-break:\s*break-all/);
  });

  it("mounts provider settings as an independent Settings section", function () {
    const settingsView = readSource("components/SettingsView.tsx");
    assert.match(settingsView, /AiProviderSettings/);
    assert.match(settingsView, /<AiProviderSettings\s*\/>/);
  });

  it("declares the optional content generation state channel", function () {
    const api = readSource("bridge/content.ts");

    assert.match(api, /getGenerationBatchState/);
    assert.match(api, /subscribeGenerationBatchState/);
  });
});
