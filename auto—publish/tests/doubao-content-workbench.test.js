const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("Doubao content workbench static boundaries", function () {
  it("derives collection pending state from feature command state and clears its run token on every exit", function () {
    const questions = read(
      "media-workbench/src/components/content/QuestionCollectionView.tsx",
    );
    assert.match(
      questions,
      /const collectionPending = commandStates\.collectDoubaoQuestion\.busy/,
    );
    assert.match(questions, /commandStates\.previewDoubaoBatch\.busy/);
    assert.match(questions, /commandStates\.startPreparedDoubaoBatch\.busy/);
    assert.match(questions, /commandStates\.retryFailedDoubao\.busy/);
    assert.match(questions, /const isCollecting = collectionPending/);
    assert.doesNotMatch(
      questions,
      /pendingCollectionToken|tryBeginCollection|finishCollection/,
    );
  });

  it("deduplicates collection refreshes by run token and refreshes empty/external completions", function () {
    const feature = read(
      "media-workbench/src/features/content/content-sources-feature.js",
    );
    assert.match(feature, /queueRefreshKey/);
    assert.match(feature, /nextQueue\.total === 0/);
    assert.match(feature, /key !== lastQueueRefreshKey/);
    assert.doesNotMatch(feature, /skipNextCompletionRefresh/);
  });

  it("maps legacy history templates by platform and scenario without replacing snapshots", async function () {
    const generation = read(
      "media-workbench/src/components/content/ArticleGenerationView.tsx",
    );
    const { resolveAvailableTemplateId } =
      await import("../media-workbench/src/article-history-logic.js");
    assert.equal(
      resolveAvailableTemplateId(
        { platform: "ctrip", scenario: "guide", templateId: "missing" },
        [{ id: "current", platform: "ctrip", scenario: "guide" }],
      ),
      "current",
    );
    assert.equal(
      resolveAvailableTemplateId(
        {
          platform: "ctrip",
          templateId: "deleted",
          templateSnapshot: {
            platform: "ctrip",
            id: "deleted",
            name: "Old",
            scenario: "guide",
            body: "old",
          },
        },
        [{ id: "current", platform: "ctrip", scenario: "guide" }],
      ),
      "deleted",
    );
    assert.match(generation, /resolveAvailableTemplateId/);
    assert.match(
      generation,
      /onArticleChange\(\{ \.\.\.currentArticle, templateId: resolvedTemplateId \}\)/,
    );
    assert.match(
      generation,
      /commands\.saveArticle\(\{ article: \{ \.\.\.editorArticle, templateId: resolvedTemplateId/,
    );
    assert.match(generation, /expectedFingerprint/);
    assert.match(generation, /templateId: resolvedTemplateId/);
  });
});
