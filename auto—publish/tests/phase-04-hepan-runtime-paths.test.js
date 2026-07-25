"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { resolveHepanScriptPath } = require("../src/platforms/hepan/runtime-paths");

test("Hepan production resolver chooses an unpacked ordinary script", () => {
  const original = process.resourcesPath;
  process.resourcesPath = path.join("C:", "fixture-resources");
  try {
    const expected = path.join(process.resourcesPath, "app.asar.unpacked", "src", "platforms", "hepan", "hepan_publish.py");
    const actual = resolveHepanScriptPath({ fs: { lstatSync: (candidate) => ({ isFile: () => candidate === expected }) } });
    assert.equal(actual, expected);
  } finally {
    process.resourcesPath = original;
  }
});
