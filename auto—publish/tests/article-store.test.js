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
      researchQueryIds: ["query-1"],
      researchSnapshots: [{ questionId: "query-1", question: "Question", answerText: "Answer", references: [], collectedAt: "2026-07-11T00:00:00.000Z", collectionMethod: "automatic" }],
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

  it("rejects Windows reserved device names in client and article path segments", function() {
    ["CON", "prn.txt", "Aux", "nul.log", "COM1", "com9.md", "LPT1", "lpt9.json"].forEach(function(value) {
      assert.throws(function() { store.listArticles(value); }, function(error) { return error.code === "ARTICLE_PATH_OUT_OF_BOUNDS"; });
      assert.throws(function() { store.getArticle("client-1", value); }, function(error) { return error.code === "ARTICLE_PATH_OUT_OF_BOUNDS"; });
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

  it("reads markdown checked out with Windows CRLF line endings", function() {
    const article = valid("article-crlf");
    store.saveArticle(article);
    const directory = path.join(root, "generated", "client-1");
    const markdownPath = path.join(directory, "article-crlf.md");
    const markdown = fs.readFileSync(markdownPath, "utf8").replace(/\n/g, "\r\n");
    fs.writeFileSync(markdownPath, markdown, "utf8");

    assert.deepStrictEqual(store.getArticle("client-1", "article-crlf"), article);
    assert.deepStrictEqual(store.listArticles("client-1").map(function(item) { return item.id; }), ["article-crlf"]);
  });

  it("ignores temporary and non-JSON files while listing", function() {
    store.saveArticle(valid("article-1"));
    const directory = path.join(root, "generated", "client-1");
    fs.writeFileSync(path.join(directory, "discard.json.tmp-123"), JSON.stringify(valid("discard")));
    fs.writeFileSync(path.join(directory, "article-2.json.tmp-123"), JSON.stringify(valid("article-2")));
    fs.writeFileSync(path.join(directory, "note.md"), "not an article");
    assert.deepStrictEqual(store.listArticles("client-1").map(function(article) { return article.id; }), ["article-1"]);
  });

  it("recovers a complete prior article after an interrupted two-file update", function() {
    const original = valid("article-1");
    const updated = valid("article-1", { title: "Updated title", content: "Updated body.", updatedAt: "2026-07-11T01:00:00.000Z" });
    store.saveArticle(original);
    const directory = path.join(root, "generated", "client-1");
    fs.renameSync(path.join(directory, "article-1.json"), path.join(directory, "article-1.json.backup"));
    fs.renameSync(path.join(directory, "article-1.md"), path.join(directory, "article-1.md.backup"));
    fs.writeFileSync(path.join(directory, "article-1.json"), JSON.stringify(updated, null, 2) + "\n");
    fs.writeFileSync(path.join(directory, "article-1.md"), "---\ntitle: " + JSON.stringify(original.title) + "\n---\n\n" + original.content + "\n");
    fs.writeFileSync(path.join(directory, "article-1.journal"), JSON.stringify({
      version: 1,
      temporaryJson: "article-1.json.tmp-interrupted",
      temporaryMarkdown: "article-1.md.tmp-interrupted"
    }) + "\n");

    assert.deepStrictEqual(store.getArticle("client-1", "article-1"), original);
    assert.equal(fs.existsSync(path.join(directory, "article-1.journal")), false);
    assert.equal(fs.existsSync(path.join(directory, "article-1.json.backup")), false);
    assert.equal(fs.existsSync(path.join(directory, "article-1.md.backup")), false);
    assert.deepStrictEqual(store.listArticles("client-1"), [original]);
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

  it("normalizes a legacy single research id without manufacturing snapshots", function() {
    const legacy = valid("legacy-article");
    delete legacy.researchQueryIds;
    delete legacy.researchSnapshots;
    legacy.researchQueryId = "legacy-query";
    const directory = path.join(root, "generated", "client-1");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "legacy-article.json"), JSON.stringify(legacy));
    fs.writeFileSync(path.join(directory, "legacy-article.md"), "---\ntitle: " + JSON.stringify(legacy.title) + "\n---\n\n" + legacy.content + "\n");

    const loaded = store.getArticle("client-1", "legacy-article");
    assert.deepStrictEqual(loaded.researchQueryIds, ["legacy-query"]);
    assert.equal(Object.prototype.hasOwnProperty.call(loaded, "researchSnapshots"), false);
    assert.equal(store.listArticles("client-1")[0].researchQueryId, "legacy-query");

    const saved = store.saveArticle(loaded);
    assert.deepStrictEqual(saved.researchQueryIds, ["legacy-query"]);
    assert.equal(Object.prototype.hasOwnProperty.call(saved, "researchSnapshots"), false);
    const metadata = JSON.parse(fs.readFileSync(path.join(directory, "legacy-article.json"), "utf8"));
    assert.equal(Object.prototype.hasOwnProperty.call(metadata, "researchSnapshots"), false);
  });

  it("accepts an IPC-roundtripped legacy article with matching singular and plural research ids", function() {
    const legacy = valid("roundtripped-legacy");
    delete legacy.researchSnapshots;
    legacy.researchQueryId = "legacy-query";
    legacy.researchQueryIds = ["legacy-query"];
    const directory = path.join(root, "generated", "client-1");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "roundtripped-legacy.json"), JSON.stringify(JSON.parse(JSON.stringify(legacy))));
    fs.writeFileSync(path.join(directory, "roundtripped-legacy.md"), "---\ntitle: " + JSON.stringify(legacy.title) + "\n---\n\n" + legacy.content + "\n");

    const loaded = store.getArticle("client-1", "roundtripped-legacy");
    assert.deepStrictEqual(loaded.researchQueryIds, ["legacy-query"]);
    assert.equal(Object.prototype.hasOwnProperty.call(loaded, "researchSnapshots"), false);
    const saved = store.saveArticle(Object.assign({}, loaded, { title: "Edited legacy title", content: "Edited legacy body." }));
    assert.equal(saved.title, "Edited legacy title");
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "roundtripped-legacy.json"), "utf8")).researchQueryId, "legacy-query");
    assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(fs.readFileSync(path.join(directory, "roundtripped-legacy.json"), "utf8")), "researchQueryIds"), false);
  });

  it("rejects inconsistent singular and plural research ids without snapshots", function() {
    assert.throws(function() {
      store.saveArticle(valid("inconsistent-roundtripped-legacy", {
        researchQueryId: "legacy-query",
        researchQueryIds: ["different-query"],
        researchSnapshots: undefined
      }));
    }, function(error) { return error.code === "ARTICLE_INVALID"; });
  });

  it("requires new research ids and snapshots to correspond", function() {
    assert.throws(function() { store.saveArticle(valid("missing-snapshots", { researchSnapshots: undefined })); }, function(error) {
      return error.code === "ARTICLE_INVALID";
    });
    assert.throws(function() { store.saveArticle(valid("mismatched-snapshots", { researchSnapshots: [] })); }, function(error) {
      return error.code === "ARTICLE_INVALID";
    });
  });

  it("rejects mixed legacy and new research metadata instead of dropping new ids", function() {
    assert.throws(function() {
      store.saveArticle(valid("mixed-missing-snapshots", {
        researchQueryId: "legacy-query",
        researchQueryIds: ["query-1", "query-2"],
        researchSnapshots: undefined
      }));
    }, function(error) { return error.code === "ARTICLE_INVALID"; });
    assert.throws(function() {
      store.saveArticle(valid("mixed-with-snapshots", {
        researchQueryId: "legacy-query",
        researchQueryIds: ["query-1"],
        researchSnapshots: valid("snapshot-source").researchSnapshots
      }));
    }, function(error) { return error.code === "ARTICLE_INVALID"; });
  });

  it("rejects legacy metadata that already contains research snapshots", function() {
    const legacyWithSnapshots = valid("legacy-with-snapshots");
    delete legacyWithSnapshots.researchQueryIds;
    legacyWithSnapshots.researchQueryId = "legacy-query";
    assert.throws(function() { store.saveArticle(legacyWithSnapshots); }, function(error) {
      return error.code === "ARTICLE_INVALID";
    });
  });
});
