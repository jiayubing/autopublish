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
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");

function temporaryWorkspace(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `phase-03-${label}-`));
}

const observationPortsByStore = new WeakMap();

function openStore(workspaceRoot) {
  const transitionPorts = {};
  const store = createOperationalStore({ workspaceRoot, transitionPorts });
  observationPortsByStore.set(
    store,
    transitionPorts.orderObservationTransitions,
  );
  return store;
}

function createOrder(store, suffix, status) {
  store.reservePublicationTarget({
    articleId: `article-${suffix}`,
    publicationId: `publication-${suffix}`,
    attemptId: `attempt-${suffix}`,
    target: { kind: "media", mediaResourceId: `resource-${suffix}` },
  });
  const snapshot = domain.parseOrderSnapshotV1({
    version: 1,
    orderIdentityV1: { version: 1, orderId: `order-${suffix}` },
    articleIdentityV1: {
      version: 1,
      clientId: `client-${suffix}`,
      articleId: `article-${suffix}`,
    },
    targetIdentityV1: {
      version: 1,
      kind: "media",
      mediaResourceId: `resource-${suffix}`,
    },
    orderCreationAttemptId: `creation-${suffix}`,
    mediaName: `媒体-${suffix}`,
    quotedPrice: 10,
    estimatedTotal: 10,
    actualAmount: null,
    systemSubmissionCode: "supplier-contract",
    submittedTitle: `标题-${suffix}`,
    submittedBody: `正文-${suffix}`,
    contentFingerprint: domain.contentFingerprint(
      `标题-${suffix}`,
      `正文-${suffix}`,
    ),
    remoteCallStartedAt: "2026-08-08T00:00:00.000Z",
  });
  const stamp = "2026-08-08T00:00:01.000Z";
  const db = new DatabaseSync(store.databasePath);
  db.prepare(
    "UPDATE publication_records SET status=?,updated_at=? WHERE publication_id=?",
  ).run(status, stamp, `publication-${suffix}`);
  db.prepare(
    "UPDATE publication_attempts SET status=? WHERE attempt_id=?",
  ).run(status, `attempt-${suffix}`);
  if (status === "failed")
    db.prepare("DELETE FROM article_active_targets WHERE attempt_id=?").run(
      `attempt-${suffix}`,
    );
  else
    db.prepare(
      "UPDATE article_active_targets SET state=?,updated_at=? WHERE attempt_id=?",
    ).run(status, stamp, `attempt-${suffix}`);
  db.prepare("INSERT INTO remote_orders VALUES(?,?,?,?,?)").run(
    `order-${suffix}`,
    `attempt-${suffix}`,
    `order-${suffix}`,
    JSON.stringify(snapshot),
    stamp,
  );
  db.prepare("INSERT INTO remote_evidence VALUES(?,?,?,?,?,?)").run(
    `order-evidence-${suffix}`,
    `attempt-${suffix}`,
    `order-${suffix}`,
    null,
    JSON.stringify({ remoteId: `order-${suffix}` }),
    stamp,
  );
  db.prepare(
    "INSERT INTO order_display_snapshots(attempt_id,title_snapshot,filename,resource_name_snapshot,quoted_price,created_at,media_resource_id,estimated_total,system_submission_code) VALUES(?,?,?,?,?,?,?,?,?)",
  ).run(
    `attempt-${suffix}`,
    snapshot.submittedTitle,
    `${suffix}.md`,
    snapshot.mediaName,
    snapshot.quotedPrice,
    stamp,
    `resource-${suffix}`,
    snapshot.estimatedTotal,
    snapshot.systemSubmissionCode,
  );
  db.prepare("INSERT INTO submission_batches VALUES(?,?,?,?,?)").run(
    `batch-${suffix}`,
    "completed",
    1,
    "2026-08-08T00:00:00.000Z",
    "2026-08-08T00:00:01.000Z",
  );
  db.prepare("INSERT INTO submission_items VALUES(?,?,?,?,?,?,?,?,?)").run(
    `item-${suffix}`,
    `batch-${suffix}`,
    `article-${suffix}`,
    `media-resource:resource-${suffix}`,
    1,
    "completed",
    null,
    null,
    JSON.stringify({
      attemptId: `attempt-${suffix}`,
      customerSnapshotV1: {
        version: 1,
        clientId: `client-${suffix}`,
        displayName: `客户-${suffix}`,
      },
    }),
  );
  db.close();
  return `order-${suffix}`;
}

