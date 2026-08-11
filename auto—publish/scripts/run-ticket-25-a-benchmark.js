"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const {
  createArticleManagementSnapshot,
} = require("../desktop/services/article-management-snapshot");
const {
  APPLICATION_ROOT,
  contractError,
  parseOutputArgument,
  readContract,
  validateQueryScanBudget,
  assertSafeGeneratedEvidence,
  safeEnvironmentSummary,
} = require("./ticket-25-a-contract");
const { createExecutionProvenance } = require("./release-evidence-inputs");

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * fraction) - 1,
  );
  return Number(sorted[index].toFixed(3));
}

function sha256(filename) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filename))
    .digest("hex");
}

function makeFixture(scale) {
  const articles = Array.from({ length: scale.articles }, (_, index) => ({
    id: `ticket-25-a-article-${index + 1}`,
    clientId: "ticket-25-a-client-1",
    title: `Synthetic article ${index + 1}`,
    content: "Synthetic text-only body",
    status: "saved",
  }));
  const trash = Array.from({ length: scale.trashedArticles }, (_, index) => ({
    id: `ticket-25-a-trash-${index + 1}`,
    clientId: "ticket-25-a-client-1",
    title: `Synthetic trash ${index + 1}`,
    content: "Synthetic text-only body",
    status: "saved",
  }));
  const batches = Array.from(
    { length: scale.regularQueueGroups * 50 },
    (_, index) => ({
      id: `ticket-25-a-batch-${index + 1}`,
      clientId: "ticket-25-a-client-1",
      status: "queued",
      items: [
        {
          articleId: articles[index % articles.length].id,
          status: "queued",
        },
      ],
    }),
  );
  const publications = articles.map((article, index) => ({
    articleId: article.id,
    publicationId: `ticket-25-a-publication-${index + 1}`,
    clientId: article.clientId,
    targetKey: `platform:synthetic-${index % 2}`,
    status: "published",
    attempts: [],
  }));
  const orders = articles.map((article, index) => ({
    articleId: article.id,
    orderId: `ticket-25-a-order-${index + 1}`,
    mediaResourceId: `resource-${index % 8}`,
    publicationStatus: "paid_processing",
    supplierStatusCode: "0",
    titleSnapshot: article.title,
  }));
  return {
    articles,
    trash,
    batches,
    lifecycleFacts: {
      publications,
      orders,
      submissionItems: [],
    },
    attention: {
      revision: 1,
      items: Array.from({ length: scale.attentionItems }, (_, index) => ({
        articleId: articles[index % articles.length].id,
        kind: "synthetic_attention",
      })),
      counts: { total: scale.attentionItems, actionable: scale.attentionItems },
    },
    transactions: [],
  };
}

async function measureOnce(fixture) {
  const counters = { queries: 0, scans: 0, externalTransportCalls: 0 };
  const read = (valueFactory) => {
    counters.queries += 1;
    counters.scans += 1;
    return valueFactory();
  };
  const service = createArticleManagementSnapshot({
    workspaceIdentity: "ticket-25-a-benchmark",
    getRevision: () => 1,
    listArticles: () => read(() => fixture.articles),
    listTrash: () => read(() => fixture.trash),
    listBatches: () => read(() => fixture.batches),
    listLifecycleFacts: () => read(() => fixture.lifecycleFacts),
    listAttention: () => read(() => fixture.attention),
    listTransactions: () => read(() => fixture.transactions),
    contentSubmissionService: {
      listPlatforms: () =>
        read(() => [{ id: "synthetic-platform", contentQueueImport: true }]),
    },
  });
  const startedAt = performance.now();
  const snapshot = await service.get({ clientId: "ticket-25-a-client-1" });
  return {
    elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
    counters,
    loadedArticleCount: snapshot.articles.length,
    loadedOrderCount: snapshot.orders.length,
  };
}

