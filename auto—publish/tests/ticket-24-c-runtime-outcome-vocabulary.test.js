"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  deriveArticleLifecycle,
} = require("../src/content/article-lifecycle-projection");
const {
  publicationSummary,
} = require("../src/content/article-lifecycle-facts");

function lifecycleFacts(overrides) {
  return {
    article: {
      id: "article-1",
      clientId: "client-1",
      title: "完整标题",
      content: "完整正文",
      status: "saved",
    },
    publications: [],
    submissionItems: [],
    orders: [],
    attentionItems: [],
    removalTransactions: [],
    ...(overrides || {}),
  };
}

test("regular accepted is the publication success fact and legacy submitted is unknown", () => {
  assert.equal(
    publicationSummary(
      [
        {
          articleId: "article-1",
          status: "published",
          targetKey: "platform:p1",
        },
      ],
      [],
      [],
    ).status,
    "published",
  );
  const legacy = publicationSummary(
    [{ articleId: "article-1", status: "submitted", targetKey: "platform:p1" }],
    [],
    [],
  );
  assert.equal(legacy.status, "uncertain");
  assert.equal(legacy.published, 0);
  assert.equal(legacy.uncertain, true);
});

test("paid order facts project processing and published without a generic submitted state", () => {
  const target = {
    articleId: "article-1",
    targetKey: "media-resource:r1",
    mediaResourceId: "r1",
  };
  const processing = publicationSummary(
    [{ ...target, status: "remote_started" }],
    [{ ...target, orderId: "order-1", supplierStatusCode: "0" }],
    [],
  );
  assert.equal(processing.status, "paid_processing");

  const published = publicationSummary(
    [{ ...target, status: "remote_started" }],
    [
      { ...target, orderId: "order-1", supplierStatusCode: "0" },
      { ...target, orderId: "order-1", supplierStatusCode: "2" },
    ],
    [],
  );
  assert.equal(published.status, "published");
  assert.equal(published.published, 1);
});

test("projection keeps submission-in-progress, published, and uncertain frozen outcomes distinct", () => {
  const target = { targetKey: "media-resource:r1", mediaResourceId: "r1" };
  const processing = deriveArticleLifecycle(
    lifecycleFacts({
      publications: [
        { articleId: "article-1", ...target, status: "remote_started" },
      ],
      orders: [
        {
          articleId: "article-1",
          ...target,
          orderId: "order-1",
          supplierStatusCode: "1",
        },
      ],
    }),
  );
  assert.equal(processing.stage, "in_submission");

  const published = deriveArticleLifecycle(
    lifecycleFacts({
      publications: [
        { articleId: "article-1", ...target, status: "remote_started" },
      ],
      orders: [
        {
          articleId: "article-1",
          ...target,
          orderId: "order-1",
          supplierStatusCode: "2",
        },
      ],
    }),
  );
  assert.equal(published.stage, "published");

  const uncertain = deriveArticleLifecycle(
    lifecycleFacts({
      publications: [
        {
          articleId: "article-1",
          targetKey: "platform:p1",
          status: "uncertain",
        },
      ],
    }),
  );
  assert.equal(uncertain.stage, "in_submission");
  assert.deepEqual(uncertain.allowedBulkActions, ["view_submission"]);
});
