const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { describe, it } = require("node:test");
const { createArticleManagementSnapshot } = require("../desktop/services/article-management-snapshot");

const ARTICLE_COUNTS = [10, 100, 1000];
const SUBMISSION_ITEM_COUNTS = [0, 10, 100];
const SAMPLE_COUNT = 7;

function makeFixture(articleCount, submissionItemCount) {
  const articles = Array.from({ length: articleCount }, (_, index) => ({
    id: `article-${index + 1}`,
    clientId: "client-1",
    title: `Article ${index + 1}`,
    status: "saved",
  }));
  const submissionItems = Array.from({ length: submissionItemCount }, (_, index) => ({
    id: `submission-item-${index + 1}`,
    articleId: articles[index % articles.length].id,
    status: "queued",
    targetPlatformId: "toutiao",
  }));
  const publicationRecords = articles.map((article, index) => ({
    articleId: article.id,
    publicationId: `publication-${index + 1}`,
    status: "published",
  }));
  return { articles, submissionItems, publicationRecords, trash: [] };
}

function createSnapshotLoadHarness(fixture) {
  const counters = { ipcCalls: 0, batchReads: 0, callsByMethod: Object.create(null) };
  function read(method, valueFactory) {
    counters.batchReads += 1;
    counters.callsByMethod[method] = (counters.callsByMethod[method] || 0) + 1;
    return valueFactory();
  }
  const service = createArticleManagementSnapshot({
    workspaceIdentity: "benchmark-workspace",
    getRevision: () => 1,
    listArticles: () => read("listArticles", () => fixture.articles.slice()),
    listTrash: () => read("listTrash", () => fixture.trash.slice()),
    listLifecycleFacts: () => read("listLifecycleFacts", () => ({
      publications: fixture.publicationRecords.slice(),
      submissionItems: fixture.submissionItems.slice(),
      orders: [],
    })),
    listAttention: () => read("listAttention", () => ({
      revision: 1,
      items: [],
      counts: { total: 0, actionable: 0 },
    })),
    listTransactions: () => read("listTransactions", () => []),
    submissionPlatformDirectory: {
      list: () => read("listSubmissionPlatforms", () => [
        { id: "toutiao", contentQueueImport: true },
      ]),
    },
  });
  return {
    async loadSnapshot() {
      const startedAt = performance.now();
      counters.ipcCalls += 1;
      const snapshot = await service.get({ clientId: "client-1" });
      return {
        elapsedMs: performance.now() - startedAt,
        snapshot,
        counters: {
          ipcCalls: counters.ipcCalls,
          batchReads: counters.batchReads,
          callsByMethod: { ...counters.callsByMethod },
        },
      };
    },
  };
}

function percentile(values, fraction) {
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

async function measureSnapshot(articleCount, submissionItemCount) {
  const fixture = makeFixture(articleCount, submissionItemCount);
  const samples = [];
  let last;
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    last = await createSnapshotLoadHarness(fixture).loadSnapshot();
    samples.push(last.elapsedMs);
  }
  return {
    articleCount,
    submissionItemCount,
    p50Ms: Number(percentile(samples, 0.5).toFixed(3)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(3)),
    ipcCalls: last.counters.ipcCalls,
    batchReads: last.counters.batchReads,
    callsByMethod: last.counters.callsByMethod,
    loadedArticleCount: last.snapshot.articles.length,
    hasRetiredSubmissionWire: Object.prototype.hasOwnProperty.call(last.snapshot, "submissionBatches"),
  };
}

describe("article management snapshot benchmark", () => {
  it("keeps batch reads constant as article and submission-item counts grow", async () => {
    const records = [];
    for (const articleCount of ARTICLE_COUNTS) {
      for (const submissionItemCount of SUBMISSION_ITEM_COUNTS) {
        const result = await measureSnapshot(articleCount, submissionItemCount);
        records.push(result);
        assert.equal(result.ipcCalls, 1);
        assert.equal(result.batchReads, 6);
        assert.equal(result.loadedArticleCount, articleCount);
        assert.equal(result.hasRetiredSubmissionWire, false);
        assert.equal(result.callsByMethod.listLifecycleFacts, 1);
        assert.equal(result.callsByMethod.listSubmissionPlatforms, 1);
        assert.ok(result.p95Ms >= result.p50Ms);
      }
    }
    console.log(`article-management-snapshot ${JSON.stringify(records)}`);
  });
});

module.exports = { createSnapshotLoadHarness, measureSnapshot };
