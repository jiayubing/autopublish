"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { DatabaseSync } = require("node:sqlite");
const domain = require("../src/domain");
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
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
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

function createOperationalFixture(scale) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "ticket-25-f-operational-"),
  );
  const store = createOperationalStore({ workspaceRoot: root });
  const databasePath = store.databasePath;
  store.close();
  const db = new DatabaseSync(databasePath);
  const stamp = "2026-08-12T00:00:00.000Z";
  const itemsPerGroup = Math.floor(
    scale.regularQueueItems / scale.regularQueueGroups,
  );
  const remainder = scale.regularQueueItems % scale.regularQueueGroups;
  try {
    db.exec("BEGIN IMMEDIATE");
    const insertProfile = db.prepare(
      "INSERT INTO account_profiles(account_profile_id,platform_id,display_name,created_at) VALUES(?,?,?,?)",
    );
    const insertGroup = db.prepare(
      "INSERT INTO submission_queue_groups(queue_group_id,platform_id,account_profile_id,pause_intent,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
    );
    const insertBatch = db.prepare(
      "INSERT INTO submission_batches(batch_id,status,revision,created_at,updated_at) VALUES(?,?,?,?,?)",
    );
    const insertItem = db.prepare(
      "INSERT INTO submission_items(item_id,batch_id,article_id,target_key,revision,status,claim_token,claim_until,payload_json) VALUES(?,?,?,?,?,?,?,?,?)",
    );
    const insertQueueItem = db.prepare(
      "INSERT INTO submission_queue_items(item_id,queue_group_id,position,created_at) VALUES(?,?,?,?)",
    );
    for (
      let groupIndex = 0;
      groupIndex < scale.regularQueueGroups;
      groupIndex += 1
    ) {
      const groupNumber = groupIndex + 1;
      const profileId = `ticket-25-f-account-${groupNumber}`;
      const groupId = `ticket-25-f-queue-group-${groupNumber}`;
      const batchId = `ticket-25-f-queue-batch-${groupNumber}`;
      const platformId = `synthetic-platform-${groupIndex % 2}`;
      const hasCurrent = groupIndex % 2 === 0;
      insertProfile.run(profileId, platformId, `Account ${groupNumber}`, stamp);
      insertGroup.run(
        groupId,
        platformId,
        profileId,
        hasCurrent ? "none" : "system",
        1,
        stamp,
        stamp,
      );
      insertBatch.run(batchId, "queued", 1, stamp, stamp);
      const itemCount = itemsPerGroup + (groupIndex < remainder ? 1 : 0);
      for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
        const itemNumber = itemIndex + 1;
        const itemId = `ticket-25-f-queue-item-${groupNumber}-${itemNumber}`;
        const attemptId = `ticket-25-f-attempt-${groupNumber}-${itemNumber}`;
        const articleId = `ticket-25-a-article-${
          ((groupIndex * itemsPerGroup + itemIndex) % scale.articles) + 1
        }`;
        const current = hasCurrent && itemIndex === 0;
        insertItem.run(
          itemId,
          batchId,
          articleId,
          `platform:${platformId}`,
          1,
          current ? "claimed" : "queued",
          current ? `claim-${itemId}` : null,
          current ? "2026-08-12T00:01:00.000Z" : null,
          JSON.stringify({ attemptId }),
        );
        insertQueueItem.run(itemId, groupId, itemNumber, stamp);
      }
    }

    const insertPublication = db.prepare(
      "INSERT INTO publication_records(publication_id,article_id,target_key,target_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
    );
    const insertAttempt = db.prepare(
      "INSERT INTO publication_attempts(attempt_id,publication_id,status,created_at,finished_at) VALUES(?,?,?,?,?)",
    );
    const insertOrder = db.prepare(
      "INSERT INTO remote_orders(order_id,attempt_id,remote_id,payload_json,created_at) VALUES(?,?,?,?,?)",
    );
    const insertDisplay = db.prepare(
      "INSERT INTO order_display_snapshots(attempt_id,title_snapshot,filename,resource_name_snapshot,quoted_price,created_at,media_resource_id,estimated_total,system_submission_code) VALUES(?,?,?,?,?,?,?,?,?)",
    );
    for (let index = 0; index < scale.paidOrders; index += 1) {
      const number = index + 1;
      const orderId = `ticket-25-f-order-${number}`;
      const attemptId = `ticket-25-f-order-attempt-${number}`;
      const publicationId = `ticket-25-f-order-publication-${number}`;
      const articleId = `ticket-25-f-order-article-${number}`;
      const resourceId = `ticket-25-f-media-${(index % 8) + 1}`;
      const title = `Synthetic order ${number}`;
      const body = `Synthetic order body ${number}`;
      const createdAt = new Date(
        Date.parse(stamp) + index * 1000,
      ).toISOString();
      const target = { kind: "media", mediaResourceId: resourceId };
      const snapshot = domain.parseOrderSnapshotV1({
        version: 1,
        orderIdentityV1: { version: 1, orderId },
        articleIdentityV1: {
          version: 1,
          clientId: "ticket-25-f-client",
          articleId,
        },
        targetIdentityV1: { version: 1, ...target },
        orderCreationAttemptId: `ticket-25-f-order-creation-${number}`,
        mediaName: `Synthetic media ${(index % 8) + 1}`,
        quotedPrice: 12.5,
        estimatedTotal: 12.5,
        actualAmount: null,
        systemSubmissionCode: `ticket-25-f-system-${number}`,
        submittedTitle: title,
        submittedBody: body,
        contentFingerprint: domain.contentFingerprint(title, body),
        remoteCallStartedAt: stamp,
      });
      insertPublication.run(
        publicationId,
        articleId,
        `media-resource:${resourceId}`,
        JSON.stringify(target),
        "remote_started",
        stamp,
        createdAt,
      );
      insertAttempt.run(
        attemptId,
        publicationId,
        "remote_started",
        stamp,
        null,
      );
      insertOrder.run(
        orderId,
        attemptId,
        orderId,
        JSON.stringify(snapshot),
        createdAt,
      );
      insertDisplay.run(
        attemptId,
        title,
        `article-${number}.md`,
        snapshot.mediaName,
        snapshot.quotedPrice,
        createdAt,
        resourceId,
        snapshot.estimatedTotal,
        snapshot.systemSubmissionCode,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch (_) {
      // The fixture database is disposable; preserve the construction error.
    }
    throw error;
  } finally {
    db.close();
  }
  return Object.freeze({ root });
}

