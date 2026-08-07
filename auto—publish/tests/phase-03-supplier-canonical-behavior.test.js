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

function temporaryWorkspace(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `phase-03-${label}-`));
}

function createOrder(store, suffix, status) {
  store.reservePublicationTarget({
    articleId: `article-${suffix}`,
    publicationId: `publication-${suffix}`,
    attemptId: `attempt-${suffix}`,
    target: { kind: "media", mediaResourceId: `resource-${suffix}` },
  });
  store.commitRemoteOutcome({
    attemptId: `attempt-${suffix}`,
    outcome: {
      status,
      evidence: {
        articleId: `article-${suffix}`,
        attemptId: `attempt-${suffix}`,
        targetKey: `media-resource:resource-${suffix}`,
        remoteId: `order-${suffix}`,
        ...(status === "published"
          ? { remoteUrl: `https://media.example.test/articles/order-${suffix}` }
          : {}),
      },
    },
  });
  return `order-${suffix}`;
}

async function observe(store, orderId, response) {
  return createMediaOrderService({
    operationalStore: store,
    clientProvider: () => ({
      orderInfo: async () => ({ data: [response] }),
    }),
  }).syncOrder(orderId);
}

function orderMap(store) {
  return new Map(
    store.listOrderDisplayViews().map((order) => [order.orderId, order]),
  );
}

