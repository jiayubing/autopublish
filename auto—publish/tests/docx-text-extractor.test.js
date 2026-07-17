const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { extractDocxText, extractDocxArticle } = require("../src/core/docx-text-extractor");

const fixture = fs.readFileSync(path.join(__dirname, "fixtures", "docx", "customer-material.docx"));
const emptyFixture = fs.readFileSync(path.join(__dirname, "fixtures", "docx", "empty.docx"));

describe("docx text extractor", function() {
  it("extracts real Chinese and English paragraphs and derives an article", async function() {
    const first = await extractDocxText({ buffer: fixture });
    const second = await extractDocxText({ buffer: fixture });
    const article = await extractDocxArticle({ buffer: fixture, fallbackTitle: "fallback" });

    assert.equal(first, "客户资料标题\n\nEnglish context paragraph.\n\n第二段中文正文。");
    assert.equal(second, first);
    assert.deepEqual(article, {
      title: "客户资料标题",
      body: "English context paragraph.\n\n第二段中文正文。",
      text: first
    });
  });

  it("maps an empty DOCX to a stable error", async function() {
    await assert.rejects(extractDocxText({ buffer: emptyFixture }), function(error) {
      return error.code === "MATERIAL_DOCX_EMPTY" && error.message === "DOCX does not contain readable text";
    });
  });

  it("maps a damaged ZIP and invalid input without exposing the parser exception", async function() {
    await assert.rejects(extractDocxText({ buffer: Buffer.from("not a docx") }), function(error) {
      return error.code === "MATERIAL_DOCX_CONVERSION_FAILED" && error.message === "DOCX conversion failed";
    });
    await assert.rejects(extractDocxText({ buffer: "not a buffer" }), function(error) {
      return error.code === "MATERIAL_DOCX_INVALID" && error.message === "DOCX input is invalid";
    });
  });
});
