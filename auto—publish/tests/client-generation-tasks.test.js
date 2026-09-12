const assert = require("node:assert/strict");
const { it } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createGenerationExecutionScheduler } = require("../src/content/generation-execution-scheduler");
const { createAiExecutionService } = require("../desktop/services/ai-execution-service");
const { createClientGenerationService } = require("../desktop/services/client-generation-service");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function waitFor(predicate, timeoutMs = 2000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for synthetic generation state");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function createMemoryContentStore() {
  const articles = [];
  return {
    articles,
    createArticle(article) {
      articles.push(article);
      return article;
    },
    findByGenerationOperationId(operationId) {
      const matches = articles.filter((article) => article.generationOperationId === operationId);
      if (!matches.length) return { kind: "none" };
      if (matches.length === 1) return { kind: "one", article: matches[0] };
      return { kind: "many", articles: matches };
    },
    getArticle(clientId, articleId) {
      return articles.find((article) => article.clientId === clientId && article.id === articleId) || null;
    },
  };
}

function baseInput(clientId, operationId, count, concurrency) {
  return {
    clientId,
    materialIds: ["brand"],
    researchQueryIds: ["question"],
    platform: "xiecheng",
    templateId: "geo",
    articleCount: count,
    concurrency,
    generationOperationId: operationId,
  };
}

function createSyntheticService(overrides = {}) {
  let sequence = 0;
  return createClientGenerationService({
    workspaceRoot: ".",
    contentStore: createMemoryContentStore(),
    clientKnowledge: { getClient: (id) => ({ id, name: id }) },
    researchStore: { getResearch: (clientId, id) => ({ question: id, answerText: "synthetic answer", references: [] }) },
    materialStore: { getSelectedMaterials: async (clientId, ids) => ids.map((id) => ({ id, name: id, content: "synthetic facts" })) },
    templateStore: { getCatalogTemplate: () => ({ id: "geo", body: "synthetic template", scenario: "guide" }) },
    buildPrompt: () => ({ system: "synthetic", user: "synthetic" }),
    aiClientFactory: () => ({ complete: async () => "# Synthetic title\n\nSynthetic body" }),
    createId: () => `article-${++sequence}`,
    ...overrides,
  });
}

it("reuses persisted single and child results after restart without creating an AI client", async (t) => {
  for (const count of [1, 2]) {
    const contentStore = createMemoryContentStore();
    const service = createSyntheticService({ contentStore });
    t.after(() => service.dispose());
    const input = baseInput("client-a", `restart-${count}`, count, 1);
    const original = await service.generateArticle(input);
    assert.equal(contentStore.articles.length, count);
    assert.deepEqual(contentStore.articles.map((article) => article.generationOperationId),
      count === 1 ? ["restart-1"] : ["restart-2-1", "restart-2-2"]);
    await service.dispose();

    let providerCalls = 0;
    const restarted = createSyntheticService({ contentStore, aiClientFactory: () => {
      providerCalls += 1;
      throw new Error("Persisted results must not invoke the provider");
    } });
    t.after(() => restarted.dispose());
    assert.deepEqual(await restarted.generateArticle(input), original);
    assert.equal(contentStore.articles.length, count);
    assert.equal(providerCalls, 0);
  }
});

it("deduplicates concurrent single-generation calls and persists one article", async (t) => {
  const gate = deferred();
  const contentStore = createMemoryContentStore();
  let providerCalls = 0;
  const service = createSyntheticService({ contentStore, aiClientFactory: () => ({ complete: async () => {
    providerCalls += 1;
    await gate.promise;
    return "# One title\n\nOne body";
  } }) });
  t.after(async () => { gate.resolve(); await service.dispose(); });
  assert.equal(providerCalls, 0);
  const input = baseInput("client-a", "duplicate-operation", 1, 1);
  const first = service.generateArticle(input);
  const second = service.generateArticle(input);
  await waitFor(() => providerCalls > 0);
  assert.equal(service.getState("client-a").status, "running");
  gate.resolve();
  const [article, repeated] = await Promise.all([first, second]);
  assert.deepEqual(repeated, article);
  assert.equal(article.generationOperationId, "duplicate-operation");
  assert.equal(contentStore.articles.length, 1);
  assert.equal(providerCalls, 1);
  assert.equal(service.getState("client-a").status, "completed");
});

