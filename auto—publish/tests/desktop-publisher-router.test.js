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
      return { status: "accepted", evidence: { remoteId: "platform-1" } };
    },
  };
  const mediaPublisher = {
    inspectAccount: async () => ({ verified: false }),
    publish: async (value) => {
      calls.push(["media", value.target.kind]);
      return { kind: "order_created", orderId: "media-1" };
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
    { status: "accepted", evidence: { remoteId: "platform-1" } },
  );
  assert.deepEqual(
    await router.publish(
      input({ kind: "media", mediaResourceId: "resource-1" }),
    ),
    { kind: "order_created", orderId: "media-1" },
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
                status: "accepted",
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
  let receivedSupplierInput;
  const systemSubmissionId = "system-submission-router-1";
  const mediaPublisher = createMediaPublisher({
    systemSubmissionIdProvider: () => systemSubmissionId,
    supplierProvider: () => ({
      createOrder: async (value) => {
        receivedSupplierInput = value;
        return { kind: "order_created", orderId: "media-order-1" };
      },
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

  assert.equal(platform.status, "accepted");
  assert.equal(platform.evidence.remoteId, "platform-remote-1");
  assert.equal(media.kind, "order_created");
  assert.equal(media.orderId, "media-order-1");
  assert.equal(receivedSupplierInput.systemSubmissionId, systemSubmissionId);
  assert.notEqual(receivedSupplierInput.systemSubmissionId, "attempt-1");
});

test("desktop publisher router fails closed before supplier transport when the global media submission id is missing", async () => {
  let supplierProviderCalls = 0;
  let createOrderCalls = 0;
  const mediaPublisher = createMediaPublisher({
    supplierProvider: () => {
      supplierProviderCalls += 1;
      return {
        createOrder: async () => {
          createOrderCalls += 1;
          return { kind: "order_created", orderId: "must-not-exist" };
        },
      };
    },
  });
  const router = createDesktopPublisherRouter({
    workerPublisher: { publish: async () => ({ status: "accepted" }) },
    mediaPublisher,
  });

  const result = await router.publish(
    input({ kind: "media", mediaResourceId: "resource-1" }),
  );

  assert.equal(result.kind, "order_rejected");
  assert.equal(result.error.code, "MEDIA_SYSTEM_SUBMISSION_ID_REQUIRED");
  assert.equal(supplierProviderCalls, 0);
  assert.equal(createOrderCalls, 0);
});