async function observe(store, orderId, response) {
  const status = {
    0: "pending",
    1: "scheduled",
    2: "published",
    4: "rejected",
    9: "aftercare",
  }[Number(response.status)];
  return createMediaOrderService({
    orderObservationTransitions: observationPortsByStore.get(store),
    supplierProvider: () => ({
      getOrderDetails: async () => ({
        kind: "order_details",
        orders: [
          {
            orderId,
            status,
            ...(response.order_url ? { remoteUrl: response.order_url } : {}),
            ...(response.published_at
              ? { publishedAt: response.published_at }
              : {}),
          },
        ],
      }),
    }),
  }).syncOrder(orderId);
}

function orderService(store, options) {
  return createMediaOrderService({
    orderObservationTransitions: observationPortsByStore.get(store),
    ...(options || {}),
  });
}

function orderMap(store) {
  return new Map(
    store.listOrderDisplayViews().map((order) => [order.orderId, order]),
  );
}

test("canonical outcomes never backfill a supplier observation", () => {
  const store = openStore(temporaryWorkspace("canonical-no-supplier"));
  try {
    for (const status of ["remote_started", "failed", "uncertain"])
      createOrder(store, `canonical-${status}`, status);
    const views = orderMap(store);
    for (const status of ["remote_started", "failed", "uncertain"]) {
      const order = views.get(`order-canonical-${status}`);
      assert.equal(
        order.publicationStatus,
        status === "remote_started" ? "paid_processing" : "manual_check",
      );
      assert.equal(order.supplierStatusCode, "");
      assert.equal(order.supplierObservedAt, null);
    }
    for (const order of store.listRemoteOrders()) {
      assert.equal(order.supplierStatusCode, null);
      assert.equal(order.supplierObservedAt, null);
    }
  } finally {
    store.close();
  }
});

test("supplier responses preserve 0/1/2/4/9 while published and rejected observations apply their authoritative outcomes", async () => {
  const store = openStore(temporaryWorkspace("supplier-corpus"));
  try {
    for (const code of ["0", "1", "2", "4", "9"]) {
      const orderId = createOrder(store, `supplier-${code}`, "remote_started");
      await observe(store, orderId, {
        status: Number(code),
        ...(code === "2"
          ? {
              order_url:
                "https://news.publisher.example/article/2?id=2&utm_source=test",
            }
          : {}),
      });
    }
    const views = orderMap(store);
    for (const code of ["0", "1", "2", "4", "9"]) {
      const order = views.get(`order-supplier-${code}`);
      assert.equal(order.supplierStatusCode, code);
      assert.equal(
        order.publicationStatus,
        code === "2"
          ? "published"
          : code === "4"
            ? "manual_check"
          : code === "9"
              ? "manual_check"
              : "paid_processing",
      );
    }
  } finally {
    store.close();
  }
});

test("supplier status 2 promotes every retained order fact through the Ticket 15 success primitive", async () => {
  const store = openStore(temporaryWorkspace("supplier-promotion"));
  try {
    for (const status of ["remote_started", "uncertain", "failed"])
      createOrder(store, `evidence-${status}`, status);
    for (const status of ["remote_started", "uncertain", "failed"])
      await observe(store, `order-evidence-${status}`, {
        status: 2,
        order_url: `https://publisher.example/${status}`,
      });
    const views = orderMap(store);
    assert.equal(
      views.get("order-evidence-remote_started").publicationStatus,
      "published",
    );
    assert.equal(
      views.get("order-evidence-uncertain").publicationStatus,
      "published",
    );
    assert.equal(
      views.get("order-evidence-failed").publicationStatus,
      "published",
    );
    for (const order of views.values())
      assert.equal(order.supplierStatusCode, "2");
  } finally {
    store.close();
  }
});

