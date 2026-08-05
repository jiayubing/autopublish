"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { MediaClient } = require("../src/platforms/media/media-client");
const { createMediaSupplierAdapter } = require("../src/platforms/media/media-supplier-adapter");

function jsonResponse(value) {
  return { ok: true, status: 200, text: async () => JSON.stringify(value) };
}

test("MediaClient exposes supplier ports with the documented multipart field mapping", async () => {
  const requests = [];
  const client = new MediaClient({
    apiKey: "fixture-key",
    baseUrl: "https://media.example.test",
    fetch: async (url, options) => {
      requests.push({ url, options, body: options.body.toString("utf8") });
      return jsonResponse({ code: 0, data: { order_nid: "order-1" } });
    },
  });

  await client.refreshMediaResources({ page: 2, pageSize: 30 });
  await client.createOrder({
    mediaResourceId: "resource-1",
    title: "保存的标题",
    htmlBody: "<p>保存的正文</p>",
    remark: "编辑备注",
    systemSubmissionId: "system-submission-1",
  });
  await client.getOrderDetails(["order-1", "order-2"]);
  await client.cancelOrder("order-1");

  assert.deepEqual(requests.map((request) => request.url), [
    "https://media.example.test/api/media/media_list",
    "https://media.example.test/api/media/send",
    "https://media.example.test/api/media/order_info",
    "https://media.example.test/api/media/order_cancel",
  ]);
  assert.match(requests[0].body, /name="page"\r?\n\r?\n2/);
  assert.match(requests[0].body, /name="page_size"\r?\n\r?\n30/);
  assert.match(requests[1].body, /name="resource_id"\r?\n\r?\nresource-1/);
  assert.match(requests[1].body, /name="title"\r?\n\r?\n保存的标题/);
  assert.match(requests[1].body, /name="content"\r?\n\r?\n<p>保存的正文<\/p>/);
  assert.match(requests[1].body, /name="remark"\r?\n\r?\n编辑备注/);
  assert.match(requests[1].body, /name="third_id"\r?\n\r?\nsystem-submission-1/);
  assert.doesNotMatch(requests[1].body, /idempotency|idempotency_key/i);
  assert.match(requests[2].body, /name="order_nids\[\]"\r?\n\r?\norder-1/);
  assert.match(requests[2].body, /name="order_nids\[\]"\r?\n\r?\norder-2/);
  assert.match(requests[3].body, /name="order_nid"\r?\n\r?\norder-1/);
});

test("MediaClient rejects an empty order query or cancellation id before transport", async () => {
  let requests = 0;
  const client = new MediaClient({
    apiKey: "fixture-key",
    baseUrl: "https://media.example.test",
    fetch: async () => {
      requests += 1;
      return jsonResponse({ code: 0, data: [] });
    },
  });

  await assert.rejects(client.getOrderDetails([]), /缺少 order_nids/);
  await assert.rejects(client.cancelOrder(""), /缺少 order_nid/);
  assert.equal(requests, 0);
});

test("the supplier adapter keeps explicit HTTP rejection distinct from protocol and transport uncertainty", async () => {
  const rejectedClient = new MediaClient({
    apiKey: "fixture-key",
    baseUrl: "https://media.example.test",
    fetch: async () => ({ ok: false, status: 400, text: async () => "provider rejected" }),
  });
  const rejected = createMediaSupplierAdapter({ client: rejectedClient });

  assert.deepEqual(await rejected.createOrder({
    mediaResourceId: "resource-1",
    title: "标题",
    htmlBody: "<p>正文</p>",
    systemSubmissionId: "system-1",
  }), { kind: "order_rejected", scope: "service" });
  assert.deepEqual(await rejected.cancelOrder("order-1"), {
    kind: "cancel_rejected",
    orderId: "order-1",
    scope: "order",
  });

  const protocolClient = new MediaClient({
    apiKey: "fixture-key",
    baseUrl: "https://media.example.test",
    fetch: async () => ({ ok: true, status: 200, text: async () => "not-json" }),
  });
  const protocol = await createMediaSupplierAdapter({ client: protocolClient }).createOrder({
    mediaResourceId: "resource-1",
    title: "标题",
    htmlBody: "<p>正文</p>",
    systemSubmissionId: "system-1",
  });
  assert.equal(protocol.kind, "uncertain");
  assert.equal(protocol.reason, "protocol");
  assert.equal(protocol.error.code, "MEDIA_PROTOCOL_ERROR");
});
