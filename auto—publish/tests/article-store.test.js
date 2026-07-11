const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createArticleStore } = require("../src/content/article-store");

describe("article store", function() {
  let root;
  let store;

  beforeEach(function() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "article-store-"));
    store = createArticleStore(root);
  });

  afterEach(function() { fs.rmSync(root, { recursive: true, force: true }); });

  function valid(id, overrides) {
    return Object.assign({
      id: id,
      clientId: "client-1",
      researchQueryId: "query-1",
      platform: "ctrip",
      scenario: "guide",
      templateId: "template-1",
      title: "A useful title",
      content: "A useful article body.",
      status: "generated",
      source: { client_material: true, doubao_answer: true, references: false, template: true },
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z"
    }, overrides || {});
  }

  it("saves and reads a complete generated article", function() {
    const article = valid("article-1");
    assert.deepStrictEqual(store.saveArticle(article), article);
    assert.deepStrictEqual(store.getArticle("client-1", "article-1"), article);
  });

  it("writes editable markdown alongside full JSON metadata", function() {
    const article = valid("article-1");
    store.saveArticle(article);
    const directory = path.join(root, "generated", "client-1");
    const markdown = fs.readFileSync(path.join(directory, "article-1.md"), "utf8");
    const metadata = JSON.parse(fs.readFileSync(path.join(directory, "article-1.json"), "utf8"));
    assert.match(markdown, /title: "A useful title"/);
    assert.match(markdown, /A useful article body\./);
    assert.deepStrictEqual(metadata, article);
  });

  it("replaces both files when saving an updated article id", function() {
    store.saveArticle(valid("article-1"));
    const updated = valid("article-1", { title: "Updated title", content: "Updated body.", updatedAt: "2026-07-11T01:00:00.000Z" });
    assert.deepStrictEqual(store.saveArticle(updated), updated);
    assert.deepStrictEqual(store.getArticle("client-1", "article-1"), updated);
    assert.match(fs.readFileSync(path.join(root, "generated", "client-1", "article-1.md"), "utf8"), /Updated body\./);
  });

  it("lists direct article JSON records by updatedAt descending", function() {
    const older = valid("older", { updatedAt: "2026-07-11T00:00:00.000Z" });
    const newer = valid("newer", { updatedAt: "2026-07-11T01:00:00.000Z" });
    store.saveArticle(older);
    store.saveArticle(newer);
    fs.mkdirSync(path.join(root, "generated", "client-1", "nested"));
    fs.writeFileSync(path.join(root, "generated", "client-1", "nested", "ignored.json"), JSON.stringify(valid("ignored")));
    assert.deepStrictEqual(store.listArticles("client-1").map(function(article) { return article.id; }), ["newer", "older"]);
  });

  it("rejects unsafe client and article path segments", function() {
    ["../client", "client/path", "client\\path", ".", "..", " ", "client. ", path.resolve(root, "outside")].forEach(function(clientId) {
      assert.throws(function() { store.listArticles(clientId); }, function(error) { return error.code === "ARTICLE_PATH_OUT_OF_BOUNDS"; });
    });
    ["../article", "article/path", "article\\path", ".", "..", " ", "article. ", path.resolve(root, "outside")].forEach(function(articleId) {
      assert.throws(function() { store.getArticle("client-1", articleId); }, function(error) { return error.code === "ARTICLE_PATH_OUT_OF_BOUNDS"; });
    });
  });

  it("rejects articles missing required content or provenance fields", function() {
    [
      valid("empty-title", { title: "  " }),
      valid("empty-content", { content: "  " }),
      valid("missing-source", { source: { client_material: true, doubao_answer: true, references: false } }),
      valid("invalid-source", { source: { client_material: true, doubao_answer: true, references: "false", template: true } }),
      valid("missing-field", { templateId: "" })
    ].forEach(function(article) {
      assert.throws(function() { store.saveArticle(article); }, function(error) { return error.code === "ARTICLE_INVALID"; });
    });
  });

  it("rejects damaged JSON, missing markdown, and mismatched markdown", function() {
    const article = valid("article-1");
    store.saveArticle(article);
    const directory = path.join(root, "generated", "client-1");
    fs.writeFileSync(path.join(directory, "article-1.json"), "{");
    assert.throws(function() { store.getArticle("client-1", "article-1"); }, function(error) { return error.code === "ARTICLE_INVALID"; });

    store.saveArticle(article);
    fs.unlinkSync(path.join(directory, "article-1.md"));
    assert.throws(function() { store.getArticle("client-1", "article-1"); }, function(error) { return error.code === "ARTICLE_INVALID"; });

    store.saveArticle(article);
    fs.writeFileSync(path.join(directory, "article-1.md"), "---\ntitle: \"Changed\"\n---\n\nA useful article body.\n");
    assert.throws(function() { store.getArticle("client-1", "article-1"); }, function(error) { return error.code === "ARTICLE_INVALID"; });
  });

  it("ignores temporary and non-JSON files while listing", function() {
    store.saveArticle(valid("article-1"));
    const directory = path.join(root, "generated", "client-1");
    fs.writeFileSync(path.join(directory, "discard.json.tmp-123"), JSON.stringify(valid("discard")));
    fs.writeFileSync(path.join(directory, "article-2.json.tmp-123"), JSON.stringify(valid("article-2")));
    fs.writeFileSync(path.join(directory, "note.md"), "not an article");
    assert.deepStrictEqual(store.listArticles("client-1").map(function(article) { return article.id; }), ["article-1"]);
  });

  it("rejects generated client directories that resolve outside generated", function(t) {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "article-store-outside-"));
    const generated = path.join(root, "generated");
    fs.mkdirSync(generated, { recursive: true });
    try {
      fs.symlinkSync(outside, path.join(generated, "linked"), "junction");
    } catch (error) {
      fs.rmSync(outside, { recursive: true, force: true });
      if (["EPERM", "EACCES", "ENOTSUP", "EINVAL"].includes(error.code)) {
        t.skip("symlinks or junctions are unavailable in this environment");
        return;
      }
      throw error;
    }
    try {
      assert.throws(function() { store.listArticles("linked"); }, function(error) { return error.code === "ARTICLE_PATH_OUT_OF_BOUNDS"; });
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
