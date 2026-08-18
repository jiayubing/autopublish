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
    assert.throws(
      () => store.get("account-123"),
      (error) => error.code === "PLATFORM_ACCOUNT_BINDING_STORAGE_INVALID",
    );
    assert.throws(
      () =>
        store.bind({
          accountProfileId: "account-123",
          platformId: "toutiao",
          remoteFingerprint: "a".repeat(64),
        }),
      (error) => error.code === "PLATFORM_ACCOUNT_BINDING_STORAGE_INVALID",
    );
    assert.equal(fs.readFileSync(filename, "utf8"), "not json");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("platform account binding can be explicitly removed without exposing the remote identity", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "platform-account-binding-remove-"),
  );
  try {
    const store = createPlatformAccountBindingStore({ localStateRoot: root });
    store.bind({
      accountProfileId: "account-123",
      platformId: "lieju",
      remoteFingerprint: "b".repeat(64),
    });
    assert.equal(store.remove("account-123"), true);
    assert.equal(store.get("account-123"), null);
    assert.equal(store.remove("account-123"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a malformed individual binding entry fails closed and cannot be overwritten", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "platform-account-binding-entry-invalid-"),
  );
  const filename = path.join(root, "platform-account-bindings.json");
  try {
    fs.writeFileSync(
      filename,
      JSON.stringify(
        {
          version: 1,
          bindings: {
            "account-123": {
              platformId: "lieju",
              remoteFingerprint: "not-a-fingerprint",
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    const store = createPlatformAccountBindingStore({ localStateRoot: root });
    assert.throws(
      () => store.get("account-123"),
      (error) => error.code === "PLATFORM_ACCOUNT_BINDING_STORAGE_INVALID",
    );
    assert.throws(
      () =>
        store.bind({
          accountProfileId: "account-123",
          platformId: "lieju",
          remoteFingerprint: "c".repeat(64),
        }),
      (error) => error.code === "PLATFORM_ACCOUNT_BINDING_STORAGE_INVALID",
    );
    const persisted = JSON.parse(fs.readFileSync(filename, "utf8"));
    assert.equal(
      persisted.bindings["account-123"].remoteFingerprint,
      "not-a-fingerprint",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
