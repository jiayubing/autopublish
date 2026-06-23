import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { convertArticle } from "../src/core/article-converter.js";

// Helper: create a temp file and return its path + cleanup function
async function createTempFile(name, content) {
  const dir = join(tmpdir(), "media-test-" + Date.now());
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, name);
  await writeFile(filePath, content, "utf-8");
  return {
    filePath,
    async cleanup() {
      try { await unlink(filePath); } catch {}
    },
  };
}

describe("convertArticle — .txt", () => {
  it("should convert simple txt to HTML paragraphs", async () => {
    const { filePath, cleanup } = await createTempFile(
      "test.txt",
      "第一段。\n\n第二段。"
    );
    try {
      const result = await convertArticle(filePath);
      assert.ok(result.html.includes("<p>第一段。</p>"));
      assert.ok(result.html.includes("<p>第二段。</p>"));
      assert.strictEqual(result.plainText, "第一段。\n\n第二段。");
      assert.strictEqual(result.sourceFile, "test.txt");
    } finally {
      await cleanup();
    }
  });

  it("should escape HTML special chars in txt", async () => {
    const { filePath, cleanup } = await createTempFile(
      "escape.txt",
      '<script>alert("xss")</script>'
    );
    try {
      const result = await convertArticle(filePath);
      assert.ok(result.html.includes("&lt;script&gt;"));
      assert.ok(result.html.includes("&quot;"));
      // plainText should keep raw content
      assert.strictEqual(result.plainText, '<script>alert("xss")</script>');
    } finally {
      await cleanup();
    }
  });

  it("should throw on empty txt file", async () => {
    const { filePath, cleanup } = await createTempFile("empty.txt", "   \n\n  ");
    try {
      await assert.rejects(
        () => convertArticle(filePath),
        /内容为空/
      );
    } finally {
      await cleanup();
    }
  });
});

describe("convertArticle — unsupported format", () => {
  it("should throw for .pdf", async () => {
    await assert.rejects(
      () => convertArticle("test.pdf"),
      /不支持的文件格式.*\.pdf/
    );
  });

  it("should throw for unknown extension", async () => {
    await assert.rejects(
      () => convertArticle("test.rtf"),
      /不支持的文件格式.*\.rtf/
    );
  });
});

describe("convertArticle — .docx", () => {
  it("should throw for non-existent docx file", async () => {
    await assert.rejects(
      () => convertArticle("/nonexistent/file.docx"),
      /ENOENT/
    );
  });
});
