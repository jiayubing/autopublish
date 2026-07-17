const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("React renderer resource library api", function() {
  it("uses the paged media service methods directly", function() {
    const app = read("media-workbench/src/App.tsx");
    const api = read("media-workbench/src/electron-api.ts");
    assert.match(app, /refreshResources\(\{ fetchAll: true \}\)/);
    assert.match(app, /getResourcePage\(\{ page: 1, pageSize: 99999 \}\)/);
    assert.match(api, /getResourcePage/);
    assert.match(api, /searchResourcePage/);
    assert.doesNotMatch(app, /listResources|getCachedResources|searchResources/);
    assert.doesNotMatch(api, /listResources|getCachedResources|searchResources/);
  });
});
