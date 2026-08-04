"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createDesktopPublisherRouter,
} = require("../desktop/services/desktop-publisher-router");
const {
  createWorkerPublisher,
} = require("../desktop/services/worker-publisher");
const { createMediaPublisher } = require("../desktop/services/media-publisher");
const domain = require("../src/domain");

function input(target) {
  return domain.parsePublishInput({
    version: 1,
    articleId: "article-1",
    attemptId: "attempt-1",
    target,
    title: "title",
    body: "body",
  });
}

test("desktop publisher router delegates platform and media targets to their production owners", async () => {
  const calls = [];
  const workerPublisher = {
    inspectAccount: async () => ({
      verified: true,
      accountProfileId: "account-1",
    }),
    publish: async (value) => {
      calls.push(["worker", value.target.kind]);
      return { status: "published", evidence: { remoteId: "platform-1" } };
    },
  };
  const mediaPublisher = {
    inspectAccount: async () => ({ verified: false }),
    publish: async (value) => {
      calls.push(["media", value.target.kind]);
      return { status: "submitted", evidence: { remoteId: "media-1" } };
    },
  };
  const router = createDesktopPublisherRouter({
    workerPublisher,
    mediaPublisher,
  });

  assert.equal(Object.isFrozen(router), true);
  assert.deepEqual(
    await router.publish(
      input({
        kind: "platform",
        platformId: "toutiao",
        accountProfileId: "account-1",
      }),
    ),
    { status: "published", evidence: { remoteId: "platform-1" } },
  );
  assert.deepEqual(
    await router.publish(
      input({ kind: "media", mediaResourceId: "resource-1" }),
    ),
    { status: "submitted", evidence: { remoteId: "media-1" } },
  );
  assert.deepEqual(calls, [
    ["worker", "platform"],
    ["media", "media"],
  ]);
  assert.deepEqual(await router.inspectAccount(), {
    verified: true,
    accountProfileId: "account-1",
  });
});

test("desktop publisher owners preserve remote evidence and target-specific outcomes", async () => {
  const workerPublisher = createWorkerPublisher({
    taskService: {
      startPlatformSubmit: async () => ({
        ok: true,
        data: {
          results: [
            {
              outcome: {
                status: "published",
                remoteId: "platform-remote-1",
                remoteUrl: "https://platform.example/article-1",
              },
            },
          ],
        },
      }),
    },
    inspectAccount: async () => ({
      verified: true,
      accountProfileId: "account-1",
    }),
  });
  workerPublisher.registerAttempt("attempt-1", {
    targetPlatformId: "toutiao",
    accountProfileId: "account-1",
  });
  const mediaPublisher = createMediaPublisher({
    clientProvider: () => ({
      sendArticle: async () => ({
        ok: true,
        data: { order_nid: "media-order-1" },
      }),
    }),
  });
  const router = createDesktopPublisherRouter({
    workerPublisher,
    mediaPublisher,
  });

  const platform = await router.publish(
    input({
      kind: "platform",
      platformId: "toutiao",
      accountProfileId: "account-1",
    }),
  );
  const media = await router.publish(
    input({ kind: "media", mediaResourceId: "resource-1" }),
  );

  assert.equal(platform.status, "published");
  assert.equal(platform.evidence.remoteId, "platform-remote-1");
  assert.equal(media.status, "submitted");
  assert.equal(media.evidence.remoteId, "media-order-1");
});