test("non-success supplier observations cannot promote remote-started work", async () => {
  const store = openStore(temporaryWorkspace("published-monotonic"));
  try {
    const orderId = createOrder(store, "published-monotonic", "remote_started");
    for (const code of [0, 1]) {
      await observe(store, orderId, { status: code });
      const order = orderMap(store).get(orderId);
      assert.equal(order.publicationStatus, "paid_processing");
      assert.equal(order.supplierStatusCode, String(code));
    }
    await assert.rejects(() => observe(store, orderId, { status: 0 }), {
      code: "ORDER_OBSERVATION_STATUS_REGRESSION",
    });
    assert.equal(orderMap(store).get(orderId).supplierStatusCode, "1");
  } finally {
    store.close();
  }
});

test("published URL evidence remains openable after a later aftercare observation", async () => {
  const store = openStore(temporaryWorkspace("published-url-2-to-9"));
  const opened = [];
  try {
    const orderId = createOrder(store, "published-url-2-to-9", "remote_started");
    const url = "https://publisher.example/article/persistent-evidence";
    await observe(store, orderId, { status: 2, order_url: url });
    await observe(store, orderId, { status: 9 });

    const view = orderService(store).listOrderViews()[0];
    assert.deepEqual([view.statusCode, view.hasPublishedUrl], ["9", true]);

    const service = orderService(store, {
      openExternal: async (url) => opened.push(url),
    });
    await service.openPublishedUrl(orderId);
    assert.deepEqual(opened, [url]);
  } finally {
    store.close();
  }
});

test("published success and URL evidence win over every later supplier status", async () => {
  const store = openStore(
    temporaryWorkspace("published-url-observation-matrix"),
  );
  try {
    for (const code of [0, 1, 4, 9]) {
      const orderId = createOrder(store, `published-url-${code}`, "remote_started");
      const url = `https://publisher.example/article/persistent-${code}`;
      await observe(store, orderId, { status: 2, order_url: url });
      await observe(store, orderId, { status: code });

      const view = orderService(store)
        .listOrderViews()
        .find((order) => order.orderNid === orderId);
      assert.deepEqual(
        [
          store.listRemoteOrders().find((order) => order.orderId === orderId)
            .status,
          view.statusCode,
          view.hasPublishedUrl,
        ],
        ["published", String(code), true],
      );

      const opened = [];
      const service = orderService(store, {
        openExternal: async (target) => opened.push(target),
      });
      await service.openPublishedUrl(orderId);
      assert.deepEqual(opened, [url]);
    }
  } finally {
    store.close();
  }
});

test("supplier observation survives restart, backup, and restored temporary SQLite", async () => {
  const workspaceRoot = temporaryWorkspace("supplier-persistence");
  let store = openStore(workspaceRoot);
  const orderId = createOrder(store, "persistent", "remote_started");
  await observe(store, orderId, { status: 1 });
  const backupPath = path.join(workspaceRoot, "supplier.backup.sqlite");
  store.backup(backupPath);
  store.close();

  store = openStore(workspaceRoot);
  try {
    assert.deepEqual(
      [
        orderMap(store).get(orderId).publicationStatus,
        orderMap(store).get(orderId).supplierStatusCode,
      ],
      ["paid_processing", "1"],
    );
  } finally {
    store.close();
  }

  const restoredRoot = temporaryWorkspace("supplier-restored");
  const restoredDirectory = path.join(
    restoredRoot,
    ".autopublish",
    "operations",
  );
  fs.mkdirSync(restoredDirectory, { recursive: true });
  fs.copyFileSync(backupPath, path.join(restoredDirectory, "operations.db"));
  const restored = openStore(restoredRoot);
  try {
    const order = orderMap(restored).get(orderId);
    assert.deepEqual(
      [order.publicationStatus, order.supplierStatusCode],
      ["paid_processing", "1"],
    );
  } finally {
    restored.close();
  }
});

