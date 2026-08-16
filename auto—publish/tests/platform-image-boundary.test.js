"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function javascriptFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...javascriptFiles(target));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(target);
  }
  return files;
}

test("platforms depend only on ImagePlanV1 and the injected asset reader boundary", () => {
  const platformsRoot = path.resolve(__dirname, "../src/platforms");
  const forbidden =
    /client-image-(?:cache|library|metadata|path-policy|reference|scanner|selector)/;
  const violations = javascriptFiles(platformsRoot)
    .filter((filename) => forbidden.test(fs.readFileSync(filename, "utf8")))
    .map((filename) => path.relative(platformsRoot, filename));
  assert.deepEqual(violations, []);

  const planService = fs.readFileSync(
    path.resolve(
      __dirname,
      "../desktop/services/regular-image-plan-service.js",
    ),
    "utf8",
  );
  assert.doesNotMatch(planService, /client-image-/);
});
