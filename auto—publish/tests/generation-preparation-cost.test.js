"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const {
  createGeoKnowledgeStore,
} = require("../src/content/geo-knowledge-store");
const {
  createGeoKnowledgeService,
} = require("../desktop/services/geo-knowledge-service");
const { normalizeCandidate } = require("../src/content/geo-knowledge-merge");
const {
  createContentGenerationBatchService,
} = require("../desktop/services/content-generation-batch-service");
const {
  createGenerationBatchStore,
} = require("../src/content/generation-batch-store");
const {
  createGenerationBatchRunner,
} = require("../src/content/generation-batch-runner");

test("create resolves fresh knowledge once and progress excludes frozen prose before serialization", async (t) => {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "generation-preparation-"),
  );
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  const knowledgeStore = createGeoKnowledgeStore({ workspaceRoot });
  const document = normalizeCandidate(
    {
      profile: { fields: { name: "合成客户" } },
      geoQuestions: [{ name: "如何选择服务？", intent: "selection" }],
    },
    [],
    "c1",
  );
  document.geoQuestions[0].questionId = "q1";
  document.deliverable = {
    version: 1,
    knowledgeRevision: 0,
    contentRevision: 1,
    savedAt: "2026-10-02T00:00:00.000Z",
    indexStatus: "current",
    sourceIds: [],
    status: "complete",
    origin: "manual",
    markdown: "## 产品或服务描述\n\n" + "合成客户服务资料。".repeat(3000),
    warnings: [],
  };
  const saved = knowledgeStore.save(document, 0);
  const runs = knowledgeStore.runDirectory("c1", true);
  for (let index = 0; index < 20; index++) {
    const directory = path.join(runs, `run-${index}`);
    fs.mkdirSync(directory);
    fs.writeFileSync(
      path.join(directory, "run-outcome.json"),
      JSON.stringify({ phase: "complete" }),
    );
  }
  const geo = createGeoKnowledgeService({
    workspaceRoot,
    store: knowledgeStore,
    getClient: () => ({ id: "c1", name: "合成客户" }),
    questionService: {
      listQuestions: () => [
        { id: "q1", clientId: "c1", text: "如何选择服务？", enabled: true },
      ],
    },
    researchStore: {
      getResearch: () => ({
        id: "q1",
        clientId: "c1",
        question: "如何选择服务？",
        answerText: "合成客户服务资料。",
        references: [],
        collectedAt: "2026-10-02T00:00:00.000Z",
      }),
    },
  });
  const store = createGenerationBatchStore({ workspaceRoot });
  const service = createContentGenerationBatchService({
    workspaceRoot,
    batchStore: store,
    contentStore: { saveArticle() {}, findByGenerationTaskId: () => null },
    templateStore: {
      getCatalogTemplate: () => ({ id: "guide", body: "Write" }),
    },
    getGenerationBriefV2: geo.getGenerationBriefV2,
    aiProviderService: { getFingerprint: () => "synthetic" },
  });
  t.after(async () => {
    await service.dispose();
    geo.dispose();
  });
  const input = {
    requestId: "measured",
    selectedQuestions: [
      { clientId: "c1", geoQuestionId: saved.geoQuestions[0].id },
    ],
    templates: [{ platform: "media", templateId: "guide" }],
  };
  let knowledgeReads = 0,
    historyScans = 0,
    createMs;
  const read = fs.readFileSync,
    list = fs.readdirSync;
  let batch;
  try {
    fs.readFileSync = function (file, ...args) {
      if (String(file).endsWith(path.sep + "c1.json")) knowledgeReads++;
      return read.call(this, file, ...args);
    };
    fs.readdirSync = function (directory, ...args) {
      if (String(directory) === runs) historyScans++;
      return list.call(this, directory, ...args);
    };
    const started = performance.now();
    batch = await service.createBatchV2(input);
    createMs = performance.now() - started;
  } finally {
    fs.readFileSync = read;
    fs.readdirSync = list;
  }
  const persisted = store.getBatch(batch.id);
  const frozen = JSON.stringify(persisted.proseBriefs);
  const progress = [];
  const runner = createGenerationBatchRunner({
    batchStore: store,
    executeTask: async () => ({ id: "article-1" }),
  });
  runner.subscribe((event) => progress.push(event));
  let serializedCharacters = 0,
    serializations = 0,
    writeMs = 0;
  const stringify = JSON.stringify,
    write = fs.writeFileSync;
  try {
    JSON.stringify = function (...args) {
      const result = stringify.apply(this, args);
      serializedCharacters += result?.length || 0;
      serializations++;
      return result;
    };
    fs.writeFileSync = function (...args) {
      const started = performance.now();
      try {
        return write.apply(this, args);
      } finally {
        writeMs += performance.now() - started;
      }
    };
    await runner.run(batch.id, "pending");
  } finally {
    JSON.stringify = stringify;
    fs.writeFileSync = write;
    await runner.dispose();
  }
  const eventBytes = Buffer.byteLength(JSON.stringify(progress));
  console.log(
    JSON.stringify({
      generationPreparation: {
        knowledgeReads,
        historyScans,
        createMs,
        eventBytes,
        serializedCharacters,
        serializations,
        writeMs,
      },
    }),
  );
  assert.equal(knowledgeReads, 1);
  assert.equal(
    historyScans,
    0,
    "preparation only reads canonical knowledge, not run history",
  );
  assert.ok(progress.length > 0);
  assert.ok(progress.every((event) => event.batch?.proseBriefs === undefined));
  assert.equal(JSON.stringify(store.getBatch(batch.id).proseBriefs), frozen);
  assert.equal(store.getBatch(batch.id).tasks[0].articleId, "article-1");
});
