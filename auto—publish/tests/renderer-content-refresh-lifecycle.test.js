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
    const sources = read("media-workbench/src/features/content/content-sources-feature.js");
    const management = read("media-workbench/src/features/content/article-management-feature.js");
    assert.match(source, /useContentWorkbenchFeature/);
    assert.match(source, /content\.refresh\('manual'\)/);
    assert.match(hook, /feature\.refreshContentSources\(event\.kind\)/);
    assert.match(hook, /event\.reasonCode/);
    assert.match(hook, /ARTICLE_REMOVAL_TRANSACTION_CHANGED/);
    assert.match(hook, /feature\.refreshManagement\(event\.kind\)/);
    assert.doesNotMatch(hook, /feature\.refresh\(event\.kind\)/);
    assert.match(sources, /createQueryIdentity/);
    assert.match(management, /createQueryIdentity/);
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
    const hook = read(
      "media-workbench/src/features/content/use-content-workbench-feature.ts",
    );
    assert.match(workbench, /content\.refresh/);
    assert.match(workbench, /refreshManagement/);
    assert.match(hook, /refreshClientData/);
    assert.doesNotMatch(workbench, /articleRefreshToken|batchRefreshToken/);
    assert.doesNotMatch(article, /onRefreshArticles|onRefreshBatchState|refreshToken/);
    assert.doesNotMatch(history, /refreshToken|getArticleManagementSnapshot/);
    assert.doesNotMatch(batch, /onRefreshBatchState|refreshToken|batchRefreshToken/);
    assert.doesNotMatch(article, /onRefresh\(\)/);
    assert.doesNotMatch(history, /refreshHistoryData|refreshManagement\('command-result'\)/);
    assert.doesNotMatch(workbench, /await content\.refreshManagement\('command-result'\)/);
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
    assert.match(questions, /queueQuery|queue=\{queue\}/);
    assert.doesNotMatch(questions, /refreshWorkspaceSources/);
    assert.doesNotMatch(questions, /onContentSourcesChanged|subscribeDoubaoQueue/);
  });
});
