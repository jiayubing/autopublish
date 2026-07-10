const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createResearchStore } = require("../src/content/research-store");

describe("research store", function() {
  let root;
  let store;

  beforeEach(function() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "research-store-"));
    store = createResearchStore(root);
  });

  afterEach(function() {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("saves, lists, and reads a normalized research record", function() {
    const saved = store.saveResearch("client-1", {
      id: "query-1",
      question: "上海亲子酒店",
      answerText: "可考虑以下酒店。",
      references: [{ title: "参考", url: "https://example.com", snippet: "摘要" }],
      createdAt: "2026-07-11T00:00:00.000Z"
    });

    assert.deepStrictEqual(saved, {
      id: "query-1",
      clientId: "client-1",
      question: "上海亲子酒店",
      answerText: "可考虑以下酒店。",
      references: [{ title: "参考", url: "https://example.com", snippet: "摘要" }],
      createdAt: "2026-07-11T00:00:00.000Z",
      isAnswerComplete: true
    });
    assert.deepStrictEqual(store.listResearch("client-1"), [saved]);
    assert.deepStrictEqual(store.getResearch("client-1", "query-1"), saved);
  });

  it("reads legacy or incomplete answers without treating them as successful", function() {
    const directory = path.join(root, "research", "client-1");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "query-2.json"), JSON.stringify({
      id: "query-2",
      clientId: "client-1",
      question: "问题",
      references: [],
      createdAt: "2026-07-11T00:00:00.000Z"
    }), "utf8");

    const result = store.getResearch("client-1", "query-2");
    assert.equal(result.answerText, undefined);
    assert.equal(result.isAnswerComplete, false);
    assert.deepStrictEqual(result.references, []);
  });

  it("rejects empty answers and reports missing or corrupt records", function() {
    assert.throws(function() {
      store.saveResearch("client-1", { id: "empty", question: "问题", answerText: "  " });
    }, function(error) { return error.code === "RESEARCH_EMPTY_ANSWER"; });
    assert.throws(function() { store.getResearch("client-1", "missing"); }, function(error) {
      return error.code === "RESEARCH_NOT_FOUND";
    });

    const directory = path.join(root, "research", "client-1");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "broken.json"), "{", "utf8");
    assert.throws(function() { store.getResearch("client-1", "broken"); }, function(error) {
      return error.code === "RESEARCH_INVALID_JSON";
    });
  });

  it("stores records below the injected workspace research directory", function() {
    store.saveResearch("client-2", {
      id: "query-3",
      question: "问题",
      answerText: "答案",
      references: [],
      createdAt: "2026-07-11T00:00:00.000Z"
    });

    assert.equal(fs.existsSync(path.join(root, "research", "client-2", "query-3.json")), true);
  });
});
