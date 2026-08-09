const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

describe("renderer workbench controller seams", () => {
  it("keeps queue-group commands, request identity, and terminal refresh in a renderer controller", () => {
    const controller = read(
      "media-workbench/src/features/platform/platform-feature.js",
    );
    const view = read("media-workbench/src/components/PlatformWorkbench.tsx");
    assert.match(controller, /createPlatformFeature/);
    assert.match(controller, /createCommandOwner/);
    assert.match(controller, /startAllGroups/);
    assert.match(controller, /pauseAllGroups/);
    assert.doesNotMatch(controller, /requestId/);
    assert.match(controller, /refreshQueue\(['"]submit-terminal['"]\)/);
    assert.match(controller, /subscribe/);
    assert.match(view, /usePlatformFeature/);
    assert.doesNotMatch(
      view,
      /bridge\/platform|usePlatformQueue|usePlatformTask/,
    );
    assert.doesNotMatch(view, /usePlatformWorkbenchController/);
  });

  it("account profile selection consumes the root platform feature", () => {
    const selector = read(
      "media-workbench/src/components/content/AccountProfileSelector.tsx",
    );
    assert.match(selector, /usePlatformFeature/);
    assert.doesNotMatch(
      selector,
      /bridge\/account-profile|listAccountProfiles/,
    );
    assert.doesNotMatch(selector, /setProfiles|setBusyPlatformId|setError/);
  });
});
