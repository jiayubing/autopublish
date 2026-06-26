const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { convertArticle } = require("../src/platforms/media/article-converter");

describe("media article converter", function() {
  let dir;

  beforeEach(function() {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "media-converter-"));
  });

  afterEach(function() {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("converts markdown articles to html", async function() {
    const filePath = path.join(dir, "a.md");
    fs.writeFileSync(filePath, "# Title A\n\nBody paragraph", "utf-8");

    const result = await convertArticle(filePath);
    assert.match(result.html, /<h1>Title A<\/h1>/);
    assert.match(result.html, /<p>Body paragraph<\/p>/);
    assert.strictEqual(result.sourceFile, "a.md");
  });
});
