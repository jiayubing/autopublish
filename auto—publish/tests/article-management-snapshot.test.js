const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  createArticleManagementSnapshot,
  deriveWorkflow,
} = require("../desktop/services/article-management-snapshot");
const {
  registerArticleManagementIpc,
} = require("../desktop/ipc/article-management-ipc");

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
                  kind: "failed_submission",
                  allowedActions: ["inspect"],
                },
              ],
        counts: { total: clientId === "client-a" ? 0 : 1, actionable: 0 },
      };
    },
    listPlatforms: () => [{ id: "toutiao", contentQueueImport: true }],
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
    assert.equal(first.cancellationPlans.length, 1);
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
    const invalid = await handlers.get(
      "content:get-article-management-snapshot",
    )({}, { clientId: "../other" });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error.code, "ARTICLE_MANAGEMENT_CLIENT_INVALID");
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
      listPlatforms: () => [],
      operationalStore: {
        listOrderDisplayViews() {
          legacyReads += 1;
          return [{ orderId: "legacy-order", articleId: "article-a" }];
        },
      },
    });

    const snapshot = await service.get({ clientId: "client-a" });
    assert.equal(legacyReads, 0);
    assert.deepEqual(snapshot.orders, []);
  });

  it("does not offer cancellation for a published target when an old queued item remains", function () {
    const workflow = deriveWorkflow(
      { id: "article-a", status: "saved" },
      [],
      [],
      [],
      [],
      {
        targetFacts: {
          "platform:toutiao": {
            targetKey: "platform:toutiao",
            status: "published",
            canCancel: false,
          },
        },
      },
    );
    assert.equal(workflow.stage, "published");
    assert.equal(workflow.locks.canCancel, false);
  });

  it("keeps a published article published while another declared target remains available", function () {
    const workflow = deriveWorkflow(
      { id: "article-a", status: "saved" },
      [],
      [],
      [],
      [],
      {
        targetFacts: {
          "platform:toutiao": {
            targetKey: "platform:toutiao",
            status: "published",
            canCancel: false,
          },
          "platform:hepan": {
            targetKey: "platform:hepan",
            status: "not_submitted",
            canCancel: false,
          },
        },
      },
    );
    assert.equal(workflow.stage, "published");
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
      listPlatforms: () => [],
    });

    const snapshot = await service.get({ clientId: "client-a" });
    assert.equal(snapshot.workflowByArticle["trash-article"].stage, "failed");
    assert.equal(snapshot.lifecycleCounts.failed, 1);
    assert.equal(snapshot.lifecycleCounts.trash, 0);
  });
});
