import assert from "node:assert/strict";
import test from "node:test";

import { createContentSourcesFeature } from "../media-workbench/src/features/content/content-sources-feature.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function question(id, text, enabled = true) {
  return {
    id,
    text,
    enabled,
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
  };
}

function research(id, clientId, questionText) {
  return {
    id,
    clientId,
    question: questionText,
    answerText: `回答 ${id}`,
    references: [],
    collectionMethod: "manual",
  };
}

function queueState(status, tasks) {
  return {
    status,
    currentTaskId: null,
    completed: status === "completed" ? tasks.length : 0,
    total: tasks.length,
    waitRemainingMs: 0,
    tasks,
  };
}

function normalizedText(value) {
  return value.trim().replace(/\s+/g, " ");
}

async function makeFeature(t, options = {}) {
  const questionData = new Map([
    ["client-a", [question("question-1", "原问题"), question("question-2", "其他问题")]],
    ["client-b", [question("question-b", "客户 B 问题")]],
    ...(options.questions || []),
  ]);
  const researchData = new Map([
    ["client-a", [research("question-1", "client-a", "原问题"), research("question-2", "client-a", "其他问题")]],
    ["client-b", [research("question-b", "client-b", "客户 B 问题")]],
    ...(options.research || []),
  ]);
  const calls = {
    listQuestions: 0,
    getClientDetails: 0,
    listResearchMetadata: 0,
    listResearch: 0,
  };
  const clients = [
    { id: "client-a", name: "客户 A" },
    { id: "client-b", name: "客户 B" },
  ];
  const cloneItems = (items) => items.map((item) => ({ ...item }));
  const adapters = {
    listClients: async () => clients.map((client) => ({ ...client })),
    listTemplateCatalog: async () => ({ revision: "catalog-1", platforms: [], templates: [], diagnostics: [] }),
    listQuestions: async (clientId) => {
      calls.listQuestions += 1;
      return cloneItems(questionData.get(clientId) || []);
    },
    listResearch: async (clientId) => {
      calls.listResearch += 1;
      return cloneItems(researchData.get(clientId) || []);
    },
    listResearchMetadata: async (clientId) => {
      calls.listResearchMetadata += 1;
      return cloneItems(researchData.get(clientId) || []);
    },
    getClientDetails: async (clientId) => {
      calls.getClientDetails += 1;
      const client = clients.find((item) => item.id === clientId);
      return {
        client: { ...client },
        research: cloneItems(researchData.get(clientId) || []),
      };
    },
    createQuestion: async (input) => {
      const created = question("question-created", input.text.trim(), input.enabled);
      questionData.set(input.clientId, [...(questionData.get(input.clientId) || []), created]);
      return { ...created };
    },
    updateQuestion: async (input) => {
      const current = questionData.get(input.clientId).find((item) => item.id === input.questionId);
      const updated = {
        ...current,
        ...(input.text === undefined ? {} : { text: input.text.trim() }),
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        updatedAt: "2026-09-16T00:01:00.000Z",
      };
      questionData.set(input.clientId, questionData.get(input.clientId).map((item) =>
        item.id === input.questionId ? updated : item));
      if (normalizedText(updated.text) !== normalizedText(current.text))
        researchData.set(input.clientId, (researchData.get(input.clientId) || []).filter((item) => item.id !== input.questionId));
      return { ...updated };
    },
    deleteQuestion: async (input) => {
      const current = questionData.get(input.clientId).find((item) => item.id === input.questionId);
      questionData.set(input.clientId, questionData.get(input.clientId).filter((item) => item.id !== input.questionId));
      researchData.set(input.clientId, (researchData.get(input.clientId) || []).filter((item) => item.id !== input.questionId));
      return { ...current };
    },
    ...options.adapters,
  };
  const feature = createContentSourcesFeature(adapters);
  t.after(() => feature.dispose());
  feature.setScope({ workspaceRuntimeId: "runtime-1" });
  await feature.refresh("initial");
  return { feature, calls, questionData, researchData };
}

function readCounts(calls) {
  return {
    listQuestions: calls.listQuestions,
    getClientDetails: calls.getClientDetails,
    listResearchMetadata: calls.listResearchMetadata,
  };
}

test("createQuestion applies the returned question without rereading client data", async (t) => {
  const value = await makeFeature(t);
  const baseline = readCounts(value.calls);

  const created = await value.feature.commands.createQuestion({
    clientId: "client-a",
    text: "新增问题",
    enabled: true,
  });

  assert.equal(created.id, "question-created");
  assert.deepEqual(value.feature.getSnapshot().questions.map((item) => item.id), [
    "question-1",
    "question-2",
    "question-created",
  ]);
  assert.equal(value.feature.getSnapshot().questions.at(-1).text, "新增问题");
  assert.deepEqual(readCounts(value.calls), baseline);
});