test("canonical outcomes never backfill a supplier observation", () => {
  const store = createOperationalStore({
    workspaceRoot: temporaryWorkspace("canonical-no-supplier"),
  });
  try {
    for (const status of ["submitted", "failed", "uncertain"])
      createOrder(store, `canonical-${status}`, status);
    const views = orderMap(store);
    for (const status of ["submitted", "failed", "uncertain"]) {
      const order = views.get(`order-canonical-${status}`);
      assert.equal(order.publicationStatus, status);
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

test("supplier responses preserve 0/1/2/4/9 independently, rejection closes unpublished work, and 2 without evidence cannot promote", async () => {
  const store = createOperationalStore({
    workspaceRoot: temporaryWorkspace("supplier-corpus"),
  });
  try {
    for (const code of ["0", "1", "2", "4", "9"]) {
      const orderId = createOrder(store, `supplier-${code}`, "submitted");
      if (code === "2")
        await assert.rejects(() => observe(store, orderId, { status: 2 }), {
          code: "MEDIA_ORDER_SYNC_FAILED",
        });
      else await observe(store, orderId, { status: Number(code) });
    }
    const views = orderMap(store);
    for (const code of ["0", "1", "2", "4", "9"]) {
      const order = views.get(`order-supplier-${code}`);
      assert.equal(order.supplierStatusCode, code === "2" ? "" : code);
      assert.equal(
        order.publicationStatus,
        code === "4" ? "failed" : "submitted",
      );
    }
  } finally {
    store.close();
  }
});

test("supplier 2 cannot promote any in-flight canonical outcome before Ticket 15", async () => {
  const store = createOperationalStore({
    workspaceRoot: temporaryWorkspace("supplier-promotion"),
  });
  try {
    for (const status of ["submitted", "uncertain", "failed"])
      createOrder(store, `evidence-${status}`, status);
    for (const status of ["submitted", "uncertain", "failed"])
      await assert.rejects(
        () =>
          observe(store, `order-evidence-${status}`, {
            status: 2,
            order_url: `https://publisher.example/${status}`,
          }),
        { code: "MEDIA_ORDER_SYNC_FAILED" },
      );
    const views = orderMap(store);
    assert.equal(
      views.get("order-evidence-submitted").publicationStatus,
      "submitted",
    );
    assert.equal(
      views.get("order-evidence-uncertain").publicationStatus,
      "uncertain",
    );
    assert.equal(
      views.get("order-evidence-failed").publicationStatus,
      "failed",
    );
    for (const order of views.values())
      assert.equal(order.supplierStatusCode, "");
  } finally {
    store.close();
  }
});

test("non-success supplier observations cannot promote submitted work", async () => {
  const store = createOperationalStore({
    workspaceRoot: temporaryWorkspace("published-monotonic"),
  });
  try {
    const orderId = createOrder(store, "published-monotonic", "submitted");
    for (const code of [9, 0, 1]) {
      await observe(store, orderId, { status: code });
      const order = orderMap(store).get(orderId);
      assert.equal(order.publicationStatus, "submitted");
      assert.equal(order.supplierStatusCode, String(code));
    }
  } finally {
    store.close();
  }
});

test("closed supplier success leaves no URL after a later status 9", async () => {
  const store = createOperationalStore({
    workspaceRoot: temporaryWorkspace("published-url-2-to-9"),
  });
  const opened = [];
  try {
    const orderId = createOrder(store, "published-url-2-to-9", "submitted");
    await assert.rejects(
      () =>
        observe(store, orderId, {
          status: 2,
          order_url: "https://publisher.example/article/persistent-evidence",
        }),
      { code: "MEDIA_ORDER_SYNC_FAILED" },
    );
    await observe(store, orderId, { status: 9 });

    const view = createMediaOrderService({
      operationalStore: store,
      allowedPublishedUrlHosts: ["publisher.example"],
    }).listOrderViews()[0];
    assert.deepEqual([view.statusCode, view.hasPublishedUrl], ["9", false]);

    const service = createMediaOrderService({
      operationalStore: store,
      allowedPublishedUrlHosts: ["publisher.example"],
      openExternal: async (url) => opened.push(url),
    });
    await assert.rejects(() => service.openPublishedUrl(orderId), {
      code: "MEDIA_ORDER_NOT_PUBLISHED",
    });
    assert.deepEqual(opened, []);
  } finally {
    store.close();
  }
});

test("closed supplier 2 evidence stays absent after 0/1/4/9 observations", async () => {
  const store = createOperationalStore({
    workspaceRoot: temporaryWorkspace("published-url-observation-matrix"),
  });
  try {
    for (const code of [0, 1, 4, 9]) {
      const orderId = createOrder(store, `published-url-${code}`, "submitted");
      const url = `https://publisher.example/article/persistent-${code}`;
      await assert.rejects(
        () => observe(store, orderId, { status: 2, order_url: url }),
        { code: "MEDIA_ORDER_SYNC_FAILED" },
      );
      await observe(store, orderId, { status: code });

      const view = createMediaOrderService({
        operationalStore: store,
        allowedPublishedUrlHosts: ["publisher.example"],
      })
        .listOrderViews()
        .find((order) => order.orderNid === orderId);
      assert.deepEqual(
        [
          store.listRemoteOrders().find((order) => order.orderId === orderId)
            .status,
          view.statusCode,
          view.hasPublishedUrl,
        ],
        [code === 4 ? "failed" : "submitted", String(code), false],
      );

      const opened = [];
      const service = createMediaOrderService({
        operationalStore: store,
        allowedPublishedUrlHosts: ["publisher.example"],
        openExternal: async (target) => opened.push(target),
      });
      await assert.rejects(() => service.openPublishedUrl(orderId), {
        code: "MEDIA_ORDER_NOT_PUBLISHED",
      });
      assert.deepEqual(opened, []);
    }
  } finally {
    store.close();
  }
});

test("supplier observation survives restart, backup, and restored temporary SQLite", async () => {
  const workspaceRoot = temporaryWorkspace("supplier-persistence");
  let store = createOperationalStore({ workspaceRoot });
  const orderId = createOrder(store, "persistent", "submitted");
  await observe(store, orderId, { status: 1 });
  const backupPath = path.join(workspaceRoot, "supplier.backup.sqlite");
  store.backup(backupPath);
  store.close();

  store = createOperationalStore({ workspaceRoot });
  try {
    assert.deepEqual(
      [
        orderMap(store).get(orderId).publicationStatus,
        orderMap(store).get(orderId).supplierStatusCode,
      ],
      ["submitted", "1"],
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
  const restored = createOperationalStore({ workspaceRoot: restoredRoot });
  try {
    const order = orderMap(restored).get(orderId);
    assert.deepEqual(
      [order.publicationStatus, order.supplierStatusCode],
      ["submitted", "1"],
    );
  } finally {
    restored.close();
  }
});

test("closed supplier success remains absent after restart, backup, and restore", async () => {
  const workspaceRoot = temporaryWorkspace("published-url-persistence");
  let store = createOperationalStore({ workspaceRoot });
  const orderId = createOrder(store, "published-url-persistence", "submitted");
  const url = "https://publisher.example/article/persistent-after-restore";
  await assert.rejects(
    () => observe(store, orderId, { status: 2, order_url: url }),
    { code: "MEDIA_ORDER_SYNC_FAILED" },
  );
  await observe(store, orderId, { status: 9 });
  const backupPath = path.join(workspaceRoot, "published-url.backup.sqlite");
  store.backup(backupPath);
  store.close();

  store = createOperationalStore({ workspaceRoot });
  try {
    const opened = [];
    const service = createMediaOrderService({
      operationalStore: store,
      allowedPublishedUrlHosts: ["publisher.example"],
      openExternal: async (target) => opened.push(target),
    });
    assert.equal(service.listOrderViews()[0].hasPublishedUrl, false);
    await assert.rejects(() => service.openPublishedUrl(orderId), {
      code: "MEDIA_ORDER_NOT_PUBLISHED",
    });
    assert.deepEqual(opened, []);
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
  const restored = createOperationalStore({ workspaceRoot: restoredRoot });
  try {
    const opened = [];
    const service = createMediaOrderService({
      operationalStore: restored,
      allowedPublishedUrlHosts: ["publisher.example"],
      openExternal: async (target) => opened.push(target),
    });
    assert.equal(service.listOrderViews()[0].hasPublishedUrl, false);
    await assert.rejects(() => service.openPublishedUrl(orderId), {
      code: "MEDIA_ORDER_NOT_PUBLISHED",
    });
    assert.deepEqual(opened, []);
  } finally {
    restored.close();
  }
});

test("real SQLite order projection hides and main rejects every unsafe published URL state", async () => {
  const workspaceRoot = temporaryWorkspace("published-url-fail-closed");
  let store = createOperationalStore({ workspaceRoot });
  const cases = [
    [
      "unpublished",
      "submitted",
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
    createOrder(store, `fail-closed-${suffix}`, "submitted");
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
        .prepare("UPDATE publication_records SET status=? WHERE publication_id=?")
        .run(status, `publication-fail-closed-${suffix}`);
    }
  } finally {
    database.close();
  }

  store = createOperationalStore({ workspaceRoot });
  try {
    const opened = [];
    const service = createMediaOrderService({
      operationalStore: store,
      allowedPublishedUrlHosts: ["publisher.example"],
      openExternal: async (target) => opened.push(target),
    });
    const views = new Map(
      service.listOrderViews().map((order) => [order.orderNid, order]),
    );
    for (const [suffix, , , code] of cases) {
      const orderId = `order-fail-closed-${suffix}`;
      assert.equal(views.get(orderId).hasPublishedUrl, false, suffix);
      await assert.rejects(() => service.openPublishedUrl(orderId), { code });
    }
    assert.deepEqual(opened, []);
  } finally {
    store.close();
  }
});
