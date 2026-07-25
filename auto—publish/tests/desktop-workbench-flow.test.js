const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("desktop workbench flow", function () {
  it("loads the React production renderer from the packaged dist entry", function () {
    const main = read("desktop/main.js");
    const packaging = read("electron-builder.alpha.yml");
    assert.match(main, /media-workbench["\\']?, ["\\']dist["\\']?/);
    assert.match(main, /rendererEntryPath/);
    assert.match(packaging, /media-workbench\/dist/);
    assert.doesNotMatch(packaging, /desktop[\\/]renderer/);
    assert.doesNotMatch(main, /desktop[\\/]renderer/);
  });

  it("keeps media, platform, order, and content workbenches on the React app surface", function () {
    const app = read("media-workbench/src/App.tsx");
    const platform = read(
      "media-workbench/src/components/PlatformWorkbench.tsx",
    );
    const content = read("media-workbench/src/components/ContentWorkbench.tsx");
    assert.match(app, /ResourceLibrary/);
    assert.match(app, /ArticleEditor/);
    assert.match(app, /OrdersView/);
    assert.match(app, /PlatformWorkbench/);
    assert.match(app, /ContentWorkbench/);
    assert.match(platform, /selectedArticles/);
    assert.match(content, /GeneratedArticlesView/);
  });

  it("keeps platform batch selection until explicit confirmation", function () {
    const platform = read(
      "media-workbench/src/components/PlatformWorkbench.tsx",
    );
    assert.match(platform, /selectedArticles/);
    assert.match(platform, /selectedPlatformIds/);
    assert.match(platform, /submitPlatformSelection/);
    assert.match(platform, /isConfirming/);
    assert.match(platform, /accountProfiles: Object\.fromEntries/);
    assert.match(platform, /article\.accountProfileId/);
  });
});
