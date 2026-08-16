"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const domain = require("../src/domain");
const {
  createMediaOrderService,
} = require("../desktop/services/media-order-service");
const {
  createMediaWorkbenchApplication,
} = require("../desktop/services/media-workbench-application");
const { scopesForReason } = require("../desktop/workspace-data-invalidation");
const {
  deriveArticleLifecycle,
} = require("../src/content/article-lifecycle-projection");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");

function fixture(options) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ticket-15-"));
  let store = createOperationalStore({ workspaceRoot: root });
  store.reservePublicationTarget({
    articleId: "article-15",
    publicationId: "publication-15",
    attemptId: "attempt-15",
    target: { kind: "media", mediaResourceId: "resource-15" },
  });
  const databasePath = store.verify().databasePath;
  store.close();
  const snapshot = domain.parseOrderSnapshotV1({
    version: 1,
    orderIdentityV1: { version: 1, orderId: "order-15" },
    articleIdentityV1: {
      version: 1,
      clientId: "client-15",
      articleId: "article-15",
    },
    targetIdentityV1: {
      version: 1,
      kind: "media",
      mediaResourceId: "resource-15",
    },
    orderCreationAttemptId: "paid-attempt-15",
    mediaName: "媒体十五",
    quotedPrice: 15,
    estimatedTotal: 15,
    actualAmount: null,
    systemSubmissionCode: "system-15",
    submittedTitle: "订单十五标题",
    submittedBody: "订单十五正文",
    contentFingerprint: domain.contentFingerprint(
      "订单十五标题",
      "订单十五正文",
    ),
    remoteCallStartedAt: "2026-08-08T00:00:00.000Z",
  });
  const db = new DatabaseSync(databasePath);
  db.prepare(
    "UPDATE publication_records SET status='remote_started',updated_at=? WHERE publication_id=?",
  ).run("2026-08-08T00:00:00.000Z", "publication-15");
  db.prepare(
    "UPDATE publication_attempts SET status='remote_started' WHERE attempt_id=?",
  ).run("attempt-15");
  db.prepare(
    "UPDATE article_active_targets SET state='remote_started',updated_at=? WHERE attempt_id=?",
  ).run("2026-08-08T00:00:00.000Z", "attempt-15");
  db.prepare(
    "UPDATE recovery_intents SET state='resolved',payload_json=?,updated_at=? WHERE attempt_id=?",
  ).run(
    JSON.stringify({
      paidSubmission: { batchItemId: "item-15" },
      detail: {
        phase: "order_created",
        orderCreationAttemptId: "paid-attempt-15",
      },
      orderCreationAttemptId: "paid-attempt-15",
    }),
    "2026-08-08T00:00:00.000Z",
    "attempt-15",
  );
  db.prepare("INSERT INTO remote_orders VALUES(?,?,?,?,?)").run(
    "order-15",
    "attempt-15",
    "order-15",
    JSON.stringify(snapshot),
    "2026-08-08T00:00:01.000Z",
  );
  db.prepare("INSERT INTO remote_evidence VALUES(?,?,?,?,?,?)").run(
    "order-evidence-15",
    "attempt-15",
    "order-15",
    null,
    JSON.stringify(snapshot),
    "2026-08-08T00:00:01.000Z",
  );
  db.prepare(
    "INSERT INTO order_display_snapshots(attempt_id,title_snapshot,filename,resource_name_snapshot,quoted_price,created_at,media_resource_id,estimated_total,system_submission_code) VALUES(?,?,?,?,?,?,?,?,?)",
  ).run(
    "attempt-15",
    snapshot.submittedTitle,
    "article-15.md",
    snapshot.mediaName,
    15,
    "2026-08-08T00:00:01.000Z",
    "resource-15",
    15,
    "system-15",
  );
  if (!options || options.customerSnapshot !== false) {
    db.prepare("INSERT INTO submission_batches VALUES(?,?,?,?,?)").run(
      "batch-15",
      "completed",
      1,
      "2026-08-08T00:00:00.000Z",
      "2026-08-08T00:00:01.000Z",
    );
    db.prepare("INSERT INTO submission_items VALUES(?,?,?,?,?,?,?,?,?)").run(
      "item-15",
      "batch-15",
      "article-15",
      "media-resource:resource-15",
      1,
      "completed",
      null,
      null,
      JSON.stringify({
        attemptId: "attempt-15",
        customerSnapshotV1: {
          version: 1,
          clientId: "client-15",
          displayName: "客户十五",
        },
      }),
    );
  }
  db.close();
  const transitionPorts = {};
  store = createOperationalStore({
    workspaceRoot: root,
    transitionPorts,
    clock: options && options.clock,
    internalPaidExecutionTransitionFault:
      options && options.internalPaidExecutionTransitionFault,
  });
  return {
    root,
    store,
    transitions: transitionPorts.orderObservationTransitions,
    snapshot,
    close() {
      store.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function observation(value, overrides) {
  const context = value.transitions.getOrderObservationContext("order-15");
  const base = {
    version: 1,
    orderIdentityV1: { version: 1, orderId: "order-15" },
    statusCode: "0",
    observedAt: "2026-08-08T01:00:00.000Z",
    eventAt: null,
    eventAtSource: "not_available",
    remoteUrl: null,
    actualAmount: null,
    evidenceFingerprint: "b".repeat(64),
    orderSnapshotFingerprint: context.orderSnapshotFingerprint,
    ...(overrides || {}),
  };
  return domain.parseOrderObservationV1(base);
}

test("status 0/1 observations append exact history without rewriting the immutable order snapshot", (t) => {
  const value = fixture();
  t.after(() => value.close());
  const before = value.store.listRemoteOrders()[0];
  value.transitions.recordOrderObservation({
    orderObservationV1: observation(value),
  });
  value.transitions.recordOrderObservation({
    orderObservationV1: observation(value, {
      statusCode: "1",
      observedAt: "2026-08-08T02:00:00.000Z",
      actualAmount: 14.5,
      evidenceFingerprint: "c".repeat(64),
    }),
  });
  const view = value.transitions.listOrderObservationViews()[0];
  assert.deepEqual([view.statusCode, view.actualAmount], ["1", 14.5]);
  assert.equal(value.store.listRemoteOrders()[0].createdAt, before.createdAt);
  const db = new DatabaseSync(value.store.databasePath);
  const persistedSnapshot = domain.parseOrderSnapshotV1(
    JSON.parse(
      db
        .prepare("SELECT payload_json FROM remote_orders WHERE order_id=?")
        .get("order-15").payload_json,
    ),
  );
  db.close();
  assert.equal(persistedSnapshot.actualAmount, null);
});

test("order observations reject non-terminal status regressions and every public order reader keeps the authoritative history", (t) => {
  const value = fixture();
  t.after(() => value.close());
  value.transitions.recordOrderObservation({
    orderObservationV1: observation(value, {
      statusCode: "1",
      evidenceFingerprint: "8".repeat(64),
    }),
  });
  assert.throws(
    () =>
      value.transitions.recordOrderObservation({
        orderObservationV1: observation(value, {
          statusCode: "0",
          observedAt: "2026-08-08T02:00:00.000Z",
          evidenceFingerprint: "7".repeat(64),
        }),
      }),
    { code: "ORDER_OBSERVATION_STATUS_REGRESSION" },
  );
  assert.equal(
    value.transitions.listOrderObservationViews()[0].statusCode,
    "1",
  );
  assert.equal(value.store.listRemoteOrders()[0].supplierStatusCode, "1");
  assert.equal(value.store.listOrderDisplayViews()[0].supplierStatusCode, "1");
});

test("status 2 delegates to the unique success primitive and preserves distinct submitted/published times", (t) => {
  const value = fixture();
  t.after(() => value.close());
  const result = value.transitions.recordOrderObservation({
    orderObservationV1: observation(value, {
      statusCode: "2",
      observedAt: "2026-08-08T03:00:00.000Z",
      eventAt: "2026-08-08T02:30:00.000Z",
      eventAtSource: "provider_event_time",
      remoteUrl: "https://publisher.example/article-15",
      evidenceFingerprint: "d".repeat(64),
    }),
  });
  assert.equal(result.publication.status, "published");
  const facts = value.store.listArticleLifecycleFacts({
    articleIds: ["article-15"],
  });
  assert.equal(
    facts.publications.some((fact) => fact.status === "published"),
    true,
  );
  const db = new DatabaseSync(value.store.databasePath);
  const evidence = JSON.parse(
    db
      .prepare("SELECT evidence_json FROM remote_evidence WHERE remote_id=?")
      .get("publication-success:attempt-15").evidence_json,
  );
  db.close();
  assert.deepEqual(
    [
      evidence.submittedAt,
      evidence.firstPublishedAt,
      evidence.firstPublishedAtSource,
    ],
    [
      "2026-08-08T00:00:00.000Z",
      "2026-08-08T02:30:00.000Z",
      "provider_event_time",
    ],
  );
  assert.deepEqual(evidence.customerSnapshotV1, {
    version: 1,
    clientId: "client-15",
    displayName: "客户十五",
  });
});

test("status 4 restores unpublished work while status 9 never revokes publication success", (t) => {
  const rejected = fixture();
  t.after(() => rejected.close());
  rejected.transitions.recordOrderObservation({
    orderObservationV1: observation(rejected, {
      statusCode: "4",
      evidenceFingerprint: "e".repeat(64),
    }),
  });
  assert.equal(
    rejected.store.listArticleLifecycleFacts({ articleIds: ["article-15"] })
      .publications[0].status,
    "failed",
  );
  const rejectedFacts = rejected.store.listArticleLifecycleFacts({
    articleIds: ["article-15"],
  });
  assert.equal(rejectedFacts.orders[0].supplierStatusCode, "4");
  const rejectedLifecycle = deriveArticleLifecycle({
    article: {
      id: "article-15",
      clientId: "client-15",
      title: "订单十五标题",
      content: "订单十五正文",
    },
    ...rejectedFacts,
  });
  assert.deepEqual(
    [rejectedLifecycle.stage, rejectedLifecycle.operations.edit.allowed],
    ["pending_submission", true],
  );
  assert.equal(
    rejected.store.reservePublicationTarget({
      articleId: "article-15",
      publicationId: "publication-15-retarget",
      attemptId: "attempt-15-retarget",
      target: { kind: "media", mediaResourceId: "resource-15-retarget" },
    }).status,
    "queued",
  );

  const published = fixture();
  t.after(() => published.close());
  published.transitions.recordOrderObservation({
    orderObservationV1: observation(published, {
      statusCode: "2",
      remoteUrl: "https://publisher.example/article-15",
      evidenceFingerprint: "f".repeat(64),
    }),
  });
  published.transitions.recordOrderObservation({
    orderObservationV1: observation(published, {
      statusCode: "9",
      observedAt: "2026-08-08T04:00:00.000Z",
      evidenceFingerprint: "1".repeat(64),
    }),
  });
  assert.equal(
    published.store
      .listArticleLifecycleFacts({ articleIds: ["article-15"] })
      .publications.some((fact) => fact.status === "published"),
    true,
  );
  const aftercareFacts = published.store.listArticleLifecycleFacts({
    articleIds: ["article-15"],
  });
  assert.deepEqual(
    [
      aftercareFacts.orders[0].supplierStatusCode,
      aftercareFacts.publications[0].remoteId,
      aftercareFacts.publications[0].remoteUrl,
    ],
    ["9", "order-15", "https://publisher.example/article-15"],
  );
});

function serviceFor(value, supplierState, clock) {
  return createMediaOrderService({
    orderObservationTransitions: value.transitions,
    supplierProvider: () => ({
      getOrderDetails: async () => ({
        kind: "order_details",
        orders: supplierState.orders,
      }),
    }),
    clock: clock || (() => new Date("2026-08-08T05:00:00.000Z")),
  });
}

test("missing orders freeze with anomaly and verified trackable evidence resumes tracking", async (t) => {
  const value = fixture();
  t.after(() => value.close());
  const supplierState = { orders: [] };
  const service = serviceFor(value, supplierState);
  await assert.rejects(
    async () => {
      try {
        await service.syncOrder("order-15");
      } catch (error) {
        assert.deepEqual(error.mutation, {
          changed: true,
          kind: "order_status_anomaly_recorded",
          orderId: "order-15",
        });
        throw error;
      }
    },
    { code: "MEDIA_ORDER_STATUS_ANOMALY" },
  );
  assert.equal(
    value.transitions.readOrderTransitionFacts("order-15").openAnomaly,
    true,
  );
  supplierState.orders = [{ orderId: "order-15", status: "pending" }];
  const prepared = await service.prepareOrderStatusAnomalyResolution({
    orderId: "order-15",
  });
  assert.deepEqual(
    [prepared.classification, prepared.allowedActions],
    ["verified_trackable", ["resumeOrderTracking"]],
  );
  const resolved = service.resumeOrderTracking({
    orderId: "order-15",
    confirmationToken: prepared.confirmationToken,
  });
  assert.equal(resolved.status, "tracking_resumed");
  assert.equal(
    value.transitions.readOrderTransitionFacts("order-15").openAnomaly,
    false,
  );
});

test("anomaly publication confirmation uses manual positive evidence time and is idempotent", async (t) => {
  let currentTime = "2026-08-08T05:00:00.000Z";
  const clock = () => new Date(currentTime);
  const value = fixture({ clock });
  t.after(() => value.close());
  const supplierState = { orders: [] };
  const service = serviceFor(value, supplierState, clock);
  await assert.rejects(() => service.syncOrder("order-15"));
  supplierState.orders = [
    {
      orderId: "order-15",
      status: "published",
      remoteUrl: "https://publisher.example/article-15",
    },
  ];
  const prepared = await service.prepareOrderStatusAnomalyResolution({
    orderId: "order-15",
  });
  currentTime = "2026-08-08T05:01:00.000Z";
  const first = service.confirmOrderPublished({
    orderId: "order-15",
    confirmationToken: prepared.confirmationToken,
  });
  const second = service.confirmOrderPublished({
    orderId: "order-15",
    confirmationToken: prepared.confirmationToken,
  });
  assert.deepEqual([first.status, second.idempotent], ["published", true]);
  const db = new DatabaseSync(value.store.databasePath);
  const evidence = JSON.parse(
    db
      .prepare("SELECT evidence_json FROM remote_evidence WHERE remote_id=?")
      .get("publication-success:attempt-15").evidence_json,
  );
  db.close();
  assert.deepEqual(
    [evidence.firstPublishedAt, evidence.firstPublishedAtSource],
    ["2026-08-08T05:01:00.000Z", "manual_positive_evidence_time"],
  );
});

test("anomaly non-published confirmation restores editability and opposite decisions conflict", async (t) => {
  const value = fixture();
  t.after(() => value.close());
  const supplierState = { orders: [] };
  const service = serviceFor(value, supplierState);
  await assert.rejects(() => service.syncOrder("order-15"));
  supplierState.orders = [{ orderId: "order-15", status: "rejected" }];
  const prepared = await service.prepareOrderStatusAnomalyResolution({
    orderId: "order-15",
  });
  const result = service.confirmOrderNotPublished({
    orderId: "order-15",
    confirmationToken: prepared.confirmationToken,
  });
  assert.equal(result.status, "not_published");
  assert.equal(
    value.transitions.listOrderObservationViews()[0].statusCode,
    "4",
  );
  assert.throws(
    () =>
      service.confirmOrderPublished({
        orderId: "order-15",
        confirmationToken: prepared.confirmationToken,
      }),
    { code: "ORDER_STATUS_ANOMALY_RESOLUTION_OPPOSITE" },
  );
});

test("batch refresh reports partial success and preserves failed order facts", async (t) => {
  const value = fixture();
  t.after(() => value.close());
  const supplierState = {
    orders: [{ orderId: "order-15", status: "scheduled" }],
  };
  const service = serviceFor(value, supplierState);
  const result = await service.syncAllOrders();
  assert.deepEqual([result.succeeded, result.failed], [1, 0]);
  supplierState.orders = [];
  const partial = await service.syncAllOrders();
  assert.deepEqual([partial.succeeded, partial.failed], [0, 1]);
  assert.equal(service.listOrderViews()[0].statusCode, "1");
});

test("publication and anomaly resolutions roll back completely on transition faults", async (t) => {
  let faultPoint = "after-paid-publication-success";
  const value = fixture({
    internalPaidExecutionTransitionFault(point) {
      if (point === faultPoint) throw new Error(`fault:${point}`);
    },
  });
  t.after(() => value.close());
  assert.throws(() =>
    value.transitions.recordOrderObservation({
      orderObservationV1: observation(value, {
        statusCode: "2",
        evidenceFingerprint: "2".repeat(64),
      }),
    }),
  );
  assert.equal(
    value.store
      .listArticleLifecycleFacts({ articleIds: ["article-15"] })
      .publications.some((fact) => fact.status === "published"),
    false,
  );
  assert.equal(
    value.transitions.listOrderObservationViews()[0].statusCode,
    "0",
  );

  faultPoint = "";
  const supplierState = { orders: [] };
  const service = serviceFor(value, supplierState);
  await assert.rejects(() => service.syncOrder("order-15"));
  supplierState.orders = [{ orderId: "order-15", status: "pending" }];
  const prepared = await service.prepareOrderStatusAnomalyResolution({
    orderId: "order-15",
  });
  faultPoint = "after-order-anomaly-resolution";
  assert.throws(() =>
    service.resumeOrderTracking({
      orderId: "order-15",
      confirmationToken: prepared.confirmationToken,
    }),
  );
  assert.equal(
    value.transitions.readOrderTransitionFacts("order-15").openAnomaly,
    true,
  );
});

test("anomaly prepare fails closed for inconclusive evidence and stale tokens", async (t) => {
  const value = fixture();
  t.after(() => value.close());
  const supplierState = { orders: [] };
  const service = serviceFor(value, supplierState);
  await assert.rejects(() => service.syncOrder("order-15"));
  const inconclusive = await service.prepareOrderStatusAnomalyResolution({
    orderId: "order-15",
  });
  assert.deepEqual(
    [inconclusive.classification, inconclusive.allowedActions],
    ["inconclusive", []],
  );
  supplierState.orders = [{ orderId: "order-15", status: "pending" }];
  const first = await service.prepareOrderStatusAnomalyResolution({
    orderId: "order-15",
  });
  const second = await service.prepareOrderStatusAnomalyResolution({
    orderId: "order-15",
  });
  assert.notEqual(first.confirmationToken, second.confirmationToken);
  assert.throws(
    () =>
      service.resumeOrderTracking({
        orderId: "order-15",
        confirmationToken: first.confirmationToken,
      }),
    { code: "ORDER_STATUS_ANOMALY_TOKEN_STALE" },
  );
});

test("aftercare without publication remains inconclusive and frozen", async (t) => {
  const value = fixture();
  t.after(() => value.close());
  const supplierState = {
    orders: [{ orderId: "order-15", status: "aftercare" }],
  };
  const service = serviceFor(value, supplierState);
  const synced = await service.syncOrder("order-15");
  assert.deepEqual(synced.mutation, {
    changed: true,
    kind: "order_status_anomaly_recorded",
    orderId: "order-15",
  });
  const prepared = await service.prepareOrderStatusAnomalyResolution({
    orderId: "order-15",
  });
  assert.deepEqual(
    [prepared.classification, prepared.allowedActions],
    ["inconclusive", []],
  );
  assert.equal(
    value.transitions.readOrderTransitionFacts("order-15").openAnomaly,
    true,
  );
});

test("stale query results cannot overwrite newer order facts while trusted publication still wins", async (t) => {
  const staleStatus = fixture();
  t.after(() => staleStatus.close());
  const pendingStatus = deferred();
  const staleService = createMediaOrderService({
    orderObservationTransitions: staleStatus.transitions,
    supplierProvider: () => ({ getOrderDetails: () => pendingStatus.promise }),
    clock: () => new Date("2026-08-08T05:00:00.000Z"),
  });
  const staleSync = staleService.syncOrder("order-15");
  staleStatus.transitions.recordOrderObservation({
    orderObservationV1: observation(staleStatus, {
      statusCode: "1",
      observedAt: "2026-08-08T04:00:00.000Z",
      evidenceFingerprint: "3".repeat(64),
    }),
  });
  pendingStatus.resolve({
    kind: "order_details",
    orders: [{ orderId: "order-15", status: "pending" }],
  });
  await assert.rejects(staleSync, { code: "ORDER_OBSERVATION_QUERY_STALE" });
  assert.equal(
    staleStatus.transitions.listOrderObservationViews()[0].statusCode,
    "1",
  );

  const staleMissing = fixture();
  t.after(() => staleMissing.close());
  const pendingMissing = deferred();
  const missingService = createMediaOrderService({
    orderObservationTransitions: staleMissing.transitions,
    supplierProvider: () => ({ getOrderDetails: () => pendingMissing.promise }),
    clock: () => new Date("2026-08-08T05:00:00.000Z"),
  });
  const missingSync = missingService.syncOrder("order-15");
  staleMissing.transitions.recordOrderObservation({
    orderObservationV1: observation(staleMissing, {
      statusCode: "1",
      observedAt: "2026-08-08T04:00:00.000Z",
      evidenceFingerprint: "4".repeat(64),
    }),
  });
  pendingMissing.resolve({ kind: "order_details", orders: [] });
  await assert.rejects(missingSync, { code: "ORDER_OBSERVATION_QUERY_STALE" });
  assert.equal(
    staleMissing.transitions.readOrderTransitionFacts("order-15").openAnomaly,
    false,
  );

  const published = fixture();
  t.after(() => published.close());
  const pendingPublished = deferred();
  const publishedService = createMediaOrderService({
    orderObservationTransitions: published.transitions,
    supplierProvider: () => ({
      getOrderDetails: () => pendingPublished.promise,
    }),
    clock: () => new Date("2026-08-08T05:00:00.000Z"),
  });
  const publishedSync = publishedService.syncOrder("order-15");
  published.transitions.recordOrderObservation({
    orderObservationV1: observation(published, {
      statusCode: "1",
      observedAt: "2026-08-08T04:00:00.000Z",
      evidenceFingerprint: "5".repeat(64),
    }),
  });
  pendingPublished.resolve({
    kind: "order_details",
    orders: [
      {
        orderId: "order-15",
        status: "published",
        remoteUrl: "https://publisher.example/article-15",
      },
    ],
  });
  await publishedSync;
  assert.equal(
    published.transitions.readOrderTransitionFacts("order-15").published,
    true,
  );
});

test("anomaly prepare rejects evidence queried against an older fact revision", async (t) => {
  const value = fixture();
  t.after(() => value.close());
  value.transitions.recordOrderStatusAnomaly({
    orderId: "order-15",
    reason: "order-missing",
    evidenceFingerprint: "6".repeat(64),
  });
  const pending = deferred();
  const service = createMediaOrderService({
    orderObservationTransitions: value.transitions,
    supplierProvider: () => ({ getOrderDetails: () => pending.promise }),
    clock: () => new Date("2026-08-08T05:00:00.000Z"),
  });
  const preparing = service.prepareOrderStatusAnomalyResolution({
    orderId: "order-15",
  });
  value.transitions.recordOrderStatusAnomaly({
    orderId: "order-15",
    reason: "order-missing",
    evidenceFingerprint: "7".repeat(64),
  });
  pending.resolve({
    kind: "order_details",
    orders: [{ orderId: "order-15", status: "pending" }],
  });
  await assert.rejects(preparing, {
    code: "ORDER_STATUS_ANOMALY_QUERY_STALE",
  });
});

test("terminal order history is authoritative and rejects a later non-published regression", (t) => {
  const value = fixture();
  t.after(() => value.close());
  value.transitions.recordOrderObservation({
    orderObservationV1: observation(value, {
      statusCode: "4",
      evidenceFingerprint: "8".repeat(64),
    }),
  });
  assert.throws(
    () =>
      value.transitions.recordOrderObservation({
        orderObservationV1: observation(value, {
          statusCode: "0",
          observedAt: "2026-08-08T06:00:00.000Z",
          evidenceFingerprint: "9".repeat(64),
        }),
      }),
    { code: "ORDER_TRANSITION_TERMINAL" },
  );
  assert.equal(
    value.transitions.listOrderObservationViews()[0].statusCode,
    "4",
  );
});

test("legacy paid orders without a frozen customer snapshot fail closed at publication", (t) => {
  const value = fixture({ customerSnapshot: false });
  t.after(() => value.close());
  assert.throws(
    () =>
      value.transitions.recordOrderObservation({
        orderObservationV1: observation(value, {
          statusCode: "2",
          remoteUrl: "https://publisher.example/article-15",
          evidenceFingerprint: "a".repeat(64),
        }),
      }),
    { code: "ORDER_CUSTOMER_SNAPSHOT_UNAVAILABLE" },
  );
  assert.equal(
    value.transitions.readOrderTransitionFacts("order-15").published,
    false,
  );
});

test("a trusted published observation wins an open anomaly without a cancellation command", async (t) => {
  const value = fixture();
  t.after(() => value.close());
  const supplierState = { orders: [] };
  const service = serviceFor(value, supplierState);
  await assert.rejects(() => service.syncOrder("order-15"));
  supplierState.orders = [
    {
      orderId: "order-15",
      status: "published",
      publishedAt: "2026-08-08T04:59:00.000Z",
      remoteUrl: "https://publisher.example/article-15",
    },
  ];
  await service.syncOrder("order-15");
  const facts = value.transitions.readOrderTransitionFacts("order-15");
  assert.deepEqual([facts.published, facts.openAnomaly], [true, false]);
});

test("composition-facing order observation capability is narrow and contains no cancellation writer", (t) => {
  const value = fixture();
  t.after(() => value.close());
  assert.deepEqual(Object.keys(value.transitions).sort(), [
    "confirmOrderNotPublished",
    "confirmOrderPublished",
    "getOrderObservationContext",
    "listOrderObservationViews",
    "prepareOrderStatusAnomalyResolution",
    "readOrderTransitionFacts",
    "recordOrderObservation",
    "recordOrderStatusAnomaly",
    "resumeOrderTracking",
  ]);
  assert.equal("cancelOrder" in value.transitions, false);
  assert.equal("recordCancellationIntent" in value.transitions, false);
  assert.equal("recordRemoteOrderObservation" in value.store, false);
});

test("order mutations invalidate orders, article management, and attention even when anomaly sync throws", async () => {
  const reasons = [];
  let anomalyFailure = false;
  const orderService = {
    listOrderViews: () => [
      {
        orderNid: "order-15",
        statusCode: "0",
        title: "订单十五",
        createdAt: "2026-08-08T00:00:00.000Z",
        submittedAt: "2026-08-08T00:00:00.000Z",
        publishedAt: "",
        resourceName: "媒体十五",
        price: "15",
        actualAmount: "",
        hasPublishedUrl: false,
        anomaly: null,
      },
    ],
    syncOrder: async () => {
      if (anomalyFailure) {
        const error = Object.assign(new Error("MEDIA_ORDER_STATUS_ANOMALY"), {
          code: "MEDIA_ORDER_STATUS_ANOMALY",
        });
        Object.defineProperty(error, "mutation", {
          value: Object.freeze({
            changed: true,
            kind: "order_status_anomaly_recorded",
            orderId: "order-15",
          }),
        });
        throw error;
      }
      return { idempotent: false };
    },
    syncAllOrders: async () => ({
      items: [],
      succeeded: 1,
      failed: 0,
      mutationCount: 1,
    }),
    prepareOrderStatusAnomalyResolution: async () => ({}),
    resumeOrderTracking: () => ({ status: "tracking_resumed" }),
    confirmOrderPublished: () => ({ status: "published" }),
    confirmOrderNotPublished: () => ({ status: "not_published" }),
    openPublishedUrl: async () => ({ completed: true }),
  };
  const application = createMediaWorkbenchApplication({
    mediaClientProvider: () => ({}),
    mediaResourceService: {},
    mediaOrderService: orderService,
    resourceStore: {},
    poolStore: {},
    draftStore: { getAll: () => ({}), get: () => null },
    mediaWorkbenchService: {
      scanArticles: async () => [],
      resolveSubmissionFile: (filename) => filename,
    },
    invalidateData: (reason) => reasons.push(reason),
  });

  await application.syncOrder("order-15");
  anomalyFailure = true;
  await assert.rejects(() => application.syncOrder("order-15"), {
    code: "MEDIA_ORDER_STATUS_ANOMALY",
  });
  await application.syncAllOrders();
  await application.resumeOrderTracking({});
  await application.confirmOrderPublished({});
  await application.confirmOrderNotPublished({});
  assert.deepEqual(reasons, [
    "PAID_ORDER_OBSERVATION_CHANGED",
    "PAID_ORDER_OBSERVATION_CHANGED",
    "PAID_ORDER_OBSERVATION_CHANGED",
    "PAID_ORDER_STATUS_ANOMALY_RESOLVED",
    "PAID_ORDER_STATUS_ANOMALY_RESOLVED",
    "PAID_ORDER_STATUS_ANOMALY_RESOLVED",
  ]);
  assert.deepEqual(scopesForReason("PAID_ORDER_OBSERVATION_CHANGED"), [
    "articleManagement",
    "articleAttention",
    "orders",
    "submissionCenter",
  ]);
  assert.deepEqual(scopesForReason("PAID_ORDER_STATUS_ANOMALY_RESOLVED"), [
    "articleManagement",
    "articleAttention",
    "orders",
    "submissionCenter",
  ]);
});
