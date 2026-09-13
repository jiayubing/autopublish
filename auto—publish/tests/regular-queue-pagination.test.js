"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const { seedQueue } = require("./helpers/scale-queue-fixture");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  createRegularQueueGroupQuery,
} = require("../desktop/services/regular-queue-group-query");
const {
  createSubmissionCenterSnapshot,
} = require("../desktop/services/submission-center-snapshot");
const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");

for (const groups of [1, 20003]) {
  test(`regular task pages reach all 20003 items across ${groups} groups`, async () => {
    const root = seedQueue({ count: 20003, groups });
    const ports = {};
    const store = createOperationalStore({
      workspaceRoot: root,
      transitionPorts: ports,
    });
    const query = createRegularQueueGroupQuery({
      groupTransitions: ports.regularQueueGroupTransitions,
    });
    const center = createSubmissionCenterSnapshot({
      getRevision: () => 1,
      getWorkspaceRuntimeId: () => "test",
      validateClient: () => {},
      listRegularQueueGroups: query.listRegularQueueGroups,
      listPaidMediaBatches: () => [],
      listAttention: () => ({ items: [] }),
    });
    const original = DatabaseSync.prototype.prepare;
    let calls = 0,
      bytes = 0;
    DatabaseSync.prototype.prepare = function (sql) {
      const statement = original.call(this, sql);
      for (const method of ["all", "get"]) {
        const execute = statement[method];
        statement[method] = function (...args) {
          const result = execute.apply(this, args);
          calls++;
          const json = JSON.stringify(result);
          assert.equal(json.includes("x".repeat(4096)), false);
          bytes += Buffer.byteLength(json || "");
          return result;
        };
      }
      return statement;
    };
    try {
      const first = await center.get({ page: 1, pageSize: 10 });
      assert.equal(first.counts.regularItems, 20003);
      assert.equal(first.hasMore, true);
      assert.equal(
        first.regular.groups.reduce((n, g) => n + g.remaining.length, 0),
        10,
      );
      assert.ok(calls <= 4, `SQL calls ${calls}`);
      assert.ok(bytes < 50000, `SQL bytes ${bytes}`);
      const last = await center.get({ page: 2001, pageSize: 10 });
      assert.deepEqual(
        last.regular.groups.flatMap((g) => g.remaining.map((i) => i.itemId)),
        groups === 1
          ? ["item-20000", "item-20001", "item-20002"]
          : ["item-9997", "item-9998", "item-9999"],
      );
      assert.equal(last.hasMore, false);
      assert.equal(last.counts.regularItems, 20003);
      assert.ok(last.regular.groups.every((g) => g.actions.canStart));
      const empty = await center.get({ page: 2002, pageSize: 10 });
      assert.equal(empty.regular.groups.length, 0);
      assert.equal(empty.counts.regularItems, 20003);
      assert.equal(empty.hasMore, false);
      const client = await center.get({
        clientId: "client-0",
        page: 201,
        pageSize: 10,
      });
      assert.equal(client.counts.regularItems, 2001);
      assert.deepEqual(
        client.regular.groups.flatMap((g) => g.remaining.map((i) => i.itemId)),
        groups === 1 ? ["item-20000"] : ["item-9990"],
      );
      assert.equal(client.hasMore, false);
      // Real typed IPC must accept the final page without raising its array caps.
      const wire = productionIpcRegistry.success(
        productionIpcRegistry.byChannel(
          "content:get-submission-center-snapshot",
        ),
        last,
      );
      assert.equal(wire.ok, true);
    } finally {
      DatabaseSync.prototype.prepare = original;
      store.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

test("global and startup reads cover all identities without loading queued bodies", () => {
  for (const kind of ["regular", "paid"]) {
    const root = seedQueue({
      count: 20003,
      groups: kind === "regular" ? 20003 : 1,
      kind,
      prepare(db) {
        db.exec(
          "UPDATE " +
            (kind === "regular"
              ? "submission_queue_groups"
              : "paid_submission_batches") +
            " SET pause_intent='system'",
        );
      },
    });
    const ports = {};
    const store = createOperationalStore({
      workspaceRoot: root,
      transitionPorts: ports,
    });
    const original = DatabaseSync.prototype.prepare;
    let reads = 0;
    DatabaseSync.prototype.prepare = function (sql) {
      const statement = original.call(this, sql);
      for (const method of ["get", "all"]) {
        const execute = statement[method];
        statement[method] = function (...args) {
          const result = execute.apply(this, args);
          reads++;
          assert.equal(
            JSON.stringify(result).includes("x".repeat(4096)),
            false,
          );
          return result;
        };
      }
      return statement;
    };
    try {
      const runtime =
        kind === "regular"
          ? ports.regularQueueGroupTransitions
          : ports.paidExecutionTransitions;
      const started =
        kind === "regular"
          ? runtime.startAllRegularQueueGroups({ runtimeOnly: true })
          : runtime.startAllPaidSubmissionBatches();
      const rows = kind === "regular" ? started.groups : started.batches;
      assert.equal(rows.length, 20003);
      assert.equal(
        new Set(rows.map((row) => row.queueGroupId || row.batchId)).size,
        20003,
      );
      assert.ok(rows.every((row) => row.pauseIntent === "none"));
      assert.ok(reads <= 2);
      reads = 0;
      const startup =
        kind === "regular"
          ? runtime.pauseRegularQueueGroupsOnStartup()
          : runtime.pausePaidSubmissionBatchesOnStartup();
      assert.equal(startup.changedCount, 20003);
      assert.deepEqual(
        kind === "regular" ? startup.groups : startup.batches,
        [],
      );
      assert.ok(reads <= 1);
    } finally {
      DatabaseSync.prototype.prepare = original;
      store.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("global runners reach a runnable target after 20000 manually paused targets", async () => {
  const {
    createRegularQueueGroupOrchestrator,
  } = require("../desktop/services/regular-queue-group-orchestrator");
  const {
    createPaidMediaBatchOrchestrator,
  } = require("../desktop/services/paid-media-batch-orchestrator");
  for (const kind of ["regular", "paid"]) {
    const target = kind === "regular" ? "group-009999" : "batch-9999";
    const root = seedQueue({
      count: 20003,
      groups: kind === "regular" ? 20003 : 1,
      kind,
      prepare(db) {
        const table =
          kind === "regular"
            ? "submission_queue_groups"
            : "paid_submission_batches";
        const id = kind === "regular" ? "queue_group_id" : "batch_id";
        db.exec(`UPDATE ${table} SET pause_intent='manual'`);
        db.prepare(
          `UPDATE ${table} SET pause_intent='system' WHERE ${id}=?`,
        ).run(target);
      },
    });
    const ports = {};
    const store = createOperationalStore({
      workspaceRoot: root,
      transitionPorts: ports,
    });
    const claims = [];
    const orchestrator =
      kind === "regular"
        ? createRegularQueueGroupOrchestrator({
            regularQueueGroupTransitions: {
              ...ports.regularQueueGroupTransitions,
              claimRegularQueueGroupHead(input) {
                claims.push(input.queueGroupId);
                return null;
              },
            },
            platformSubmissionExecutor: {
              preparePlatformSubmission() {
                throw new Error("No real publishing");
              },
            },
          })
        : createPaidMediaBatchOrchestrator({
            paidExecutionTransitions: {
              ...ports.paidExecutionTransitions,
              claimPaidSubmissionBatchItem(input) {
                claims.push(input.batchId);
                return null;
              },
            },
            orderCreationPort: {
              createOrder() {
                throw new Error("No real orders");
              },
            },
          });
    try {
      const result = await orchestrator.startAll();
      assert.equal(result.results.length, 1);
      assert.deepEqual(claims, [target]);
    } finally {
      await orchestrator.dispose();
      store.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
