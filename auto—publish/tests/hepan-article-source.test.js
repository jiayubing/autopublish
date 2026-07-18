const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  MAX_ARTICLE_BYTES,
  parseArticle,
  scanArticles
} = require("../src/platforms/hepan/article-source");

function tempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "auto-publish-hepan-source-"));
}

describe("Hepan article source", () => {
  it("parses BOM/CRLF Markdown into safe HTML and rejects raw HTML and dangerous URLs", () => {
    const root = tempDirectory();
    const filename = path.join(root, "river-note.markdown");
    try {
      fs.writeFileSync(filename, Buffer.from("\uFEFF# 河畔标题\r\n\r\n正文 **加粗**，<script>alert(1)</script>。\r\n\r\n[安全链接](https://example.com) [危险链接](javascript:alert(1))\r\n", "utf8"));

      const article = parseArticle(filename);

      assert.deepEqual(article, {
        title: "河畔标题",
        contentHtml: '<p>正文 <strong>加粗</strong>，&lt;script&gt;alert(1)&lt;/script&gt;。</p>\n<p><a href="https://example.com/">安全链接</a> 危险链接</p>',
        sourceStem: "river-note",
        sourceFormat: "markdown"
      });
      assert.doesNotMatch(article.contentHtml, /<script|javascript:|onerror=/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses the first non-empty TXT line as title and preserves safe paragraphs", () => {
    const root = tempDirectory();
    const filename = path.join(root, "plain.txt");
    try {
      fs.writeFileSync(filename, "\uFEFF\r\n标题\r\n第一段 <b>文本</b>\r\n仍在第一段\r\n\r\n第二段 & 内容\r\n", "utf8");

      assert.deepEqual(parseArticle(filename), {
        title: "标题",
        contentHtml: "<p>第一段 &lt;b&gt;文本&lt;/b&gt;<br />仍在第一段</p>\n<p>第二段 &amp; 内容</p>",
        sourceStem: "plain",
        sourceFormat: "txt"
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("scans supported ordinary files while excluding sidecars, temporary files, and symlinks", () => {
    const root = tempDirectory();
    try {
      for (const name of ["a.md", "b.markdown", "c.txt", "d.docx"]) fs.writeFileSync(path.join(root, name), "x");
      for (const name of ["a.md.submission.json", "~$draft.docx", "ignore.pdf", ".stage.md"]) fs.writeFileSync(path.join(root, name), "x");
      try { fs.symlinkSync(path.join(root, "a.md"), path.join(root, "linked.md")); } catch (_) {}

      assert.deepEqual(scanArticles(root).map((item) => item.filename), ["a.md", "b.markdown", "c.txt", "d.docx"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns stable article errors for invalid extension, empty values, invalid UTF-8, and oversized input", () => {
    const root = tempDirectory();
    try {
      const cases = [
        ["bad.pdf", Buffer.from("title\nbody", "utf8"), "HEPAN_ARTICLE_INVALID_EXTENSION"],
        ["empty.md", Buffer.from("\uFEFF\r\n\r\n", "utf8"), "HEPAN_ARTICLE_EMPTY_TITLE"],
        ["no-body.md", Buffer.from("# title\r\n", "utf8"), "HEPAN_ARTICLE_EMPTY_BODY"],
        ["bad.txt", Buffer.from([0xc3, 0x28]), "HEPAN_ARTICLE_INVALID_ENCODING"],
        ["large.txt", Buffer.alloc(MAX_ARTICLE_BYTES + 1, 0x61), "HEPAN_ARTICLE_TOO_LARGE"]
      ];

      for (const [name, content, code] of cases) {
        const filename = path.join(root, name);
        fs.writeFileSync(filename, content);
        assert.throws(() => parseArticle(filename), (error) => error.code === code);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
