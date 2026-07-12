const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createQuestionStore } = require("../src/content/question-store");

describe("question store", function() {
  let root;
  let store;
  let timestamps;

  beforeEach(function() {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "question-store-"));
    fs.mkdirSync(path.join(root, "clients", "client-1"), { recursive: true });
    timestamps = ["2026-07-12T00:00:00.000Z", "2026-07-12T00:01:00.000Z", "2026-07-12T00:02:00.000Z"];
    store = createQuestionStore(root, {
      createId: function() { return "question-1"; },
      now: function() { return timestamps.shift() || "2026-07-12T00:03:00.000Z"; }
    });
  });

  afterEach(function() { fs.rmSync(root, { recursive: true, force: true }); });

  it("creates, updates, lists, toggles, and deletes a stable question", function() {
    const created = store.createQuestion("client-1", { text: " 上海  周边推荐 ", extra: "ignored" });
    assert.equal(created.id, "question-1");
    assert.equal(created.text, "上海  周边推荐");
    assert.equal(created.enabled, true);
    assert.equal(created.createdAt, "2026-07-12T00:00:00.000Z");
    assert.equal(created.updatedAt, "2026-07-12T00:00:00.000Z");
    assert.equal(created.extra, undefined);
    const updated = store.updateQuestion("client-1", "question-1", { text: "上海酒店推荐", enabled: false, extra: "ignored" });
    assert.equal(updated.id, "question-1");
    assert.equal(updated.createdAt, created.createdAt);
    assert.equal(updated.updatedAt, "2026-07-12T00:01:00.000Z");
    assert.equal(updated.extra, undefined);
    assert.equal(store.listQuestions("client-1")[0].enabled, false);
    const saved = JSON.parse(fs.readFileSync(path.join(root, "clients", "client-1", "questions.json"), "utf8"));
    assert.deepStrictEqual(Object.keys(saved.questions[0]).sort(), ["createdAt", "enabled", "id", "text", "updatedAt"]);
    assert.deepStrictEqual(fs.readdirSync(path.join(root, "clients", "client-1")).filter(function(name) {
      return name.includes(".tmp-") || name.includes(".bak-");
    }), []);
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
    assert.throws(function() { store.getQuestion("client-1", "../question-1"); }, function(error) {
      return error.code === "QUESTION_ID_INVALID";
    });
    assert.throws(function() { store.updateQuestion("client-1", path.resolve(root, "question-1"), { enabled: false }); }, function(error) {
      return error.code === "QUESTION_ID_INVALID";
    });
    assert.throws(function() { store.deleteQuestion("client-1", "question/1"); }, function(error) {
      return error.code === "QUESTION_ID_INVALID";
    });
    assert.throws(function() { store.createQuestion("client-1", { text: " " }); }, function(error) {
      return error.code === "QUESTION_TEXT_INVALID";
    });
    assert.throws(function() { store.createQuestion("client-1", { text: "x".repeat(2001) }); }, function(error) {
      return error.code === "QUESTION_TEXT_INVALID";
    });
  });

  it("rejects malformed questions.json with a stable error", function() {
    const filename = path.join(root, "clients", "client-1", "questions.json");
    fs.writeFileSync(filename, JSON.stringify({ version: 2, questions: [] }), "utf8");
    assert.throws(function() { store.listQuestions("client-1"); }, function(error) {
      return error.code === "QUESTION_INVALID_JSON";
    });
    fs.writeFileSync(filename, "{", "utf8");
    assert.throws(function() { store.listQuestions("client-1"); }, function(error) {
      return error.code === "QUESTION_INVALID_JSON";
    });
  });

  it("rejects a customer directory symlink escaping workspace.clients", function(t) {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "question-store-outside-"));
    const linked = path.join(root, "clients", "linked-client");
    try {
      try {
        fs.symlinkSync(outside, linked, process.platform === "win32" ? "junction" : "dir");
      } catch (error) {
        t.skip("directory links are unavailable: " + error.code);
        return;
      }
      assert.throws(function() { store.listQuestions("linked-client"); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
      assert.throws(function() { store.createQuestion("linked-client", { text: "outside" }); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects a clients root symlink escaping workspace", function(t) {
    const originalClients = path.join(root, "clients");
    const outsideClients = fs.mkdtempSync(path.join(os.tmpdir(), "question-store-clients-outside-"));
    fs.rmSync(originalClients, { recursive: true, force: true });
    try {
      try {
        fs.symlinkSync(outsideClients, originalClients, process.platform === "win32" ? "junction" : "dir");
      } catch (error) {
        t.skip("directory links are unavailable: " + error.code);
        return;
      }
      assert.throws(function() { store.listQuestions("client-1"); }, function(error) {
        return error.code === "CLIENT_PATH_OUT_OF_BOUNDS";
      });
    } finally {
      fs.rmSync(originalClients, { recursive: true, force: true });
      fs.rmSync(outsideClients, { recursive: true, force: true });
    }
  });
});
