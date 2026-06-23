import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resolveApiKey, maskApiKey } from "../src/core/config.js";

describe("resolveApiKey", () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = process.env.XQW_API_KEY;
    delete process.env.XQW_API_KEY;
  });

  afterEach(() => {
    if (savedEnv !== undefined) {
      process.env.XQW_API_KEY = savedEnv;
    } else {
      delete process.env.XQW_API_KEY;
    }
  });

  it("should use CLI key when provided", () => {
    const key = resolveApiKey("cli-key-12345");
    assert.strictEqual(key, "cli-key-12345");
  });

  it("should fall back to env var when CLI key is null", () => {
    process.env.XQW_API_KEY = "env-key-67890";
    const key = resolveApiKey(null);
    assert.strictEqual(key, "env-key-67890");
  });

  it("should throw when no key is available", () => {
    assert.throws(
      () => resolveApiKey(null),
      /缺少 API Key/
    );
  });

  it("should throw when env var is empty string", () => {
    process.env.XQW_API_KEY = "";
    assert.throws(
      () => resolveApiKey(null),
      /缺少 API Key/
    );
  });

  it("should prefer CLI key over env var", () => {
    process.env.XQW_API_KEY = "env-key";
    const key = resolveApiKey("cli-key");
    assert.strictEqual(key, "cli-key");
  });
});

describe("maskApiKey", () => {
  it("should mask middle part of a long key", () => {
    const masked = maskApiKey("abcdef1234567890");
    assert.strictEqual(masked, "abcd****7890");
  });

  it("should return **** for short keys", () => {
    assert.strictEqual(maskApiKey("short"), "****");
  });

  it("should return **** for null/undefined", () => {
    assert.strictEqual(maskApiKey(null), "****");
    assert.strictEqual(maskApiKey(undefined), "****");
  });
});
