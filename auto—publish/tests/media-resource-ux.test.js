const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("media resource ux", function() {
  it("shows balance and price fields and keeps the resource search input stable", function() {
    const service = read("desktop/services/media-resource-service.js");
    const library = read("desktop/renderer/media-resource-library.js");
    const workbench = read("desktop/renderer/media-workbench.js");

    assert.ok(service.includes("extractBalanceValue"), "missing normalized balance extraction");
    assert.ok(service.includes("balance:"), "missing normalized balance dto");
    assert.ok(library.includes("resource.price"), "missing pool/resource price rendering");
    assert.ok(library.includes("setTimeout"), "missing search debounce");
    assert.ok(library.includes("restoreSearchFocus"), "missing search focus restore state");
    assert.ok(library.includes("setSelectionRange"), "missing search cursor restore");
    assert.ok(workbench.includes("余额: "), "missing readable balance display");
  });
});