function measureOperationalFixture(fixture, operation) {
  const transitionPorts = {};
  const store = createOperationalStore({
    workspaceRoot: fixture.root,
    transitionPorts,
  });
  const originalPrepare = DatabaseSync.prototype.prepare;
  const counters = { queries: 0, scans: 0, externalTransportCalls: 0 };
  DatabaseSync.prototype.prepare = function observedPrepare(sql) {
    if (/^\s*(?:SELECT|WITH)\b/i.test(String(sql))) {
      counters.queries += 1;
      counters.scans += 1;
    }
    return originalPrepare.call(this, sql);
  };
  try {
    return operation({ transitionPorts, counters });
  } finally {
    DatabaseSync.prototype.prepare = originalPrepare;
    store.close();
  }
}

function measureRegularQueue(fixture) {
  return measureOperationalFixture(fixture, ({ transitionPorts, counters }) => {
    const orchestrator = createRegularQueueGroupOrchestrator({
      regularQueueGroupTransitions:
        transitionPorts.regularQueueGroupTransitions,
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
  });
}

async function measurePaidOrders(fixture, projectOrderList) {
  return measureOperationalFixture(fixture, ({ transitionPorts, counters }) => {
    const service = createMediaOrderService({
      orderObservationTransitions: transitionPorts.orderObservationTransitions,
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
  });
}

function operationMeasure(operationId, fixture, projectOrderList) {
  if (operationId === "article_management_snapshot")
    return measureArticleManagement(fixture);
  if (
    operationId === "regular_queue_snapshot" ||
    operationId === "paid_order_snapshot"
  ) {
    const operationalFixture = createOperationalFixture(
      readContract("queryScanBudget").syntheticFixture,
    );
    try {
      return operationId === "regular_queue_snapshot"
        ? measureRegularQueue(operationalFixture)
        : measurePaidOrders(operationalFixture, projectOrderList);
    } finally {
      fs.rmSync(operationalFixture.root, { recursive: true, force: true });
    }
  }
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
      persistence: "isolated_operational_store_sqlite",
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
  createOperationalFixture,
  measurePaidOrders,
  measureRegularQueue,
  runBenchmark,
};
