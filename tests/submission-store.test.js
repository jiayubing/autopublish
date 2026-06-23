import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SubmissionStore } from "../src/core/submission-store.js";

describe("SubmissionStore", () => {
  let storePath;
  let store;

  beforeEach(() => {
    storePath = join(tmpdir(), `test-submissions-${Date.now()}.jsonl`);
    store = new SubmissionStore({ storePath });
  });

  afterEach(async () => {
    try { await unlink(storePath); } catch {}
  });

  it("should write a valid JSONL record", async () => {
    await store.record({
      command: "submit",
      dryRun: true,
      params: { resource_id: "123", title: "测试", content: "<p>Hi</p>" },
      result: { success: true, data: { order_nid: "N-001" } },
    });

    const raw = await readFile(storePath, "utf-8");
    const lines = raw.trim().split("\n");
    assert.strictEqual(lines.length, 1);

    const entry = JSON.parse(lines[0]);
    assert.strictEqual(entry.command, "submit");
    assert.strictEqual(entry.dryRun, true);
    assert.strictEqual(entry.params.resource_id, "123");
    assert.strictEqual(entry.params.title, "测试");
    assert.strictEqual(entry.result.success, true);
    assert.strictEqual(entry.result.data.order_nid, "N-001");
    assert.ok(entry.ts);
  });

  it("should mask api_key in recorded params", async () => {
    await store.record({
      command: "order",
      dryRun: false,
      params: { api_key: "secret-key-1234567890", order_nids: ["X"] },
      result: { success: true },
    });

    const raw = await readFile(storePath, "utf-8");
    const entry = JSON.parse(raw.trim());
    assert.strictEqual(entry.params.api_key, "secr****7890");
  });

  it("should record error results", async () => {
    await store.record({
      command: "submit",
      dryRun: false,
      params: { resource_id: "456" },
      result: { success: false, error: "API 请求失败: 余额不足" },
    });

    const raw = await readFile(storePath, "utf-8");
    const entry = JSON.parse(raw.trim());
    assert.strictEqual(entry.result.success, false);
    assert.strictEqual(entry.result.error, "API 请求失败: 余额不足");
    assert.strictEqual(entry.result.data, undefined);
  });

  it("should append multiple records", async () => {
    for (let i = 0; i < 3; i++) {
      await store.record({
        command: "submit",
        dryRun: true,
        params: { idx: i },
        result: { success: true },
      });
    }

    const raw = await readFile(storePath, "utf-8");
    const lines = raw.trim().split("\n");
    assert.strictEqual(lines.length, 3);
    assert.strictEqual(JSON.parse(lines[0]).params.idx, 0);
    assert.strictEqual(JSON.parse(lines[2]).params.idx, 2);
  });
});