test("published supplier URL survives restart, backup, and restore", async () => {
  const workspaceRoot = temporaryWorkspace("published-url-persistence");
  let store = openStore(workspaceRoot);
  const orderId = createOrder(store, "published-url-persistence", "remote_started");
  const url = "https://publisher.example/article/persistent-after-restore";
  await observe(store, orderId, { status: 2, order_url: url });
  await observe(store, orderId, { status: 9 });
  const backupPath = path.join(workspaceRoot, "published-url.backup.sqlite");
  store.backup(backupPath);
  store.close();

  store = openStore(workspaceRoot);
  try {
    const opened = [];
    const service = orderService(store, {
      openExternal: async (target) => opened.push(target),
    });
    assert.equal(service.listOrderViews()[0].hasPublishedUrl, true);
    await service.openPublishedUrl(orderId);
    assert.deepEqual(opened, [url]);
  } finally {
    store.close();
  }

  const restoredRoot = temporaryWorkspace("published-url-restored");
  const restoredDirectory = path.join(
    restoredRoot,
    ".autopublish",
    "operations",
  );
  fs.mkdirSync(restoredDirectory, { recursive: true });
  fs.copyFileSync(backupPath, path.join(restoredDirectory, "operations.db"));
  const restored = openStore(restoredRoot);
  try {
    const opened = [];
    const service = orderService(restored, {
      openExternal: async (target) => opened.push(target),
    });
    assert.equal(service.listOrderViews()[0].hasPublishedUrl, true);
    await service.openPublishedUrl(orderId);
    assert.deepEqual(opened, [url]);
  } finally {
    restored.close();
  }
});

test("legacy remote-evidence URLs cannot manufacture an openable Ticket 15 publication link", async () => {
  const workspaceRoot = temporaryWorkspace("published-url-fail-closed");
  let store = openStore(workspaceRoot);
  const cases = [
    [
      "unpublished",
      "remote_started",
      "https://publisher.example/article/unpublished",
      "MEDIA_ORDER_NOT_PUBLISHED",
    ],
    ["missing", "published", null, "MEDIA_ORDER_URL_UNAVAILABLE"],
    [
      "http",
      "published",
      "http://publisher.example/article/http",
      "MEDIA_ORDER_URL_UNAVAILABLE",
    ],
    [
      "credentials",
      "published",
      "https://user:secret@publisher.example/article/credentials",
      "MEDIA_ORDER_URL_UNAVAILABLE",
    ],
    [
      "query",
      "published",
      "https://publisher.example/article/query?token=secret",
      "MEDIA_ORDER_URL_UNAVAILABLE",
    ],
    [
      "fragment",
      "published",
      "https://publisher.example/article/fragment#secret",
      "MEDIA_ORDER_URL_UNAVAILABLE",
    ],
    [
      "oversized",
      "published",
      `https://publisher.example/article/${"x".repeat(2048)}`,
      "MEDIA_ORDER_URL_UNAVAILABLE",
    ],
    [
      "malformed",
      "published",
      "not a valid URL",
      "MEDIA_ORDER_URL_UNAVAILABLE",
    ],
  ];
  for (const [suffix] of cases)
    createOrder(store, `fail-closed-${suffix}`, "remote_started");
  const databasePath = store.verify().databasePath;
  store.close();

  const database = new DatabaseSync(databasePath);
  try {
    const update = database.prepare(
      "UPDATE remote_evidence SET remote_url=? WHERE attempt_id=?",
    );
    for (const [suffix, , remoteUrl] of cases) {
      if (remoteUrl !== null)
        update.run(remoteUrl, `attempt-fail-closed-${suffix}`);
    }
    for (const [suffix, status] of cases) {
      database
        .prepare("UPDATE publication_attempts SET status=? WHERE attempt_id=?")
        .run(status, `attempt-fail-closed-${suffix}`);
      database
        .prepare(
          "UPDATE publication_records SET status=? WHERE publication_id=?",
        )
        .run(status, `publication-fail-closed-${suffix}`);
    }
  } finally {
    database.close();
  }

  store = openStore(workspaceRoot);
  try {
    const opened = [];
    const service = orderService(store, {
      openExternal: async (target) => opened.push(target),
    });
    const views = new Map(
      service.listOrderViews().map((order) => [order.orderNid, order]),
    );
    for (const [suffix] of cases) {
      const orderId = `order-fail-closed-${suffix}`;
      assert.equal(views.get(orderId).hasPublishedUrl, false, suffix);
      await assert.rejects(() => service.openPublishedUrl(orderId), {
        code: "MEDIA_ORDER_NOT_PUBLISHED",
      });
    }
    assert.deepEqual(opened, []);
  } finally {
    store.close();
  }
});
