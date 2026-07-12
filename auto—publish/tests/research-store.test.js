const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createResearchStore } = require("../src/content/research-store");

describe("research store", function() {
  let root;
  let store;
  beforeEach(function() { root = fs.mkdtempSync(path.join(os.tmpdir(), "research-store-")); store = createResearchStore(root); });
  afterEach(function() { fs.rmSync(root, { recursive: true, force: true }); });

  function valid(id, answer, references) {
    return { id: id, question: "question", answerText: answer, references: arguments.length < 3 ? [] : references, createdAt: "2026-07-11T00:00:00.000Z" };
  }

  it("saves, lists, and reads a normalized record", function() {
    const saved = store.saveResearch("client-1", valid("query-1", "answer", [{ title: "Reference", url: "https://example.com" }]));
    assert.equal(saved.clientId, "client-1");
    assert.deepStrictEqual(store.listResearch("client-1"), [saved]);
    assert.deepStrictEqual(store.getResearch("client-1", "query-1"), saved);
  });

  it("updates an existing record for the same client and query", function() {
    store.saveResearch("client-1", valid("query-1", "first", [{ title: "Old", url: "https://old.example.com" }]));
    const updated = store.saveResearch("client-1", valid("query-1", "updated", [{ title: "New", url: "https://new.example.com" }]));
    assert.equal(store.getResearch("client-1", "query-1").answerText, "updated");
    assert.deepStrictEqual(store.getResearch("client-1", "query-1").references, updated.references);
    assert.deepStrictEqual(store.getResearch("client-1", "query-1"), updated);
  });

  it("requires references to be an array of title and valid HTTP URL", function() {
    [undefined, null, {}, "not-array"].forEach(function(references, index) {
      assert.throws(function() { store.saveResearch("client-1", valid("missing-" + index, "answer", references)); }, function(error) { return error.code === "RESEARCH_INVALID_REFERENCE"; });
    });
    [{ title: "", url: "https://example.com" }, { title: "Reference" }, { title: "Reference", url: "ftp://example.com" }, { title: "Reference", url: "example.com" }, { title: "Reference", url: "https://" }].forEach(function(reference, index) {
      assert.throws(function() { store.saveResearch("client-1", valid("invalid-" + index, "answer", [reference])); }, function(error) { return error.code === "RESEARCH_INVALID_REFERENCE"; });
    });
  });

  it("rejects invalid JSON and JSON arrays", function() {
    const directory = path.join(root, "research", "client-1");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "broken.json"), "{");
    fs.writeFileSync(path.join(directory, "array.json"), "[]");
    assert.throws(function() { store.getResearch("client-1", "broken"); }, function(error) { return error.code === "RESEARCH_INVALID_JSON"; });
    assert.throws(function() { store.getResearch("client-1", "array"); }, function(error) { return error.code === "RESEARCH_INVALID_JSON"; });
  });

  it("rejects empty answers and missing records", function() {
    assert.throws(function() { store.saveResearch("client-1", { id: "empty", answerText: "  ", references: [] }); }, function(error) { return error.code === "RESEARCH_EMPTY_ANSWER"; });
    assert.throws(function() { store.getResearch("client-1", "missing"); }, function(error) { return error.code === "RESEARCH_NOT_FOUND"; });
  });

  it("stores records below the workspace research directory", function() {
    store.saveResearch("client-2", valid("query-3", "answer"));
    assert.equal(fs.existsSync(path.join(root, "research", "client-2", "query-3.json")), true);
  });
});