test("enabled-only question updates replace the question without rereading client data", async (t) => {
  const value = await makeFeature(t);
  const baseline = readCounts(value.calls);

  await value.feature.commands.updateQuestion({
    clientId: "client-a",
    questionId: "question-1",
    enabled: false,
  });

  assert.equal(value.feature.getSnapshot().questions.find((item) => item.id === "question-1").enabled, false);
  assert.deepEqual(value.feature.getSnapshot().research.map((item) => item.id), ["question-1", "question-2"]);
  assert.deepEqual(readCounts(value.calls), baseline);
});

test("text question updates invalidate only the edited question research without rereading client data", async (t) => {
  const value = await makeFeature(t);
  const baseline = readCounts(value.calls);

  await value.feature.commands.updateQuestion({
    clientId: "client-a",
    questionId: "question-1",
    text: "修改后的问题",
  });

  const snapshot = value.feature.getSnapshot();
  assert.equal(snapshot.questions.find((item) => item.id === "question-1").text, "修改后的问题");
  assert.deepEqual(snapshot.research.map((item) => item.id), ["question-2"]);
  assert.deepEqual(snapshot.researchByClient["client-a"].map((item) => item.id), ["question-2"]);
  assert.deepEqual(snapshot.researchByClient["client-b"].map((item) => item.id), ["question-b"]);
  assert.deepEqual(readCounts(value.calls), baseline);
});

test("deleteQuestion removes the question and its research without rereading client data", async (t) => {
  const value = await makeFeature(t);
  const baseline = readCounts(value.calls);

  await value.feature.commands.deleteQuestion({
    clientId: "client-a",
    questionId: "question-1",
  });

  const snapshot = value.feature.getSnapshot();
  assert.deepEqual(snapshot.questions.map((item) => item.id), ["question-2"]);
  assert.deepEqual(snapshot.research.map((item) => item.id), ["question-2"]);
  assert.deepEqual(snapshot.researchByClient["client-a"].map((item) => item.id), ["question-2"]);
  assert.deepEqual(snapshot.researchByClient["client-b"].map((item) => item.id), ["question-b"]);
  assert.deepEqual(readCounts(value.calls), baseline);
});

test("question command errors do not write unpersisted state", async (t) => {
  const pendingError = Object.assign(new Error("write failed"), {
    code: "QUESTION_WRITE_FAILED",
    userMessage: "问题保存失败，请重试。",
  });
  const value = await makeFeature(t, {
    adapters: {
      updateQuestion: async () => { throw pendingError; },
    },
  });
  const before = value.feature.getSnapshot();
  const baseline = readCounts(value.calls);

  await assert.rejects(
    value.feature.commands.updateQuestion({
      clientId: "client-a",
      questionId: "question-1",
      text: "未持久化的问题",
    }),
    { code: "QUESTION_WRITE_FAILED" },
  );

  const after = value.feature.getSnapshot();
  assert.deepEqual(after.questions, before.questions);
  assert.deepEqual(after.research, before.research);
  assert.deepEqual(readCounts(value.calls), baseline);
});

test("a stale question command cannot write into the newly selected client", async (t) => {
  const pending = deferred();
  const value = await makeFeature(t, {
    adapters: {
      updateQuestion: () => pending.promise,
    },
  });

  const command = value.feature.commands.updateQuestion({
    clientId: "client-a",
    questionId: "question-1",
    text: "旧客户的迟到更新",
  });
  await value.feature.selectClient("client-b");
  const afterSwitch = readCounts(value.calls);

  pending.resolve(question("question-1", "旧客户的迟到更新"));
  assert.deepEqual(await command, { stale: true, code: "CONTENT_COMMAND_STALE", reason: "scope-changed" });
  assert.equal(value.feature.getSnapshot().selectedClientId, "client-b");
  assert.deepEqual(value.feature.getSnapshot().questions.map((item) => item.id), ["question-b"]);
  assert.deepEqual(value.feature.getSnapshot().research.map((item) => item.id), ["question-b"]);
  assert.deepEqual(readCounts(value.calls), afterSwitch);
});

test("manual research applies the returned record without rereading client data", async (t) => {
  const value = await makeFeature(t, {
    adapters: {
      saveManualResearch: async () => {
        const saved = {
          ...research("question-1", "client-a", "原问题"),
          answerText: "新的人工回答",
          updatedAt: "2026-09-16T00:02:00.000Z",
        };
        const current = value.researchData.get("client-a") || [];
        value.researchData.set("client-a", [
          saved,
          ...current.filter((item) => item.id !== saved.id),
        ]);
        return saved;
      },
    },
  });
  const baseline = readCounts(value.calls);

  const saved = await value.feature.commands.saveManualResearch({
    clientId: "client-a",
    questionId: "question-1",
    answerText: "新的人工回答",
    references: [],
  });

  assert.equal(saved.answerText, "新的人工回答");
  assert.equal(value.feature.getSnapshot().research.find((item) => item.id === "question-1").answerText, "新的人工回答");
  assert.equal(value.feature.getSnapshot().researchByClient["client-a"].find((item) => item.id === "question-1").answerText, "新的人工回答");
  assert.deepEqual(value.feature.getSnapshot().researchByClient["client-b"].map((item) => item.id), ["question-b"]);
  assert.deepEqual(readCounts(value.calls), baseline);
});

