const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  createArticleManagementSnapshot,
} = require("../desktop/services/article-management-snapshot");
const {
  registerArticleManagementIpc,
} = require("../desktop/ipc/article-management-ipc");
const { projectArticleLifecycle } = require("../src/content/article-lifecycle-projection");

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
const sampleArticle = (clientId = "client-a", title = "A") => ({
  id: `article-${clientId}`, clientId, title, content: "Body", status: "saved",
});

describe("article management concurrent reads", () => {
  it("shares one cold build and gives every caller an independent result", async () => {
    const gate = deferred();
    let reads = 0;
    const service = createArticleManagementSnapshot({
      listArticles: () => { reads++; return gate.promise; },
    });
    const requests = Array.from({ length: 6 }, () => service.get("client-a"));
    await nextTurn();
    assert.equal(reads, 1);
    gate.resolve([sampleArticle()]);
    const results = await Promise.all(requests);
    results[0].articles[0].title = "local edit";
    results[0].workflowByArticle["article-client-a"].operations.edit.allowed = false;
    assert.equal(results[1].articles[0].title, "A");
    assert.equal(results[1].workflowByArticle["article-client-a"].operations.edit.allowed, true);
    assert.deepEqual(await service.get("client-a"), results[1]);
    assert.equal(reads, 1);
  });

  it("builds different clients independently even at the same version", async () => {
    const gate = deferred();
    const reads = [];
    const service = createArticleManagementSnapshot({
      listArticles: async client => { reads.push(client); await gate.promise; return [sampleArticle(client)]; },
    });
    const a = service.get("client-a"), b = service.get("client-b");
    await nextTurn();
    assert.deepEqual(reads.sort(), ["client-a", "client-b"]);
    gate.resolve();
    const [first, second] = await Promise.all([a, b]);
    assert.equal(first.articles[0].clientId, "client-a");
    assert.equal(second.articles[0].clientId, "client-b");
  });

  it("releases a failed shared build so a subsequent request can retry", async () => {
    const gate = deferred();
    let reads = 0;
    const service = createArticleManagementSnapshot({
      listArticles: () => { reads++; return reads === 1 ? gate.promise : [sampleArticle()]; },
    });
    const failed = Promise.allSettled([service.get("client-a"), service.get("client-a")]);
    await nextTurn();
    gate.reject(Object.assign(new Error("Synthetic read failure"), { code: "ARTICLE_READ_FAILED" }));
    for (const result of await failed) {
      assert.equal(result.status, "rejected");
      assert.equal(result.reason.code, "ARTICLE_READ_FAILED");
    }
    assert.equal(service.cacheSize(), 0);
    assert.equal((await service.get("client-a")).articles[0].title, "A");
    assert.equal(reads, 2);
  });

  it("shares a build across source-only revisions and reports the current public revision", async () => {
    let revision = 1, reads = 0;
    const gate = deferred();
    const service = createArticleManagementSnapshot({
      getRevision: () => revision, getCacheRevision: () => 1,
      listArticles: () => { reads++; return gate.promise; },
    });
    const a = service.get("client-a");
    await nextTurn();
    revision = 2;
    const b = service.get("client-a");
    gate.resolve([sampleArticle()]);
    for (const result of await Promise.all([a, b])) assert.equal(result.revision, 2);
    assert.equal(reads, 1);
  });

  for (const mode of ["version change", "explicit invalidation", "new version completes first"]) {
    it(`discards late work after ${mode} without removing a newer shared build`, async () => {
      let revision = 1, reads = 0;
      const oldGate = deferred(), newGate = deferred();
      const service = createArticleManagementSnapshot({
        getRevision: () => revision,
        listArticles: () => { reads++; return reads === 1 ? oldGate.promise : newGate.promise; },
      });
      const old = service.get("client-a");
      await nextTurn();
      if (mode === "explicit invalidation") service.invalidate();
      else revision++;
      const current = service.get("client-a");
      await nextTurn();
      if (mode === "new version completes first") {
        newGate.resolve([sampleArticle("client-a", "current")]);
        await current;
      }
      oldGate.resolve([sampleArticle("client-a", "stale")]);
      await nextTurn();
      const third = service.get("client-a");
      await nextTurn();
      assert.equal(reads, 2);
      newGate.resolve([sampleArticle("client-a", "current")]);
      for (const result of await Promise.all([old, current, third])) {
        assert.equal(result.articles[0].title, "current");
        assert.equal(result.revision, revision);
      }
      assert.equal(service.cacheSize(), 1);
      assert.equal((await service.get("client-a")).articles[0].title, "current");
      assert.equal(reads, 2);
    });
  }

  it("bounds retries when the article read version changes on every build", async () => {
    let revision = 1, reads = 0;
    const service = createArticleManagementSnapshot({
      getRevision: () => revision,
      listArticles: () => { revision++; reads++; return [sampleArticle()]; },
    });
    await assert.rejects(service.get("client-a"), { code: "ARTICLE_MANAGEMENT_SNAPSHOT_STALE" });
    assert.equal(reads, 2);
    assert.equal(service.cacheSize(), 0);
  });

  it("omits internal decision metadata while preserving the lifecycle owner's decisions", async () => {
    const article = sampleArticle();
    for (const status of [null, "failed", "published"]) {
      const publications = status ? [{ publicationId: "publication-a", articleId: article.id, status, targetKey: "platform:test" }] : [];
      const expected = projectArticleLifecycle({ articles: [article], publications }).byArticle[article.id];
      const service = createArticleManagementSnapshot({ listArticles: () => [article], listPublications: () => publications });
      const actual = (await service.get("client-a")).workflowByArticle[article.id];
      assert.equal(actual.stage, expected.stage);
      for (const action of ["edit", "submit", "trash", "restore", "purge"]) {
        assert.deepEqual(actual.operations[action], {
          allowed: expected.operations[action].allowed,
          reasonCodes: [...expected.operations[action].reasonCodes],
        });
        assert.ok(expected.operations[action].safeMetadata, "the authoritative lifecycle metadata remains intact");
      }
      assert.equal("targetFacts" in actual, false);
      assert.equal("queue" in actual.operations, false);
      assert.equal("retarget" in actual.operations, false);
      assert.equal("canQueue" in actual.locks, false);
      assert.ok(JSON.stringify(actual).length < JSON.stringify(expected).length * 0.7);
    }
  });
});

