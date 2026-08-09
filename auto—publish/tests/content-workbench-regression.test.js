const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("content workbench static boundary", function () {
  it("defines the three content workbench tabs and shared refresh boundary", function () {
    const workbench = fs.readFileSync(
      path.resolve(
        __dirname,
        "..",
        "media-workbench/src/components/ContentWorkbench.tsx",
      ),
      "utf8",
    );
    for (const capability of [
      "questions",
      "generate",
      "history",
      "QuestionCollectionView",
      "ArticleGenerationView",
      "GeneratedArticlesView",
    ]) {
      assert.equal(
        workbench.includes(capability),
        true,
        `missing ${capability}`,
      );
    }
    assert.match(workbench, /onRefresh|refresh/);
  });
});
