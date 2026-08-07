"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createMediaOrderService,
} = require("../desktop/services/media-order-service");

function transitions(overrides) {
  return {
    listOrderObservationViews: () => [],
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
    ...(overrides || {}),
  };
}

test("media order service requires only the order observation capability", () => {
  assert.throws(() => createMediaOrderService(), {
    code: "MEDIA_ORDER_STORE_REQUIRED",
  });
  assert.throws(
    () => createMediaOrderService({ orderObservationTransitions: {} }),
    { code: "MEDIA_ORDER_TRANSITIONS_REQUIRED" },
  );
});

test("order projection defaults to pending, sorts upstream creation facts, and exposes no workflow identity", () => {
  const service = createMediaOrderService({
    orderObservationTransitions: transitions({
      listOrderObservationViews: () => [
        {
          orderId: "order-1",
          title: "标题",
          filename: "article.md",
          resourceName: "媒体",
          quotedPrice: 12.5,
          createdAt: "2026-08-08T00:00:01.000Z",
          submittedAt: "2026-08-08T00:00:00.000Z",
          statusCode: "",
          publishedAt: null,
          remoteUrl: null,
          actualAmount: null,
          anomaly: null,
        },
      ],
    }),
  });
  const view = service.listOrderViews()[0];
  assert.deepEqual(
    [view.orderNid, view.statusCode, view.price, view.createdAt],
    ["order-1", "0", "12.5", "2026-08-08T00:00:01.000Z"],
  );
  for (const key of ["attemptId", "publicationId", "articleId", "raw"])
    assert.equal(key in view, false, key);
});

test("single sync maps canonical supplier observations and keeps raw supplier fields out", async () => {
  const writes = [];
  const service = createMediaOrderService({
    orderObservationTransitions: transitions({
      recordOrderObservation: (input) => {
        writes.push(input);
        return { status: "saved" };
      },
    }),
    supplierProvider: () => ({
      getOrderDetails: async () => ({
        kind: "order_details",
        orders: [
          {
            orderId: "order-1",
            status: "scheduled",
            actualAmount: 11.5,
            supplierSecret: "must-not-cross",
          },
        ],
      }),
    }),
    clock: () => new Date("2026-08-08T01:00:00.000Z"),
  });
  await service.syncOrder("order-1");
  const observation = writes[0].orderObservationV1;
  assert.deepEqual(
    [observation.statusCode, observation.actualAmount, observation.observedAt],
    ["1", 11.5, "2026-08-08T01:00:00.000Z"],
  );
  assert.equal(JSON.stringify(observation).includes("supplierSecret"), false);
});

test("transport failures preserve facts and explicit missing orders open anomaly", async () => {
  let anomaly = null;
  const state = { mode: "transport" };
  const service = createMediaOrderService({
    orderObservationTransitions: transitions({
      recordOrderStatusAnomaly: (input) => {
        anomaly = input;
        return input;
      },
    }),
    supplierProvider: () => ({
      getOrderDetails: async () => {
        if (state.mode === "transport") throw new Error("supplier secret");
        return { kind: "order_details", orders: [] };
      },
    }),
    clock: () => new Date("2026-08-08T01:00:00.000Z"),
  });
  await assert.rejects(() => service.syncOrder("order-1"), {
    code: "MEDIA_ORDER_SYNC_FAILED",
  });
  assert.equal(anomaly, null);
  state.mode = "missing";
  await assert.rejects(() => service.syncOrder("order-1"), {
    code: "MEDIA_ORDER_STATUS_ANOMALY",
  });
  assert.deepEqual(
    [anomaly.orderId, anomaly.reason],
    ["order-1", "order-missing"],
  );
});

test("published links use the supplier-returned article site rather than the API endpoint host and preserve ordinary queries", async () => {
  const opened = [];
  const articleUrl =
    "https://news.publisher-site.example/article/42?id=42&utm_source=autopublish";
  const service = createMediaOrderService({
    orderObservationTransitions: transitions({
      listOrderObservationViews: () => [
        {
          orderId: "order-1",
          statusCode: "2",
          remoteUrl: articleUrl,
        },
      ],
      getOrderObservationContext: () => ({
        orderSnapshotFingerprint: "a".repeat(64),
        remoteUrl: articleUrl,
      }),
    }),
    supplierProvider: () => ({
      endpointPolicy: { hostname: "api.supplier.example" },
    }),
    openExternal: async (url) => opened.push(url),
  });
  await service.openPublishedUrl("order-1");
  assert.deepEqual(opened, [articleUrl]);
});

test("published-link opening still rejects unsafe protocols, credentials, fragments, and sensitive query keys", async () => {
  const unsafe = [
    "http://publisher.example/article",
    "https://user:secret@publisher.example/article",
    "https://publisher.example/article#access-token",
    "https://publisher.example/article?api_key=secret",
  ];
  for (const remoteUrl of unsafe) {
    const service = createMediaOrderService({
      orderObservationTransitions: transitions({
        listOrderObservationViews: () => [
          { orderId: "order-unsafe", statusCode: "2", remoteUrl },
        ],
        getOrderObservationContext: () => ({
          orderSnapshotFingerprint: "a".repeat(64),
          remoteUrl,
        }),
      }),
      openExternal: async () => assert.fail("unsafe URL must not be opened"),
    });
    await assert.rejects(() => service.openPublishedUrl("order-unsafe"), {
      code: "MEDIA_ORDER_URL_UNAVAILABLE",
    });
  }
});
