const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, "media-workbench/src", file), "utf8");

describe("renderer platform task store seam", function() {
  it("deletes the legacy task store after the platform feature owns run lifecycle", function() {
    assert.equal(fs.existsSync(path.join(root, "media-workbench/src/platform-task-store.tsx")), false);
    const feature = read("features/platform/platform-feature.js");
    const provider = read("features/platform/platform-feature-context.tsx");
    assert.match(feature, /start\(\)/);
    assert.match(feature, /applyRunSnapshot/);
    assert.match(provider, /getPlatformState/);
    assert.match(provider, /onPlatformState/);
  });
});
