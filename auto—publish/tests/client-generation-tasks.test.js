const assert = require("node:assert/strict");
const { it } = require("node:test");
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
