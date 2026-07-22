const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const LEGACY_BATCH_REFERENCES = /desktop:(?:get-state|refresh-queue|start-batch|stop-batch)|desktopConsole\.batch|\.batch\.(?:getState|refreshQueue|startBatch|stopBatch)/;

function filesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(function(entry) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesBelow(filename);
    return /\.(?:[cm]?[jt]sx?)$/.test(entry.name) ? [filename] : [];
  });
}

describe("legacy publication batch path audit", function() {
  it("has no current renderer or command-line caller", function() {
    const productRoots = ["media-workbench/src", "scripts"];
    const callers = productRoots.flatMap(function(relativeRoot) {
      const absoluteRoot = path.join(ROOT, relativeRoot);
      return filesBelow(absoluteRoot).flatMap(function(filename) {
        return LEGACY_BATCH_REFERENCES.test(fs.readFileSync(filename, "utf8"))
          ? [path.relative(ROOT, filename)]
          : [];
      });
    });

    assert.deepEqual(callers, [], "New product callers must use the platform submission runtime instead of the deprecated batch path");

    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const legacyScript = Object.entries(packageJson.scripts || {}).find(function(entry) {
      return LEGACY_BATCH_REFERENCES.test(entry[1]);
    });
    assert.equal(legacyScript, undefined, "Package commands must not invoke the deprecated batch path");
  });
});
