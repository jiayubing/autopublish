const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createArticleVersionService } = require("../src/content/article-version-service");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sourceArticle(overrides) {
  return Object.assign({
    id: "article-source",
    clientId: "client-1",
    researchQueryIds: ["query-1"],
    researchSnapshots: [{
      questionId: "query-1",
      question: "Question",
      answerText: "Answer",
      references: [],
      collectedAt: "2026-07-17T00:00:00.000Z",
      collectionMethod: "automatic"
    }],
    platform: "toutiao",
    scenario: "news",
    templateId: "template-1",
    title: "原文章标题",
    content: "原文章正文",
    status: "saved",
    source: { client_material: true, doubao_answer: true, references: false, template: true },
    materialSnapshots: [{
      id: "facts.md",
      name: "facts.md",
      extension: ".md",
      content: "facts",
      contentHash: "facts-hash",
      source: "text"
    }],
    templateSnapshot: {
      platform: "toutiao",
      id: "template-1",
      name: "News",
      scenario: "news",
      body: "template body",
      bodyHash: "template-hash"
    },
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T01:00:00.000Z",
    reviewedAt: "2026-07-17T01:00:00.000Z",
    sourceArticleId: "article-root",
    version: 4,
    publicationId: "publication-old",
    publicationReservation: { targetKey: "platform:toutiao" },
    publicationLedger: { status: "published" },
    articleKey: "generated:client-1:article-source",
    targetKey: "platform:toutiao",
    attemptId: "attempt-old",
    prompt: "do not copy",
    apiKey: "secret-do-not-copy"
  }, overrides || {});
}

function createMemoryStore(article) {
  const records = new Map([[article.clientId + ":" + article.id, clone(article)]]);
  const calls = [];
  return {
    calls: calls,
    records: records,
    getArticle: function(clientId, articleId) {
      calls.push(["getArticle", clientId, articleId]);
      const value = records.get(clientId + ":" + articleId);
      if (!value) throw Object.assign(new Error("Article was not found"), { code: "ARTICLE_NOT_FOUND" });
      return clone(value);
    },
    saveArticle: function(value) {
      calls.push(["saveArticle", value.id]);
      records.set(value.clientId + ":" + value.id, clone(value));
      return clone(value);
    }
  };
}

describe("article version service", function() {
  it("reads the source and creates a fresh generated version without publishing metadata", function() {
    const source = sourceArticle();
    const store = createMemoryStore(source);
    const service = createArticleVersionService({
      contentStore: store,
      createId: function() { return "article-copy"; },
      now: function() { return "2026-07-18T00:00:00.000Z"; }
    });

    const copied = service.copyArticleVersion({ clientId: "client-1", sourceArticleId: "article-source" });

    assert.equal(copied.id, "article-copy");
    assert.equal(copied.clientId, "client-1");
    assert.equal(copied.sourceArticleId, "article-root");
    assert.equal(copied.version, 5);
    assert.equal(copied.status, "generated");
    assert.equal(Object.prototype.hasOwnProperty.call(copied, "reviewedAt"), false);
    assert.equal(copied.createdAt, "2026-07-18T00:00:00.000Z");
    assert.equal(copied.updatedAt, "2026-07-18T00:00:00.000Z");
    assert.equal(copied.title, source.title);
    assert.equal(copied.content, source.content);
    assert.equal(store.calls[0][0], "getArticle");
    assert.deepEqual(store.calls.at(-1), ["saveArticle", "article-copy"]);

    ["publicationId", "publicationReservation", "publicationLedger", "articleKey", "targetKey", "attemptId", "prompt", "apiKey"].forEach(function(field) {
      assert.equal(Object.prototype.hasOwnProperty.call(copied, field), false, "copied " + field);
    });
  });

  it("does not mutate the source and does not share nested content metadata", function() {
    const source = sourceArticle();
    const before = clone(source);
    const store = createMemoryStore(source);
    const service = createArticleVersionService({
      contentStore: store,
      createId: function() { return "article-copy"; },
      now: function() { return "2026-07-18T00:00:00.000Z"; }
    });

    const copied = service.copyArticleVersion({ clientId: "client-1", sourceArticleId: "article-source" });
    copied.researchSnapshots[0].answerText = "changed";
    copied.source.client_material = false;

    assert.deepEqual(store.records.get("client-1:article-source"), before);
    assert.equal(store.records.get("client-1:article-copy").researchSnapshots[0].answerText, "Answer");
    assert.equal(store.records.get("client-1:article-copy").source.client_material, true);
  });

  it("rejects a conflicting generated id instead of overwriting an article", function() {
    const source = sourceArticle();
    const store = createMemoryStore(source);
    store.records.set("client-1:article-conflict", sourceArticle({ id: "article-conflict", title: "Existing article" }));
    let calls = 0;
    const service = createArticleVersionService({
      contentStore: store,
      createId: function() { calls += 1; return "article-conflict"; },
      now: function() { return "2026-07-18T00:00:00.000Z"; }
    });

    assert.throws(function() {
      service.copyArticleVersion({ clientId: "client-1", sourceArticleId: "article-source" });
    }, function(error) {
      return error.code === "ARTICLE_ID_DUPLICATE";
    });
    assert.equal(calls, 3);
    assert.equal(store.records.get("client-1:article-conflict").title, "Existing article");
    assert.equal(store.calls.some(function(call) { return call[0] === "saveArticle"; }), false);
  });

  it("rejects illegal input and unsafe generated ids before saving", function() {
    const store = createMemoryStore(sourceArticle());
    const service = createArticleVersionService({
      contentStore: store,
      createId: function() { return "safe-copy"; },
      now: function() { return "2026-07-18T00:00:00.000Z"; }
    });

    [
      null,
      {},
      { clientId: "client-1", sourceArticleId: "" },
      { clientId: "client-1", sourceArticleId: "../article-source" },
      { clientId: "client-1", sourceArticleId: "article-source", articleId: "attacker-chosen" }
    ].forEach(function(input) {
      assert.throws(function() { service.copyArticleVersion(input); }, function(error) {
        return error.code === "ARTICLE_VERSION_INPUT_INVALID";
      });
    });

    const unsafeIdService = createArticleVersionService({
      contentStore: store,
      createId: function() { return "../unsafe"; },
      now: function() { return "2026-07-18T00:00:00.000Z"; }
    });
    assert.throws(function() {
      unsafeIdService.copyArticleVersion({ clientId: "client-1", sourceArticleId: "article-source" });
    }, function(error) {
      return error.code === "ARTICLE_ID_INVALID";
    });
    assert.equal(store.calls.some(function(call) { return call[0] === "saveArticle"; }), false);
  });
});
