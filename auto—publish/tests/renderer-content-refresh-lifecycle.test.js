const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("renderer content refresh lifecycle", function () {
  it("routes initial manual and invalidation refresh through the content feature query", function () {
    const source = read("media-workbench/src/components/ContentWorkbench.tsx");
    const hook = read("media-workbench/src/features/content/use-content-workbench-feature.ts");
    const feature = read("media-workbench/src/features/content/content-workbench-feature.js");
    assert.match(source, /useContentWorkbenchFeature/);
    assert.match(source, /content\.refresh\('manual'\)/);
    assert.match(hook, /feature\.refresh\('initial'\)/);
    assert.match(hook, /feature\.refresh\(event\.kind\)/);
    assert.match(feature, /createQueryIdentity/);
    assert.doesNotMatch(source, /refreshRequestIdRef|refreshTimerRef|setTimeout\(/);
    assert.match(source, /role="status" aria-live="polite"/);
    assert.match(source, /role="alert"/);
  });

  it("routes content read refreshes through feature-owned scoped queries", function () {
    const workbench = read(
      "media-workbench/src/components/ContentWorkbench.tsx",
    );
    const article = read(
      "media-workbench/src/components/content/ArticleGenerationView.tsx",
    );
    const history = read(
      "media-workbench/src/components/content/GeneratedArticlesView.tsx",
    );
    const batch = read(
      "media-workbench/src/components/content/BatchGenerationView.tsx",
    );
    assert.match(workbench, /content\.refresh/);
    assert.match(workbench, /refreshManagement/);
    assert.match(workbench, /refreshClientData/);
    assert.doesNotMatch(workbench, /articleRefreshToken|batchRefreshToken/);
    assert.doesNotMatch(article, /onRefreshArticles|onRefreshBatchState|refreshToken/);
    assert.doesNotMatch(history, /refreshToken|getArticleManagementSnapshot/);
    assert.doesNotMatch(batch, /onRefreshBatchState|refreshToken|batchRefreshToken/);
    assert.doesNotMatch(article, /onRefresh\(\)/);
    assert.match(history, /refreshManagement\('command-result'\)/);
    assert.doesNotMatch(history, /onRefresh\?\.\(\)/);
  });

  it("keeps content-source invalidation separate from customer and template rescans", function () {
    const workbench = read(
      "media-workbench/src/components/ContentWorkbench.tsx",
    );
    const questions = read(
      "media-workbench/src/components/content/QuestionCollectionView.tsx",
    );
    const invalidation = read("desktop/workspace-data-invalidation.js");
    const hook = read("media-workbench/src/features/content/use-content-workbench-feature.ts");
    assert.match(hook, /useWorkspaceScope\('contentSources'/);
    assert.doesNotMatch(workbench, /onWorkspaceDataInvalidated/);
    assert.match(invalidation, /contentSources/);
    assert.match(questions, /onContentSourcesChanged/);
    assert.doesNotMatch(questions, /refreshWorkspaceSources/);
  });
});
