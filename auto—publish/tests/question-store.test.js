const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createQuestionStore } = require("../src/content/question-store");

describe("question store", function() {
  let root;
  let store;

  beforeEach(function() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "question-store-"));
    fs.mkdirSync(path.join(root, "clients", "client-1"), { recursive: true });
    store = createQuestionStore(root, {
      createId: function() { return "question-1"; },
      now: function() { return "2026-07-12T00:00:00.000Z"; }
    });
  });

  afterEach(function() { fs.rmSync(root, { recursive: true, force: true }); });

  it("creates, updates, lists, toggles, and deletes a stable question", function() {
    const created = store.createQuestion("client-1", { text: " 上海  周边推荐 " });
    assert.equal(created.id, "question-1");
    assert.equal(created.text, "上海  周边推荐");
    assert.equal(created.enabled, true);
    assert.equal(store.updateQuestion("client-1", "question-1", { text: "上海酒店推荐", enabled: false }).id, "question-1");
    assert.equal(store.listQuestions("client-1")[0].enabled, false);
    store.deleteQuestion("client-1", "question-1");
    assert.deepStrictEqual(store.listQuestions("client-1"), []);
  });

  it("imports search_query.txt once and rejects normalized duplicates", function() {
    fs.writeFileSync(path.join(root, "clients", "client-1", "search_query.txt"), "上海  酒店推荐\r\n", "utf8");
    assert.equal(store.listQuestions("client-1")[0].text, "上海  酒店推荐");
    assert.equal(store.listQuestions("client-1").length, 1);
    assert.throws(function() { store.createQuestion("client-1", { text: "上海 酒店推荐" }); }, function(error) {
      return error.code === "QUESTION_DUPLICATE";
    });
  });

  it("returns stable errors for invalid paths and question data", function() {
    assert.throws(function() { store.listQuestions("../client-1"); }, function(error) {
      return error.code === "CLIENT_ID_INVALID";
    });
    assert.throws(function() { store.listQuestions(path.resolve(root, "clients", "client-1")); }, function(error) {
      return error.code === "CLIENT_ID_INVALID";
    });
    assert.throws(function() { store.createQuestion("client-1", { text: " " }); }, function(error) {
      return error.code === "QUESTION_TEXT_INVALID";
    });
    assert.throws(function() { store.createQuestion("client-1", { text: "x".repeat(2001) }); }, function(error) {
      return error.code === "QUESTION_TEXT_INVALID";
    });
  });
});
