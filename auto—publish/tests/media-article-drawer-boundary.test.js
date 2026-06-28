const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("media article drawer boundary", function() {
  it("keeps the drawer article-only and lets the workbench own the shared resource library", function() {
    const drawer = read("desktop/renderer/media-article-drawer.js");
    const workbench = read("desktop/renderer/media-workbench.js");

    assert.ok(!drawer.includes("createMediaResourceLibrary("), "drawer should not create its own resource library");
    assert.ok(!drawer.includes("bind(libRoot"), "drawer should not bind a resource library root");
    assert.ok(drawer.includes("renderSelectedResources"), "drawer should still show the selected media summary");
    assert.ok(workbench.includes("createMediaResourceLibrary(api,"), "workbench should own the shared resource library");
    assert.ok(workbench.includes("mode: \"management\""), "workbench should initialize the shared resource library in management mode");
    assert.ok(workbench.includes("resourceLib.bind(libRoot, refreshLibrary)"), "workbench should bind the shared resource library");
  });
});
