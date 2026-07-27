const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("Phase 06 article editor confirmation", function() {
  it("queues unsaved draft close through the renderer confirmation host", function() {
    const source = fs.readFileSync(
      path.resolve(__dirname, "..", "media-workbench", "src", "components", "ArticleEditor.tsx"),
      "utf8",
    );

    assert.match(source, /useConfirmation\(\)/);
    assert.match(source, /await confirm\(\{/);
    assert.doesNotMatch(source, /window\.confirm|globalThis\.confirm/);
  });

  it("does not retain a second content-workbench confirmation modal", function() {
    const source = fs.readFileSync(
      path.resolve(__dirname, "..", "media-workbench", "src", "components", "ContentWorkbench.tsx"),
      "utf8",
    );

    assert.match(source, /useConfirmation\(\)/);
    assert.doesNotMatch(source, /ActionConfirmationModal|pendingConfirmation|confirmationActionRef/);
  });

  it("uses the host for a dirty generated-article editor close", function() {
    const source = fs.readFileSync(
      path.resolve(__dirname, "..", "media-workbench", "src", "components", "content", "GeneratedArticleEditorPanel.tsx"),
      "utf8",
    );

    assert.match(source, /useConfirmation\(\)/);
    assert.match(source, /await confirm\(\{/);
    assert.doesNotMatch(source, /ActionConfirmationModal|confirmClose/);
  });

  it("does not retain a content-history confirmation modal", function() {
    const source = fs.readFileSync(
      path.resolve(__dirname, "..", "media-workbench", "src", "components", "content", "GeneratedArticlesView.tsx"),
      "utf8",
    );

    assert.match(source, /useConfirmation\(\)/);
    assert.doesNotMatch(source, /ActionConfirmationModal|pendingConfirmation|confirmationActionRef/);
  });
});
