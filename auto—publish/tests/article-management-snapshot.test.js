const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { createArticleManagementSnapshot, deriveWorkflow } = require("../desktop/services/article-management-snapshot");
const { registerArticleManagementIpc } = require("../desktop/ipc/article-management-ipc");

function createFixture() {
  let revision = 7;
  const calls = { articles: 0, trash: 0, batches: 0, publications: 0, attention: 0 };
  const articles = {
    "client-a": [{ id: "article-a", clientId: "client-a", title: "A", status: "saved" }],
    "client-b": [{ id: "article-b", clientId: "client-b", title: "B", status: "saved" }],
  };
  const service = createArticleManagementSnapshot({
    workspaceIdentity: "library-a",
    getRevision: () => revision,
    listArticles: (clientId) => { calls.articles += 1; return articles[clientId] || []; },
    listTrash: () => { calls.trash += 1; return []; },
    listBatches: (clientId) => { calls.batches += 1; return clientId === "client-a" ? [{ id: "batch-a", clientId, status: "queued", items: [{ articleId: "article-a", status: "queued" }], actionPlan: { batchId: "batch-a", allowedCount: 1, blockedCount: 0, items: [{ articleId: "article-a", allowed: true }] } }] : []; },
    listPublications: () => { calls.publications += 1; return [{ publicationId: "publication-a", clientId: "client-a", articleId: "article-a", status: "published", attempts: [] }]; },
    listAttention: (clientId) => { calls.attention += 1; return { revision, items: clientId === "client-a" ? [] : [{ articleId: "article-b", kind: "failed_submission", allowedActions: ["inspect"] }], counts: { total: clientId === "client-a" ? 0 : 1, actionable: 0 } }; },
    listPlatforms: () => [{ id: "toutiao", contentQueueImport: true }],
  });
  return { service, calls, bump: () => { revision += 1; } };
}

describe("article management snapshot", function() {
  it("combines one client read into a revisioned snapshot and reuses it", async function() {
    const fixture = createFixture();
    const first = await fixture.service.get({ clientId: "client-a" });
    const second = await fixture.service.get({ clientId: "client-a" });
    assert.deepEqual(second, first);
    assert.equal(fixture.calls.articles, 1);
    assert.equal(fixture.calls.batches, 1);
    assert.equal(fixture.calls.publications, 1);
    assert.equal(fixture.calls.attention, 1);
    assert.equal(first.cancellationPlans.length, 1);
    assert.equal(first.workflowByArticle["article-a"].stage, "queued");
    assert.equal(first.workflowByArticle["article-a"].locks.canTrash, false);
  });

  it("isolates clients and invalidates only after the workspace revision changes", async function() {
    const fixture = createFixture();
    const clientA = await fixture.service.get({ clientId: "client-a" });
    const clientB = await fixture.service.get({ clientId: "client-b" });
    assert.equal(clientA.clientId, "client-a");
    assert.equal(clientB.clientId, "client-b");
    assert.deepEqual(clientB.articles.map((article) => article.id), ["article-b"]);
    assert.equal(fixture.calls.articles, 2);
    fixture.bump();
    await fixture.service.get({ clientId: "client-a" });
    assert.equal(fixture.calls.articles, 3);
    fixture.service.invalidate();
    await fixture.service.get({ clientId: "client-a" });
    assert.equal(fixture.calls.articles, 4);
  });

  it("exposes only the client-scoped snapshot seam through IPC", async function() {
    const fixture = createFixture();
    const handlers = new Map();
    registerArticleManagementIpc({
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
      articleManagementSnapshot: fixture.service,
    });
    const response = await handlers.get("content:get-article-management-snapshot")({}, { clientId: "client-a" });
    assert.equal(response.ok, true);
    assert.equal(response.data.clientId, "client-a");
    assert.equal("workspaceRoot" in response.data, false);
    const invalid = await handlers.get("content:get-article-management-snapshot")({}, { clientId: "../other" });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error.code, "ARTICLE_MANAGEMENT_CLIENT_INVALID");
  });

  it("does not offer cancellation for a published target when an old queued item remains", function() {
    const workflow = deriveWorkflow({ id: "article-a", status: "saved" }, [], [], [], [], {
      targetFacts: {
        "platform:toutiao": { targetKey: "platform:toutiao", status: "published", canCancel: false }
      }
    });
    assert.equal(workflow.stage, "published");
    assert.equal(workflow.locks.canCancel, false);
  });

  it("keeps an article pending while another declared target remains available", function() {
    const workflow = deriveWorkflow({ id: "article-a", status: "saved" }, [], [], [], [], {
      targetFacts: {
        "platform:toutiao": { targetKey: "platform:toutiao", status: "published", canCancel: false },
        "platform:hepan": { targetKey: "platform:hepan", status: "not_submitted", canCancel: false }
      }
    });
    assert.equal(workflow.stage, "pending_submission");
  });
});
