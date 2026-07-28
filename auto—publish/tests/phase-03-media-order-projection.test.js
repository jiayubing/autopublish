"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createMediaOrderService,
} = require("../desktop/services/media-order-service");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");

test("media order service has no implicit legacy publication ledger factory", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "desktop", "services", "media-order-service.js"),
    "utf8",
  );
  assert.doesNotMatch(source, /createPublicationLedger/);
});

test("media order views use OperationalStore order projections when supplied", () => {
  let readLegacy = false;
  const service = createMediaOrderService({
    storePath: "Z:\\must-not-be-read.jsonl",
    operationalStore: {
      listRemoteOrders: () => [
        {
          orderId: "order-1",
          orderNid: "order-1",
          publicationId: "publication-1",
          attemptId: "attempt-1",
          mediaResourceId: "resource-1",
          status: "submitted",
          createdAt: "2026-07-25T00:00:00.000Z",
        },
      ],
    },
  });
  const view = service.listOrderViews()[0];
  assert.equal(readLegacy, false);
  assert.deepEqual(
    [view.orderNid, view.publicationId, view.resourceId, view.statusCode],
    ["order-1", "publication-1", "resource-1", "0"],
  );
});

test("media order views join the immutable submission display snapshot without inventing settlement data", () => {
  const service = createMediaOrderService({
    operationalStore: {
      listRemoteOrders: () => [
        {
          orderId: "order-1",
          publicationId: "publication-1",
          attemptId: "attempt-1",
          articleId: "article-1",
          mediaResourceId: "resource-1",
          status: "submitted",
          createdAt: "2026-07-28T00:00:00.000Z",
        },
      ],
      listSubmissionBatches: () => [
        {
          batchId: "batch-1",
          items: [
            {
              articleId: "article-1",
              targetKey: "media-resource:resource-1",
              payload: {
                attemptId: "attempt-1",
                titleSnapshot: "已保存的投稿标题",
                filename: "article-1.md",
                resourceNameSnapshot: "媒体甲",
                quotedPrice: 12.5,
              },
            },
          ],
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
      view.statusLabel,
    ],
    ["已保存的投稿标题", "article-1.md", "媒体甲", "12.5", "0", "待安排"],
  );
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
      listRemoteOrders: () =>
        statuses.map(([remoteStatusCode], index) => ({
          orderId: `order-${index}`,
          attemptId: `attempt-${index}`,
          status:
            remoteStatusCode === "2"
              ? "published"
              : remoteStatusCode === "4"
                ? "failed"
                : remoteStatusCode === "9"
                  ? "uncertain"
                  : "submitted",
          remoteStatusCode,
        })),
    },
  });

  assert.deepEqual(
    service
      .listOrderViews()
      .map((order) => [order.statusCode, order.statusLabel]),
    statuses,
  );
});

test("OperationalStore media order sync never writes the retired JSONL history", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase-03-order-sync-"));
  const storePath = path.join(root, "submission-orders.jsonl");
  fs.writeFileSync(storePath, '{"legacy":true}\n');
  const service = createMediaOrderService({
    storePath,
    operationalStore: { listRemoteOrders: () => [] },
    clientProvider: () => ({ orderInfo: async () => ({ data: [] }) }),
  });
  await service.syncOrder("order-1");
  assert.equal(fs.readFileSync(storePath, "utf8"), '{"legacy":true}\n');
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
      [view.statusCode, view.statusLabel, view.publicationStatus],
      ["1", "已安排", "submitted"],
    );
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
      remoteStatusCode: "2",
      remoteUrl: "https://publisher.example/article/1",
    },
    {
      orderId: "order-pending",
      attemptId: "attempt-pending",
      status: "submitted",
      remoteStatusCode: "0",
      remoteUrl: null,
    },
    {
      orderId: "order-unsafe-url",
      attemptId: "attempt-unsafe-url",
      status: "published",
      remoteStatusCode: "2",
      remoteUrl: "http://publisher.example/article/unsafe",
    },
  ];
  const service = createMediaOrderService({
    operationalStore: { listRemoteOrders: () => orders },
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
  assert.deepEqual(opened, ["https://publisher.example/article/1"]);
});
