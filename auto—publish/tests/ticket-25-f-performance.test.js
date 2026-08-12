"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  assertSafeGeneratedEvidence,
  readContract,
  validateAllContracts,
} = require("../scripts/ticket-25-a-contract");
const {
  OPERATION_IDS,
  runBenchmark,
} = require("../scripts/run-ticket-25-f-benchmark");

function temporaryRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ticket-25-f-performance-"));
}

test("25-F validates the single tracked evidence contract and responsibility facts", () => {
  const summary = validateAllContracts();
  assert.equal(summary.budget.operationCount, 3);
  assert.equal(summary.evidence.moduleCount, 9);
  assert.equal(
    summary.evidence.moduleDisposition,
    "FACTS_FOR_INDEPENDENT_AUDIT",
  );
  assert.equal(summary.runner.entryPoints, 3);
  assert.deepEqual(
    readContract("queryScanBudget").operations.map(
      (operation) => operation.operationId,
    ),
    OPERATION_IDS,
  );
  const behaviorSources = new Map([
    [15, "bd3b9b11a8adcf78a00e7ce46b6dd39fd402b492"],
    [16, "bd3b9b11a8adcf78a00e7ce46b6dd39fd402b492"],
    [27, "e925dbf90ff82f6028956092ce4240ab717d3c52"],
    [61, "45244e5d0e967db1e48f2220762d5dc99042a07e"],
    [63, "45244e5d0e967db1e48f2220762d5dc99042a07e"],
  ]);
  for (const row of readContract("storyMatrix").rows) {
    if (!behaviorSources.has(row.storyId)) continue;
    assert.equal(row.observedResult, "PUBLIC_BEHAVIOR_VERIFIED");
    assert.equal(row.observedSourceState, behaviorSources.get(row.storyId));
  }
});

test("25-F measures public batch/read projections at the frozen scale with hard query/scan budgets", async () => {
  const root = temporaryRoot();
  try {
    const output = path.join(root, "ticket-25-f-benchmark.json");
    const report = await runBenchmark(output);
    assert.equal(report.status, "OBSERVED_NOT_A_FINAL_GATE");
    assert.equal(report.package, "25-F");
    assert.deepEqual(
      report.operations.map((operation) => operation.operationId),
      OPERATION_IDS,
    );
    assert.equal(report.fixture.articles, 2000);
    assert.equal(report.fixture.regularQueueGroups, 8);
    assert.equal(report.fixture.regularQueueItems, 400);
    assert.equal(report.fixture.paidOrders, 2000);
    assert.equal(
      report.fixture.persistence,
      "isolated_operational_store_sqlite",
    );
    assert.equal(report.fixture.transport, "in_memory_fake_only");
    assert.equal(report.protocol.warmupRuns, 2);
    assert.equal(report.protocol.measuredRuns, 7);
    assert.equal(report.protocol.discardWarmup, true);
    assert.equal(report.environment.externalOperations, "none");
    assert.equal(report.environment.credentials, "not-collected");
    assert.equal(report.environment.sensitiveValues, "excluded");
    assert.doesNotMatch(report.command, /[A-Za-z]:[\\/]/);

    const expectedCounts = {
      article_management_snapshot: [7, 7],
      regular_queue_snapshot: [2, 2],
      paid_order_snapshot: [1, 1],
    };
    for (const operation of report.operations) {
      const budget = readContract("queryScanBudget").operations.find(
        (candidate) => candidate.operationId === operation.operationId,
      );
      assert.equal(operation.counts.hardGate, "PASSED");
      assert.deepEqual(
        [operation.counts.queries, operation.counts.scans],
        expectedCounts[operation.operationId],
      );
      assert.equal(operation.counts.externalTransportCalls, 0);
      assert.ok(operation.counts.queries <= budget.maxQueries);
      assert.ok(operation.counts.scans <= budget.maxScans);
      assert.equal(operation.wallClock.status, "NOT_APPROVED");
      assert.equal(operation.wallClock.decision, "OBSERVATION_ONLY");
      assert.equal(
        operation.wallClock.regression,
        "NOT_ASSESSED_NO_APPROVED_BASELINE",
      );
      assert.ok(operation.p95Ms >= operation.p50Ms);
      assert.equal(operation.samples.length, 7);
      assert.ok(
        operation.samples.every(
          (sample) => sample.queries === operation.counts.queries,
        ),
      );
      assert.ok(
        operation.samples.every(
          (sample) => sample.scans === operation.counts.scans,
        ),
      );
    }

    const article = report.operations.find(
      (operation) => operation.operationId === "article_management_snapshot",
    );
    const queue = report.operations.find(
      (operation) => operation.operationId === "regular_queue_snapshot",
    );
    const orders = report.operations.find(
      (operation) => operation.operationId === "paid_order_snapshot",
    );
    assert.equal(article.loaded.articles, 2000);
    assert.equal(article.loaded.orders, 2000);
    assert.equal(queue.loaded.groups, 8);
    assert.equal(queue.loaded.queueItems, 400);
    assert.equal(orders.loaded.orders, 2000);
    assert.equal(orders.loaded.projectedOrders, 2000);
    assert.equal(orders.loaded.projectedCounts.all, 2000);
    assert.equal(
      Object.entries(orders.loaded.projectedCounts)
        .filter(([status]) => status !== "all")
        .reduce((total, [, count]) => total + count, 0),
      2000,
    );
    assertSafeGeneratedEvidence(report);
    assert.equal(fs.existsSync(output), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