it("reads materials by logical client identity and persists ordered source snapshots", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "generation-logical-client-"));
  const directory = path.join(workspaceRoot, "clients", "physical-client");
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "client.json"), JSON.stringify({ id: "logical-client", name: "Logical Client" }));
  fs.writeFileSync(path.join(directory, "brand.md"), "logical client facts");
  const service = createSyntheticService({ workspaceRoot, clientKnowledge: undefined, materialStore: undefined });
  try {
    const input = { ...baseInput("logical-client", "logical-operation", 1, 1), materialIds: ["brand.md"], researchQueryIds: ["question-2", "question-1"] };
    const article = await service.generateArticle(input);
    assert.equal(article.clientId, "logical-client");
    assert.deepEqual(article.materialSnapshots.map(({ name, content }) => ({ name, content })), [{ name: "brand.md", content: "logical client facts" }]);
    assert.deepEqual(article.researchSnapshots.map((source) => source.questionId), ["question-2", "question-1"]);
    const singleSource = await service.generateArticle({ ...input, generationOperationId: "single-source", researchQueryIds: undefined, researchQueryId: "question-1" });
    assert.deepEqual(singleSource.researchSnapshots.map((source) => source.questionId), ["question-1"]);
  } finally {
    await service.dispose();
  }
});

it("rejects invalid generation selections and stale templates before invoking AI", async (t) => {
  let providerCalls = 0;
  const contentStore = createMemoryContentStore();
  const service = createSyntheticService({ contentStore,
    templateStore: { listCatalog: () => ({ revision: "current" }) },
    aiClientFactory: () => { providerCalls += 1; throw new Error("Must reject before invoking AI"); },
  });
  t.after(() => service.dispose());
  const oversized = Array.from({ length: 51 }, (_, index) => `source-${index}`);
  const cases = [
    [{ clientId: "" }, "CONTENT_INPUT_INVALID"],
    [{ platform: "" }, "CONTENT_INPUT_INVALID"],
    [{ templateId: "" }, "CONTENT_INPUT_INVALID"],
    [{ generationOperationId: "../operation" }, "CONTENT_INPUT_INVALID"],
    [{ articleCount: 101 }, "CONTENT_INPUT_INVALID"],
    [{ researchQueryIds: [] }, "GEO_RESEARCH_REQUIRED"],
    [{ researchQueryIds: ["question", "question"] }, "CONTENT_INPUT_INVALID"],
    [{ researchQueryIds: oversized }, "CONTENT_INPUT_INVALID"],
    [{ materialIds: [] }, "CLIENT_MATERIAL_REQUIRED"],
    [{ materialIds: ["brand", "brand"] }, "CLIENT_MATERIAL_INVALID"],
    [{ materialIds: ["../brand"] }, "CLIENT_MATERIAL_INVALID"],
    [{ templateCatalogRevision: "old" }, "TEMPLATE_CATALOG_STALE"],
  ];
  for (const [overrides, code] of cases) {
    assert.throws(() => service.generateArticle({ ...baseInput("client-a", "invalid-operation", 1, 1), ...overrides }), { code });
  }
  assert.equal(providerCalls, 0);
  assert.equal(contentStore.articles.length, 0);
});

it("preserves safe AI configuration failures without retrying or persisting articles", async (t) => {
  let providerCalls = 0;
  const contentStore = createMemoryContentStore();
  const service = createSyntheticService({ contentStore, aiClientFactory: () => {
    providerCalls += 1;
    throw Object.assign(new Error("AI client configuration is invalid"), { code: "AI_CONFIG_INVALID" });
  } });
  t.after(() => service.dispose());
  assert.equal(providerCalls, 0);
  await assert.rejects(service.generateArticle(baseInput("client-a", "config-failure", 1, 1)), {
    code: "AI_CONFIG_INVALID", message: "AI client configuration is invalid",
  });
  assert.equal(providerCalls, 1);
  assert.equal(contentStore.articles.length, 0);
});

it("disposal interrupts active work and leaves queued work recoverable", async (t) => {
  const contentStore = createMemoryContentStore();
  let signal;
  let providerCalls = 0;
  const service = createSyntheticService({ contentStore, aiClientFactory: () => ({
    complete(messages, options) {
      providerCalls += 1;
      signal = options.signal;
      return new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(Object.assign(new Error("Aborted"), { code: "AI_ABORTED" })), { once: true });
      });
    },
  }) });
  t.after(() => service.dispose());
  const pending = service.generateArticle(baseInput("client-a", "dispose-operation", 2, 1));
  await waitFor(() => signal);
  await service.dispose();
  const result = await pending;
  assert.equal(signal.aborted, true);
  assert.deepEqual(result.failures, [{ index: 0, code: "CONTENT_GENERATION_INTERRUPTED" }]);
  assert.equal(providerCalls, 1, "queued work must not start during shutdown");
  assert.equal(contentStore.articles.length, 0);
  assert.throws(() => service.start(baseInput("client-a", "after-dispose", 1, 1)), { code: "CONTENT_RUNTIME_DISPOSED" });
});

