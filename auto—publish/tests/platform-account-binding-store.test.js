"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createPlatformAccountBindingStore,
} = require("../desktop/services/platform-account-binding-store");

test("platform account bindings persist only platform and opaque fingerprint", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "platform-account-binding-"),
  );
  try {
    const store = createPlatformAccountBindingStore({ localStateRoot: root });
    const fingerprint = "a".repeat(64);
    store.bind({
      accountProfileId: "account-123",
      platformId: "toutiao",
      remoteFingerprint: fingerprint,
    });
    assert.deepEqual(
      createPlatformAccountBindingStore({ localStateRoot: root }).get(
        "account-123",
      ),
      { platformId: "toutiao", remoteFingerprint: fingerprint },
    );
    const serialized = fs.readFileSync(
      path.join(root, "platform-account-bindings.json"),
      "utf8",
    );
    assert.equal(serialized.includes("remote-account"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("unsafe or malformed existing binding state cannot be overwritten", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "platform-account-binding-unsafe-"),
  );
  const filename = path.join(root, "platform-account-bindings.json");
  try {
    fs.writeFileSync(filename, "not json", "utf8");
    const store = createPlatformAccountBindingStore({ localStateRoot: root });
    assert.equal(store.get("account-123"), null);
    assert.throws(
      () =>
        store.bind({
          accountProfileId: "account-123",
          platformId: "toutiao",
          remoteFingerprint: "a".repeat(64),
        }),
      /binding storage is invalid/,
    );
    assert.equal(fs.readFileSync(filename, "utf8"), "not json");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
