const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("media workbench flow", function() {
  it("keeps article editing and the shared media pool in the React app", function() {
    const app = read("media-workbench/src/App.tsx");
    const editor = read("media-workbench/src/components/ArticleEditor.tsx");
    const library = read("media-workbench/src/components/ResourceLibrary.tsx");
    assert.match(app, /activeArticle/);
    assert.match(app, /ArticleEditor/);
    assert.match(app, /ResourceLibrary/);
    assert.match(editor, /selectedResources/);
    assert.match(library, /id="mediaResourceLibraryRoot"/);
    assert.match(library, /mode === 'picker'/);
  });
});
