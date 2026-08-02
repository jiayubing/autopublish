"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const asar = require("@electron/asar");

const root = path.resolve(__dirname, "..");
const legacyPaths = [
  "src/core/jobs.js",
  "desktop/services/submission/action.js",
  "desktop/services/submission/preparation.js",
  "desktop/services/submission/query.js",
  "desktop/services/submission/read-snapshot.js",
  "desktop/services/submission/submission-action.js",
  "desktop/services/submission/submission-preparation.js",
  "desktop/services/submission/submission-query.js",
  "desktop/services/submission/submission-read-snapshot.js",
  "src/platforms/media/preflight.js",
];

function sourceFilesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(target);
    return /\.(?:js|mjs|cjs|ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

test("legacy publication and media files are physically absent from the production source tree", () => {
  for (const relative of legacyPaths) {
    assert.equal(fs.existsSync(path.join(root, relative)), false, relative);
  }
});

test("production import graph has no reference to a named legacy module", () => {
  const productionRoots = ["desktop", "src", "scripts", "media-workbench/src"];
  const moduleReferences = [
    /(?:^|[/\\])core[/\\]jobs(?:\.js)?$/,
    /submission[/\\]submission-preparation(?:\.js)?$/,
    /submission[/\\]submission-query(?:\.js)?$/,
    /platforms[/\\]media[/\\]preflight(?:\.js)?$/,
  ];
  for (const file of productionRoots.flatMap((relative) =>
    sourceFilesUnder(path.join(root, relative)),
  )) {
    const source = fs.readFileSync(file, "utf8");
    const specifiers = Array.from(
      source.matchAll(/(?:require\(\s*|from\s+)["']([^"']+)["']/g),
      (match) => match[1],
    );
    for (const specifier of specifiers) {
      assert.equal(
        moduleReferences.some((pattern) => pattern.test(specifier)),
        false,
        `${path.relative(root, file)} -> ${specifier}`,
      );
    }
  }
});

test("the current packaged ASAR contains none of the named legacy paths", () => {
  const artifact = path.join(
    root,
    "release-alpha/win-unpacked/resources/app.asar",
  );
  if (!fs.existsSync(artifact)) return;
  const entries = new Set(
    asar
      .listPackage(artifact)
      .map((entry) => entry.replace(/^[/\\]/, "").replaceAll("\\", "/")),
  );
  for (const relative of legacyPaths)
    assert.equal(entries.has(relative), false, relative);
});