function createFixture() {
  let revision = 7;
  const calls = {
    articles: 0,
    trash: 0,
    batches: 0,
    publications: 0,
    attention: 0,
  };
  const articles = {
    "client-a": [
      { id: "article-a", clientId: "client-a", title: "A", status: "saved" },
    ],
    "client-b": [
      { id: "article-b", clientId: "client-b", title: "B", status: "saved" },
    ],
  };
  const service = createArticleManagementSnapshot({
    workspaceIdentity: "library-a",
    getRevision: () => revision,
    listArticles: (clientId) => {
      calls.articles += 1;
      return articles[clientId] || [];
    },
    listTrash: () => {
      calls.trash += 1;
      return [];
    },
    listBatches: (clientId) => {
      calls.batches += 1;
      return clientId === "client-a"
        ? [
            {
              id: "batch-a",
              clientId,
              status: "queued",
              items: [{ articleId: "article-a", status: "queued" }],
              actionPlan: {
                batchId: "batch-a",
                allowedCount: 1,
                blockedCount: 0,
                items: [{ articleId: "article-a", allowed: true }],
              },
            },
          ]
        : [];
    },
    listPublications: () => {
      calls.publications += 1;
      return [
        {
          publicationId: "publication-a",
          clientId: "client-a",
          articleId: "article-a",
          status: "published",
          attempts: [],
        },
      ];
    },
    listAttention: (clientId) => {
      calls.attention += 1;
      return {
        revision,
        items:
          clientId === "client-a"
            ? []
            : [
                {
                  articleId: "article-b",
                  kind: "regular_platform_failed",
                  allowedActions: ["inspect"],
                },
              ],
        counts: { total: clientId === "client-a" ? 0 : 1, actionable: 0 },
      };
    },
    submissionPlatformDirectory: {
      list: () => [{ id: "toutiao", contentQueueImport: true }],
    },
  });
  return {
    service,
    calls,
    bump: () => {
      revision += 1;
    },
  };
}

