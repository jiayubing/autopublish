const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, "media-workbench/src", file), "utf8");

describe("renderer platform cross-page progress contract", function() {
  it("mounts one task provider at App root and consumes it from the workbench", function() {
    assert.match(read("App.tsx"), /PlatformTaskProvider/);
    assert.match(read("components/PlatformWorkbench.tsx"), /usePlatformTask/);
    assert.match(read("components/Sidebar.tsx"), /usePlatformTask/);
    assert.match(read("components/PlatformWorkbench.tsx"), /已处理/);
  });
});
