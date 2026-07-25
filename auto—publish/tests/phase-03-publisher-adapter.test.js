"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const domain = require("../src/domain");
const {
  createLegacyAdapterPublisher,
} = require("../src/infrastructure/publishers/legacy-adapter-publisher");
const {
  createPublisherRouter,
} = require("../src/infrastructure/publishers/publisher-router");
const input = {
  version: 1,
  articleId: "article-1",
  attemptId: "attempt-1",
  target: {
    kind: "platform",
    platformId: "toutiao",
    accountProfileId: "account-1",
  },
  title: "title",
  body: "body",
};
test("final Publisher adapter never upgrades weak legacy success to published", async () => {
  const publisher = createLegacyAdapterPublisher({
    adapter: {
      id: "toutiao",
      publishArticle: async () => ({ status: "published" }),
    },
  });
  assert.equal(
    (
      await publisher.publish(
        domain.parsePublishInput(input),
        new AbortController().signal,
      )
    ).status,
    "uncertain",
  );
});
test("final Publisher adapter preserves a pre-remote rejection as failed", async () => {
  const publisher = createLegacyAdapterPublisher({
    adapter: {
      id: "toutiao",
      publishArticle: async () => ({
        status: "failed",
        errorCode: "LOGIN_REQUIRED",
      }),
    },
  });
  assert.equal(
    (
      await publisher.publish(
        domain.parsePublishInput(input),
        new AbortController().signal,
      )
    ).status,
    "failed",
  );
});
test("Publisher router keeps a media resource target distinct from a platform target", async () => {
  const publisher = createPublisherRouter({
    adapters: {
      media: {
        id: "media",
        publishArticle: async () => ({
          status: "failed",
          errorCode: "MEDIA_REJECTED",
        }),
      },
    },
  });
  const media = domain.parsePublishInput({
    ...input,
    target: { kind: "media", mediaResourceId: "resource-1" },
  });
  assert.equal(
    (await publisher.publish(media, new AbortController().signal)).error.code,
    "MEDIA_REJECTED",
  );
});
