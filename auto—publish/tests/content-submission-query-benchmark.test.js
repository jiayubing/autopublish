const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { it } = require("node:test");

const { createSubmissionBatchStore } = require("../src/content/submission-batch-store");
const { createPublicationLedger } = require("../src/publication/publication-ledger");
const { createContentSubmissionService } = require("../desktop/services/content-submission-service");

const RUNS = 7;

function percentile(values, p) {
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * p) - 1];
}

function ratioAtMost(measurements, name, maximum) {
  assert.ok(measurements.current[name] <= measurements.previous[name] * maximum,
    `${name} must grow by no more than ${maximum}x when input doubles (${measurements.previous[name]} -> ${measurements.current[name]})`);
}

function writeFixture(root, batchCount, itemsPerBatch) {
  const store = createSubmissionBatchStore({ workspaceRoot: root });
  for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
    const items = Array.from({ length: itemsPerBatch }, (_, itemIndex) => {
      const name = `article-${batchIndex}-${itemIndex}.md`;
      const filePath = path.join(root, "queue", name);
      const sidecarPath = filePath + ".submission.json";
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, `# ${name}\n`, "utf8");
      fs.writeFileSync(sidecarPath, JSON.stringify({ submissionBatchId: `batch-${batchIndex}`, articleId: `article-${batchIndex}-${itemIndex}`, targetPlatformId: "toutiao", contentHash: "fixture" }), "utf8");
      return { articleId: `article-${batchIndex}-${itemIndex}`, targetPlatformId: "toutiao", status: "queued", filePath, sidecarPath, contentHash: "fixture" };
    });
    store.save({ id: `batch-${batchIndex}`, clientId: "client-1", createdAt: `2026-07-22T00:${String(batchIndex % 60).padStart(2, "0")}:00.000Z`, status: "queued", items });
  }
  return store;
}

function measureFixture(batchCount, itemsPerBatch) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-submission-query-benchmark-"));
  try {
    const realStore = writeFixture(root, batchCount, itemsPerBatch);
    const realLedger = createPublicationLedger({ workspaceRoot: root });
    const durations = [];
    let representative = null;
    for (let run = 0; run < RUNS; run += 1) {
      const counters = { list: 0, get: 0, reconcile: 0, ledgerGet: 0, ledgerList: 0, sidecarReads: 0, batchVisits: 0, itemVisits: 0 };
      const batchStore = Object.assign({}, realStore, {
        list() { counters.list += 1; return realStore.list(); },
        get(id) { counters.get += 1; return realStore.get(id); },
        reconcile(...args) { counters.reconcile += 1; return realStore.reconcile(...args); }
      });
      const ledger = Object.assign({}, realLedger, {
        get(id) { counters.ledgerGet += 1; return realLedger.get(id); },
        listForArticles(...args) { counters.ledgerList += 1; return realLedger.listForArticles(...args); }
      });
      const service = createContentSubmissionService({
        workspaceRoot: root, batchStore, publicationLedger: ledger,
        articleStore: { getArticle: () => { throw new Error("unused"); } },
        platforms: [{ id: "toutiao", scanDir: "toutiao", contentQueueImport: true }],
        onSubmissionSnapshotCreated(counts) { counters.batchVisits += counts.batchVisits; counters.itemVisits += counts.itemVisits; }
      });
      const originalRead = fs.readFileSync;
      fs.readFileSync = function(file, ...args) {
        if (String(file).endsWith(".submission.json")) counters.sidecarReads += 1;
        return originalRead.call(fs, file, ...args);
      };
      const started = process.hrtime.bigint();
      let result;
      try { result = service.listBatches("client-1"); } finally { fs.readFileSync = originalRead; }
      durations.push(Number(process.hrtime.bigint() - started) / 1e6);
      assert.equal(result.length, batchCount);
      assert.equal(counters.list, 1, "one listBatches query must load the batch store once");
      assert.equal(counters.get, 0, "a list query must not reload individual batches");
      assert.equal(counters.reconcile, 0, "unchanged observations must not write batch reconciliation records");
      // This fixture intentionally models queue items that have not yet been
      // reserved for a remote attempt, so no ledger lookup is needed.  The
      // counter is retained to make a future change to that contract visible.
      assert.equal(counters.ledgerGet, 0, "unreserved queue items must not read the publication ledger");
      assert.equal(counters.sidecarReads, batchCount * itemsPerBatch, "each item sidecar is read once per query");
      representative = counters;
    }
    return Object.assign({ batchCount, itemsPerBatch, itemCount: batchCount * itemsPerBatch, p50Ms: percentile(durations, 0.5), p95Ms: percentile(durations, 0.95) }, representative);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

it("records real-store submission query operation counts and timing distributions", () => {
  const measurements = [];
  [10, 100, 500, 1000].forEach((batchCount) => [1, 5].forEach((itemsPerBatch) => measurements.push(measureFixture(batchCount, itemsPerBatch))));
  [1, 5].forEach((itemsPerBatch) => {
    const previous = measurements.find((value) => value.batchCount === 500 && value.itemsPerBatch === itemsPerBatch);
    const current = measurements.find((value) => value.batchCount === 1000 && value.itemsPerBatch === itemsPerBatch);
    ["batchVisits", "itemVisits", "sidecarReads", "ledgerGet"].forEach((name) => ratioAtMost({ previous, current }, name, 3));
  });
  // The Phase 0 commit did not contain this real-store benchmark, so a same-
  // machine p95 comparison cannot be reconstructed honestly after the fact.
  // Accept the structural gate on operation counts; retain this explicit
  // decision until a future baseline is captured before an implementation change.
  console.log(`content-submission-query-snapshot ${JSON.stringify({ measurements, phase0P95Comparison: { status: "accepted-unavailable", reason: "No same-machine real-operation benchmark exists at 2a018fe; do not claim the required 50% p95 improvement." } })}`);
});
