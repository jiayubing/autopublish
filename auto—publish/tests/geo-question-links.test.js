"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createGeoKnowledgeStore,
} = require("../src/content/geo-knowledge-store");
const { normalizeCandidate } = require("../src/content/geo-knowledge-merge");
const { createGeoQuestionLinks } = require("../src/content/geo-question-links");
const { createResearchStore } = require("../src/content/research-store");
const {
  createDoubaoCollectionDesktopService,
} = require("../desktop/services/doubao-collection-service");
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "geo-links-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "clients", "client-1"), { recursive: true });
  const store = createGeoKnowledgeStore({ workspaceRoot: root });
  const document = store.save(
    normalizeCandidate(
      {
        profile: { basis: "fact", sourceIds: ["client-input"], fields: { name: "合成客户", aliases: "合成别名、Synthetic Co" } },
        geoQuestions: [
          { name: "如何选择服务？", intent: "selection" },
          { name: "有哪些适用场景？", intent: "scenario" },
        ],
      },
      [{ id: "client-input", type: "client_input", title: "客户输入" }],
      "client-1",
    ),
    0,
  );
  const researchStore = createResearchStore(root);
  const questionService = createDoubaoCollectionDesktopService({
    workspaceRoot: root,
    researchStore,
    browserAdapter: {
      collect: () => {
        throw new Error("network forbidden");
      },
    },
  });
  const options = {
    store,
    researchStore,
    questionService,
    getClient: () => ({ name: "合成客户" }),
  };
  return { ...options, document, links: createGeoQuestionLinks(options) };
}
test("linking reuses normalized existing questions, preserves disabled and rejects stale before mutation", (t) => {
  const c = setup(t);
  const existing = c.questionService.createQuestion({
    clientId: "client-1",
    text: " 如何选择服务？ ",
    enabled: false,
  });
  const input = {
    clientId: "client-1",
    revision: 1,
    ids: c.document.geoQuestions.map((q) => q.id),
  };
  const saved = c.links.linkQuestions(input).knowledge;
  assert.equal(saved.geoQuestions[0].questionId, existing.id);
  assert.equal(c.questionService.listQuestions("client-1")[0].enabled, false);
  assert.throws(() => c.links.linkQuestions(input), {
    code: "GEO_REVISION_CONFLICT",
  });
  c.links.linkQuestions({ ...input, revision: saved.revision });
  assert.equal(c.questionService.listQuestions("client-1").length, 2);
});
test("failed knowledge save reports partial and retry links the already persisted questions without duplicates", (t) => {
  const c = setup(t);
  let fail = true;
  const links = createGeoQuestionLinks({
    ...c,
    store: {
      ...c.store,
      save: (...args) => {
        if (fail)
          throw Object.assign(new Error("private"), {
            code: "GEO_SAVE_FAILED",
          });
        return c.store.save(...args);
      },
    },
  });
  const input = {
    clientId: "client-1",
    revision: 1,
    ids: c.document.geoQuestions.map((q) => q.id),
  };
  assert.throws(
    () => links.linkQuestions({ ...input, ids: [...input.ids, "missing"] }),
    { code: "GEO_ITEM_NOT_FOUND" },
  );
  assert.equal(c.questionService.listQuestions("client-1").length, 0);
  assert.throws(() => links.linkQuestions(input), { code: "GEO_LINK_PARTIAL" });
  assert.equal(c.store.load("client-1").revision, 1);
  fail = false;
  const saved = links.linkQuestions(input).knowledge;
  assert.equal(c.questionService.listQuestions("client-1").length, 2);
  assert.ok(saved.geoQuestions.every((q) => q.questionId));
});
test("real answers stay in research owner; changed and deleted questions cannot expose stale answers", (t) => {
  const c = setup(t);
  const id = c.document.geoQuestions[0].id;
  assert.equal(
    c.links.questionDetails({ clientId: "client-1", id }).linkStatus,
    "unlinked",
  );
  const saved = c.links.linkQuestions({
    clientId: "client-1",
    revision: 1,
    ids: [id],
  }).knowledge;
  const questionId = saved.geoQuestions[0].questionId;
  const record = {
    id: questionId,
    question: saved.geoQuestions[0].name,
    answerText: "synthetic co 提供服务，选择时请核对具体服务范围。",
    references: [{ title: "合成来源", url: "https://example.com/source" }],
    collectedAt: "2026-09-19T00:00:00.000Z",
    collectionMethod: "manual",
  };
  c.researchStore.saveResearch("client-1", record);
  const details = c.links.questionDetails({ clientId: "client-1", id });
  assert.equal(details.clientMentioned, true);
  assert.equal(details.research.answerText, record.answerText);
  assert.equal(
    JSON.stringify(c.store.load("client-1")).includes(record.answerText),
    false,
  );
  c.store.edit("client-1", saved.revision, "geoQuestions", id, {
    name: "改变的问题",
  });
  assert.equal(
    c.links.questionDetails({ clientId: "client-1", id }).research,
    null,
  );
  assert.equal(
    c.researchStore.getResearch("client-1", questionId).answerText,
    record.answerText,
  );
  c.questionService.deleteQuestion({ clientId: "client-1", questionId });
  assert.equal(
    c.links.questionDetails({ clientId: "client-1", id }).linkStatus,
    "stale",
  );
});
