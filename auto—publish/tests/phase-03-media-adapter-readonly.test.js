"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("media adapter returns remote results without importing or writing the legacy order JSON store", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "platforms", "media", "adapter.js"), "utf8");
  assert.doesNotMatch(source, /SubmissionOrderStore/);
  assert.doesNotMatch(source, /\.record\s*\(/);
  assert.match(source, /orderNid/);
});
