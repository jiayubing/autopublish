const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("media article drawer boundary", function() {
  it("keeps the article detail focused on preview, editing, and selected media summary", function() {
    const drawer = read("desktop/renderer/media-article-drawer.js");

    assert.ok(drawer.includes("已选媒体摘要"), "drawer should show the selected media summary");
    assert.ok(drawer.includes("右侧媒体池"), "drawer should point selection to the shared media pool");
    assert.ok(drawer.includes("data-remove-selected-resource"), "drawer should let users remove selected media from the summary");
    assert.equal(drawer.includes("createMediaResourceLibrary("), false, "drawer should not create its own resource library");
    assert.equal(drawer.includes("mediaResourceLibraryRoot"), false, "drawer should not own the resource library root");
  });
});
