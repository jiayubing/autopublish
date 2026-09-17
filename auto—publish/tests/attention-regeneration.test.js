const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createArticleStore } = require("../src/content/article-store");
const { createContentStore } = require("../src/content/content-store");
const {
  createGenerationBatchStore,
} = require("../src/content/generation-batch-store");
const {
  createArticleAttentionQuery,
} = require("../desktop/services/article-attention-query");
const {
  createContentGenerationBatchService,
} = require("../desktop/services/content-generation-batch-service");

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "attention-regeneration-"),
  );
  const articles = createArticleStore(root);
  const store = createContentStore({
    articleStore: articles,
    listClientIds: () => ["client-1"],
  });
  const publications = [1, 2].map((n) => ({
    publicationId: `publication-${n}`,
    attemptId: `attempt-${n}`,
    clientId: "client-1",
    articleId: `original-${n}`,
    platformId: "hepan",
    status: "failed",
    reasonCode: "HEPAN_CONTENT_REJECTED",
  }));
  for (const n of [1, 2])
    store.createArticle({
      id: `original-${n}`,
      clientId: "client-1",
      title: `Original ${n}`,
      content: "Original body",
      status: "generated",
      platform: "hepan",
      templateId: "guide",
      scenario: "guide",
      researchQueryIds: [`question-${n}`],
      researchSnapshots: [
        {
          questionId: `question-${n}`,
          question: "Question",
          answerText: "Answer",
          references: [],
          collectedAt: "2026-09-17T00:00:00.000Z",
          collectionMethod: "manual",
        },
      ],
      materialSnapshots: [
        {
          id: `material-${n}`,
          name: `material-${n}.md`,
          extension: ".md",
          content: "Client facts",
          contentHash: "fixture",
          source: "text",
        },
      ],
      source: {
        client_material: true,
        doubao_answer: true,
        references: false,
        template: true,
      },
      createdAt: "2026-09-17T00:00:00.000Z",
    });
  const originals = [1, 2].map((n) =>
    store.getArticle("client-1", `original-${n}`),
  );
  const query = createArticleAttentionQuery({
    operationalStore: {
      listPublicationAttention: () => structuredClone(publications),
    },
    readers: { getArticle: store.getArticle },
  });
  const ids = query.list().items.map((item) => item.attentionId);
  let calls = 0;
  const prompts = [];
  const batchStore = createGenerationBatchStore({ workspaceRoot: root });
  function createService() {
    return createContentGenerationBatchService({
      workspaceRoot: root,
      batchStore,
      contentStore: store,
      getAttentionItems(ids) {
        query.invalidate();
        return ids.map((attentionId) => query.get({ attentionId }));
      },
      clientKnowledge: {
        getClient: () => ({ id: "client-1", name: "Synthetic client" }),
      },
      materialStore: {
        async listMaterials() {
          if (options.beforePreview) await options.beforePreview();
          return [1, 2].map((n) => ({
            id: `material-${n}`,
            name: `material-${n}.md`,
            content: "Client facts",
            status: "ready",
          }));
        },
        async getSelectedMaterials(clientId, materialIds) {
          return materialIds.map((id) => ({
            id,
            name: `${id}.md`,
            extension: ".md",
            content: "Client facts",
            status: "ready",
          }));
        },
      },
      researchStore: {
        listResearch: () =>
          [1, 2].map((n) => ({
            id: `question-${n}`,
            question: `Question ${n}`,
            answerText: "Research answer",
          })),
        getResearch: (clientId, id) => ({
          id,
          question: id,
          answerText: "Research answer",
          collectedAt: "2026-09-17T00:00:00.000Z",
          collectionMethod: "manual",
        }),
      },
      templateStore: {
        getCatalogTemplate: () => ({
          body: "Write using facts",
          name: "Guide",
        }),
      },
      buildPrompt(input) {
        prompts.push(input);
        return { system: "Synthetic test", user: input.researchQueryIds[0] };
      },
      aiProviderService: {
        getFingerprint: () => "synthetic-provider",
        createClient: () => ({
          async complete(messages) {
            calls++;
            if (options.complete) return options.complete(messages, calls);
            return "# New article\nNew body";
          },
        }),
      },
    });
  }
  const service = createService();
  t.after(async () => {
    await service.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    service,
    createService,
    batchStore,
    store,
    originals,
    publications,
    ids,
    prompts,
    calls: () => calls,
  };
}