async function runBenchmark(output) {
  const startedAt = Date.now();
  const budget = readContract("queryScanBudget");
  const budgetSummary = validateQueryScanBudget(budget);
  const operation = budget.operations.find(
    (item) => item.operationId === "article_management_snapshot",
  );
  if (!operation)
    throw contractError("TICKET_25_A_BENCHMARK_OPERATION_MISSING");
  const fixture = makeFixture(budget.syntheticFixture);
  const samples = [];
  let last = null;
  for (let index = 0; index < budget.protocol.warmupRuns; index += 1)
    await measureOnce(fixture);
  for (let index = 0; index < budget.protocol.measuredRuns; index += 1) {
    last = await measureOnce(fixture);
    samples.push(last);
  }
  const queryCount = last.counters.queries;
  const scanCount = last.counters.scans;
  const hardGatePassed =
    queryCount <= operation.maxQueries &&
    scanCount <= operation.maxScans &&
    last.counters.externalTransportCalls <= operation.maxExternalTransportCalls;
  const provenance = createExecutionProvenance({
    root: APPLICATION_ROOT,
    command: `npm run benchmark:ticket-25-a -- --output ${path
      .relative(APPLICATION_ROOT, output)
      .replaceAll("\\", "/")}`,
    startedAt,
  });
  const report = {
    status: hardGatePassed ? "OBSERVED_NOT_A_FINAL_GATE" : "FAILED",
    operation: "ticket-25-a-benchmark",
    ...provenance,
    environment: safeEnvironmentSummary(),
    budgetSchemaVersion: budget.schemaVersion,
    budgetSha256: sha256(
      path.join(
        path.dirname(__dirname),
        "..",
        ".scratch",
        "article-lifecycle-and-submission",
        "acceptance",
        "25-a-query-scan-budget.json",
      ),
    ),
    fixture: {
      seed: budget.syntheticFixture.seed,
      clients: budget.syntheticFixture.clients,
      articles: budget.syntheticFixture.articles,
      trashedArticles: budget.syntheticFixture.trashedArticles,
      regularQueueGroups: budget.syntheticFixture.regularQueueGroups,
      regularQueueItems: budget.syntheticFixture.regularQueueItems,
      paidOrders: budget.syntheticFixture.paidOrders,
      attentionItems: budget.syntheticFixture.attentionItems,
    },
    counts: {
      queries: queryCount,
      scans: scanCount,
      externalTransportCalls: last.counters.externalTransportCalls,
      maxQueries: operation.maxQueries,
      maxScans: operation.maxScans,
      maxExternalTransportCalls: operation.maxExternalTransportCalls,
      hardGate: hardGatePassed ? "PASSED" : "FAILED",
    },
    p50Ms: percentile(
      samples.map((sample) => sample.elapsedMs),
      0.5,
    ),
    p95Ms: percentile(
      samples.map((sample) => sample.elapsedMs),
      0.95,
    ),
    wallClock: {
      status: budget.wallClockBaseline.status,
      decision: budget.wallClockBaseline.decision,
      baseline: "not-approved",
    },
    samples: samples.map((sample) => ({
      elapsedMs: sample.elapsedMs,
      queries: sample.counters.queries,
      scans: sample.counters.scans,
      externalTransportCalls: sample.counters.externalTransportCalls,
    })),
    resultDisposition: "query_scan_hard_gate_only",
    budgetValidation: budgetSummary,
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  assertSafeGeneratedEvidence(report);
  if (report.status === "FAILED")
    throw contractError("TICKET_25_A_QUERY_SCAN_BUDGET_FAILED");
  return report;
}

if (require.main === module) {
  let output;
  try {
    output = parseOutputArgument(process.argv.slice(2));
  } catch (error) {
    const code =
      error && typeof error.code === "string"
        ? error.code
        : "TICKET_25_A_BENCHMARK_FAILED";
    process.stderr.write(code + "\n");
    process.exitCode = 1;
  }
  if (output)
    runBenchmark(output)
      .then((report) => process.stdout.write(JSON.stringify(report) + "\n"))
      .catch((error) => {
        const code =
          error && typeof error.code === "string"
            ? error.code
            : "TICKET_25_A_BENCHMARK_FAILED";
        process.stderr.write(code + "\n");
        process.exitCode = 1;
      });
}

module.exports = { makeFixture, measureOnce, runBenchmark };
