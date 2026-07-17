const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("media resource ux", function() {
  it("keeps normalized balance and resource paging on the service boundary", function() {
    const service = read("desktop/services/media-resource-service.js");
    const library = read("media-workbench/src/components/ResourceLibrary.tsx");
    const app = read("media-workbench/src/App.tsx");
    assert.match(service, /extractBalanceValue/);
    assert.match(service, /balance:/);
    assert.match(library, /resource\.price/);
    assert.match(library, /setSearchQuery/);
    assert.match(library, /setCurrentPage/);
    assert.match(app, /getBalance/);
  });
});
