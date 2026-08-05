"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const {
  createMediaOrderService,
} = require("../desktop/services/media-order-service");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");

test("media order service requires the canonical OperationalStore projection and has no legacy order path", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "desktop", "services", "media-order-service.js"),
    "utf8",
  );
  assert.throws(() => createMediaOrderService(), {
    code: "MEDIA_ORDER_STORE_REQUIRED",
  });
  assert.throws(
    () => createMediaOrderService({ operationalStore: { listRemoteOrders() { return []; } } }),
    { code: "MEDIA_ORDER_PROJECTION_REQUIRED" },
  );
  for (const symbol of [
    "submission-orders.jsonl",
    "publicationLedger",
    "toOrderView",
    "mapOrderStatus",
    "updateLocalOrderRecord",
    "syncPublicationFromOrder",
  ]) {
    assert.equal(source.includes(symbol), false, symbol);
  }
});

test("media order views consume the bounded OperationalStore projection and expose no workflow identifiers", () => {
  let readLegacy = false;
  const service = createMediaOrderService({
    storePath: "Z:\\must-not-be-read.jsonl",
    operationalStore: {
      listOrderDisplayViews: () => [
        {
          orderId: "order-1",
          orderNid: "order-1",
          publicationId: "publication-1",
          attemptId: "attempt-1",
          mediaResourceId: "resource-1",
          supplierStatusCode: "0",
          submittedAt: "2026-07-25T00:00:00.000Z",
        },
      ],
      listSubmissionBatches: () => { throw new Error("unbounded history scan"); },
    },
  });
  const view = service.listOrderViews()[0];
  assert.equal(readLegacy, false);
  assert.deepEqual(
    [view.orderNid, view.statusCode],
    ["order-1", "0"],
  );
  for (const key of ["publicationId", "attemptId", "resourceId", "publicationStatus", "raw"])
    assert.equal(key in view, false, key);
});

test("media order views join the immutable submission display snapshot without inventing settlement data", () => {
  const service = createMediaOrderService({
    operationalStore: {
      listOrderDisplayViews: () => [
        {
          orderId: "order-1",
          publicationId: "publication-1",
          attemptId: "attempt-1",
          articleId: "article-1",
          mediaResourceId: "resource-1",
          supplierStatusCode: "0",
          submittedAt: "2026-07-28T00:00:00.000Z",
          titleSnapshot: "已保存的投稿标题",
          filename: "article-1.md",
          resourceNameSnapshot: "媒体甲",
          quotedPrice: 12.5,
        },
      ],
    },
  });

  const view = service.listOrderViews()[0];
  assert.deepEqual(
    [
      view.title,
      view.filename,
      view.resourceName,
      view.price,
      view.statusCode,
    ],
    ["已保存的投稿标题", "article-1.md", "媒体甲", "12.5", "0"],
  );
});

test("order projection preserves timezone-bearing instants and leaves missing publication time empty", () => {
  const service = createMediaOrderService({
    operationalStore: {
      listOrderDisplayViews: () => [
        {
          orderId: "order-shanghai",
          supplierStatusCode: "2",
          submittedAt: "2026-07-28T00:00:00.000Z",
          publishedAt: "2026-07-28T00:30:00+08:00",
        },
        {
          orderId: "order-missing-time",
          supplierStatusCode: "0",
          submittedAt: "2026-07-27T20:30:00.000Z",
          publishedAt: null,
        },
      ],
    },
  });
  const [shanghai, missing] = service.listOrderViews();
  assert.equal(shanghai.publishedAt, "2026-07-27T16:30:00.000Z");
  assert.equal(missing.submittedAt, "2026-07-27T20:30:00.000Z");
  assert.equal(missing.publishedAt, "");
});

