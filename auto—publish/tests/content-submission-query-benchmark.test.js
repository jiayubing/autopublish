const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { it } = require("node:test");

const { createSubmissionBatchStore } = require("../src/content/submission-batch-store");
const { createContentSubmissionService } = require("../desktop/services/content-submission-service");

it("records real batch-store reads for one listBatches query", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-submission-query-benchmark-"));
  try {
    const realStore = createSubmissionBatchStore({ workspaceRoot: root });
    for (let index = 0; index < 10; index += 1) {
      realStore.save({ id: `batch-${index}`, clientId: "client-1", createdAt: `2026-07-22T00:00:${String(index).padStart(2, "0")}.000Z`, status: "queued", items: [{ articleId: `article-${index}`, targetPlatformId: "toutiao", status: "queued", filePath: path.join(root, "missing.md"), sidecarPath: path.join(root, "missing.md.submission.json") }] });
    }
    const counters = { list: 0, get: 0, reconcile: 0, ledgerGet: 0, ledgerList: 0, sidecarReads: 0 };
    const batchStore = Object.assign({}, realStore, {
      list() { counters.list += 1; return realStore.list(); },
      get(id) { counters.get += 1; return realStore.get(id); },
      reconcile(...args) { counters.reconcile += 1; return realStore.reconcile(...args); }
    });
    const service = createContentSubmissionService({
      workspaceRoot: root,
      batchStore,
      articleStore: { getArticle: () => { throw new Error("unused"); } },
      platforms: [{ id: "toutiao", scanDir: "toutiao", contentQueueImport: true }],
      publicationLedger: { get() { counters.ledgerGet += 1; return null; }, listForArticles() { counters.ledgerList += 1; return []; } }
    });
    const originalRead = fs.readFileSync;
    fs.readFileSync = function(file, ...args) { if (String(file).endsWith(".submission.json")) counters.sidecarReads += 1; return originalRead.call(fs, file, ...args); };
    try { service.listBatches("client-1"); } finally { fs.readFileSync = originalRead; }

    console.log(`content-submission-query-baseline ${JSON.stringify(counters)}`);
    assert.equal(counters.list, 1, "one listBatches query must load the batch store once");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
