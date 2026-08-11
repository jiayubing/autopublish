"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const {
  createArticleManagementSnapshot,
} = require("../desktop/services/article-management-snapshot");
const {
  createRegularQueueGroupOrchestrator,
} = require("../desktop/services/regular-queue-group-orchestrator");
const {
  createMediaOrderService,
} = require("../desktop/services/media-order-service");
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
const {
  makeFixture,
  measureOnce: measureArticleManagement,
} = require("./run-ticket-25-a-benchmark");

const OPERATION_IDS = Object.freeze([
  "article_management_snapshot",
  "regular_queue_snapshot",
  "paid_order_snapshot",
]);

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

function contractPath(filename) {
  return path.join(
    path.dirname(APPLICATION_ROOT),
    ".scratch",
    "article-lifecycle-and-submission",
    "acceptance",
    filename,
  );
}

function relativeOutput(output) {
  const relative = path
    .relative(APPLICATION_ROOT, output)
    .replaceAll("\\", "/");
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    return "<external-output>";
  return relative;
}

function readCapability(counters, valueFactory) {
  counters.queries += 1;
  counters.scans += 1;
  return valueFactory();
}

function makeRegularQueueSnapshots(scale) {
  const groups = [];
  const itemsPerGroup = Math.floor(
    scale.regularQueueItems / scale.regularQueueGroups,
  );
  const remainder = scale.regularQueueItems % scale.regularQueueGroups;
  for (
    let groupIndex = 0;
    groupIndex < scale.regularQueueGroups;
    groupIndex += 1
  ) {
    const itemCount = itemsPerGroup + (groupIndex < remainder ? 1 : 0);
    const items = Array.from({ length: itemCount }, (_, itemIndex) => ({
      itemId: `ticket-25-f-queue-item-${groupIndex + 1}-${itemIndex + 1}`,
      batchId: `ticket-25-f-queue-batch-${groupIndex + 1}`,
      articleId: `ticket-25-a-article-${
        ((groupIndex * itemCount + itemIndex) % scale.articles) + 1
      }`,
      regularPublicationAttemptId: `ticket-25-f-attempt-${
        groupIndex + 1
      }-${itemIndex + 1}`,
      position: itemIndex + 1,
    }));
    const current = groupIndex % 2 === 0 ? items[0] : null;
    const remaining = current ? items.slice(1) : items;
    groups.push({
      queueGroupId: `ticket-25-f-queue-group-${groupIndex + 1}`,
      platformId: `synthetic-platform-${groupIndex % 2}`,
      accountProfileId: `synthetic-account-${groupIndex + 1}`,
      runState: current ? "in_flight" : "paused",
      pauseIntent: current ? "none" : "system",
      manuallyPaused: false,
      current: current
        ? {
            ...current,
            phase: "prepared",
            claimUntil: "2026-08-12T00:01:00.000Z",
          }
        : null,
      remaining,
      actions: {
        canStart: !current,
        canPause: Boolean(current),
        reasonCode: null,
      },
      revision: 1,
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
    });
  }
  return groups;
}

