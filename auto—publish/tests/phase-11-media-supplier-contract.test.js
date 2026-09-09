"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createMediaSupplierAdapter,
} = require("../src/platforms/media/media-supplier-adapter");
const {
  parseOrderDetailsResponse,
  parseResourceResponse,
} = require("../src/platforms/media/media-supplier-response");
const {
  createMediaOrderService,
} = require("../desktop/services/media-order-service");
const {
  createMediaResourceService,
} = require("../desktop/services/media-resource-service");

function successful(value) {
  return { code: 0, data: value };
}

function resourceSuccessful(value) {
  return { code: 1, msg: "success", time: "0", data: value };
}

test("refreshMediaResources maps supplier resource fields into a closed DTO", async () => {
  const adapter = createMediaSupplierAdapter({
    client: {
      refreshMediaResources: async (input) => {
        assert.deepEqual(input, { page: 2, pageSize: 20 });
        return resourceSuccessful([
            {
              resource_id: "resource-1",
              title: "媒体甲",
              price: "12.50",
              is_open: 1,
              remark: "只收工作日稿件",
              provider_only: "must not escape",
            },
          ]);
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
  });
  assert.equal(Object.hasOwn(result.resources[0], "provider_only"), false);
  assert.equal(Object.hasOwn(result.resources[0], "resource_id"), false);
});

test("refreshMediaResources accepts the documented successful paged data envelope", async () => {
  const adapter = createMediaSupplierAdapter({
      client: {
        refreshMediaResources: async () => ({
          code: 1,
          msg: "success",
          time: "0",
          data: [
          {
            resource_id: "resource-page-1",
            title: "分页媒体",
            available: false,
          },
        ],
        total: 3,
        hasNext: true,
      }),
    },
  });

  assert.deepEqual(
    await adapter.refreshMediaResources({ page: 2, pageSize: 1 }),
    {
      kind: "resources_refreshed",
      resources: [
        {
          resourceId: "resource-page-1",
          name: "分页媒体",
          price: null,
          available: false,
          remarks: "",
        },
      ],
      page: 2,
      pageSize: 1,
      total: 3,
      hasNext: true,
    },
  );
});

test("resource parser classifies only the documented failure code as remote rejection", () => {
  assert.throws(
    () => parseResourceResponse({ code: 0, msg: "rejected", data: [] }),
    (error) => error.code === "MEDIA_SUPPLIER_REJECTED",
  );

  assert.throws(
    () => parseResourceResponse({ code: 200, msg: "unsupported", data: [] }),
    (error) =>
      error.code === "MEDIA_SUPPLIER_PROTOCOL_ERROR" &&
      error.diagnostics.endpointPath === "/api/media/media_list" &&
      error.diagnostics.supplierCode === "200",
  );
});

test("malformed resource envelopes expose only a safe candidate-list schema summary", () => {
  assert.throws(
    () => parseResourceResponse({ code: 1, msg: "success", data: { list: [] } }),
    (error) =>
      error.code === "MEDIA_SUPPLIER_PROTOCOL_ERROR" &&
      error.diagnostics.dataType === "object" &&
      error.diagnostics.candidateListFields === "data.list" &&
      !JSON.stringify(error.diagnostics).includes("success"),
  );
});

test("generic order parser protocol errors do not claim the media-list endpoint", () => {
  assert.throws(
    () => parseOrderDetailsResponse({ data: {} }),
    (error) =>
      error.code === "MEDIA_SUPPLIER_PROTOCOL_ERROR" &&
      (!error.diagnostics || error.diagnostics.endpointPath !== "/api/media/media_list"),
  );
});

test("createOrder rejects invalid content and missing submission identity before transport", async () => {
  let calls = 0;
  const adapter = createMediaSupplierAdapter({ client: { createOrder: async () => { calls += 1; } } });
  const input = { mediaResourceId: "resource-1", title: "Title", htmlBody: "Body", systemSubmissionId: "system-1" };
  for (const change of [{ htmlBody: "x".repeat(2_000_001) }, { systemSubmissionId: "" }, { title: "" }, { mediaResourceId: "" }]) {
    const result = await adapter.createOrder({ ...input, ...change });
    assert.equal(result.kind, "invalid_input");
    assert.equal(result.error.code, "MEDIA_SUPPLIER_INPUT_INVALID");
    assert.equal(calls, 0);
  }
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

test("createOrder accepts the supplier code-1 success envelope when it carries an order id", async () => {
  const adapter = createMediaSupplierAdapter({
    client: {
      createOrder: async () =>
        resourceSuccessful({ order_nid: "order-provider-1" }),
    },
  });

  assert.deepEqual(
    await adapter.createOrder({
      mediaResourceId: "resource-1",
      title: "标题",
      htmlBody: "<p>正文</p>",
      systemSubmissionId: "system-submission-1",
    }),
    { kind: "order_created", orderId: "order-provider-1" },
  );
});

test("createOrder keeps code-1 responses without an order id uncertain and explicit failure dominant", async () => {
  const responses = [
    resourceSuccessful({ accepted: true }),
    {
      code: 1,
      success: false,
      data: { order_nid: "must-not-bind" },
    },
  ];
  const adapter = createMediaSupplierAdapter({
    client: {
      createOrder: async () => responses.shift(),
    },
  });
  const input = {
    mediaResourceId: "resource-1",
    title: "标题",
    htmlBody: "<p>正文</p>",
    systemSubmissionId: "system-submission-1",
  };

  assert.deepEqual(await adapter.createOrder(input), {
    kind: "uncertain",
    reason: "missing-order-id",
  });
  assert.deepEqual(await adapter.createOrder(input), {
    kind: "order_rejected",
    scope: "service",
  });
});

test("code-1 success is accepted for order details but does not relax cancellation", async () => {
  const adapter = createMediaSupplierAdapter({
    client: {
      getOrderDetails: async () =>
        resourceSuccessful([
          {
            order_nid: "order-1",
            status: 2,
            resource_id: "resource-1",
            title: "已发布标题",
          },
        ]),
      cancelOrder: async () => resourceSuccessful({ cancelled: true }),
    },
  });

  assert.deepEqual(await adapter.getOrderDetails(["order-1"]), {
    kind: "order_details",
    orders: [
      {
        orderId: "order-1",
        status: "published",
        resourceId: "resource-1",
        title: "已发布标题",
      },
    ],
  });
  assert.deepEqual(await adapter.cancelOrder("order-1"), {
    kind: "cancel_rejected",
    orderId: "order-1",
    scope: "order",
  });
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
  assert.equal(
    JSON.stringify(result).includes("private upstream response"),
    false,
  );
});

test("createOrder reports an unavailable supplier before transport as a definite configuration failure", async () => {
  const adapter = createMediaSupplierAdapter({});

  assert.deepEqual(
    await adapter.createOrder({
      mediaResourceId: "resource-1",
      title: "标题",
      htmlBody: "<p>正文</p>",
      systemSubmissionId: "system-submission-1",
    }),
    {
      kind: "configuration_error",
      error: {
        code: "MEDIA_SUPPLIER_PORT_UNAVAILABLE",
        scope: "validation",
        retryability: "manual-check",
      },
    },
  );
});

test("getOrderDetails maps all supported status codes and keeps unknown status closed", async () => {
  const adapter = createMediaSupplierAdapter({
    client: {
      getOrderDetails: async (orderIds) => {
        assert.deepEqual(orderIds, [
          "order-0",
          "order-1",
          "order-2",
          "order-4",
          "order-9",
          "order-x",
        ]);
        return successful([
          { order_nid: "order-0", status: 0, resource_id: "resource-1" },
          { order_nid: "order-1", status: 1, resource_id: "resource-1" },
          {
            order_nid: "order-2",
            status: 2,
            resource_id: "resource-1",
            actual_amount: 12.5,
          },
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
      {
        orderId: "order-2",
        status: "published",
        resourceId: "resource-1",
        actualAmount: 12.5,
      },
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
        if (orderId === "order-rejected")
          return { code: 400, message: "private rejection" };
        if (orderId === "order-unknown")
          throw Object.assign(new Error("network details"), {
            code: "MEDIA_NETWORK_ERROR",
          });
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

test("the application order service consumes canonical order details from the supplier port", async () => {
  const observations = [];
  const service = createMediaOrderService({
    orderObservationTransitions: {
      listOrderObservationViews: () => [],
      getOrderObservationContext: () => ({
        orderSnapshotFingerprint: "a".repeat(64),
        remoteUrl: null,
      }),
      recordOrderObservation: (input) => observations.push(input),
      recordOrderStatusAnomaly: () => ({}),
      prepareOrderStatusAnomalyResolution: () => ({}),
      resumeOrderTracking: () => ({}),
      confirmOrderPublished: () => ({}),
      confirmOrderNotPublished: () => ({}),
    },
    supplierProvider: () => ({
      getOrderDetails: async (orderIds) => {
        assert.deepEqual(orderIds, ["order-2"]);
        return {
          kind: "order_details",
          orders: [
            {
              orderId: "order-2",
              status: "published",
              resourceId: "resource-1",
              remoteUrl: "https://publisher.example/article-2",
              publishedAt: "2026-08-05T12:00:00.000Z",
            },
          ],
        };
      },
    }),
    clock: () => new Date("2026-08-05T12:05:00.000Z"),
  });

  await service.syncOrder("order-2");

  const observation = observations[0].orderObservationV1;
  assert.deepEqual(
    [
      observation.orderIdentityV1.orderId,
      observation.statusCode,
      observation.remoteUrl,
      observation.eventAt,
      observation.eventAtSource,
    ],
    [
      "order-2",
      "2",
      "https://publisher.example/article-2",
      "2026-08-05T12:00:00.000Z",
      "provider_event_time",
    ],
  );
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
          resources: [
            {
              resourceId: "resource-1",
              name: "媒体甲",
              price: 12.5,
              available: false,
              remarks: "备注",
            },
          ],
          page: 1,
          pageSize: 2,
          total: 1,
        };
      },
    }),
  });

  const result = await service.refreshResources({
    fetchAll: false,
    pageSizeHint: 2,
  });

  assert.equal(result.ok, true);
  assert.equal(writes[0].resources[0].resourceId, "resource-1");
  assert.equal(writes[0].resources[0].available, false);
  assert.equal(writes[0].resources[0].remarks, "备注");
});
