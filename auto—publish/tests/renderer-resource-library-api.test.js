const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("React renderer resource library api", function () {
  it("does not expose a fake local media creation action without a typed capability", function () {
    const app = read("media-workbench/src/App.tsx");
    const library = read("media-workbench/src/components/ResourceLibrary.tsx");
    const feature = read("media-workbench/src/features/media/media-feature.js");
    assert.doesNotMatch(app, /onAddResource/);
    assert.doesNotMatch(
      library,
      /onAddResource|showAddForm|RES-\$\{|添加媒体|录入新媒体资源/,
    );
    assert.doesNotMatch(feature, /addSelectedResource/);
  });
});
