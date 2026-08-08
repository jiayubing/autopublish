"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const domain = require("../src/domain");
const {
  createOrderCancellationService,
} = require("../desktop/services/order-cancellation-service");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");

function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ticket-16-"));
  let store = createOperationalStore({ workspaceRoot: root });
  store.reservePublicationTarget({
    articleId: "article-16",
    publicationId: "publication-16",
    attemptId: "attempt-16",
    target: { kind: "media", mediaResourceId: "resource-16" },
  });
  store.commitRemoteOutcome({
    attemptId: "attempt-16",
    outcome: {
      status: "submitted",
      evidence: {
        articleId: "article-16",
        attemptId: "attempt-16",
        targetKey: "media-resource:resource-16",
        remoteId: "order-16",
      },
    },
  });
  const databasePath = store.verify().databasePath;
  store.close();
  const orderSnapshotV1 = domain.parseOrderSnapshotV1({
    version: 1,
    orderIdentityV1: { version: 1, orderId: "order-16" },
    articleIdentityV1: {
      version: 1,
      clientId: "client-16",
      articleId: "article-16",
    },
    targetIdentityV1: {
      version: 1,
      kind: "media",
      mediaResourceId: "resource-16",
    },
    orderCreationAttemptId: "paid-attempt-16",
    mediaName: "媒体十六",
    quotedPrice: 16,
    estimatedTotal: 16,
    actualAmount: null,
    systemSubmissionCode: "system-16",
    submittedTitle: "订单十六标题",
    submittedBody: "订单十六正文",
    contentFingerprint: domain.contentFingerprint(
      "订单十六标题",
      "订单十六正文",
    ),
    remoteCallStartedAt: "2026-08-08T00:00:00.000Z",
  });
  const db = new DatabaseSync(databasePath);
  db.prepare("UPDATE remote_orders SET payload_json=? WHERE order_id=?").run(
    JSON.stringify(orderSnapshotV1),
    "order-16",
  );
  db.prepare("INSERT INTO submission_batches VALUES(?,?,?,?,?)").run(
    "batch-16",
    "completed",
    1,
    "2026-08-08T00:00:00.000Z",
    "2026-08-08T00:00:01.000Z",
  );
  db.prepare("INSERT INTO submission_items VALUES(?,?,?,?,?,?,?,?,?)").run(
    "item-16",
    "batch-16",
    "article-16",
    "media-resource:resource-16",
    1,
    "completed",
    null,
    null,
    JSON.stringify({
      attemptId: "attempt-16",
      customerSnapshotV1: {
        version: 1,
        clientId: "client-16",
        displayName: "客户十六",
      },
    }),
  );
  db.close();
  const transitionPorts = {};
  store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts,
    clock: () => new Date("2026-08-08T01:00:00.000Z"),
    randomUUID: (() => {
      let index = 0;
      return () => `ticket-16-id-${++index}`;
    })(),
    internalPaidExecutionTransitionFault:
      options.internalPaidExecutionTransitionFault,
  });
  const result = {
    root,
    store,
    observations: transitionPorts.orderObservationTransitions,
    cancellations: transitionPorts.orderCancellationTransitions,
    orderSnapshotV1,
    restart() {
      store.close();
      const nextPorts = {};
      store = createOperationalStore({
        workspaceRoot: root,
        transitionPorts: nextPorts,
        clock: () => new Date("2026-08-08T01:00:00.000Z"),
      });
      result.store = store;
      result.observations = nextPorts.orderObservationTransitions;
      result.cancellations = nextPorts.orderCancellationTransitions;
    },
    close() {
      store.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
  return result;
}

function recordStatus(value, statusCode, fingerprintCharacter) {
  const context = value.observations.getOrderObservationContext("order-16");
  value.observations.recordOrderObservation({
    orderObservationV1: domain.parseOrderObservationV1({
      version: 1,
      orderIdentityV1: { version: 1, orderId: "order-16" },
      statusCode,
      observedAt: "2026-08-08T00:30:00.000Z",
      eventAt: null,
      eventAtSource: "not_available",
      remoteUrl: statusCode === "2" ? "https://publisher.example/order-16" : null,
      actualAmount: null,
      evidenceFingerprint: fingerprintCharacter.repeat(64),
      orderSnapshotFingerprint: context.orderSnapshotFingerprint,
    }),
  });
}

test("cancellation preflight allows pending and warns for arranged while 2/4/9 stay closed", (t) => {
  const pending = fixture();
  t.after(() => pending.close());
  recordStatus(pending, "0", "a");
  const pendingPlan = pending.cancellations.prepareOrderCancellation({
    orderId: "order-16",
  });
  assert.deepEqual(
    [pendingPlan.actionLabel, pendingPlan.riskCode],
    ["取消订单", null],
  );

  const arranged = fixture();
  t.after(() => arranged.close());
  recordStatus(arranged, "1", "b");
  const arrangedPlan = arranged.cancellations.prepareOrderCancellation({
    orderId: "order-16",
  });
  assert.deepEqual(
    [arrangedPlan.actionLabel, arrangedPlan.riskCode],
    ["尝试取消", "CANCELLATION_MAY_BE_REJECTED"],
  );

  for (const [statusCode, fingerprintCharacter] of [
    ["2", "c"],
    ["4", "d"],
    ["9", "e"],
  ]) {
    const closed = fixture();
    t.after(() => closed.close());
    recordStatus(closed, statusCode, fingerprintCharacter);
    assert.throws(
      () =>
        closed.cancellations.prepareOrderCancellation({
          orderId: "order-16",
        }),
      { code: "ORDER_CANCELLATION_NOT_ALLOWED" },
      statusCode,
    );
  }
});

test("explicit remote cancellation appends immutable history, closes intent, and releases the article", async (t) => {
  const value = fixture();
  t.after(() => value.close());
  recordStatus(value, "0", "f");
  const calls = [];
  const service = createOrderCancellationService({
    orderCancellationTransitions: value.cancellations,
    supplierProvider: () => ({
      cancelOrder: async (orderId) => {
        calls.push(orderId);
        return { kind: "order_cancelled", orderId };
      },
    }),
  });
  const prepared = service.prepareOrderCancellation({ orderId: "order-16" });

  const result = await service.cancelOrder({
    orderId: "order-16",
    confirmationToken: prepared.confirmationToken,
  });

  assert.deepEqual(calls, ["order-16"]);
  assert.equal(result.status, "cancelled");
  const context = value.cancellations.getOrderCancellationContext({
    cancellationAttemptId: prepared.cancellationAttemptId,
  });
  assert.deepEqual([context.state, context.outcome], ["resolved", "cancelled"]);
  const latest = context.orderHistoryV1.entries.at(-1);
  assert.equal(latest.kind, "terminal");
  assert.equal(latest.terminalObservationV1.terminalKind, "CANCELLED");
  const facts = value.observations.readOrderTransitionFacts("order-16");
  assert.equal(facts.published, false);
  assert.equal(facts.publicationStatus, "failed");
  assert.equal(
    value.observations.listOrderObservationViews()[0].statusCode,
    "cancelled",
  );
  const duplicate = await service.cancelOrder({
    orderId: "order-16",
    confirmationToken: prepared.confirmationToken,
  });
  assert.deepEqual(calls, ["order-16"]);
  assert.deepEqual([duplicate.status, duplicate.idempotent], ["cancelled", true]);
});

test("rejection preserves the active order while uncertain cancellation stays durable and blocks retry", async (t) => {
  const rejected = fixture();
  t.after(() => rejected.close());
  recordStatus(rejected, "1", "1");
  const rejectedService = createOrderCancellationService({
    orderCancellationTransitions: rejected.cancellations,
    supplierProvider: () => ({
      cancelOrder: async (orderId) => ({ kind: "cancel_rejected", orderId }),
    }),
  });
  const plan = rejectedService.prepareOrderCancellation({ orderId: "order-16" });
  const result = await rejectedService.cancelOrder({
    orderId: "order-16",
    confirmationToken: plan.confirmationToken,
  });
  assert.equal(result.status, "rejected");
  assert.equal(
    rejected.cancellations.getOrderCancellationContext({
      cancellationAttemptId: plan.cancellationAttemptId,
    }).state,
    "resolved",
  );
  assert.equal(
    rejected.observations.readOrderTransitionFacts("order-16").publicationStatus,
    "submitted",
  );

  const uncertain = fixture();
  t.after(() => uncertain.close());
  recordStatus(uncertain, "0", "2");
  const uncertainService = createOrderCancellationService({
    orderCancellationTransitions: uncertain.cancellations,
    supplierProvider: () => ({
      cancelOrder: async () => ({ kind: "uncertain", reason: "transport" }),
    }),
  });
  const uncertainPlan = uncertainService.prepareOrderCancellation({
    orderId: "order-16",
  });
  assert.equal(
    (
      await uncertainService.cancelOrder({
        orderId: "order-16",
        confirmationToken: uncertainPlan.confirmationToken,
      })
    ).status,
    "uncertain",
  );
  assert.equal(
    uncertain.cancellations.getOrderCancellationContext({
      cancellationAttemptId: uncertainPlan.cancellationAttemptId,
    }).state,
    "open",
  );
  assert.throws(
    () => uncertain.cancellations.prepareOrderCancellation({ orderId: "order-16" }),
    { code: "ORDER_CANCELLATION_INTENT_OPEN" },
  );
});

test("stale preflight fails closed and publication success wins over a late cancellation outcome", async (t) => {
  const stale = fixture();
  t.after(() => stale.close());
  recordStatus(stale, "0", "3");
  const stalePlan = stale.cancellations.prepareOrderCancellation({ orderId: "order-16" });
  recordStatus(stale, "1", "4");
  assert.throws(
    () =>
      stale.cancellations.beginOrderCancellation({
        orderId: "order-16",
        confirmationToken: stalePlan.confirmationToken,
      }),
    { code: "ORDER_CANCELLATION_OBSERVATION_STALE" },
  );

  const published = fixture();
  t.after(() => published.close());
  recordStatus(published, "0", "5");
  const service = createOrderCancellationService({
    orderCancellationTransitions: published.cancellations,
    supplierProvider: () => ({
      cancelOrder: async () => {
        recordStatus(published, "2", "6");
        return { kind: "order_cancelled", orderId: "order-16" };
      },
    }),
  });
  const prepared = service.prepareOrderCancellation({ orderId: "order-16" });
  const result = await service.cancelOrder({
    orderId: "order-16",
    confirmationToken: prepared.confirmationToken,
  });
  assert.equal(result.publishedWins, true);
  const facts = published.observations.readOrderTransitionFacts("order-16");
  assert.deepEqual([facts.published, facts.publicationStatus], [true, "published"]);
  const context = published.cancellations.getOrderCancellationContext({
    cancellationAttemptId: prepared.cancellationAttemptId,
  });
  assert.equal(context.orderHistoryV1.entries.at(-1).terminalObservationV1.terminalKind, "CANCELLED");
});

test("uncertain cancellation exposes only evidence-bound succeeded/not-applied resolutions", async (t) => {
  const value = fixture();
  t.after(() => value.close());
  recordStatus(value, "0", "7");
  let remoteStatus = "cancelled";
  const service = createOrderCancellationService({
    orderCancellationTransitions: value.cancellations,
    supplierProvider: () => ({
      cancelOrder: async () => ({ kind: "uncertain", reason: "protocol" }),
      getOrderDetails: async () => ({
        kind: "order_details",
        orders:
          remoteStatus === "missing"
            ? []
            : [{ orderId: "order-16", status: remoteStatus }],
      }),
    }),
  });
  const prepared = service.prepareOrderCancellation({ orderId: "order-16" });
  await service.cancelOrder({
    orderId: "order-16",
    confirmationToken: prepared.confirmationToken,
  });
  const verification = await service.prepareCancellationResolution({
    cancellationAttemptId: prepared.cancellationAttemptId,
  });
  assert.equal(verification.classification, "verified_cancelled");
  const resolved = service.confirmCancellationSucceeded({
    cancellationAttemptId: prepared.cancellationAttemptId,
    confirmationToken: verification.confirmationToken,
    evidenceFingerprint: verification.evidenceFingerprint,
  });
  assert.equal(resolved.status, "cancelled");
  assert.throws(
    () =>
      service.confirmCancellationNotApplied({
        cancellationAttemptId: prepared.cancellationAttemptId,
        confirmationToken: verification.confirmationToken,
        evidenceFingerprint: verification.evidenceFingerprint,
      }),
    { code: "ORDER_CANCELLATION_RESOLUTION_CONFLICT" },
  );
});

test("restart preserves an open intent and outcome transaction failure never unlocks or retries", async (t) => {
  let failOutcome = true;
  const value = fixture({
    internalPaidExecutionTransitionFault(point) {
      if (point === "after-order-cancellation-outcome" && failOutcome)
        throw new Error("fault-after-remote-response");
    },
  });
  t.after(() => value.close());
  recordStatus(value, "0", "8");
  let calls = 0;
  const service = createOrderCancellationService({
    orderCancellationTransitions: value.cancellations,
    supplierProvider: () => ({
      cancelOrder: async () => {
        calls += 1;
        return { kind: "order_cancelled", orderId: "order-16" };
      },
    }),
  });
  const prepared = service.prepareOrderCancellation({ orderId: "order-16" });
  await assert.rejects(
    service.cancelOrder({
      orderId: "order-16",
      confirmationToken: prepared.confirmationToken,
    }),
    /fault-after-remote-response/,
  );
  assert.equal(calls, 1);
  assert.equal(
    value.cancellations.getOrderCancellationContext({
      cancellationAttemptId: prepared.cancellationAttemptId,
    }).state,
    "open",
  );
  value.restart();
  assert.equal(
    value.cancellations.getOrderCancellationContext({
      cancellationAttemptId: prepared.cancellationAttemptId,
    }).state,
    "open",
  );
  assert.throws(
    () => value.cancellations.prepareOrderCancellation({ orderId: "order-16" }),
    { code: "ORDER_CANCELLATION_INTENT_OPEN" },
  );
  failOutcome = false;
});

test("verified active evidence closes uncertainty without ending the immutable order", async (t) => {
  const value = fixture();
  t.after(() => value.close());
  recordStatus(value, "1", "9");
  const service = createOrderCancellationService({
    orderCancellationTransitions: value.cancellations,
    supplierProvider: () => ({
      cancelOrder: async () => ({ kind: "uncertain", reason: "transport" }),
      getOrderDetails: async () => ({
        kind: "order_details",
        orders: [{ orderId: "order-16", status: "scheduled" }],
      }),
    }),
  });
  const prepared = service.prepareOrderCancellation({ orderId: "order-16" });
  await service.cancelOrder({ orderId: "order-16", confirmationToken: prepared.confirmationToken });
  const verification = await service.prepareCancellationResolution({ cancellationAttemptId: prepared.cancellationAttemptId });
  assert.equal(verification.classification, "verified_active");
  const result = service.confirmCancellationNotApplied({
    cancellationAttemptId: prepared.cancellationAttemptId,
    confirmationToken: verification.confirmationToken,
    evidenceFingerprint: verification.evidenceFingerprint,
  });
  assert.equal(result.status, "rejected");
  assert.equal(value.observations.readOrderTransitionFacts("order-16").publicationStatus, "submitted");
  assert.equal(value.cancellations.getOrderCancellationView({ orderId: "order-16" }).actionLabel, "尝试取消");
});

test("composition capability stays narrow and exposes no observation, migration, or deletion writer", () => {
  const value = fixture();
  try {
    assert.deepEqual(Object.keys(value.cancellations).sort(), [
      "beginOrderCancellation",
      "confirmCancellationNotApplied",
      "confirmCancellationSucceeded",
      "getOrderCancellationContext",
      "getOrderCancellationView",
      "prepareCancellationResolution",
      "prepareOrderCancellation",
      "recordOrderCancellationOutcome",
    ]);
  } finally {
    value.close();
  }
});