test("Doubao collection applies the returned research without rereading client data", async (t) => {
  const value = await makeFeature(t, {
    adapters: {
      collectDoubaoQuestion: async () => {
        const collected = {
          ...research("question-1", "client-a", "原问题"),
          answerText: "新的豆包回答",
          collectionMethod: "automatic",
        };
        const current = value.researchData.get("client-a") || [];
        value.researchData.set("client-a", [
          collected,
          ...current.filter((item) => item.id !== collected.id),
        ]);
        return collected;
      },
    },
  });
  const baseline = readCounts(value.calls);

  const collected = await value.feature.commands.collectDoubaoQuestion({
    clientId: "client-a",
    questionId: "question-1",
  });

  assert.equal(collected.answerText, "新的豆包回答");
  assert.equal(value.feature.getSnapshot().research.find((item) => item.id === "question-1").answerText, "新的豆包回答");
  assert.equal(value.feature.getSnapshot().researchByClient["client-a"].find((item) => item.id === "question-1").collectionMethod, "automatic");
  assert.deepEqual(readCounts(value.calls), baseline);
});

test("single collection completion skips queue refresh while batch completion still refreshes", async (t) => {
  let queueListener;
  const batchTask = {
    id: "batch-task",
    clientId: "client-a",
    questionId: "question-1",
    status: "succeeded",
  };
  const value = await makeFeature(t, {
    adapters: {
      subscribeDoubaoQueue: (listener) => {
        queueListener = listener;
        return () => { queueListener = undefined; };
      },
      collectDoubaoQuestion: async (input) => {
        const task = {
          id: "single-task",
          clientId: input.clientId,
          questionId: input.questionId,
          status: "succeeded",
        };
        queueListener(queueState("running", [{ ...task, status: "running" }]));
        const collected = {
          ...research(input.questionId, input.clientId, "原问题"),
          answerText: "订阅链路采集结果",
          collectionMethod: "automatic",
        };
        value.researchData.set(input.clientId, [
          collected,
          ...(value.researchData.get(input.clientId) || []).filter(
            (item) => item.id !== collected.id,
          ),
        ]);
        queueListener(queueState("completed", [task]));
        return collected;
      },
      startPreparedDoubaoBatch: async () => {
        queueListener(queueState("running", [{ ...batchTask, status: "running" }]));
        const completed = queueState("completed", [batchTask]);
        queueListener(completed);
        return completed;
      },
    },
  });
  const baseline = readCounts(value.calls);

  await value.feature.commands.collectDoubaoQuestion({
    clientId: "client-a",
    questionId: "question-1",
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(
    value.feature.getSnapshot().research.find((item) => item.id === "question-1").answerText,
    "订阅链路采集结果",
  );
  assert.deepEqual(readCounts(value.calls), baseline);

  await value.feature.commands.startPreparedDoubaoBatch({
    clientIds: ["client-a"],
    mode: "all",
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(readCounts(value.calls), {
    listQuestions: baseline.listQuestions + 1,
    getClientDetails: baseline.getClientDetails + 1,
    listResearchMetadata: baseline.listResearchMetadata + 2,
  });
});

test("a stale research command cannot write into the newly selected client", async (t) => {
  const pending = deferred();
  const value = await makeFeature(t, {
    adapters: {
      collectDoubaoQuestion: () => pending.promise,
    },
  });

  const command = value.feature.commands.collectDoubaoQuestion({
    clientId: "client-a",
    questionId: "question-1",
  });
  await value.feature.selectClient("client-b");

  pending.resolve(research("question-1", "client-a", "迟到回答"));
  assert.deepEqual(await command, { stale: true, code: "CONTENT_COMMAND_STALE", reason: "scope-changed" });
  assert.equal(value.feature.getSnapshot().selectedClientId, "client-b");
  assert.deepEqual(value.feature.getSnapshot().research.map((item) => item.id), ["question-b"]);
  assert.deepEqual(value.feature.getSnapshot().researchByClient["client-a"].map((item) => item.id), ["question-1", "question-2"]);
});

test("a stale research command cannot write into the newly selected workspace", async (t) => {
  const pending = deferred();
  const value = await makeFeature(t, {
    adapters: {
      collectDoubaoQuestion: () => pending.promise,
    },
  });

  const command = value.feature.commands.collectDoubaoQuestion({
    clientId: "client-a",
    questionId: "question-1",
  });
  value.feature.setScope({ workspaceRuntimeId: "runtime-2" });

  pending.resolve(research("question-1", "client-a", "旧工作区回答"));
  assert.deepEqual(await command, { stale: true, code: "CONTENT_COMMAND_STALE", reason: "scope-changed" });
  assert.equal(value.feature.getSnapshot().scope.workspaceRuntimeId, "runtime-2");
  assert.equal(value.feature.getSnapshot().selectedClientId, "");
  assert.deepEqual(value.feature.getSnapshot().research, []);
});