function command(ids, requestId = "request-1") {
  return { requestId, attentionIds: ids, confirmed: true, concurrency: 2 };
}
async function terminal(service, id) {
  for (let n = 0; n < 200; n++) {
    const batch = service.getBatch(id);
    if (
      ["completed", "failed"].includes(batch.status) &&
      !service.getState().isBatchRunning
    )
      return batch;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("generation did not terminate");
}

for (const count of [1, 2])
  test(`regenerates ${count} content failures through persisted generation tasks without modifying originals`, async (t) => {
    const f = fixture(t);
    const originalFailures = structuredClone(f.publications);
    const batch = await f.service.regenerateAttentionItems(
      command(f.ids.slice(0, count)),
    );
    const result = await terminal(f.service, batch.id);
    assert.equal(result.counts.succeeded, count, JSON.stringify(result.tasks));
    assert.equal(f.calls(), count);
    assert.equal(f.store.listArticles("client-1").length, 2 + count);
    assert.deepEqual(
      [1, 2].map((n) => f.store.getArticle("client-1", `original-${n}`)),
      f.originals,
    );
    assert.deepEqual(f.publications, originalFailures);
    for (const task of result.tasks) {
      const article = f.store.getArticle(task.clientId, task.articleId);
      const original = f.store.getArticle(task.clientId, task.sourceArticleId);
      assert.notEqual(article.id, original.id);
      assert.equal(article.clientId, original.clientId);
      assert.equal(article.status, "generated");
      assert.equal(article.generationBatchId, batch.id);
      assert.equal(article.generationTaskId, task.id);
      assert.deepEqual(article.researchQueryIds, original.researchQueryIds);
      assert.deepEqual(
        article.materialSnapshots.map((s) => s.id),
        original.materialSnapshots.map((s) => s.id),
      );
      assert.equal(article.templateId, original.templateId);
      assert.equal(article.platform, original.platform);
      assert.ok(f.ids.includes(task.sourceAttentionId));
    }
  });

test("partial AI failure preserves successful articles and has durable per-task outcomes", async (t) => {
  const f = fixture(t, {
    complete: async (messages) => {
      if (messages[1].content === "question-2")
        throw Object.assign(new Error("synthetic failure"), {
          code: "AI_EMPTY_RESPONSE",
        });
      return "# New\nBody";
    },
  });
  const batch = await f.service.regenerateAttentionItems(command(f.ids));
  const result = await terminal(f.service, batch.id);
  assert.equal(result.status, "failed");
  assert.equal(result.counts.succeeded, 1);
  assert.equal(result.counts.failed, 1);
  assert.equal(f.store.listArticles("client-1").length, 3);
  assert.equal(
    result.tasks.find((task) => task.status === "failed").articleId,
    null,
  );
});

for (const reason of [
  "HEPAN_QUOTA_EXHAUSTED",
  "HEPAN_CREDENTIALS_INVALID",
  "HEPAN_RATE_LIMITED",
  "UNKNOWN",
])
  test(`rejects mixed selections including ${reason} before creating work`, async (t) => {
    const f = fixture(t);
    f.publications[1].reasonCode = reason;
    await assert.rejects(f.service.regenerateAttentionItems(command(f.ids)), {
      code: "GENERATION_CONTENT_FAILURE_REQUIRED",
    });
    assert.equal(f.batchStore.listBatches().length, 0);
    assert.equal(f.calls(), 0);
  });

test("stale failure, duplicate identity and missing source never start AI", async (t) => {
  const f = fixture(t);
  await assert.rejects(
    f.service.regenerateAttentionItems(command([f.ids[0], f.ids[0]])),
    { code: "GENERATION_INPUT_INVALID" },
  );
  f.publications[0].status = "uncertain";
  await assert.rejects(f.service.regenerateAttentionItems(command(f.ids)), {
    code: "GENERATION_CONTENT_FAILURE_REQUIRED",
  });
  f.publications[0].status = "failed";
  const original = f.store.getArticle("client-1", "original-1");
  delete original.materialSnapshots;
  f.store.saveArticle(original);
  await assert.rejects(f.service.regenerateAttentionItems(command(f.ids)), {
    code: "GENERATION_SOURCE_INVALID",
  });
  assert.equal(f.calls(), 0);
  assert.equal(f.batchStore.listBatches().length, 0);
});

test("duplicate request survives service restart and never repeats AI; changed selection conflicts", async (t) => {
  const f = fixture(t);
  const batch = await f.service.regenerateAttentionItems(command(f.ids));
  await terminal(f.service, batch.id);
  assert.equal(
    (await f.service.regenerateAttentionItems(command(f.ids))).id,
    batch.id,
  );
  const restarted = f.createService();
  t.after(() => restarted.dispose());
  assert.equal(
    (await restarted.regenerateAttentionItems(command(f.ids))).id,
    batch.id,
  );
  await assert.rejects(
    restarted.regenerateAttentionItems(command(f.ids.slice(0, 1))),
    { code: "GENERATION_TASK_CONFLICT" },
  );
  assert.equal(f.calls(), 2);
  assert.equal(f.batchStore.listBatches().length, 1);
});

test("preparation excludes concurrent launches and rechecks failure after async source validation", async (t) => {
  let unblock;
  const gate = new Promise((resolve) => {
    unblock = resolve;
  });
  const f = fixture(t, { beforePreview: () => gate });
  const first = f.service.regenerateAttentionItems(command(f.ids));
  await assert.rejects(
    f.service.regenerateAttentionItems(command(f.ids, "request-2")),
    { code: "GENERATION_BATCH_BUSY" },
  );
  f.publications[0].status = "uncertain";
  unblock();
  await assert.rejects(first, { code: "GENERATION_CONTENT_FAILURE_REQUIRED" });
  assert.equal(f.batchStore.listBatches().length, 0);
  assert.equal(f.calls(), 0);
});