test("a real SQLite projection stays single-query and parses only orders across 13k submission batches", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-order-large-history-"));
  let store = createOperationalStore({ workspaceRoot: root });
  let databasePath;
  const fakeSupplier = {
    orderInfo: async () => ({ data: [] }),
    sendArticle: async () => {
      throw new Error("paid send must not be called by an order projection");
    },
  };
  let paidSendCalls = 0;
  fakeSupplier.sendArticle = async () => {
    paidSendCalls += 1;
    throw new Error("paid send must not be called by an order projection");
  };
  try {
    for (let index = 1; index <= 3; index += 1) {
      store.reservePublicationTarget({
        articleId: `article-${index}`,
        publicationId: `publication-${index}`,
        attemptId: `attempt-${index}`,
        target: { kind: "media", mediaResourceId: `resource-${index}` },
      });
      store.commitRemoteOutcome({
        attemptId: `attempt-${index}`,
        outcome: {
          status: "submitted",
          evidence: {
            articleId: `article-${index}`,
            attemptId: `attempt-${index}`,
            targetKey: `media-resource:resource-${index}`,
            remoteId: `order-${index}`,
          },
        },
      });
    }
    databasePath = store.verify().databasePath;
    store.close();

    const fixtureDb = new DatabaseSync(databasePath);
    fixtureDb.exec("BEGIN IMMEDIATE");
    const insertBatch = fixtureDb.prepare(
      "INSERT INTO submission_batches(batch_id,status,revision,created_at,updated_at) VALUES(?,?,?,?,?)",
    );
    for (let index = 1; index <= 13000; index += 1) {
      insertBatch.run(
        `history-batch-${index}`,
        "complete",
        1,
        "2026-07-01T00:00:00.000Z",
        "2026-07-01T00:00:00.000Z",
      );
    }
    const insertSnapshot = fixtureDb.prepare(
      "INSERT INTO order_display_snapshots(attempt_id,title_snapshot,filename,resource_name_snapshot,quoted_price,created_at) VALUES(?,?,?,?,?,?)",
    );
    for (let index = 1; index <= 3; index += 1) {
      insertSnapshot.run(
        `attempt-${index}`,
        `订单标题 ${index}`,
        `article-${index}.md`,
        `媒体 ${index}`,
        index * 10,
        "2026-07-28T00:00:00.000Z",
      );
    }
    fixtureDb.exec("COMMIT");
    fixtureDb.close();

    const metrics = [];
    store = createOperationalStore({
      workspaceRoot: root,
      internalOrderProjectionObserver: (value) => metrics.push(value),
    });
    let orderQueryCount = 0;
    const service = createMediaOrderService({
      operationalStore: {
        listOrderDisplayViews: () => {
          orderQueryCount += 1;
          return store.listOrderDisplayViews();
        },
      },
      clientProvider: () => fakeSupplier,
    });
    const beforeHeap = process.memoryUsage().heapUsed;
    const startedAt = performance.now();
    const views = service.listOrderViews();
    const elapsedMs = performance.now() - startedAt;
    const heapDeltaBytes = Math.max(0, process.memoryUsage().heapUsed - beforeHeap);

    assert.equal(orderQueryCount, 1);
    assert.deepEqual(metrics, [{ sqlCount: 1, rowCount: 3, parsedPayloadCount: 3 }]);
    assert.equal(views.length, 3);
    assert.deepEqual(
      views.map((view) => [view.title, view.resourceName, view.price]),
      [["订单标题 3", "媒体 3", "30"], ["订单标题 2", "媒体 2", "20"], ["订单标题 1", "媒体 1", "10"]],
    );
    assert.equal(paidSendCalls, 0);
    assert.ok(elapsedMs < 1000, `elapsedMs=${elapsedMs}`);
    assert.ok(heapDeltaBytes < 16 * 1024 * 1024, `heapDeltaBytes=${heapDeltaBytes}`);
    t.diagnostic(
      `fixture=temporary SQLite; historyBatches=13000; orderQueries=${orderQueryCount}; sql=${metrics[0].sqlCount}; parsedPayloads=${metrics[0].parsedPayloadCount}; orders=${views.length}; heapDeltaBytes=${heapDeltaBytes}; elapsedMs=${elapsedMs.toFixed(3)}; paidSendCalls=${paidSendCalls}`,
    );
  } finally {
    store.close();
  }
});

test("media order views expose the five supplier status categories independently from publication status", () => {
  const statuses = [
    ["0", "待安排"],
    ["1", "已安排"],
    ["2", "已发布"],
    ["4", "已退稿"],
    ["9", "售后中"],
  ];
  const service = createMediaOrderService({
    operationalStore: {
      listOrderDisplayViews: () =>
        statuses.map(([remoteStatusCode], index) => ({
          orderId: `order-${index}`,
          attemptId: `attempt-${index}`,
          supplierStatusCode: remoteStatusCode,
        })),
    },
  });

  assert.deepEqual(
    service
      .listOrderViews()
      .map((order) => order.statusCode),
    statuses.map(([statusCode]) => statusCode),
  );
});

test("OperationalStore media order sync never writes the retired JSONL history", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-order-sync-"));
  const storePath = path.join(root, "submission-orders.jsonl");
  fs.writeFileSync(storePath, '{"legacy":true}\n');
  const service = createMediaOrderService({
    storePath,
    operationalStore: { listOrderDisplayViews: () => [], recordRemoteOrderObservation: () => ({}) },
    clientProvider: () => ({ orderInfo: async () => ({ data: [{ status: 1 }] }) }),
  });
  await service.syncOrder("order-1");
  assert.equal(fs.readFileSync(storePath, "utf8"), '{"legacy":true}\n');
});

