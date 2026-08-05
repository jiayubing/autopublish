"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const asar = require("@electron/asar");

const root = path.resolve(__dirname, "..");
const artifact = path.join(
  root,
  "release-production-smoke",
  "win-unpacked",
  "resources",
  "app.asar",
);
const operationalStoreRelative = path.join(
  "src",
  "infrastructure",
  "operational-store",
  "operational-store.js",
);
const mediaOrderServiceRelative = path.join(
  "desktop",
  "services",
  "media-order-service.js",
);
const retiredOwners = ["reconcileRemoteOrder", "supplierStatusOrFallback"];

function sourceFilesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(target);
    return /\.(?:js|mjs|cjs|ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

function assertOwnersAbsent(source, label) {
  for (const owner of retiredOwners)
    assert.equal(source.includes(owner), false, `${label}:${owner}`);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

test("source, import, export, and tests physically omit retired remote-order owners", () => {
  const roots = ["desktop", "src", "scripts", "media-workbench/src", "tests"];
  for (const file of roots.flatMap((relative) => sourceFilesUnder(path.join(root, relative)))) {
    if (file === __filename) continue;
    assertOwnersAbsent(fs.readFileSync(file, "utf8"), path.relative(root, file));
  }
});

test("the current packaged ASAR physically omits retired remote-order owners", () => {
  assert.ok(fs.existsSync(artifact), `current artifact missing: ${artifact}`);
  for (const relative of [operationalStoreRelative, mediaOrderServiceRelative]) {
    assertOwnersAbsent(
      asar.extractFile(artifact, relative).toString("utf8"),
      `app.asar:${relative}`,
    );
  }
});

test("the two packaged order owners exactly match current production source", () => {
  assert.ok(fs.existsSync(artifact), `current artifact missing: ${artifact}`);
  for (const relative of [operationalStoreRelative, mediaOrderServiceRelative]) {
    const packaged = asar.extractFile(artifact, relative);
    const source = fs.readFileSync(path.join(root, relative));
    assert.equal(
      sha256(packaged),
      sha256(source),
      `${relative}: packaged owner hash differs from current source`,
    );
    assert.deepEqual(
      packaged,
      source,
      relative,
    );
  }
});