function makePaidOrderViews(scale) {
  const statusCodes = ["0", "1", "2", "4", "9", "cancelled"];
  return Array.from({ length: scale.paidOrders }, (_, index) => {
    const statusCode = statusCodes[index % statusCodes.length];
    return {
      orderId: `ticket-25-f-order-${index + 1}`,
      title: `Synthetic order ${index + 1}`,
      filename: `article-${index + 1}.md`,
      resourceName: `Synthetic media ${index % 8}`,
      quotedPrice: 12.5,
      createdAt: `2026-08-12T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
      submittedAt: "2026-08-12T00:00:00.000Z",
      publishedAt: statusCode === "2" ? "2026-08-12T00:01:00.000Z" : null,
      statusCode,
      remoteUrl:
        statusCode === "2"
          ? "https://publisher.example/synthetic-article"
          : null,
      actualAmount: null,
      anomaly: null,
    };
  });
}

function regularTransitions(fixture, counters) {
  return {
    beginRegularRemoteSubmission: () => null,
    claimRegularQueueGroupHead: () => null,
    listRegularQueueGroupSnapshots: () =>
      readCapability(counters, () => fixture.regularQueueGroups),
    pauseAllRegularQueueGroups: () => null,
    pauseRegularQueueGroupsOnStartup: () => null,
    renewRegularQueueGroupClaim: () => null,
    setRegularQueueGroupRunIntent: () => null,
    startAllRegularQueueGroups: () => null,
  };
}

function measureRegularQueue(fixture) {
  const counters = { queries: 0, scans: 0, externalTransportCalls: 0 };
  const orchestrator = createRegularQueueGroupOrchestrator({
    regularQueueGroupTransitions: regularTransitions(fixture, counters),
    platformSubmissionExecutor: { preparePlatformSubmission: () => null },
  });
  const startedAt = performance.now();
  const groups = orchestrator.snapshot();
  return {
    elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
    counters,
    loadedGroupCount: groups.length,
    loadedQueueItemCount: groups.reduce(
      (total, group) =>
        total + (group.current ? 1 : 0) + group.remaining.length,
      0,
    ),
  };
}

function orderTransitions(fixture, counters) {
  return {
    listOrderObservationViews: () =>
      readCapability(counters, () => fixture.paidOrders),
    getOrderObservationContext: () => ({
      orderSnapshotFingerprint: "a".repeat(64),
      remoteUrl: null,
    }),
    recordOrderObservation: (input) => input,
    recordOrderStatusAnomaly: (input) => input,
    prepareOrderStatusAnomalyResolution: (input) => input,
    resumeOrderTracking: (input) => input,
    confirmOrderPublished: (input) => input,
    confirmOrderNotPublished: (input) => input,
  };
}

async function measurePaidOrders(fixture, projectOrderList) {
  const counters = { queries: 0, scans: 0, externalTransportCalls: 0 };
  const service = createMediaOrderService({
    orderObservationTransitions: orderTransitions(fixture, counters),
  });
  const startedAt = performance.now();
  const orders = service.listOrderViews();
  const all = projectOrderList(orders, { status: "all" });
  const pending = projectOrderList(orders, { status: "0" });
  return {
    elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
    counters,
    loadedOrderCount: orders.length,
    projectedOrderCount: all.items.length,
    projectedPendingCount: pending.items.length,
    projectedCounts: all.counts,
  };
}

function operationMeasure(operationId, fixture, projectOrderList) {
  if (operationId === "article_management_snapshot")
    return measureArticleManagement(fixture);
  if (operationId === "regular_queue_snapshot")
    return measureRegularQueue(fixture);
  if (operationId === "paid_order_snapshot")
    return measurePaidOrders(fixture, projectOrderList);
  throw contractError("TICKET_25_F_BENCHMARK_OPERATION_UNKNOWN");
}

function operationReport(operation, samples) {
  const last = samples[samples.length - 1];
  const hardGatePassed = samples.every(
    (sample) =>
      sample.counters.queries <= operation.maxQueries &&
      sample.counters.scans <= operation.maxScans &&
      sample.counters.externalTransportCalls <=
        operation.maxExternalTransportCalls,
  );
  return {
    operationId: operation.operationId,
    status: hardGatePassed ? "OBSERVED_NOT_A_FINAL_GATE" : "FAILED",
    counts: {
      queries: last.counters.queries,
      scans: last.counters.scans,
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
      status: "NOT_APPROVED",
      decision: "OBSERVATION_ONLY",
      regression: "NOT_ASSESSED_NO_APPROVED_BASELINE",
      baseline: null,
    },
    samples: samples.map((sample) => ({
      elapsedMs: sample.elapsedMs,
      queries: sample.counters.queries,
      scans: sample.counters.scans,
      externalTransportCalls: sample.counters.externalTransportCalls,
      loadedArticleCount: sample.loadedArticleCount,
      loadedGroupCount: sample.loadedGroupCount,
      loadedQueueItemCount: sample.loadedQueueItemCount,
      loadedOrderCount: sample.loadedOrderCount,
    })),
    loaded: {
      articles: last.loadedArticleCount || 0,
      groups: last.loadedGroupCount || 0,
      queueItems: last.loadedQueueItemCount || 0,
      orders: last.loadedOrderCount || 0,
      projectedOrders: last.projectedOrderCount || 0,
      projectedPendingOrders: last.projectedPendingCount || 0,
      projectedCounts: last.projectedCounts || null,
    },
  };
}

async function runBenchmark(output) {
  const startedAt = Date.now();
  const budget = readContract("queryScanBudget");
  const budgetValidation = validateQueryScanBudget(budget);
  const operations = OPERATION_IDS.map((operationId) => {
    const operation = budget.operations.find(
      (candidate) => candidate.operationId === operationId,
    );
    if (!operation)
      throw contractError("TICKET_25_F_BENCHMARK_OPERATION_MISSING");
    return operation;
  });
  const fixture = makeFixture(budget.syntheticFixture);
  fixture.regularQueueGroups = makeRegularQueueSnapshots(
    budget.syntheticFixture,
  );
  fixture.paidOrders = makePaidOrderViews(budget.syntheticFixture);
  const { projectOrderList } =
    await import("../media-workbench/src/features/media/order-list-projection.js");
  const samplesByOperation = Object.fromEntries(
    OPERATION_IDS.map((operationId) => [operationId, []]),
  );
  for (let warmup = 0; warmup < budget.protocol.warmupRuns; warmup += 1)
    for (const operation of operations)
      await operationMeasure(operation.operationId, fixture, projectOrderList);
  for (let run = 0; run < budget.protocol.measuredRuns; run += 1)
    for (const operation of operations)
      samplesByOperation[operation.operationId].push(
        await operationMeasure(
          operation.operationId,
          fixture,
          projectOrderList,
        ),
      );
  const operationReports = operations.map((operation) =>
    operationReport(operation, samplesByOperation[operation.operationId]),
  );
  const hardGatePassed = operationReports.every(
    (report) => report.counts.hardGate === "PASSED",
  );
  const provenance = createExecutionProvenance({
    root: APPLICATION_ROOT,
    command: `npm run benchmark:ticket-25-f -- --output ${relativeOutput(output)}`,
    startedAt,
  });
  const report = {
    status: hardGatePassed ? "OBSERVED_NOT_A_FINAL_GATE" : "FAILED",
    operation: "ticket-25-f-benchmark",
    ...provenance,
    environment: {
      ...safeEnvironmentSummary(),
      osRelease: os.release(),
      machine: {
        arch: process.arch,
        cpuCount: os.cpus().length,
      },
    },
    package: "25-F",
    budgetSchemaVersion: budget.schemaVersion,
    budgetSha256: sha256(contractPath("25-a-query-scan-budget.json")),
    contractInputs: {
      storyMatrixSha256: sha256(contractPath("25-a-story-matrix.json")),
      stateMatrixSha256: sha256(contractPath("25-a-state-matrix.json")),
      evidenceManifestSha256: sha256(
        contractPath("25-a-evidence-manifest.json"),
      ),
    },
    fixture: {
      seed: budget.syntheticFixture.seed,
      clients: budget.syntheticFixture.clients,
      articles: budget.syntheticFixture.articles,
      trashedArticles: budget.syntheticFixture.trashedArticles,
      regularQueueGroups: budget.syntheticFixture.regularQueueGroups,
      regularQueueItems: budget.syntheticFixture.regularQueueItems,
      paidOrders: budget.syntheticFixture.paidOrders,
      attentionItems: budget.syntheticFixture.attentionItems,
      transport: "in_memory_fake_only",
    },
    protocol: {
      warmupRuns: budget.protocol.warmupRuns,
      measuredRuns: budget.protocol.measuredRuns,
      discardWarmup: budget.protocol.discardWarmup,
      sampleOrder: budget.protocol.sampleOrder,
      repeatIsolation: budget.protocol.repeatIsolation,
    },
    operations: operationReports,
    budgetValidation,
    resultDisposition: "query_scan_hard_gate_only",
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  assertSafeGeneratedEvidence(report);
  if (!hardGatePassed)
    throw contractError("TICKET_25_F_QUERY_SCAN_BUDGET_FAILED");
  return report;
}

if (require.main === module) {
  let output;
  try {
    output = parseOutputArgument(
      process.argv.slice(2),
      path.join(
        APPLICATION_ROOT,
        "build",
        "evidence",
        "ticket-25-f-benchmark.json",
      ),
    );
  } catch (error) {
    const code =
      error && typeof error.code === "string"
        ? error.code
        : "TICKET_25_F_BENCHMARK_FAILED";
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
            : "TICKET_25_F_BENCHMARK_FAILED";
        process.stderr.write(code + "\n");
        process.exitCode = 1;
      });
}

module.exports = {
  OPERATION_IDS,
  makePaidOrderViews,
  makeRegularQueueSnapshots,
  measurePaidOrders,
  measureRegularQueue,
  runBenchmark,
};