test("supplier reconciliation storage failures are safe command failures, never a false sync success", async () => {
  const service = createMediaOrderService({
    operationalStore: {
      listOrderDisplayViews: () => [],
      recordRemoteOrderObservation: () => { throw new Error("sqlite secret payload must not reach the UI"); },
    },
    clientProvider: () => ({ orderInfo: async () => ({ data: [{ status: 1 }] }) }),
  });
  await assert.rejects(() => service.syncOrder("order-1"), (error) =>
    error.code === "MEDIA_ORDER_SYNC_FAILED" && !/secret/i.test(error.message),
  );
});

test("supplier observation parsing failures are stable and never expose the supplier payload", async () => {
  const item = {};
  Object.defineProperty(item, "status", {
    get() {
      throw new Error("supplier secret payload and C:\\workspace\\orders.db");
    },
  });
  const service = createMediaOrderService({
    operationalStore: {
      listOrderDisplayViews: () => [],
      recordRemoteOrderObservation: () => {
        throw new Error("must not be called");
      },
    },
    clientProvider: () => ({ orderInfo: async () => ({ data: [item] }) }),
  });
  await assert.rejects(
    () => service.syncOrder("order-1"),
    (error) =>
      error.code === "MEDIA_ORDER_SYNC_FAILED" &&
      error.message === "MEDIA_ORDER_SYNC_FAILED",
  );
});

test("real SQLite write and evidence conflicts roll back supplier observations with safe errors", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-order-sync-faults-"));
  let injectWriteFault = false;
  const store = createOperationalStore({
    workspaceRoot: root,
    internalBeforeCommit: () => {
      if (injectWriteFault)
        throw new Error("SQLITE_IOERR C:\\private\\operations.sqlite secret-payload");
    },
  });
  try {
    for (const suffix of ["sqlite", "evidence"]) {
      store.reservePublicationTarget({
        articleId: `article-${suffix}`,
        publicationId: `publication-${suffix}`,
        attemptId: `attempt-${suffix}`,
        target: { kind: "media", mediaResourceId: `resource-${suffix}` },
      });
      store.commitRemoteOutcome({
        attemptId: `attempt-${suffix}`,
        outcome: {
          status: "submitted",
          evidence: {
            articleId: `article-${suffix}`,
            attemptId: `attempt-${suffix}`,
            targetKey: `media-resource:resource-${suffix}`,
            remoteId: `order-${suffix}`,
          },
        },
      });
    }

    injectWriteFault = true;
    await assert.rejects(
      () =>
        createMediaOrderService({
          operationalStore: store,
          clientProvider: () => ({ orderInfo: async () => ({ data: [{ status: 1 }] }) }),
        }).syncOrder("order-sqlite"),
      (error) => error.code === "MEDIA_ORDER_SYNC_FAILED" && !/sqlite|private|payload/i.test(error.message),
    );
    injectWriteFault = false;

    await assert.rejects(
      () =>
        createMediaOrderService({
          operationalStore: store,
          clientProvider: () => ({
            orderInfo: async () => ({
              data: [{ status: 2, order_url: "https://user:secret@publisher.example/article?token=secret" }],
            }),
          }),
        }).syncOrder("order-evidence"),
      (error) => error.code === "MEDIA_ORDER_SYNC_FAILED" && !/secret|publisher|token/i.test(error.message),
    );

    const orders = new Map(store.listOrderDisplayViews().map((order) => [order.orderId, order]));
    assert.deepEqual(
      [orders.get("order-sqlite").supplierStatusCode, orders.get("order-evidence").supplierStatusCode],
      ["", ""],
    );
  } finally {
    store.close();
  }
});

test("supplier after-sales observation cannot revoke canonical published state and missing observation stays unknown", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-order-observation-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    store.reservePublicationTarget({ articleId: "article-1", publicationId: "publication-1", attemptId: "attempt-1", target: { kind: "media", mediaResourceId: "resource-1" } });
    store.commitRemoteOutcome({ attemptId: "attempt-1", outcome: { status: "submitted", evidence: { articleId: "article-1", attemptId: "attempt-1", targetKey: "media-resource:resource-1", remoteId: "order-1" } } });
    assert.equal(createMediaOrderService({ operationalStore: store }).listOrderViews()[0].statusCode, "");
    const service = createMediaOrderService({
      operationalStore: store,
      clientProvider: () => ({ orderInfo: async () => ({ data: [{ status: 2, order_url: "https://publisher.example/article-1", published_at: "2026-07-28T12:00:00.000Z" }] }) }),
    });
    await service.syncOrder("order-1");
    assert.equal(store.listRemoteOrders()[0].status, "published");
    await createMediaOrderService({
      operationalStore: store,
      clientProvider: () => ({ orderInfo: async () => ({ data: [{ status: 9 }] }) }),
    }).syncOrder("order-1");
    const view = createMediaOrderService({ operationalStore: store }).listOrderViews()[0];
    assert.deepEqual([store.listRemoteOrders()[0].status, view.statusCode, view.publishedAt], ["published", "9", "2026-07-28T12:00:00.000Z"]);
  } finally {
    store.close();
  }
});

