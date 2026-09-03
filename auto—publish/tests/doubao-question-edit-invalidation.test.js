const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createDoubaoCollectionDesktopService,
} = require("../desktop/services/doubao-collection-service");

function makeService(options = {}) {
  let question = {
    id: "question-1",
    text: "原问题",
    enabled: true,
  };
  let research = {
    id: "question-1",
    clientId: "client-a",
    question: "原问题",
    answerText: "这是原问题已经保存的完整回答。",
    references: [],
    collectionMethod: "automatic",
  };
  const calls = [];

  const service = createDoubaoCollectionDesktopService({
    workspaceRoot: "F:\\doubao-workspace",
    questionStore: {
      getQuestion() {
        calls.push("getQuestion");
        return { ...question };
      },
      updateQuestion(clientId, questionId, changes) {
        calls.push("updateQuestion");
        if (options.updateError) throw options.updateError;
        question = {
          ...question,
          ...(changes.text === undefined ? {} : { text: changes.text }),
          ...(changes.enabled === undefined ? {} : { enabled: changes.enabled }),
        };
        return { ...question };
      },
      listQuestions() { return [{ ...question }]; },
      createQuestion() { return { ...question }; },
    },
    researchStore: {
      getResearch() {
        calls.push("getResearch");
        if (!research) {
          const error = new Error("missing");
          error.code = "RESEARCH_NOT_FOUND";
          throw error;
        }
        return { ...research };
      },
      deleteResearch() {
        calls.push("deleteResearch");
        if (!research) return false;
        research = null;
        return true;
      },
      saveResearch(clientId, value) {
        calls.push("saveResearch");
        research = { ...value, clientId };
        return { ...research };
      },
    },
    collectionService: {
      getLoginState() { return { status: "authenticated" }; },
      openLogin() { return { status: "authenticated" }; },
      close() {},
      saveManual(input) { return input; },
      deleteQuestionAndResearch(input) { return input; },
    },
    queue: {
      getState() { return { status: "idle", tasks: [] }; },
      subscribe() { return function() {}; },
      dispose: async function() {},
    },
  });

  return {
    service,
    calls,
    getResearch: () => research,
  };
}

test("editing question text invalidates its old research before the update is published", function() {
  const value = makeService();

  const updated = value.service.updateQuestion({
    clientId: "client-a",
    questionId: "question-1",
    text: "新问题",
  });

  assert.equal(updated.text, "新问题");
  assert.equal(value.getResearch(), null);
  assert.deepEqual(value.calls, [
    "getQuestion",
    "getResearch",
    "deleteResearch",
    "updateQuestion",
  ]);
});

test("enabled-only question edits keep existing research", function() {
  const value = makeService();

  value.service.updateQuestion({
    clientId: "client-a",
    questionId: "question-1",
    enabled: false,
  });

  assert.equal(value.getResearch().question, "原问题");
  assert.deepEqual(value.calls, ["getQuestion", "updateQuestion"]);
});

test("failed question text edits restore the old research", function() {
  const updateError = new Error("write failed");
  updateError.code = "EACCES";
  const value = makeService({ updateError });

  assert.throws(
    () => value.service.updateQuestion({
      clientId: "client-a",
      questionId: "question-1",
      text: "新问题",
    }),
    (error) => error === updateError,
  );

  assert.equal(value.getResearch().question, "原问题");
  assert.deepEqual(value.calls, [
    "getQuestion",
    "getResearch",
    "deleteResearch",
    "updateQuestion",
    "saveResearch",
  ]);
});
