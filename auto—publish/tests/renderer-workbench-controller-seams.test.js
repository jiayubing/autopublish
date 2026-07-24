const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

describe("renderer workbench controller seams", () => {
  it("keeps platform selection, request identity, and terminal refresh in a renderer controller", () => {
    const controller = read(
      "media-workbench/src/controllers/platform-submission-controller.js",
    );
    const view = read("media-workbench/src/components/PlatformWorkbench.tsx");
    assert.match(controller, /createPlatformSubmissionController/);
    assert.match(controller, /requestId/);
    assert.match(controller, /refresh\("submit-terminal"\)/);
    assert.match(controller, /subscribe/);
    assert.match(view, /createPlatformSubmissionController/);
    assert.doesNotMatch(view, /usePlatformWorkbenchController/);
  });

  it("loads article-management snapshots through the production controller seam", () => {
    const controller = read(
      "media-workbench/src/article-management-controller.js",
    );
    const view = read(
      "media-workbench/src/components/content/GeneratedArticlesView.tsx",
    );
    assert.match(controller, /createArticleManagementController/);
    assert.match(controller, /requestId/);
    assert.match(view, /createArticleManagementController/);
    assert.doesNotMatch(view, /useArticleManagementSnapshot/);
  });
});