test("all supplier observations persist independently and status 2 without HTTPS evidence does not promote canonical state", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-order-all-observations-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    for (const statusCode of ["0", "1", "2", "4", "9"]) {
      const suffix = `status-${statusCode}`;
      store.reservePublicationTarget({
        articleId: `article-${suffix}`,
        publicationId: `publication-${suffix}`,
        attemptId: `attempt-${suffix}`,
        target: { kind: "media", mediaResourceId: `resource-${suffix}` },
      });
      store.commitRemoteOutcome({
        attemptId: `attempt-${suffix}`,
        outcome: {
          status: "submitted",
          evidence: {
            articleId: `article-${suffix}`,
            attemptId: `attempt-${suffix}`,
            targetKey: `media-resource:resource-${suffix}`,
            remoteId: `order-${suffix}`,
          },
        },
      });
      await createMediaOrderService({
        operationalStore: store,
        clientProvider: () => ({
          orderInfo: async () => ({ data: [{ status: Number(statusCode) }] }),
        }),
      }).syncOrder(`order-${suffix}`);
    }

    const observations = new Map(
      store.listOrderDisplayViews().map((order) => [order.orderId, order]),
    );
    for (const statusCode of ["0", "1", "2", "4", "9"]) {
      const order = observations.get(`order-status-${statusCode}`);
      assert.equal(order.supplierStatusCode, statusCode);
      assert.equal(order.publicationStatus, "submitted");
    }
    assert.equal(observations.get("order-status-2").remoteUrl, null);
  } finally {
    store.close();
  }
});

test("supplier status survives sync and OperationalStore reopen without being replaced by publication status", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-03-order-status-reopen-"),
  );
  let store = createOperationalStore({ workspaceRoot: root });
  try {
    store.reservePublicationTarget({
      articleId: "article-1",
      publicationId: "publication-1",
      attemptId: "attempt-1",
      target: { kind: "media", mediaResourceId: "resource-1" },
    });
    store.commitRemoteOutcome({
      attemptId: "attempt-1",
      outcome: {
        status: "submitted",
        evidence: {
          articleId: "article-1",
          attemptId: "attempt-1",
          targetKey: "media-resource:resource-1",
          remoteId: "order-1",
        },
      },
    });
    await createMediaOrderService({
      operationalStore: store,
      clientProvider: () => ({
        orderInfo: async () => ({ data: [{ status: 1 }] }),
      }),
    }).syncOrder("order-1");
    store.close();

    store = createOperationalStore({ workspaceRoot: root });
    const view = createMediaOrderService({
      operationalStore: store,
    }).listOrderViews()[0];
    assert.deepEqual(
      [view.statusCode, view.publishedAt],
      ["1", ""],
    );
    assert.equal(store.listRemoteOrders()[0].status, "submitted");
  } finally {
    store.close();
  }
});

test("published order opening resolves only its stored HTTPS evidence by order identity", async () => {
  const opened = [];
  const orders = [
    {
      orderId: "order-published",
      attemptId: "attempt-published",
      status: "published",
      supplierStatusCode: "2",
      remoteUrl: "https://publisher.example/article/1",
    },
    {
      orderId: "order-pending",
      attemptId: "attempt-pending",
      status: "submitted",
      supplierStatusCode: "0",
      remoteUrl: null,
    },
    {
      orderId: "order-unsafe-url",
      attemptId: "attempt-unsafe-url",
      status: "published",
      supplierStatusCode: "2",
      remoteUrl: "http://publisher.example/article/unsafe",
    },
  ];
  const service = createMediaOrderService({
    operationalStore: {
      listOrderDisplayViews: () => [],
      listRemoteOrders: () => orders,
    },
    allowedPublishedUrlHosts: ["publisher.example"],
    openExternal: async (url) => opened.push(url),
  });

  assert.deepEqual(await service.openPublishedUrl("order-published"), {
    completed: true,
  });
  assert.deepEqual(opened, ["https://publisher.example/article/1"]);
  await assert.rejects(() => service.openPublishedUrl("order-pending"), {
    code: "MEDIA_ORDER_NOT_PUBLISHED",
  });
  await assert.rejects(() => service.openPublishedUrl("order-unsafe-url"), {
    code: "MEDIA_ORDER_URL_UNAVAILABLE",
  });
  orders.push({
    orderId: "order-untrusted-host",
    attemptId: "attempt-untrusted-host",
    status: "published",
    supplierStatusCode: "2",
    remoteUrl: "https://evil.example/phish",
  });
  await assert.rejects(() => service.openPublishedUrl("order-untrusted-host"), {
    code: "MEDIA_ORDER_URL_UNAVAILABLE",
  });
  assert.deepEqual(opened, ["https://publisher.example/article/1"]);
});
