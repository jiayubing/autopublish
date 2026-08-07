const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

describe("renderer workbench controller seams", () => {
  it("keeps platform selection, request identity, and terminal refresh in a renderer controller", () => {
    const controller = read(
      "media-workbench/src/features/platform/platform-feature.js",
    );
    const view = read("media-workbench/src/components/PlatformWorkbench.tsx");
    assert.match(controller, /createPlatformFeature/);
    assert.match(controller, /createCommandOwner/);
    assert.doesNotMatch(controller, /requestId/);
    assert.match(controller, /refreshQueue\(['"]submit-terminal['"]\)/);
    assert.match(controller, /subscribe/);
    assert.match(view, /usePlatformFeature/);
    assert.doesNotMatch(view, /bridge\/platform|usePlatformQueue|usePlatformTask/);
    assert.doesNotMatch(view, /usePlatformWorkbenchController/);
  });

  it("loads article-management snapshots through the production content feature seam", () => {
    const view = read(
      "media-workbench/src/components/content/GeneratedArticlesView.tsx",
    );
    const feature = read("media-workbench/src/features/content/content-workbench-feature.js");
    const managementFeature = read("media-workbench/src/features/content/article-management-feature.js");
    assert.equal(fs.existsSync(path.join(root, "media-workbench/src/article-management-controller.js")), false);
    assert.doesNotMatch(view, /createArticleManagementController/);
    assert.doesNotMatch(view, /getArticleManagementSnapshot|refreshToken/);
    assert.match(feature, /createArticleManagementFeature/);
    assert.match(managementFeature, /query: ["']articleManagement["']/);
  });

  it("account profile selection consumes the root platform feature", () => {
    const selector = read(
      "media-workbench/src/components/content/AccountProfileSelector.tsx",
    );
    assert.match(selector, /usePlatformFeature/);
    assert.doesNotMatch(selector, /bridge\/account-profile|listAccountProfiles/);
    assert.doesNotMatch(selector, /setProfiles|setBusyPlatformId|setError/);
  });
});
