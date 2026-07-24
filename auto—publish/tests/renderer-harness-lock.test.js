const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  BUILD_LOCK_STALE_MS,
  isStaleBuildLock,
} = require("./helpers/renderer-harness");

test("renderer build lock reclaims only old locks without a live owner", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "renderer-lock-contract-"),
  );
  const filename = path.join(root, "build.lock");
  const now = Date.now();
  try {
    fs.writeFileSync(filename, "", "utf8");
    fs.utimesSync(
      filename,
      new Date(now - BUILD_LOCK_STALE_MS - 1000),
      new Date(now - BUILD_LOCK_STALE_MS - 1000),
    );
    assert.equal(isStaleBuildLock(filename, now), true);
    fs.writeFileSync(filename, JSON.stringify({ pid: process.pid }), "utf8");
    fs.utimesSync(
      filename,
      new Date(now - BUILD_LOCK_STALE_MS - 1000),
      new Date(now - BUILD_LOCK_STALE_MS - 1000),
    );
    assert.equal(isStaleBuildLock(filename, now), false);
    fs.writeFileSync(filename, "", "utf8");
    assert.equal(isStaleBuildLock(filename, now), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
