const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { it } = require("node:test");

const { createSubmissionBatchStore } = require("../src/content/submission-batch-store");
const { createContentSubmissionService } = require("../desktop/services/content-submission-service");

it("records linear real-store query operations for listBatches", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-submission-query-benchmark-"));
  try {
    const realStore = createSubmissionBatchStore({ workspaceRoot: root });
    const measurements = [];
    [10, 100, 500, 1000].forEach((batchCount) => [1, 5].forEach((itemsPerBatch) => {
      const prefix = `b${batchCount}-i${itemsPerBatch}`;
      for (let index = 0; index < batchCount; index += 1) {
        realStore.save({ id: `${prefix}-${index}`, clientId: "client-1", createdAt: `2026-07-22T00:00:${String(index % 60).padStart(2, "0")}.000Z`, status: "queued", items: Array.from({ length: itemsPerBatch }, (_, itemIndex) => ({ articleId: `article-${prefix}-${index}-${itemIndex}`, targetPlatformId: "toutiao", status: "queued", filePath: path.join(root, `missing-${prefix}-${index}-${itemIndex}.md`), sidecarPath: path.join(root, `missing-${prefix}-${index}-${itemIndex}.md.submission.json`) })) });
      }
      const counters = { list: 0, get: 0, reconcile: 0, ledgerGet: 0, ledgerList: 0, sidecarReads: 0 };
      const batchStore = Object.assign({}, realStore, {
        list() { counters.list += 1; return realStore.list().filter((batch) => batch.id.startsWith(prefix)); },
        get(id) { counters.get += 1; return realStore.get(id); },
        reconcile(...args) { counters.reconcile += 1; return realStore.reconcile(...args); }
      });
      const service = createContentSubmissionService({ workspaceRoot: root, batchStore, articleStore: { getArticle: () => { throw new Error("unused"); } }, platforms: [{ id: "toutiao", scanDir: "toutiao", contentQueueImport: true }], publicationLedger: { get() { counters.ledgerGet += 1; return null; }, listForArticles() { counters.ledgerList += 1; return []; } } });
      const originalRead = fs.readFileSync;
      fs.readFileSync = function(file, ...args) { if (String(file).endsWith(".submission.json")) counters.sidecarReads += 1; return originalRead.call(fs, file, ...args); };
      let result;
      try { result = service.listBatches("client-1"); } finally { fs.readFileSync = originalRead; }
      const itemCount = batchCount * itemsPerBatch;
      measurements.push({ batchCount, itemsPerBatch, itemCount, counters });
      assert.equal(result.length, batchCount);
      assert.equal(counters.list, 1, "one listBatches query must load the batch store once");
      assert.equal(counters.sidecarReads, itemCount, "each item sidecar may be read once per query");
    }));
    console.log(`content-submission-query-snapshot ${JSON.stringify(measurements)}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
