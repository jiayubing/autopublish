const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("desktop workbench flow", function() {
  it("keeps workspace switching stateful", function() {
    const source = read("desktop/renderer/app.js");
    assert.ok(source.includes("var initialized ="), "missing workspace init guard");
    assert.ok(source.includes('renderWorkspace("mediaWorkspace", true)'), "missing initial media render");
    assert.ok(source.includes('renderWorkspace("platformWorkspace", true)'), "missing initial platform render");
    assert.equal(source.includes("await renderWorkspace(id);"), false, "tab click still rerenders on every switch");
  });

  it("keeps platform batch selection in the page until explicit submit or refresh", function() {
    const source = read("desktop/renderer/platform-workbench.js");
    assert.ok(source.includes("selectedArticles"), "missing article selection state");
    assert.ok(source.includes("selectedPlatformIds"), "missing platform selection state");
    assert.ok(source.includes("clearSelection"), "missing explicit reset path");
    assert.ok(source.includes("applySelectionState"), "missing state reapply after rerender");
    assert.ok(source.includes("window.platformBatchDrawer.open"), "missing batch drawer handoff");
  });

  it("routes platform submission through the confirmation drawer and keeps the script order", function() {
    const drawer = read("desktop/renderer/platform-batch-drawer.js");
    const html = read("desktop/renderer/index.html");
    const preload = read("desktop/preload.js");

    assert.ok(drawer.includes("api.platforms.buildSelectedPlan"), "missing plan build call");
    assert.ok(drawer.includes("api.platforms.submitSelectedPlan"), "missing submit call");
    assert.ok(drawer.includes("window.drawer.open"), "missing confirmation drawer");
    assert.ok(html.includes("platform-batch-drawer.js"), "missing batch drawer script");
    assert.ok(
      html.indexOf("platform-batch-drawer.js") < html.indexOf("platform-workbench.js"),
      "batch drawer must load before platform workbench"
    );
    assert.equal(preload.includes("listResources"), false, "stale media preload alias still present");
    assert.equal(preload.includes("getCachedResources"), false, "stale media preload alias still present");
    assert.equal(preload.includes("searchResources"), false, "stale media preload alias still present");
  });
});
