const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("renderer page transition ownership", function () {
  it("does not keep two page trees mounted during view changes", function () {
    const app = read("media-workbench/src/App.tsx");
    assert.match(app, /AnimatePresence mode="wait"/);
    assert.doesNotMatch(app, /AnimatePresence mode="sync"/);
    assert.match(app, /function ArticleLibraryPage/);
    assert.match(app, /function ContentProductionPage/);
    assert.match(app, /useContentWorkbenchFeature\(\{ page: "library" \}\)/);
    assert.match(
      app,
      /useContentWorkbenchFeature\(\{ page: "production" \}\)/,
    );
    assert.doesNotMatch(app, /useMediaFeature\(\)/);
    assert.doesNotMatch(app, /useContentWorkbenchFeature\(\)/);
  });

  it("keeps page-owned feature hooks out of AppContent so unused pages stay unloaded", function () {
    const app = read("media-workbench/src/App.tsx");
    const appContent = app.slice(app.indexOf("function AppContent"));
    assert.doesNotMatch(appContent, /useContentWorkbenchFeature/);
    assert.doesNotMatch(appContent, /useSubmissionCenterFeature/);
    assert.doesNotMatch(appContent, /useMediaFeature/);
  });
});
