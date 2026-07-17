const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("media article editor boundary", function() {
  it("keeps preview, editing, and selected media removal inside the React editor", function() {
    const editor = read("media-workbench/src/components/ArticleEditor.tsx");
    assert.match(editor, /activeArticle\.content/);
    assert.match(editor, /onSaveDraft/);
    assert.match(editor, /onRemoveSelectedResource/);
    assert.match(editor, /selectedResources/);
    assert.doesNotMatch(editor, /createMediaResourceLibrary|mediaResourceLibraryRoot/);
  });
});