it("client generation allows different clients concurrently while shared scheduler caps total AI work", async (t) => {
  const scheduler = createGenerationExecutionScheduler({ maxConcurrency: 4 });
  const gate = deferred();
  let active = 0;
  let peak = 0;
  const perClientActive = new Map();
  const perClientPeak = new Map();
  const provider = {
    createClient() {
      return {
        async complete(messages) {
          const clientId = messages[0].content;
          active += 1;
          peak = Math.max(peak, active);
          const clientActive = (perClientActive.get(clientId) || 0) + 1;
          perClientActive.set(clientId, clientActive);
          perClientPeak.set(clientId, Math.max(perClientPeak.get(clientId) || 0, clientActive));
          try {
            await gate.promise;
            return "synthetic response";
          } finally {
            active -= 1;
            perClientActive.set(clientId, (perClientActive.get(clientId) || 1) - 1);
          }
        },
      };
    },
  };
  const aiExecution = createAiExecutionService({ scheduler, aiProviderService: provider });
  const contentStore = createMemoryContentStore();
  let articleSequence = 0;
  const service = createClientGenerationService({
    workspaceRoot: ".",
    contentStore,
    clientKnowledge: { getClient: (clientId) => ({ id: clientId, name: clientId }) },
    researchStore: {},
    materialStore: {},
    templateStore: {},
    aiClientFactory: aiExecution.createClient,
    articleGeneratorFactory: (deps) => ({
      async generateArticle(input) {
        await deps.aiClient.complete([{ role: "user", content: input.clientId }]);
        articleSequence += 1;
        return {
          id: `article-${articleSequence}`,
          clientId: input.clientId,
          title: `${input.clientId}-${input.generationOperationId}`,
          content: "synthetic",
          status: "generated",
          createdAt: new Date().toISOString(),
          generationOperationId: input.generationOperationId,
        };
      },
    }),
  });
  t.after(async () => {
    gate.resolve();
    await service.dispose();
    await scheduler.dispose();
  });

  service.start(baseInput("client-a", "operation-a", 2, 2));
  service.start(baseInput("client-b", "operation-b", 2, 2));

  await waitFor(() => active === 4);
  assert.equal(peak, 4, "shared scheduler should allow all four global slots and no more");
  assert.equal(perClientPeak.get("client-a"), 2);
  assert.equal(perClientPeak.get("client-b"), 2);
  assert.throws(
    () => service.start(baseInput("client-a", "operation-a-2", 1, 1)),
    (error) => error && error.code === "CONTENT_GENERATION_CLIENT_BUSY",
    "the same client should not start a second active operation",
  );

  gate.resolve();
  const [first, second] = await Promise.all([
    service.waitForOperation("operation-a"),
    service.waitForOperation("operation-b"),
  ]);
  assert.equal(first.status, "completed");
  assert.equal(second.status, "completed");
  assert.equal(contentStore.articles.length, 4);
  assert.equal(scheduler.getState().active, 0);
});

