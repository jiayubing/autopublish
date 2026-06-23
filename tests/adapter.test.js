import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMediaAdapter } from "../src/platforms/media/adapter.js";

const TEST_API_KEY = "adapter-test-key-12345678";
let originalFetch;
let tempFiles = [];

async function createTempFile(name, content) {
  const filePath = join(tmpdir(), `adapter-test-${name}`);
  await writeFile(filePath, content, "utf-8");
  tempFiles.push(filePath);
  return filePath;
}

beforeEach(async () => {
  tempFiles = [];
  originalFetch = globalThis.fetch;
  process.env.XQW_API_KEY = TEST_API_KEY;
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  delete process.env.XQW_API_KEY;
  for (const f of tempFiles) {
    try { await unlink(f); } catch {}
  }
});

describe("createMediaAdapter.publish", () => {
  it("should return submitted status on success", async () => {
    globalThis.fetch = async (url) => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({
        code: 1,
        data: { order_nid: "ADAPTER-NID-001" },
      }),
    });

    const contentFile = await createTempFile("a.txt", "适配器测试内容。");
    const adapter = createMediaAdapter();

    const result = await adapter.publish({
      title: "适配器测试",
      contentFile,
      resourceId: "999",
      remark: "测试备注",
      thirdId: "TID-001",
    });

    assert.strictEqual(result.platform, "media");
    assert.strictEqual(result.status, "submitted");
    assert.strictEqual(result.orderNid, "ADAPTER-NID-001");
    assert.strictEqual(result.title, "适配器测试");
    assert.strictEqual(result.resourceId, "999");
    assert.strictEqual(result.thirdId, "TID-001");
    assert.ok(result.htmlContent.includes("<p>适配器测试内容。</p>"));
    assert.ok(result.raw);
  });

  it("should return error status on API failure", async () => {
    globalThis.fetch = async () => ({
      ok: false, status: 500,
      text: async () => JSON.stringify({ code: 0, msg: "服务器错误" }),
    });

    const contentFile = await createTempFile("err.txt", "错误测试。");
    const adapter = createMediaAdapter();

    const result = await adapter.publish({
      title: "错误测试",
      contentFile,
      resourceId: "1",
    });

    assert.strictEqual(result.platform, "media");
    assert.strictEqual(result.status, "error");
    assert.ok(result.error.includes("服务器错误"));
  });
});

describe("createMediaAdapter.queryOrder", () => {
  it("should return ok status on success", async () => {
    globalThis.fetch = async (url) => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({
        code: 1,
        data: [{ order_nid: "N-1", status: "已发布" }],
      }),
    });

    const adapter = createMediaAdapter();
    const result = await adapter.queryOrder("N-1");

    assert.strictEqual(result.platform, "media");
    assert.strictEqual(result.status, "ok");
    assert.strictEqual(result.orderNid, "N-1");
    assert.deepStrictEqual(result.raw.data[0].status, "已发布");
  });

  it("should return error status on network failure", async () => {
    globalThis.fetch = () => { throw new Error("ETIMEDOUT"); };

    const adapter = createMediaAdapter();
    const result = await adapter.queryOrder("N-2");

    assert.strictEqual(result.status, "error");
    assert.ok(result.error.includes("ETIMEDOUT"));
  });
});

describe("createMediaAdapter.getBalance", () => {
  it("should return balance info", async () => {
    globalThis.fetch = async (url) => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({
        code: 1,
        data: { balance: 500.00 },
      }),
    });

    const adapter = createMediaAdapter();
    const result = await adapter.getBalance();

    assert.strictEqual(result.platform, "media");
    assert.strictEqual(result.status, "ok");
    assert.strictEqual(result.raw.data.balance, 500.00);
  });

  it("should return error on failure", async () => {
    globalThis.fetch = async () => ({
      ok: false, status: 401,
      text: async () => JSON.stringify({ code: 0, msg: "Unauthorized" }),
    });

    const adapter = createMediaAdapter();
    const result = await adapter.getBalance();

    assert.strictEqual(result.status, "error");
    assert.ok(result.error.includes("Unauthorized"));
  });
});
