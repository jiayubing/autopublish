const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(file) { return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"); }

describe("renderer content refresh lifecycle", function() {
  it("keeps initial loading silent and makes manual refresh feedback transient", function() {
    const source = read("media-workbench/src/components/ContentWorkbench.tsx");
    assert.match(source, /refreshWorkspaceSources\(true\)/);
    assert.match(source, /if \(initial\) \{[\s\S]*setRefreshState\('idle'\)/);
    assert.match(source, /setRefreshState\('success'\)/);
    assert.match(source, /setTimeout\(/);
    assert.match(source, /2500/);
    assert.match(source, /clearTimeout\(refreshTimerRef\.current\)/);
    assert.match(source, /mountedRef/);
    assert.match(source, /role="status" aria-live="polite"/);
    assert.match(source, /role="alert"/);
  });

  it("separates workspace, article, and batch refresh intents", function() {
    const workbench = read("media-workbench/src/components/ContentWorkbench.tsx");
    const article = read("media-workbench/src/components/content/ArticleGenerationView.tsx");
    const history = read("media-workbench/src/components/content/GeneratedArticlesView.tsx");
    const batch = read("media-workbench/src/components/content/BatchGenerationView.tsx");
    assert.match(workbench, /refreshWorkspaceSources/);
    assert.match(workbench, /refreshArticles/);
    assert.match(workbench, /refreshBatchState/);
    assert.match(article, /onRefreshArticles/);
    assert.match(article, /onRefreshBatchState/);
    assert.doesNotMatch(history, /onRefreshArticles/);
    assert.match(batch, /onRefreshBatchState/);
    assert.doesNotMatch(article, /onRefresh\(\)/);
    assert.match(history, /const refreshHistoryData/);
    assert.doesNotMatch(history, /onRefresh\?\.\(\)/);
  });

  it("keeps content-source invalidation separate from customer and template rescans", function() {
    const workbench = read("media-workbench/src/components/ContentWorkbench.tsx");
    const questions = read("media-workbench/src/components/content/QuestionCollectionView.tsx");
    const invalidationPolicy = read("desktop/workspace-invalidation-policy.js");
    assert.match(workbench, /contentSourcesRefreshToken/);
    assert.match(workbench, /onWorkspaceDataInvalidated/);
    assert.match(invalidationPolicy, /contentSources/);
    assert.match(questions, /onContentSourcesChanged/);
    assert.doesNotMatch(questions, /refreshWorkspaceSources/);
  });
});
