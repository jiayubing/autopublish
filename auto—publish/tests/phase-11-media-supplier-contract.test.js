"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createMediaSupplierAdapter,
} = require("../src/platforms/media/media-supplier-adapter");
const { createMediaPublisher } = require("../desktop/services/media-publisher");
const { createMediaOrderService } = require("../desktop/services/media-order-service");
const { createMediaResourceService } = require("../desktop/services/media-resource-service");

function successful(value) {
  return { code: 0, data: value };
}

test("refreshMediaResources maps supplier resource fields into a closed DTO", async () => {
  const adapter = createMediaSupplierAdapter({
    client: {
      refreshMediaResources: async (input) => {
        assert.deepEqual(input, { page: 2, pageSize: 20 });
        return successful({
          list: [
            {
              resource_id: "resource-1",
              title: "媒体甲",
              price: "12.50",
              is_open: 1,
              remark: "只收工作日稿件",
              provider_only: "must not escape",
            },
          ],
          total: 1,
        });
      },
    },
  });

  const result = await adapter.refreshMediaResources({ page: 2, pageSize: 20 });

  assert.deepEqual(result, {
    kind: "resources_refreshed",
    resources: [
      {
        resourceId: "resource-1",
        name: "媒体甲",
        price: 12.5,
        available: true,
        remarks: "只收工作日稿件",
      },
    ],
    page: 2,
    pageSize: 20,
    total: 1,
  });
  assert.equal(Object.hasOwn(result.resources[0], "provider_only"), false);
  assert.equal(Object.hasOwn(result.resources[0], "resource_id"), false);
});

test("createOrder maps the canonical application input and returns an order only with explicit success and an order id", async () => {
  let received;
  const adapter = createMediaSupplierAdapter({
    client: {
      createOrder: async (input) => {
        received = input;
        return successful({ order_nid: "order-1" });
      },
    },
  });

  const result = await adapter.createOrder({
    mediaResourceId: "resource-1",
    title: "保存的标题",
    htmlBody: "<p>保存的正文</p>",
    remark: "编辑备注",
    systemSubmissionId: "system-submission-1",
  });

  assert.deepEqual(received, {
    mediaResourceId: "resource-1",
    title: "保存的标题",
    htmlBody: "<p>保存的正文</p>",
    remark: "编辑备注",
    systemSubmissionId: "system-submission-1",
  });
  assert.deepEqual(result, { kind: "order_created", orderId: "order-1" });
  assert.equal(Object.hasOwn(result, "thirdId"), false);
});

test("createOrder turns a missing order id into an uncertain result instead of inventing an order", async () => {
  const adapter = createMediaSupplierAdapter({
    client: {
      createOrder: async () => successful({ accepted: true }),
    },
  });

  assert.deepEqual(
    await adapter.createOrder({
      mediaResourceId: "resource-1",
      title: "标题",
      htmlBody: "<p>正文</p>",
      systemSubmissionId: "system-submission-1",
    }),
    { kind: "uncertain", reason: "missing-order-id" },
  );
});

test("createOrder preserves transport uncertainty without exposing provider error text", async () => {
  const adapter = createMediaSupplierAdapter({
    client: {
      createOrder: async () => {
        throw Object.assign(new Error("private upstream response"), {
          code: "MEDIA_READ_TIMEOUT",
        });
      },
    },
  });

  const result = await adapter.createOrder({
    mediaResourceId: "resource-1",
    title: "标题",
    htmlBody: "<p>正文</p>",
    systemSubmissionId: "system-submission-1",
  });

  assert.deepEqual(result, {
    kind: "uncertain",
    reason: "transport",
    error: {
      code: "MEDIA_READ_TIMEOUT",
      scope: "transport",
      retryability: "manual-check",
    },
  });
  assert.equal(JSON.stringify(result).includes("private upstream response"), false);
});

test("getOrderDetails maps all supported status codes and keeps unknown status closed", async () => {
  const adapter = createMediaSupplierAdapter({
    client: {
      getOrderDetails: async (orderIds) => {
        assert.deepEqual(orderIds, ["order-0", "order-1", "order-2", "order-4", "order-9", "order-x"]);
        return successful([
          { order_nid: "order-0", status: 0, resource_id: "resource-1" },
          { order_nid: "order-1", status: 1, resource_id: "resource-1" },
          { order_nid: "order-2", status: 2, resource_id: "resource-1" },
          { order_nid: "order-4", status: 4, resource_id: "resource-1" },
          { order_nid: "order-9", status: 9, resource_id: "resource-1" },
          { order_nid: "order-x", status: 99, resource_id: "resource-1" },
        ]);
      },
    },
  });

  const result = await adapter.getOrderDetails([
    "order-0",
    "order-1",
    "order-2",
    "order-4",
    "order-9",
    "order-x",
  ]);

  assert.deepEqual(result, {
    kind: "order_details",
    orders: [
      { orderId: "order-0", status: "pending", resourceId: "resource-1" },
      { orderId: "order-1", status: "scheduled", resourceId: "resource-1" },
      { orderId: "order-2", status: "published", resourceId: "resource-1" },
      { orderId: "order-4", status: "rejected", resourceId: "resource-1" },
      { orderId: "order-9", status: "aftercare", resourceId: "resource-1" },
      { orderId: "order-x", status: "unknown", resourceId: "resource-1" },
    ],
  });
  assert.equal(Object.hasOwn(result.orders[0], "statusCode"), false);
});

