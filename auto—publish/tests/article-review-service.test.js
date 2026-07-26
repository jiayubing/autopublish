const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createArticleStore } = require("../src/content/article-store");
const { createArticleReviewService } = require("../src/content/article-review-service");

const REVIEWED_AT = "2026-07-15T00:00:00.000Z";

function article(id, clientId, overrides) {
  return Object.assign({
    id: id,
    clientId: clientId,
    researchQueryIds: ["query-1"],
    researchSnapshots: [{ questionId: "query-1", question: "Question", answerText: "Answer", references: [], collectedAt: "2026-07-14T00:00:00.000Z", collectionMethod: "automatic" }],
    platform: "ctrip",
    scenario: "guide",
    templateId: "template-1",
    title: "A useful title",
    content: "A useful article body.",
    status: "generated",
    source: { client_material: true, doubao_answer: true, references: false, template: true },
    materialSnapshots: [{ id: "facts.md", name: "facts.md", extension: ".md", content: "facts", contentHash: "facts-hash", source: "text" }],
    templateSnapshot: { platform: "ctrip", id: "template-1", name: "Guide", scenario: "guide", body: "Template body", bodyHash: "template-hash" },
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    reviewedAt: null
  }, overrides || {});
}

describe("article review service", function() {
  let root;
  let store;
  let review;

  beforeEach(function() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "article-review-"));
    store = createArticleStore(root);
    review = createArticleReviewService({ contentStore: store, now: function() { return REVIEWED_AT; } });
  });

  afterEach(function() { fs.rmSync(root, { recursive: true, force: true }); });

  it("reviews only explicitly selected generated articles across clients", function() {
    store.saveArticle(article("a1", "c1"));
    store.saveArticle(article("a2", "c2"));

    const result = review.reviewMany([{ clientId: "c1", articleId: "a1" }]);

    assert.deepStrictEqual(result.approved, ["a1"]);
    assert.equal(store.getArticle("c1", "a1").status, "saved");
    assert.equal(store.getArticle("c1", "a1").reviewedAt, REVIEWED_AT);
    assert.equal(store.getArticle("c2", "a2").status, "generated");
  });

  it("reviews a cross-client selection and reports incomplete source provenance", function() {
    store.saveArticle(article("a1", "c1"));
    const incomplete = article("a2", "c2");
    delete incomplete.materialSnapshots;
    const records = new Map([["c1:a1", article("a1", "c1")], ["c2:a2", incomplete]]);
    const saves = [];
    const fakeStore = {
      getArticle: function(clientId, articleId) { return records.get(clientId + ":" + articleId); },
      saveArticle: function(value) { saves.push(value); records.set(value.clientId + ":" + value.id, value); return value; }
    };
    const service = createArticleReviewService({ contentStore: fakeStore, now: function() { return REVIEWED_AT; } });

    const result = service.reviewMany([{ clientId: "c1", articleId: "a1" }, { clientId: "c2", articleId: "a2" }]);

    assert.deepStrictEqual(result.approved, ["a1"]);
    assert.deepStrictEqual(result.rejected, [{ articleId: "a2", code: "ARTICLE_SOURCE_INCOMPLETE" }]);
    assert.equal(saves.length, 1);
  });

  it("rejects empty title/body, incomplete provenance, and damaged records with reasons", function() {
    const records = new Map([
      ["c:title", article("title", "c", { title: "  " })],
      ["c:content", article("content", "c", { content: "\n" })],
      ["c:source", article("source", "c", { templateSnapshot: undefined })]
    ]);
    const fakeStore = {
      getArticle: function(clientId, articleId) {
        if (articleId === "damaged") throw Object.assign(new Error("Article files are incomplete"), { code: "ARTICLE_INVALID" });
        return records.get(clientId + ":" + articleId);
      },
      saveArticle: function() { throw new Error("invalid records must not be saved"); }
    };
    const service = createArticleReviewService({ contentStore: fakeStore, now: function() { return REVIEWED_AT; } });

    const result = service.reviewMany([
      { clientId: "c", articleId: "title" },
      { clientId: "c", articleId: "content" },
      { clientId: "c", articleId: "source" },
      { clientId: "c", articleId: "damaged" }
    ]);

    assert.deepStrictEqual(result.rejected, [
      { articleId: "title", code: "ARTICLE_TITLE_INVALID" },
      { articleId: "content", code: "ARTICLE_CONTENT_INVALID" },
      { articleId: "source", code: "ARTICLE_SOURCE_INCOMPLETE" },
      { articleId: "damaged", code: "ARTICLE_CORRUPTED" }
    ]);
  });

  it("is idempotent for saved articles and does not change review timestamps", function() {
    const saved = article("saved", "c1", { status: "saved", reviewedAt: "2026-07-14T12:00:00.000Z" });
    const saves = [];
    const fakeStore = {
      getArticle: function() { return saved; },
      saveArticle: function(value) { saves.push(value); return value; }
    };
    const service = createArticleReviewService({ contentStore: fakeStore, now: function() { return REVIEWED_AT; } });

    const result = service.reviewMany([{ clientId: "c1", articleId: "saved" }]);

    assert.deepStrictEqual(result.approved, []);
    assert.deepStrictEqual(result.skipped, ["saved"]);
    assert.equal(saved.reviewedAt, "2026-07-14T12:00:00.000Z");
    assert.equal(saves.length, 0);
  });
});
