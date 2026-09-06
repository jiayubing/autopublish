const { it } = require("node:test");
const assert = require("node:assert/strict");
const { createContentGenerationBatchService } = require("../desktop/services/content-generation-batch-service");

const turn = () => new Promise((resolve) => setImmediate(resolve));

// Controlled event producer: the service and its public read/event API are real.
// Persistence, recovery and AI execution are covered by the real-store cost test
// and the existing service/runner regressions, not by this projection fixture.
function fixture(prefix) {
  const batches = new Map(["batch-a", "batch-b"].map((id) => [id, {
    id, status: "paused", concurrency: 1, aiConfigFingerprint: "fp",
    tasks: ["client-a", "client-b"].map((clientId, index) => ({
      id: id + "-task-" + index, clientId, articleId: "same-article",
      status: "succeeded", attempts: 1, materialIds: [], researchQueryIds: [],
    })),
    counts: { total: 2, succeeded: 2, pending: 0, failed: 0 },
  }]));
  const articles = new Map(["client-a", "client-b"].map((clientId) => [clientId, {
    title: prefix + " " + clientId, content: "Never project this body",
  }]));
  let reads = 0;
  let current;
  let notify;
  let finish;
  let last;
  const service = createContentGenerationBatchService({
    batchStore: {
      getBatch: (id) => batches.get(id), listBatches: () => [...batches.values()],
    },
    clientKnowledge: {}, materialStore: {}, researchStore: {}, templateStore: {},
    aiProviderService: { getFingerprint: () => "fp" },
    contentStore: {
      saveArticle: (article) => article, findByGenerationTaskId: () => null,
      getArticle(clientId, articleId) {
        reads += 1;
        assert.equal(articleId, "same-article");
        const article = articles.get(clientId);
        if (article instanceof Error) throw article;
        return article;
      },
    },
    runnerFactory: () => ({
      getState: () => ({ concurrency: 1, batchId: current && current.id, status: current ? current.status : "idle" }),
      subscribe(listener) { notify = listener; },
      run(id) {
        current = batches.get(id);
        current.status = "running";
        return new Promise((resolve) => { finish = resolve; });
      },
      dispose() { if (finish) finish(current); },
    }),
  });
  // Mutating one subscriber must not poison the cache, persistence, or the next subscriber.
  service.subscribe((event) => {
    if (event.batch) event.batch.tasks[0].articleTitle = "subscriber mutation";
  });
  service.subscribe((event) => { last = event; });
  return {
    service, articles, batches,
    get reads() { return reads; }, get last() { return last; },
    emit() { notify({ batchId: current.id, status: current.status, counts: current.counts, batch: current }); },
    async finish(status) { current.status = status; finish(current); await turn(); },
  };
}

it("reuses titles only within one active batch and refreshes all explicit read paths", async () => {
  const first = fixture("workspace-one");
  const second = fixture("workspace-two");
  try {
    await first.service.startBatch({ batchId: "batch-a" });
    await second.service.startBatch({ batchId: "batch-a" });
    for (let index = 0; index < 5; index += 1) { first.emit(); second.emit(); }
    assert.equal(first.reads, 2);
    assert.equal(second.reads, 2);
    assert.deepEqual(first.last.batch.tasks.map((task) => task.articleTitle), ["workspace-one client-a", "workspace-one client-b"]);
    assert.deepEqual(second.last.batch.tasks.map((task) => task.articleTitle), ["workspace-two client-a", "workspace-two client-b"]);
    assert.equal("articleTitle" in first.batches.get("batch-a").tasks[0], false);
    assert.equal("content" in first.last.batch.tasks[0], false);

    for (const read of [
      () => first.service.getBatch("batch-a"),
      () => first.service.listBatches().find((batch) => batch.id === "batch-a"),
      () => first.service.getRuntimeSnapshot().batch,
    ]) {
      first.articles.get("client-a").title += " edited";
      const expected = first.articles.get("client-a").title;
      assert.equal(read().tasks[0].articleTitle, expected);
      const readsAfterRefresh = first.reads;
      first.emit();
      assert.equal(first.reads, readsAfterRefresh);
      assert.equal(first.last.batch.tasks[0].articleTitle, expected);
    }

    // An optional lookup failure is reused as missing display data, not as a task failure.
    first.articles.set("client-b", new Error("private title read detail"));
    assert.equal(first.service.getRuntimeSnapshot().batch.tasks[1].articleTitle, undefined);
    const afterFailure = first.reads;
    for (let index = 0; index < 5; index += 1) first.emit();
    assert.equal(first.reads, afterFailure);
    assert.equal(first.last.batch.tasks[1].status, "succeeded");
    assert.equal(first.last.batch.tasks[1].articleTitle, undefined);
    assert.doesNotMatch(JSON.stringify(first.last), /private title read detail/);
    first.articles.set("client-b", { title: "   " });
    assert.equal(first.service.getBatch("batch-a").tasks[1].articleTitle, undefined);
    first.articles.set("client-b", { title: "Recovered\n title" });
    assert.equal(first.service.getBatch("batch-a").tasks[1].articleTitle, "Recovered title");
    first.emit();
    assert.equal(first.last.batch.tasks[1].articleTitle, "Recovered title");

    await first.finish("paused");
    assert.equal(first.last.status, "paused");
    first.articles.get("client-a").title = "New run title";
    const beforeResume = first.reads;
    await first.service.resumeBatch({ batchId: "batch-a" });
    first.emit();
    assert.equal(first.reads, beforeResume + 2);
    assert.equal(first.last.batch.tasks[0].articleTitle, "New run title");
    await first.finish("failed");
    assert.equal(first.last.status, "failed");
    first.articles.get("client-a").title = "Other batch title";
    const beforeOtherBatch = first.reads;
    await first.service.startBatch({ batchId: "batch-b" });
    first.emit();
    assert.equal(first.reads, beforeOtherBatch + 2);
    assert.equal(first.last.batch.tasks[0].articleTitle, "Other batch title");
    await first.finish("completed");
    assert.equal(first.last.status, "completed");
  } finally {
    await first.service.dispose();
    await second.service.dispose();
  }
});
