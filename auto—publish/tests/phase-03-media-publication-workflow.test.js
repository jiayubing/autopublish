"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createMediaPublisher } = require("../desktop/services/media-publisher");

test("media publisher emits the existing order-created outcome without an order JSON writer", async () => {
  const publisher = createMediaPublisher({
    thirdIdProvider: () => "system-submission-1",
    clientProvider: () => ({
      sendArticle: async (input) => {
        assert.deepEqual(input, {
          resourceId: "resource-1",
          title: "投稿标题",
          content: "<p>投稿正文</p>",
          thirdId: "system-submission-1",
        });
        return { data: { order_nid: "order-1" } };
      },
    }),
  });
  const outcome = await publisher.publish({
    articleId: "media-article",
    attemptId: "attempt-1",
    target: { kind: "media", mediaResourceId: "resource-1" },
    title: "投稿标题",
    body: "<p>投稿正文</p>",
  });
  assert.deepEqual(outcome, { kind: "order_created", orderId: "order-1" });
});

test("media publisher sends the reusable operator identity without replacing the internal attempt", async () => {
  const publisher = createMediaPublisher({
    thirdIdProvider: () => "长期第三方标识",
    clientProvider: () => ({
      sendArticle: async (input) => {
        assert.equal(input.thirdId, "长期第三方标识");
        return { data: { order_nid: "order-custom" } };
      },
    }),
  });

  const outcome = await publisher.publish({
    articleId: "media-article",
    attemptId: "attempt-internal-1",
    target: { kind: "media", mediaResourceId: "resource-1" },
    title: "投稿标题",
    body: "<p>投稿正文</p>",
  });

  assert.deepEqual(outcome, { kind: "order_created", orderId: "order-custom" });
});
