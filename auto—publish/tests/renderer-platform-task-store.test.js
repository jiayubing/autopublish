const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

describe("renderer platform task store seam", function() {
  it("keeps the legacy task store absent after the platform feature owns run lifecycle", function() {
    assert.equal(fs.existsSync(path.join(root, "media-workbench/src/platform-task-store.tsx")), false);
  });
});