test("cancelOrder distinguishes explicit success, remote rejection, and transport uncertainty", async () => {
  const calls = [];
  const adapter = createMediaSupplierAdapter({
    client: {
      cancelOrder: async (orderId) => {
        calls.push(orderId);
        if (orderId === "order-rejected") return { code: 400, message: "private rejection" };
        if (orderId === "order-unknown") throw Object.assign(new Error("network details"), { code: "MEDIA_NETWORK_ERROR" });
        return successful({ order_nid: orderId, cancelled: true });
      },
    },
  });

  assert.deepEqual(await adapter.cancelOrder("order-1"), {
    kind: "order_cancelled",
    orderId: "order-1",
  });
  assert.deepEqual(await adapter.cancelOrder("order-rejected"), {
    kind: "cancel_rejected",
    orderId: "order-rejected",
    scope: "order",
  });
  assert.deepEqual(await adapter.cancelOrder("order-unknown"), {
    kind: "uncertain",
    reason: "transport",
    error: {
      code: "MEDIA_NETWORK_ERROR",
      scope: "transport",
      retryability: "manual-check",
    },
  });
  assert.deepEqual(calls, ["order-1", "order-rejected", "order-unknown"]);
});

test("the application publisher can consume the supplier port without reading provider response fields", async () => {
  let received;
  const publisher = createMediaPublisher({
    supplierProvider: () => ({
      createOrder: async (input) => {
        received = input;
        return { kind: "order_created", orderId: "order-application-1" };
      },
    }),
    systemSubmissionIdProvider: () => "system-submission-application-1",
  });

  const result = await publisher.publish({
    articleId: "article-1",
    attemptId: "attempt-1",
    target: { kind: "media", mediaResourceId: "resource-1" },
    title: "标题",
    body: "<p>正文</p>",
  });

  assert.deepEqual(received, {
    mediaResourceId: "resource-1",
    title: "标题",
    htmlBody: "<p>正文</p>",
    systemSubmissionId: "system-submission-application-1",
  });
  assert.deepEqual(result, {
    status: "submitted",
    evidence: {
      articleId: "article-1",
      attemptId: "attempt-1",
      targetKey: "media-resource:resource-1",
      remoteId: "order-application-1",
    },
  });
});

test("the application publisher keeps supplier identity-provider failures uncertain", async () => {
  let called = false;
  const publisher = createMediaPublisher({
    supplierProvider: () => {
      called = true;
      return { createOrder: async () => ({ kind: "order_created", orderId: "order-should-not-exist" }) };
    },
    systemSubmissionIdProvider: () => {
      throw new Error("private configuration detail");
    },
  });

  const result = await publisher.publish({
    articleId: "article-1",
    attemptId: "attempt-1",
    target: { kind: "media", mediaResourceId: "resource-1" },
    title: "标题",
    body: "<p>正文</p>",
  });

  assert.deepEqual(result, {
    status: "uncertain",
    error: {
      code: "MEDIA_REMOTE_UNCERTAIN",
      category: "transport",
      retryability: "manual-check",
      userMessage: "无法确认媒体投稿结果",
    },
  });
  assert.equal(called, false);
});

test("the application order service consumes canonical order details from the supplier port", async () => {
  const observations = [];
  const service = createMediaOrderService({
    clientProvider: () => {
      throw new Error("legacy client must not be constructed");
    },
    operationalStore: {
      listOrderDisplayViews: () => [],
      recordRemoteOrderObservation: (input) => observations.push(input),
    },
    supplierProvider: () => ({
      getOrderDetails: async (orderIds) => {
        assert.deepEqual(orderIds, ["order-2"]);
        return {
          kind: "order_details",
          orders: [{
            orderId: "order-2",
            status: "published",
            resourceId: "resource-1",
            remoteUrl: "https://publisher.example/article-2",
            publishedAt: "2026-08-05T12:00:00.000Z",
          }],
        };
      },
    }),
  });

  await service.syncOrder("order-2");

  assert.deepEqual(observations, [{
    orderId: "order-2",
    observation: {
      statusCode: "2",
      remoteUrl: "https://publisher.example/article-2",
      publishedAt: "2026-08-05T12:00:00.000Z",
    },
  }]);
});

test("the application resource service refreshes through the canonical supplier port", async () => {
  const writes = [];
  const service = createMediaResourceService({
    resourceStore: {
      getAll: () => null,
      setAll: (resources, meta) => writes.push({ resources, meta }),
    },
    supplierProvider: () => ({
      refreshMediaResources: async (input) => {
        assert.deepEqual(input, { page: 1, pageSize: 2 });
        return {
          kind: "resources_refreshed",
          resources: [{
            resourceId: "resource-1",
            name: "媒体甲",
            price: 12.5,
            available: true,
            remarks: "备注",
          }],
          page: 1,
          pageSize: 2,
          total: 1,
        };
      },
    }),
  });

  const result = await service.refreshResources({ fetchAll: false, pageSizeHint: 2 });

  assert.equal(result.ok, true);
  assert.equal(writes[0].resources[0].resourceId, "resource-1");
  assert.equal(writes[0].resources[0].remarks, "备注");
});