describe("article management snapshot", function () {
  it("combines one client read into a revisioned snapshot and reuses it", async function () {
    const fixture = createFixture();
    const first = await fixture.service.get({ clientId: "client-a" });
    const second = await fixture.service.get({ clientId: "client-a" });
    assert.deepEqual(second, first);
    assert.equal(fixture.calls.articles, 1);
    assert.equal(fixture.calls.batches, 1);
    assert.equal(fixture.calls.publications, 1);
    assert.equal(fixture.calls.attention, 1);
    assert.deepEqual(first.submissionPlatforms, [
      { id: "toutiao", contentQueueImport: true },
    ]);
    for (const retired of [
      "submissionBatches",
      "cancellationPlans",
      "attention",
      "publicationSummaries",
      "attentionCounts",
      "orderSummaries",
    ]) assert.equal(retired in first, false, retired);
    assert.equal(first.workflowByArticle["article-a"].stage, "published");
    assert.equal(first.workflowByArticle["article-a"].locks.canTrash, false);
    assert.equal(first.lifecycleCounts.published, 1);
  });

  it("isolates clients and invalidates only after the workspace revision changes", async function () {
    const fixture = createFixture();
    const clientA = await fixture.service.get({ clientId: "client-a" });
    const clientB = await fixture.service.get({ clientId: "client-b" });
    assert.equal(clientA.clientId, "client-a");
    assert.equal(clientB.clientId, "client-b");
    assert.deepEqual(
      clientB.articles.map((article) => article.id),
      ["article-b"],
    );
    assert.equal(fixture.calls.articles, 2);
    fixture.bump();
    await fixture.service.get({ clientId: "client-a" });
    assert.equal(fixture.calls.articles, 3);
    fixture.service.invalidate();
    await fixture.service.get({ clientId: "client-a" });
    assert.equal(fixture.calls.articles, 4);
  });

  it("exposes only the client-scoped snapshot seam through IPC", async function () {
    const fixture = createFixture();
    const handlers = new Map();
    registerArticleManagementIpc({
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
      articleManagementSnapshot: fixture.service,
    });
    const response = await handlers.get(
      "content:get-article-management-snapshot",
    )({}, { clientId: "client-a" });
    assert.equal(response.ok, true);
    assert.equal(response.data.clientId, "client-a");
    assert.equal("workspaceRoot" in response.data, false);
    for (const item of response.data.workflowItems) {
      assert.equal("targetFacts" in item.workflow, false);
      for (const operation of Object.values(item.workflow.operations)) {
        assert.equal("safeMetadata" in operation, false);
      }
    }
    const invalid = await handlers.get(
      "content:get-article-management-snapshot",
    )({}, { clientId: "../other" });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error.code, "ARTICLE_MANAGEMENT_CLIENT_INVALID");
  });

  it("uses lifecycle facts and the named submission directory without the generic facade", async function () {
    const handlers = new Map();
    registerArticleManagementIpc({
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
      getWorkspaceDataRevision: () => 3,
      aiContentService: {
        listGeneratedArticles: () => [
          { id: "article-a", clientId: "client-a", title: "A", status: "saved" },
        ],
        listTrashedArticles: () => [],
        listArticleRemovalTransactions: () => [],
      },
      submissionMaintenance: {
        listBatches() {
          throw new Error("generic batch reader must not be used");
        },
        listPlatforms() {
          throw new Error("generic platform reader must not be used");
        },
      },
      directoryEntries: [
        { id: "toutiao", displayName: "头条", publicationTargetKind: "platform", scanDir: "toutiao", imagePublishing: false },
      ],
      operationalStore: {
        listArticleLifecycleFacts: () => ({
          publications: [],
          submissionItems: [],
          orders: [],
        }),
      },
      articleAttentionQuery: {
        list: () => ({ revision: 3, items: [], counts: { total: 0, actionable: 0 } }),
      },
    });

    const response = await handlers.get(
      "content:get-article-management-snapshot",
    )({}, { clientId: "client-a" });
    assert.equal(response.ok, true, JSON.stringify(response));
    assert.deepEqual(response.data.submissionPlatforms, [
      { id: "toutiao", displayName: "头条", contentQueueImport: true },
    ]);
    assert.equal(response.data.workflowItems[0].workflow.stage, "needs_completion");
  });

  it("keeps published history in the snapshot when the ledger supplies the same article record", async function () {
    const fixture = createFixture();
    const snapshot = await fixture.service.get({ clientId: "client-a" });
    assert.deepEqual(
      snapshot.publicationRecords.map(function (record) {
        return [record.publicationId, record.status];
      }),
      [["publication-a", "published"]],
    );
    assert.equal(snapshot.workflowByArticle["article-a"].stage, "published");
  });

  it("projects the controlled publication failure summary instead of a provider message", async function () {
    const service = createArticleManagementSnapshot({
      getRevision: () => 1,
      listArticles: () => [
        { id: "article-a", clientId: "client-a", title: "A", content: "正文" },
      ],
      listTrash: () => [],
      listBatches: () => [],
      listPublications: () => [
        {
          publicationId: "publication-a",
          clientId: "client-a",
          articleId: "article-a",
          status: "failed",
          attempts: [
            {
              attemptId: "attempt-a",
              status: "failed",
              reasonCode: "CONTENT_REJECTED",
              reasonSummary: "vendor response body must not cross the boundary",
            },
          ],
        },
      ],
      listAttention: () => ({
        revision: 1,
        items: [],
        counts: { total: 0, actionable: 0 },
      }),
      submissionPlatformDirectory: { list: () => [] },
    });

    const snapshot = await service.get({ clientId: "client-a" });
    assert.deepEqual(snapshot.publicationRecords[0].attempts[0], {
      attemptId: "attempt-a",
      status: "failed",
      createdAt: null,
      updatedAt: null,
      startedAt: null,
      finishedAt: null,
      remoteId: null,
      remoteUrl: null,
      errorCode: null,
      reasonCode: "CONTENT_REJECTED",
      reasonSummary: "平台明确拒绝了这篇文章，请检查内容后从投稿入口重新发起。",
    });
  });

  it("does not fall back to the legacy order display reader when lifecycle facts are unavailable", async function () {
    let legacyReads = 0;
    const service = createArticleManagementSnapshot({
      getRevision: () => 1,
      listArticles: () => [
        {
          id: "article-a",
          clientId: "client-a",
          title: "A",
          content: "正文",
        },
      ],
      listTrash: () => [],
      listBatches: () => [],
      listPublications: () => [],
      listAttention: () => ({
        revision: 1,
        items: [],
        counts: { total: 0, actionable: 0 },
      }),
      submissionPlatformDirectory: { list: () => [] },
      operationalStore: {
        listOrderDisplayViews() {
          legacyReads += 1;
          return [{ orderId: "legacy-order", articleId: "article-a" }];
        },
      },
    });

    const snapshot = await service.get({ clientId: "client-a" });
    assert.equal(legacyReads, 0);
    assert.equal("orders" in snapshot, false);
  });

  it("loads publication facts for trash records before projecting lifecycle conflicts", async function () {
    const service = createArticleManagementSnapshot({
      getRevision: () => 1,
      listArticles: () => [],
      listTrash: () => [
        {
          articleId: "trash-article",
          clientId: "client-a",
          title: "已发布",
          content: "正文",
        },
      ],
      listBatches: () => [],
      listPublications: () => [
        {
          publicationId: "publication-trash",
          clientId: "client-a",
          articleId: "trash-article",
          status: "published",
          targetKey: "platform:p1",
        },
      ],
      listAttention: () => ({
        revision: 1,
        items: [],
        counts: { total: 0, actionable: 0 },
      }),
      submissionPlatformDirectory: { list: () => [] },
    });

    const snapshot = await service.get({ clientId: "client-a" });
    assert.equal(snapshot.workflowByArticle["trash-article"].stage, "trash");
    assert.equal(snapshot.workflowByArticle["trash-article"].operations.restore.allowed, false);
    assert.equal(snapshot.lifecycleCounts.trash, 1);
    assert.equal(snapshot.lifecycleCounts.in_submission, 0);
  });
});
