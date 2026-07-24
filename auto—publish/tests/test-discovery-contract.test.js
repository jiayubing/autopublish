const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { collectTestFiles } = require("../scripts/run-tests");

const root = path.resolve(__dirname, "..");

test("default test discovery collects both JavaScript module extensions", () => {
  const files = collectTestFiles();
  assert.ok(
    files.some((file) =>
      file.endsWith("platform-submission-controller.test.mjs"),
    ),
  );
  assert.ok(files.some((file) => file.endsWith(".test.js")));
  assert.deepEqual(
    files,
    [...files].sort((left, right) => left.localeCompare(right)),
  );
  assert.equal(new Set(files).size, files.length);
  assert.ok(files.every((file) => !file.includes("node_modules")));
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts
      .test,
    "node scripts/run-tests.js",
  );
  assert.match(
    fs.readFileSync(path.join(root, "scripts", "run-tests.js"), "utf8"),
    /--test-concurrency=1/,
  );
});
