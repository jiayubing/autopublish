const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("media workbench flow", function() {
  it("keeps article details inline and selection inside the shared media pool", function() {
    const workbench = read("desktop/renderer/media-workbench.js");
    const drawer = read("desktop/renderer/media-article-drawer.js");
    const library = read("desktop/renderer/media-resource-library.js");

    assert.ok(workbench.includes('id="mediaArticlePanelRoot"'));
    assert.ok(workbench.includes("articlePanelOpen"));
    assert.ok(workbench.includes("window.mediaArticleDrawer.render()"));
    assert.ok(drawer.includes("已选媒体摘要"));
    assert.ok(drawer.includes("右侧媒体池"));
    assert.ok(library.includes("picker"));
    assert.ok(library.includes("setActiveArticleLabel"));
    assert.ok(library.includes("取消选择"));
  });
});
