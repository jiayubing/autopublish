const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  classifyPage,
  selectAnswerForQuestion,
  isAnswerComplete,
  normalizeReferences,
  normalizePageSnapshot
} = require("../src/content/doubao-page-parser");

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "doubao", name), "utf8"));
}

describe("Doubao page parser", function() {
  it("normalizes current message candidates by id, role, class ancestry, and text", function() {
    const normalized = normalizePageSnapshot(fixture("current-message-structure.json"));

    assert.deepEqual(normalized.messages, [
      {
        messageId: "message-user-001",
        role: "user",
        text: "当前问题",
        references: []
      },
      {
        messageId: "message-assistant-001",
        role: "assistant",
        text: "当前回答正文足够长，可以保存。",
        references: [
          {
            title: "关联资料面板",
            url: "https://example.com/associated-panel",
            snippet: "脱敏资料摘要"
          }
        ]
      },
      {
        messageId: "message-explicit-001",
        role: "assistant",
        text: "显式角色优先于布局类名。",
        references: []
      }
    ]);
    assert.equal(Object.prototype.hasOwnProperty.call(normalized, "messageCandidates"), false);
  });

  it("selects an answer from a current DOM snapshot with associated panel references", function() {
    const snapshot = fixture("current-message-structure.json");
    const result = selectAnswerForQuestion(snapshot, "当前问题");

    assert.equal(result.answerText, "当前回答正文足够长，可以保存。");
    assert.deepEqual(result.references, [
      {
        title: "关联资料面板",
        url: "https://example.com/associated-panel",
        snippet: "脱敏资料摘要"
      }
    ]);
  });

  it("does not block a complete answer when its associated panel has no references", function() {
    const snapshot = fixture("current-message-structure.json");
    snapshot.messageCandidates[1].references = [];
    const result = selectAnswerForQuestion(snapshot, "当前问题");

    assert.equal(result.answerText, "当前回答正文足够长，可以保存。");
    assert.deepEqual(result.references, []);
    assert.equal(isAnswerComplete(snapshot, "当前问题"), true);
  });

  it("selects only the assistant answer following the requested question", function() {
    const result = selectAnswerForQuestion(fixture("multi-turn.json"), "目标问题");
    assert.equal(result.answerText, "目标回答正文至少十个字符。");
    assert.deepEqual(result.references.map(function(item) { return item.url; }), [
      "https://example.com/target",
      "https://reference.example/path"
    ]);
    assert.equal(result.references[1].title, "reference.example");
  });

  it("does not cross a later user turn while selecting an answer", function() {
    const snapshot = fixture("multi-turn.json");
    snapshot.messages.splice(3, 0, { role: "user", text: "后续问题" });

    assert.throws(function() {
      selectAnswerForQuestion(snapshot, "目标问题");
    }, function(error) { return error.code === "DOUBAO_ANSWER_NOT_FOUND"; });
  });

  it("selects the newest answer for a repeated question", function() {
    const snapshot = {
      messages: [
        { messageId: "user-old", role: "user", text: "重复问题" },
        { messageId: "assistant-old", role: "assistant", text: "旧回答正文至少十个字符。" },
        { messageId: "user-new", role: "user", text: "重复问题" },
        { messageId: "assistant-new", role: "assistant", text: "新回答正文至少十个字符。" }
      ]
    };

    assert.equal(selectAnswerForQuestion(snapshot, "重复问题").answerText, "新回答正文至少十个字符。");
  });

  it("distinguishes login, challenge, streaming, and complete states", function() {
    assert.equal(classifyPage(fixture("login-required.json")).status, "login_required");
    assert.equal(classifyPage(fixture("challenge.json")).status, "challenge");
    assert.equal(isAnswerComplete(fixture("streaming-answer.json"), "测试问题"), false);
    assert.equal(isAnswerComplete(fixture("complete-answer.json"), "测试问题"), true);
  });

  it("prefers an explicit login marker when the page still exposes an input", function() {
    assert.equal(classifyPage({ inputAvailable: true, loginRequired: true }).status, "login_required");
  });

  it("reports page errors before answer selection", function() {
    assert.equal(classifyPage({ inputAvailable: true, errorText: "页面加载失败" }).status, "page_error");
  });

  it("throws stable errors when the question or answer is absent", function() {
    assert.throws(function() {
      selectAnswerForQuestion(fixture("complete-answer.json"), "不存在的问题");
    }, function(error) { return error.code === "DOUBAO_QUESTION_NOT_FOUND"; });

    assert.throws(function() {
      selectAnswerForQuestion({ messages: [{ role: "user", text: "目标问题" }] }, "目标问题");
    }, function(error) { return error.code === "DOUBAO_ANSWER_NOT_FOUND"; });
  });

  it("normalizes references by keeping unique HTTP(S) URLs and filling missing titles", function() {
    const references = normalizeReferences([
      { title: "资料", url: "https://example.com/a", snippet: "第一份" },
      { title: "重复", url: "https://example.com/a", snippet: "重复" },
      { title: "", url: "http://source.example/path" },
      { title: "不应保留", url: "javascript:alert(1)" },
      { title: "不应保留", url: "not-a-url" }
    ]);
    assert.deepEqual(references, [
      { title: "资料", url: "https://example.com/a", snippet: "第一份" },
      { title: "source.example", url: "http://source.example/path", snippet: "" }
    ]);
  });
});
