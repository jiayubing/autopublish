const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { it } = require("node:test");
const { parseArticleFiles } = require("../src/core/articles");

it("parses an article DOCX with the bundled extractor and keeps the source path", async function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "articles-docx-"));
  const source = path.join(root, "customer-material.docx");
  fs.copyFileSync(path.join(__dirname, "fixtures", "docx", "customer-material.docx"), source);
  try {
    const parsed = await parseArticleFiles([{ file: source, filename: "customer-material.docx", fileBaseName: "customer-material" }]);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].title, "\u5ba2\u6237\u8d44\u6599\u6807\u9898");
    assert.match(parsed[0].body, /English context paragraph/);
    assert.match(parsed[0].body, /\u7b2c\u4e8c\u6bb5\u4e2d\u6587\u6b63\u6587/);
    assert.equal(parsed[0].sourceFile, source);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
