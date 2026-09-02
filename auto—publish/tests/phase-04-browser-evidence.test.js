"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createPlatformAdapter } = require("../src/platforms/lieju/adapter");

test("Lieju browser surface is login-only while publication stays on the regular submission port", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lieju-browser-surface-"));
  try {
    const adapter = createPlatformAdapter({
      browserRuntime: {
        stateFile: path.join(root, "lieju.json"),
      },
    });

    assert.equal(typeof adapter.openLogin, "function");
    assert.equal(typeof adapter.checkLogin, "function");
    assert.equal(typeof adapter.saveSession, "function");
    assert.equal(typeof adapter.closeSession, "function");
    assert.equal(typeof adapter.preparePlatformSubmission, "function");

    assert.equal(Object.hasOwn(adapter, "publishArticle"), false);
    assert.equal(Object.hasOwn(adapter, "withHttpGetPort"), false);
    assert.equal(Object.hasOwn(adapter, "ensureLoggedIn"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
