const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
}

describe("desktop workbench flow", function () {
  it("loads the React production renderer from the packaged dist entry", function () {
    const main = read("desktop/main.js");
    const packaging = read("electron-builder.alpha.yml");
    assert.match(main, /media-workbench["\\']?,\s*["\\']dist["\\']?/);
    assert.match(main, /rendererEntryPath/);
    assert.match(packaging, /media-workbench\/dist/);
    assert.doesNotMatch(packaging, /desktop[\\/]renderer/);
    assert.doesNotMatch(main, /desktop[\\/]renderer/);
  });
});
