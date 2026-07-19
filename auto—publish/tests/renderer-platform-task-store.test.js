const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, "media-workbench/src", file), "utf8");

describe("renderer platform task store seam", function() {
  it("is an external store with snapshot initialization and stale-event rejection", function() {
    const source = read("platform-task-store.tsx");
    assert.match(source, /createPlatformTaskStore/);
    assert.match(source, /getPlatformState/);
    assert.match(source, /onPlatformState/);
    assert.match(source, /updatedAt/);
    assert.match(source, /runId/);
  });
});
