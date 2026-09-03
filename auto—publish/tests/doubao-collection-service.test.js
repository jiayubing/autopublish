const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createDoubaoCollectionService } = require("../src/content/doubao-collection-service");

function coded(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function createContext(options) {
  options = options || {};
  const calls = [];
  const questions = new Map();
  const research = new Map();
  const question = Object.assign({
    id: "question-1",
    text: "如何选择适合家庭使用的空气净化器？",
    enabled: true,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z"
  }, options.question || {});
  const configuredQuestions = options.questions || [{ clientId: "client-1", question: question }];
  configuredQuestions.forEach(function(item) {
    questions.set(item.clientId + ":" + item.question.id, Object.assign({}, item.question));
  });
  (options.researchRecords || []).forEach(function(record) {
    research.set(record.clientId + ":" + record.id, Object.assign({}, record));
  });
  let failSave = false;

  const questionStore = {
    listQuestions: function(clientId) {
      calls.push("listQuestions");
      return Array.from(questions.entries())
        .filter(function(entry) { return entry[0].indexOf(clientId + ":") === 0; })
        .map(function(entry) { return copy(entry[1]); });
    },
    getQuestion: function(clientId, questionId) {
      calls.push("getQuestion");
      const found = questions.get(clientId + ":" + questionId);
      if (!found) throw coded("QUESTION_NOT_FOUND", "Question was not found");
      return copy(found);
    },
    deleteQuestion: function(clientId, questionId) {
      calls.push("deleteQuestion");
      if (options.onDeleteQuestion) options.onDeleteQuestion(function(value) { failSave = value; });
      if (options.deleteQuestionError) throw options.deleteQuestionError;
      const key = clientId + ":" + questionId;
      const found = questions.get(key);
      if (!found) throw coded("QUESTION_NOT_FOUND", "Question was not found");
      questions.delete(key);
      return copy(found);
    }
  };

  const researchStore = {
    getResearch: function(clientId, questionId) {
      calls.push("getResearch");
      const found = research.get(clientId + ":" + questionId);
      if (!found) throw coded("RESEARCH_NOT_FOUND", "Research was not found");
      return copy(found);
    },
    saveResearch: function(clientId, record) {
      calls.push("saveResearch");
      if (failSave || options.saveResearchError) throw options.saveResearchError || coded("SAVE_FAILED", "Save failed");
      if (typeof record.answerText !== "string" || record.answerText.trim().length < 10) {
        throw coded("RESEARCH_INVALID_ANSWER", "Research answer length is invalid");
      }
      if (!Array.isArray(record.references)) throw coded("RESEARCH_INVALID_REFERENCE", "Research references must be an array");
      record.references.forEach(function(reference) {
        try {
          const url = new URL(reference.url);
          if (!reference.title || (url.protocol !== "http:" && url.protocol !== "https:")) throw new Error();
        } catch (error) {
          throw coded("RESEARCH_INVALID_REFERENCE", "Research reference URL is invalid");
        }
      });
      const saved = Object.assign({}, copy(record), { clientId: clientId });
      research.set(clientId + ":" + record.id, saved);
      return copy(saved);
    },
    deleteResearch: function(clientId, questionId) {
      calls.push("deleteResearch");
      if (options.deleteResearchError) throw options.deleteResearchError;
      const key = clientId + ":" + questionId;
      if (!research.has(key)) return false;
      research.delete(key);
      return true;
    }
  };

  const browserAdapter = {
    collect: async function() {
      calls.push("collect");
      if (options.collectError) throw options.collectError;
      return options.collection || {
        answerText: "这是一个长度足够的自动采集回答。",
        references: [{ title: "参考资料", url: "https://example.com/reference" }],
        collectedAt: "2026-07-12T00:00:01.000Z"
      };
    },
    getLoginState: async function() { calls.push("getLoginState"); return { status: "authenticated" }; },
    openLogin: async function() { calls.push("openLogin"); return { status: "authenticated" }; },
    close: async function() { calls.push("close"); }
  };

  return {
    calls: calls,
    questions: questions,
    research: research,
    questionStore: questionStore,
    researchStore: researchStore,
    browserAdapter: browserAdapter,
    service: createDoubaoCollectionService({
      questionStore: questionStore,
      researchStore: researchStore,
      browserAdapter: browserAdapter,
      now: function() { return "2026-07-12T00:00:02.000Z"; }
    })
  };
}

function oldRecord() {
  return {
    id: "question-1",
    question: "如何选择适合家庭使用的空气净化器？",
    answerText: "这是之前已经保存的完整研究回答。",
    references: [{ title: "旧资料", url: "https://old.example.com/source" }],
    collectionMethod: "automatic",
    collectedAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z"
  };
}

describe("Doubao collection service", function() {
  it("builds missing-only and force-enabled batches from selected clients", function() {
    const question = function(clientId, questionId, enabled) {
      return { clientId: clientId, question: {
        id: questionId,
        text: "问题 " + clientId + " " + questionId + " 足够长的采集问题文本",
        enabled: enabled,
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z"
      } };
    };
    const existing = function(clientId) {
      return {
        clientId: clientId,
        id: "q-existing",
        question: "问题 " + clientId + " q-existing 足够长的采集问题文本",
        answerText: "这是已经保存的足够长度研究回答。",
        references: [],
        collectionMethod: "automatic",
        collectedAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z"
      };
    };
    const context = createContext({
      questions: [
        question("client-1", "q-new", true),
        question("client-1", "q-existing", true),
        question("client-1", "q-disabled", false),
        question("client-2", "q-new", true),
        question("client-2", "q-existing", true),
        question("client-2", "q-disabled", false)
      ],
      researchRecords: [existing("client-1"), existing("client-2")]
    });

    const missingInput = { clientIds: ["client-1", "client-2"], mode: "missing" };
    const missing = context.service.previewBatch(missingInput);
    assert.equal(missing.taskCount, 2);
    assert.equal(missing.skippedExisting, 2);
    assert.deepStrictEqual(
      context.service.prepareBatch(missingInput).map(function(task) {
        return [task.clientId, task.questionId, task.force];
      }),
      [
        ["client-1", "q-new", false],
        ["client-2", "q-new", false]
      ]
    );

    const forceInput = { clientIds: ["client-1", "client-2"], mode: "recollect" };
    const force = context.service.previewBatch(forceInput);
    assert.equal(force.taskCount, 4);
    assert.deepStrictEqual(
      context.service.prepareBatch(forceInput).map(function(task) { return task.force; }),
      [true, true, true, true]
    );
    assert.equal(force.disabledQuestions, 2);
  });

  it("rejects empty, duplicate, oversized, unknown-mode, and disabled-only batch input", function() {
    const context = createContext();
    assert.throws(function() { context.service.previewBatch({ clientIds: [], mode: "missing" }); }, /client/i);
    assert.throws(function() { context.service.previewBatch({ clientIds: ["client-1", "client-1"], mode: "missing" }); }, function(error) {
      return error.code === "DOUBAO_BATCH_CLIENT_DUPLICATE";
    });
    assert.throws(function() { context.service.previewBatch({ clientIds: ["client-1"], mode: "unknown" }); }, /mode/i);
    assert.throws(function() {
      context.service.previewBatch({ clientIds: Array.from({ length: 501 }, function(_, index) { return "client-" + index; }), mode: "missing" });
    }, /500|limit/i);

    const disabled = createContext({ question: { enabled: false } });
    const preview = disabled.service.previewBatch({ clientIds: ["client-1"], mode: "recollect" });
    assert.equal(preview.taskCount, 0);
    assert.equal(preview.disabledQuestions, 1);
  });

  it("prepares batch tasks from the current question state at start time", function() {
    const context = createContext({ question: { enabled: false } });
    assert.deepStrictEqual(
      context.service.prepareBatch({ clientIds: ["client-1"], mode: "missing" }),
      []
    );
  });

  it("collects an existing question and saves normalized research", async function() {
    const context = createContext();
    const saved = await context.service.collectOne({ clientId: "client-1", questionId: "question-1", force: false });

    assert.equal(saved.id, "question-1");
    assert.equal(saved.question, "如何选择适合家庭使用的空气净化器？");
    assert.equal(saved.collectionMethod, "automatic");
    assert.equal(saved.answerText, "这是一个长度足够的自动采集回答。");
    assert.deepEqual(context.calls, ["getQuestion", "getResearch", "collect", "saveResearch"]);
  });

  it("does not replace a successful record when recollection fails", async function() {
    const context = createContext({ collectError: coded("DOUBAO_TIMEOUT", "Timed out") });
    const old = oldRecord();
    context.researchStore.saveResearch("client-1", old);

    await assert.rejects(context.service.collectOne({ clientId: "client-1", questionId: "question-1", force: true }), function(error) {
      return error.code === "DOUBAO_TIMEOUT";
    });
    assert.deepEqual(context.researchStore.getResearch("client-1", "question-1"), Object.assign({}, old, { clientId: "client-1" }));
  });

  it("saves manual input through the same research store", function() {
    const context = createContext();
    const saved = context.service.saveManual({
      clientId: "client-1",
      questionId: "question-1",
      answerText: "这是人工修正后的完整回答。",
      references: []
    });

    assert.equal(saved.id, "question-1");
    assert.equal(saved.collectionMethod, "manual");
    assert.equal(saved.answerText, "这是人工修正后的完整回答。");
  });

  it("delegates login and close operations to the browser adapter", async function() {
    const context = createContext();
    assert.deepEqual(await context.service.getLoginState(), { status: "authenticated" });
    assert.deepEqual(await context.service.openLogin(), { status: "authenticated" });
    await context.service.close();
    assert.deepEqual(context.calls, ["getLoginState", "openLogin", "close"]);
  });

  it("rejects disabled questions before opening the browser", async function() {
    const context = createContext({ question: { enabled: false } });

    await assert.rejects(context.service.collectOne({ clientId: "client-1", questionId: "question-1", force: false }), function(error) {
      return error.code === "DOUBAO_QUESTION_DISABLED";
    });
    assert.deepEqual(context.calls, ["getQuestion"]);
  });

  it("rejects an existing result unless force is true", async function() {
    const context = createContext();
    context.researchStore.saveResearch("client-1", oldRecord());

    await assert.rejects(context.service.collectOne({ clientId: "client-1", questionId: "question-1", force: false }), function(error) {
      return error.code === "DOUBAO_RESEARCH_EXISTS";
    });
    assert.equal(context.calls.includes("collect"), false);
  });

  it("overwrites an existing result only after a forced collection succeeds", async function() {
    const context = createContext();
    context.researchStore.saveResearch("client-1", oldRecord());

    const saved = await context.service.collectOne({ clientId: "client-1", questionId: "question-1", force: true });
    assert.equal(saved.answerText, "这是一个长度足够的自动采集回答。");
    assert.equal(context.researchStore.getResearch("client-1", "question-1").answerText, saved.answerText);
  });

  it("rejects an invalid client/question pairing before collection", async function() {
    const context = createContext({ question: { clientId: "client-2" } });

    await assert.rejects(context.service.collectOne({ clientId: "client-1", questionId: "question-1", force: false }), function(error) {
      return error.code === "DOUBAO_CLIENT_QUESTION_MISMATCH";
    });
    assert.deepEqual(context.calls, ["getQuestion"]);
  });

  it("rejects unsafe identifiers before reading a question", async function() {
    const context = createContext();

    await assert.rejects(context.service.collectOne({ clientId: "../client-1", questionId: "question-1" }), function(error) {
      return error.code === "DOUBAO_INVALID_ID";
    });
    assert.deepEqual(context.calls, []);
  });

  it("does not save invalid references or short answers", async function() {
    const invalidReference = createContext({ collection: {
      answerText: "这是一个长度足够的自动采集回答。",
      references: [{ title: "坏链接", url: "javascript:alert(1)" }]
    } });
    await assert.rejects(invalidReference.service.collectOne({ clientId: "client-1", questionId: "question-1" }), function(error) {
      return error.code === "RESEARCH_INVALID_REFERENCE";
    });
    assert.equal(invalidReference.research.size, 0);

    const shortAnswer = createContext({ collection: { answerText: "太短", references: [] } });
    await assert.rejects(shortAnswer.service.collectOne({ clientId: "client-1", questionId: "question-1" }), function(error) {
      return error.code === "RESEARCH_INVALID_ANSWER";
    });
    assert.equal(shortAnswer.research.size, 0);
  });

  it("deletes research before the question and returns deletion snapshots", function() {
    const context = createContext();
    context.researchStore.saveResearch("client-1", oldRecord());

    const deleted = context.service.deleteQuestionAndResearch({ clientId: "client-1", questionId: "question-1" });
    assert.equal(deleted.question.id, "question-1");
    assert.equal(deleted.research.id, "question-1");
    assert.deepEqual(context.calls.slice(-4), ["getQuestion", "getResearch", "deleteResearch", "deleteQuestion"]);
    assert.throws(function() { context.questionStore.getQuestion("client-1", "question-1"); }, function(error) { return error.code === "QUESTION_NOT_FOUND"; });
    assert.throws(function() { context.researchStore.getResearch("client-1", "question-1"); }, function(error) { return error.code === "RESEARCH_NOT_FOUND"; });
  });

  it("restores research and rethrows the original question deletion error", function() {
    const deletionError = coded("QUESTION_DELETE_FAILED", "Question deletion failed");
    const context = createContext({ deleteQuestionError: deletionError });
    const old = oldRecord();
    context.researchStore.saveResearch("client-1", old);

    assert.throws(function() {
      context.service.deleteQuestionAndResearch({ clientId: "client-1", questionId: "question-1" });
    }, function(error) {
      return error === deletionError;
    });
    assert.deepEqual(context.researchStore.getResearch("client-1", "question-1"), Object.assign({}, old, { clientId: "client-1" }));
  });

  it("reports compensation failure instead of silently succeeding", function() {
    const deletionError = coded("QUESTION_DELETE_FAILED", "Question deletion failed");
    const context = createContext({
      deleteQuestionError: deletionError,
      onDeleteQuestion: function(setFailSave) { setFailSave(true); }
    });
    context.researchStore.saveResearch("client-1", oldRecord());

    assert.throws(function() {
      context.service.deleteQuestionAndResearch({ clientId: "client-1", questionId: "question-1" });
    }, function(error) {
      return error.code === "DOUBAO_RESEARCH_RESTORE_FAILED" && error.cause === deletionError;
    });
  });

  it("does not delete the question when research deletion fails", function() {
    const context = createContext({ deleteResearchError: coded("RESEARCH_DELETE_FAILED", "Research deletion failed") });
    context.researchStore.saveResearch("client-1", oldRecord());

    assert.throws(function() {
      context.service.deleteQuestionAndResearch({ clientId: "client-1", questionId: "question-1" });
    }, function(error) {
      return error.code === "RESEARCH_DELETE_FAILED";
    });
    assert.equal(context.calls.includes("deleteQuestion"), false);
  });
});