it("client generation keeps successful articles when one task fails and retries only failed tasks", async (t) => {
  const contentStore = createMemoryContentStore();
  const calls = new Map();
  let articleSequence = 0;
  const service = createClientGenerationService({
    workspaceRoot: ".",
    contentStore,
    clientKnowledge: { getClient: (clientId) => ({ id: clientId, name: clientId }) },
    researchStore: {},
    materialStore: {},
    templateStore: {},
    aiClientFactory: () => ({ complete: async () => "unused" }),
    articleGeneratorFactory: () => ({
      async generateArticle(input) {
        const callCount = (calls.get(input.generationOperationId) || 0) + 1;
        calls.set(input.generationOperationId, callCount);
        if (input.generationOperationId === "partial-operation-2" && callCount === 1) {
          const error = new Error("synthetic task failure");
          error.code = "SYNTHETIC_FAILURE";
          throw error;
        }
        articleSequence += 1;
        return {
          id: `article-${articleSequence}`,
          clientId: input.clientId,
          title: input.generationOperationId,
          content: "synthetic",
          status: "generated",
          createdAt: new Date().toISOString(),
          generationOperationId: input.generationOperationId,
        };
      },
    }),
  });
  t.after(() => service.dispose());

  service.start(baseInput("client-a", "partial-operation", 3, 2));
  const partial = await service.waitForOperation("partial-operation");
  assert.equal(partial.status, "partial");
  assert.deepEqual(partial.failures, [{ index: 1, code: "SYNTHETIC_FAILURE" }]);
  assert.deepEqual(partial.articles.map((item) => [item.index, item.article.generationOperationId]), [
    [0, "partial-operation-1"], [2, "partial-operation-3"],
  ]);
  assert.deepEqual(await service.generateArticle(baseInput("client-a", "partial-operation", 3, 2)), partial);
  assert.equal(Array.from(calls.values()).reduce((total, count) => total + count, 0), 3);
  let state = service.getState("client-a");
  assert.deepEqual(state.counts, { total: 3, pending: 0, running: 0, succeeded: 2, failed: 1 });
  assert.equal(contentStore.articles.length, 2, "successful tasks stay persisted after a sibling failure");

  service.retryFailed({ operationId: "partial-operation" });
  const completed = await service.waitForOperation("partial-operation");
  assert.equal(completed.status, "completed");
  state = service.getState("client-a");
  assert.deepEqual(state.counts, { total: 3, pending: 0, running: 0, succeeded: 3, failed: 0 });
  assert.equal(state.tasks.find((task) => task.index === 1).attempts, 2);
  assert.equal(calls.get("partial-operation-1"), 1);
  assert.equal(calls.get("partial-operation-2"), 2);
  assert.equal(calls.get("partial-operation-3"), 1);
  assert.equal(contentStore.articles.length, 3, "retry must not regenerate successful tasks");
});

it("shared generation scheduler rotates queued groups instead of draining one group completely", async (t) => {
  const scheduler = createGenerationExecutionScheduler({ maxConcurrency: 1 });
  const gates = [deferred(), deferred(), deferred(), deferred()];
  const started = [];
  function job(name, gate) {
    return scheduler.schedule(name[0], async () => {
      started.push(name);
      await gate.promise;
      return name;
    });
  }
  t.after(async () => {
    gates.forEach((gate) => gate.resolve());
    await scheduler.dispose();
  });

  const promises = [
    job("A1", gates[0]),
    job("A2", gates[1]),
    job("A3", gates[2]),
    job("B1", gates[3]),
  ];
  await waitFor(() => started.length === 1);
  assert.deepEqual(started, ["A1"]);
  gates[0].resolve();
  await waitFor(() => started.length === 2);
  assert.equal(started[1], "A2");
  gates[1].resolve();
  await waitFor(() => started.length === 3);
  assert.equal(started[2], "B1", "B must get a turn before A3 despite A already having queued work");
  gates[3].resolve();
  await waitFor(() => started.length === 4);
  assert.equal(started[3], "A3");
  gates[2].resolve();
  await Promise.all(promises);
});

it("bounds retained terminal operations and clears them on dispose", async () => {
  const contentStore = createMemoryContentStore();
  let sequence = 0;
  const service = createClientGenerationService({
    workspaceRoot: ".",
    contentStore,
    maxRetainedOperations: 2,
    clientKnowledge: { getClient: (clientId) => ({ id: clientId, name: clientId }) },
    researchStore: {},
    materialStore: {},
    templateStore: {},
    aiClientFactory: () => ({ complete: async () => "unused" }),
    articleGeneratorFactory: () => ({
      async generateArticle(input) {
        sequence += 1;
        return {
          id: `article-${sequence}`,
          clientId: input.clientId,
          title: input.generationOperationId,
          content: "synthetic",
          status: "generated",
          generationOperationId: input.generationOperationId,
        };
      },
    }),
  });

  for (const [clientId, operationId] of [["client-a", "operation-a"], ["client-b", "operation-b"], ["client-c", "operation-c"]]) {
    service.start(baseInput(clientId, operationId, 1, 1));
    await service.waitForOperation(operationId);
  }
  await assert.rejects(service.waitForOperation("operation-a"), { code: "CONTENT_GENERATION_OPERATION_NOT_FOUND" });

  await service.dispose();
  await assert.rejects(service.waitForOperation("operation-b"), { code: "CONTENT_GENERATION_OPERATION_NOT_FOUND" });
});