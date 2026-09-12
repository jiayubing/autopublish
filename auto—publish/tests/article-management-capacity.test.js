const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createOperationalStore } = require("../src/infrastructure/operational-store/operational-store");
const { createArticleManagementSnapshot } = require("../desktop/services/article-management-snapshot");
const { createContractRegistry } = require("../desktop/ipc/contracts/registry");
const { articleManagementContracts, projectManagementSnapshot } = require("../desktop/ipc/contracts/article-management-contracts");

const articles = () => Array.from({ length: 10001 }, (_, index) => ({
  id: `article-${index}`, clientId: "client-a", title: `Title ${index}`,
  status: "saved", summaryVersion: 1, hasContent: true,
  createdAt: "2026-09-13T00:00:00.000Z",
}));

test("a client with ten thousand articles retains lifecycle facts across identity pages and typed IPC", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "article-management-capacity-"));
  const transitionPorts = {};
  const store = createOperationalStore({ workspaceRoot: root, transitionPorts });
  try {
    for (const index of [4999, 5000, 9999]) {
      store.reservePublicationTarget({ articleId: `article-${index}`, publicationId: `publication-${index}`, attemptId: `attempt-${index}`,
        target: { kind: "platform", platformId: "hepan", accountProfileId: "account-a" } });
      store.commitRemoteOutcome({ attemptId: `attempt-${index}`, outcome: { status: "failed" } });
    }
    const snapshot = await createArticleManagementSnapshot({ listArticles: () => articles().slice(0, 10000),
      operationalStore: store, publishedArchiveQueries: transitionPorts.publishedArchiveQueries }).get("client-a");
    assert.equal(snapshot.articles.length, 10000);
    assert.equal(Object.keys(snapshot.workflowByArticle).length, 10000);
    assert.deepEqual(snapshot.publicationRecords.map(row => row.articleId).sort(), ["article-4999", "article-5000", "article-9999"]);
    for (const row of snapshot.publicationRecords) assert.equal(row.status, "failed");
    const registry = createContractRegistry(articleManagementContracts);
    const response = registry.success(registry.byChannel("content:get-article-management-snapshot"), projectManagementSnapshot(snapshot));
    assert.equal(response.ok, true);
    assert.equal(response.data.articles.length, 10000);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a failed later identity page is not cached and revision changes discard the whole build", async () => {
  let revision = 1, failLater = true, changeVersion = false;
  const reads = [];
  const service = createArticleManagementSnapshot({
    getRevision: () => revision, listArticles: articles,
    publishedArchiveQueries: { listPublishedArchiveSummaries: () => [] },
    operationalStore: { listArticleLifecycleFacts({ articleIds }) {
      assert.ok(articleIds.length <= 5000);
      reads.push(articleIds[0]);
      if (articleIds[0] === "article-5000" && failLater)
        throw Object.assign(new Error("Synthetic later page failure"), { code: "SYNTHETIC_READ_FAILED" });
      if (articleIds[0] === "article-5000" && changeVersion) { revision++; changeVersion = false; }
      return { publications: [], submissionItems: [], orders: [], attentionItems: [], manualReconciliations: [] };
    } },
  });
  await assert.rejects(service.get("client-a"), { code: "SYNTHETIC_READ_FAILED" });
  assert.equal(service.cacheSize(), 0);
  failLater = false;
  changeVersion = true;
  reads.length = 0;
  const snapshot = await service.get("client-a");
  assert.equal(snapshot.revision, 2);
  assert.equal(snapshot.articles.length, 10001);
  assert.equal(reads.filter(id => id === "article-0").length, 2);
  const count = reads.length;
  assert.equal((await service.get("client-a")).revision, 2);
  assert.equal(reads.length, count);
});
