const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { describe, it } = require('node:test');
const { createArticleManagementSnapshot } = require('../desktop/services/article-management-snapshot');

const ARTICLE_COUNTS = [10, 100, 1000];
const BATCH_COUNTS = [0, 10, 100];
const SAMPLE_COUNT = 7;

function makeFixture(articleCount, batchCount) {
  const articles = Array.from({ length: articleCount }, (_, index) => ({
    id: `article-${index + 1}`,
    clientId: 'client-1',
    title: `Article ${index + 1}`,
    status: 'saved',
  }));
  const batches = Array.from({ length: batchCount }, (_, index) => ({
    id: `submission-batch-${index + 1}`,
    clientId: 'client-1',
    status: 'queued',
    items: [{ articleId: articles[index % articles.length].id, status: 'queued' }],
  }));
  const publicationRecords = articles.map((article, index) => ({
    articleId: article.id,
    publicationId: `publication-${index + 1}`,
    status: 'published',
  }));

  return { articles, batches, publicationRecords, trash: [] };
}

function createCurrentLoadHarness(fixture) {
  const counters = {
    ipcCalls: 0,
    fileScans: 0,
    callsByMethod: Object.create(null),
  };

  // The current view has no snapshot interface or scan counter. This fixture
  // preserves its existing bridge call graph and counts one logical local-file
  // scan for each store/service read, without claiming OS syscall telemetry.
  function read(method, valueFactory) {
    counters.ipcCalls += 1;
    counters.fileScans += 1;
    counters.callsByMethod[method] = (counters.callsByMethod[method] || 0) + 1;
    return Promise.resolve(valueFactory());
  }

  function loadCurrentViewData() {
    const startedAt = performance.now();
    return Promise.all([
      read('listContentArticles', () => fixture.articles.slice()),
      read('listContentSubmissionBatches', () => fixture.batches.slice()),
      read('listContentTrash', () => fixture.trash.slice()),
    ]).then(async ([articles, batches, trash]) => {
      const articleIds = articles.map((article) => article.id);
      const publicationRecords = await read('listPublicationHistory', () => {
        const ids = new Set(articleIds);
        return fixture.publicationRecords.filter((record) => ids.has(record.articleId));
      });
      const cancellationPlans = await Promise.all(batches.map((batch) => read(
        'previewCancelContentSubmissionBatch',
        () => ({ batchId: batch.id, clientId: batch.clientId, allowedCount: batch.items.length }),
      )));
      return {
        elapsedMs: performance.now() - startedAt,
        snapshot: { articles, batches, trash, publicationRecords, cancellationPlans },
        counters: {
          ipcCalls: counters.ipcCalls,
          fileScans: counters.fileScans,
          callsByMethod: { ...counters.callsByMethod },
        },
      };
    });
  }

  return { loadCurrentViewData };
}

function createSnapshotLoadHarness(fixture) {
  const counters = { ipcCalls: 0, fileScans: 0, callsByMethod: Object.create(null) };
  function read(method, valueFactory) {
    counters.fileScans += 1;
    counters.callsByMethod[method] = (counters.callsByMethod[method] || 0) + 1;
    return valueFactory();
  }
  const service = createArticleManagementSnapshot({
    workspaceIdentity: 'benchmark-workspace',
    getRevision: () => 1,
    listArticles: () => read('listArticles', () => fixture.articles.slice()),
    listTrash: () => read('listTrash', () => fixture.trash.slice()),
    listBatches: () => read('listBatches', () => fixture.batches.slice()),
    listPublications: () => read('listPublications', () => fixture.publicationRecords.slice()),
    listAttention: () => read('listAttention', () => ({ revision: 1, items: [], counts: { total: 0, actionable: 0 } })),
    listTransactions: () => read('listTransactions', () => []),
    listPlatforms: () => read('listPlatforms', () => [{ id: 'toutiao', contentQueueImport: true }]),
  });
  return {
    async loadSnapshot() {
      const startedAt = performance.now();
      counters.ipcCalls += 1;
      const snapshot = await service.get({ clientId: 'client-1' });
      return {
        elapsedMs: performance.now() - startedAt,
        snapshot,
        counters: { ipcCalls: counters.ipcCalls, fileScans: counters.fileScans, callsByMethod: { ...counters.callsByMethod } },
      };
    },
  };
}

function percentile(values, fraction) {
  const sorted = values.slice().sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

async function measure(articleCount, batchCount) {
  const fixture = makeFixture(articleCount, batchCount);
  const samples = [];
  let last;
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const harness = createCurrentLoadHarness(fixture);
    last = await harness.loadCurrentViewData();
    samples.push(last.elapsedMs);
  }

  return {
    articleCount,
    batchCount,
    p50Ms: Number(percentile(samples, 0.5).toFixed(3)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(3)),
    ipcCalls: last.counters.ipcCalls,
    fileScans: last.counters.fileScans,
    callsByMethod: last.counters.callsByMethod,
    loadedArticleCount: last.snapshot.articles.length,
    loadedBatchCount: last.snapshot.batches.length,
  };
}

async function measureSnapshot(articleCount, batchCount) {
  const fixture = makeFixture(articleCount, batchCount);
  const samples = [];
  let last;
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    last = await createSnapshotLoadHarness(fixture).loadSnapshot();
    samples.push(last.elapsedMs);
  }
  return {
    articleCount,
    batchCount,
    p50Ms: Number(percentile(samples, 0.5).toFixed(3)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(3)),
    ipcCalls: last.counters.ipcCalls,
    fileScans: last.counters.fileScans,
    callsByMethod: last.counters.callsByMethod,
    loadedArticleCount: last.snapshot.articles.length,
    loadedBatchCount: last.snapshot.submissionBatches.length,
  };
}

describe('article management snapshot benchmark baseline', () => {
  it('records current p50/p95 time, logical scans, and IPC reads for each fixture size', async () => {
    const records = [];

    for (const articleCount of ARTICLE_COUNTS) {
      for (const batchCount of BATCH_COUNTS) {
        const result = await measure(articleCount, batchCount);
        records.push(result);

        assert.equal(result.ipcCalls, batchCount + 4);
        assert.equal(result.fileScans, batchCount + 4);
        assert.equal(result.loadedArticleCount, articleCount);
        assert.equal(result.loadedBatchCount, batchCount);
        assert.equal(result.callsByMethod.listContentArticles, 1);
        assert.equal(result.callsByMethod.listContentSubmissionBatches, 1);
        assert.equal(result.callsByMethod.listContentTrash, 1);
        assert.equal(result.callsByMethod.listPublicationHistory, 1);
        assert.equal(result.callsByMethod.previewCancelContentSubmissionBatch || 0, batchCount);
        assert.ok(result.p95Ms >= result.p50Ms);
      }
    }

    console.log(`article-management-baseline ${JSON.stringify(records)}`);
  });
});

describe('article management snapshot benchmark', () => {
  it('records one snapshot IPC and one logical read per storage category', async () => {
    const records = [];
    for (const articleCount of ARTICLE_COUNTS) {
      for (const batchCount of BATCH_COUNTS) {
        const result = await measureSnapshot(articleCount, batchCount);
        records.push(result);
        assert.equal(result.ipcCalls, 1);
        assert.equal(result.fileScans, 6);
        assert.equal(result.loadedArticleCount, articleCount);
        assert.equal(result.loadedBatchCount, batchCount);
        assert.ok(result.p95Ms >= result.p50Ms);
      }
    }
    console.log(`article-management-snapshot ${JSON.stringify(records)}`);
  });
});

module.exports = { createCurrentLoadHarness, measure, measureSnapshot };
