const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("media renderer resource library api", function() {
  it("uses the paged service methods directly", function() {
    const workbench = read("desktop/renderer/media-workbench.js");
    const library = read("desktop/renderer/media-resource-library.js");

    assert.match(workbench, /api\.media\.refreshResources\(\{ fetchAll: true \}\)/);
    assert.match(library, /api\.media\.getResourcePage\(\{ page: page, pageSize: perPage \}\)/);
    assert.match(library, /api\.media\.searchResourcePage\(\{ keyword: keyword, page: page, pageSize: perPage \}\)/);

    assert.equal(workbench.includes("listResources"), false);
    assert.equal(library.includes("getCachedResources"), false);
    assert.equal(library.includes("searchResources"), false);
  });
});
