const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createDoubaoCollectionService } = require("../src/content/doubao-collection-service");

function fixture(existingQuestionText) {
  const question = {
    id: "question-1",
    text: "修改后的问题文本",
    enabled: true,
  };
  let research = existingQuestionText
    ? {
        id: question.id,
        clientId: "client-a",
        question: existingQuestionText,
        answerText: "这是之前已经保存的完整研究回答。",
        references: [],
        collectionMethod: "automatic",
      }
    : null;
  const collectInputs = [];
  const service = createDoubaoCollectionService({
    questionStore: {
      getQuestion: function(clientId, questionId) {
        assert.equal(clientId, "client-a");
        assert.equal(questionId, question.id);
        return question;
      },
      listQuestions: function(clientId) {
        assert.equal(clientId, "client-a");
        return [question];
      },
      deleteQuestion: function() { return question; },
    },
    researchStore: {
      getResearch: function() {
        if (!research) {
          const error = new Error("missing");
          error.code = "RESEARCH_NOT_FOUND";
          throw error;
        }
        return research;
      },
      saveResearch: function(clientId, value) {
        research = { ...value, clientId };
        return research;
      },
      deleteResearch: function() {
        research = null;
        return true;
      },
    },
    browserAdapter: {
      collect: async function(input) {
        collectInputs.push(input);
        return {
          answerText: "这是针对修改后问题采集得到的完整新回答。",
          references: [],
          collectedAt: "2026-09-03T00:00:00.000Z",
        };
      },
    },
    now: function() { return "2026-09-03T00:00:01.000Z"; },
  });
  return {
    service,
    getResearch: function() { return research; },
    collectInputs,
  };
}

describe("doubao edited-question research validity", function() {
  it("treats an answer for the old question text as missing and recollects without force", async function() {
    const value = fixture("修改前的问题文本");

    const preview = value.service.previewBatch({
      clientIds: ["client-a"],
      mode: "missing",
    });
    assert.equal(preview.taskCount, 1);
    assert.equal(preview.skippedExisting, 0);

    const saved = await value.service.collectOne({
      clientId: "client-a",
      questionId: "question-1",
    });
    assert.equal(saved.question, "修改后的问题文本");
    assert.deepEqual(value.collectInputs, [{
      clientId: "client-a",
      question: "修改后的问题文本",
    }]);
  });

  it("continues to skip a research record that matches the current question text", async function() {
    const value = fixture("修改后的问题文本");

    const preview = value.service.previewBatch({
      clientIds: ["client-a"],
      mode: "missing",
    });
    assert.equal(preview.taskCount, 0);
    assert.equal(preview.skippedExisting, 1);

    await assert.rejects(
      value.service.collectOne({
        clientId: "client-a",
        questionId: "question-1",
      }),
      function(error) {
        return error.code === "DOUBAO_RESEARCH_EXISTS";
      },
    );
    assert.equal(value.collectInputs.length, 0);
  });
});
