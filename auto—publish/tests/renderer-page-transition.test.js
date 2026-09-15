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
    assert.match(
      app,
      /const content = useContentWorkbenchFeature\(\{ page: contentPage \}\)/,
    );
    assert.match(app, /<ContentProductionPage[\s\S]*content=\{content\}/);
    assert.match(app, /<ArticleLibraryPage[\s\S]*content=\{content\}/);
    assert.doesNotMatch(app, /useMediaFeature\(\)/);
    assert.doesNotMatch(app, /useContentWorkbenchFeature\(\)/);
  });

  it("keeps one workspace content owner while unrelated page features stay lazy", function () {
    const app = read("media-workbench/src/App.tsx");
    const appContent = app.slice(app.indexOf("function AppContent"));
    assert.match(
      appContent,
      /const content = useContentWorkbenchFeature\(\{ page: contentPage \}\)/,
    );
    assert.equal(
      (app.match(/useContentWorkbenchFeature\(\{/g) || []).length,
      1,
    );
    assert.doesNotMatch(appContent, /useSubmissionCenterFeature/);
    assert.doesNotMatch(appContent, /useMediaFeature/);
  });
});
