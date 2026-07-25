"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("browser adapters do not retain page-wide weak success predicates", () => {
  const root = path.resolve(__dirname, "..");
  const toutiao = fs.readFileSync(path.join(root, "src/platforms/toutiao/adapter.js"), "utf8");
  const lieju = fs.readFileSync(path.join(root, "src/platforms/lieju/adapter.js"), "utf8");
  assert.doesNotMatch(toutiao, /verifyPublishFromArticleList\(article\.title/);
  assert.doesNotMatch(lieju, /PUBLISH_SUCCESS_WORDS/);
  assert.doesNotMatch(lieju, /function\s+isPublishSuccessPage/);
  assert.doesNotMatch(lieju, /status:\s*"published"/);
});
