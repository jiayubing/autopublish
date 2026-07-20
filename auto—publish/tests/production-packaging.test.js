const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("production packaging contract", function () {
  it("inherits alpha boundaries while requiring signed ASAR production artifacts", function () {
    const config = fs.readFileSync(
      path.resolve(__dirname, "..", "electron-builder.production.yml"),
      "utf8",
    );
    assert.match(config, /extends:\s*\.\/electron-builder\.alpha\.yml/);
    assert.match(config, /^asar:\s*true$/m);
    assert.match(config, /forceCodeSigning:\s*true/);
    assert.match(config, /certificateFile:\s*"\$\{env\.WIN_CSC_LINK\}"/);
    assert.match(config, /asarUnpack:/);
    assert.match(config, /tools\/node\/\*\*\//);
    assert.match(config, /hepan_publish\.py/);
    assert.match(config, /resources\/hepan\/vendor-pure\/\*\*\//);
  });
});
