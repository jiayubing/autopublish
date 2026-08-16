"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSubmissionCenterSnapshot,
} = require("../desktop/services/submission-center-snapshot");
const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");

function regularGroup(clientId) {
  return {
    queueGroupId: "group-1",
    platformId: "lieju",
    accountProfileId: "account-1",
    imageCount: 0,
    imagePublishingSupported: false,
    runState: "paused",
    pauseIntent: "manual",
    manuallyPaused: true,
    current: null,
    remaining: [{
      itemId: "item-1",
      batchId: "batch-1",
      articleId: "article-1",
      articleRef: { clientId, articleId: "article-1" },
      articleSummary: { title: "安全标题", customerName: "安全客户" },
      regularPublicationAttemptId: "attempt-1",
      position: 1,
    }],
    actions: { canStart: true, canPause: false, reasonCode: null },
    revision: 1,
    createdAt: "2026-08-16T00:00:00.000Z",
    updatedAt: "2026-08-16T00:00:00.000Z",
  };
}

function paidBatch(clientId) {
  return {
    batchId: "paid-1",
    mediaResourceId: "media-1",
    status: "queued",
    pauseIntent: "manual",
    paused: true,
    runState: "paused",
    actions: { canStart: true, canPause: false, canCancelRemaining: true },
    articleCount: 1,
    mediaName: "媒体",
    createdOrderCount: 0,
    remainingCount: 1,
    currentItem: null,
    pauseReason: null,
    quotedPrice: 10,
    estimatedTotal: 10,
    createdAt: "2026-08-16T00:00:00.000Z",
    updatedAt: "2026-08-16T00:00:00.000Z",
    items: [{
      itemId: "paid-item-1",
      articleRef: { clientId, articleId: "article-2" },
      status: "queued",
      phase: "pending",
      title: "付费文章",
    }],
  };
}

function attentionItem(clientId) {
  return {
    attentionId: "attention-1",
    kind: "removal_needs_repair",
    owner: "article-removal-recovery",
    freeze: { article: true, reasonCode: "REMOVAL_NEEDS_REPAIR" },
    resolutionPriority: 10,
    safeFacts: { clientId, articleId: "article-3" },
    clientId,
    articleId: "article-3",
    platformId: "lieju",
    accountProfileId: "account-1",
    allowedActions: ["retry-removal"],
    message: "需要修复",
  };
}

function fixture(options = {}) {
  let revision = options.revision || 7;
  const calls = { revision: 0, regular: 0, paid: 0, attention: 0, transport: 0 };
  const service = createSubmissionCenterSnapshot({
    getRevision() {
      calls.revision += 1;
      if (Array.isArray(options.revisions) && options.revisions.length)
        return options.revisions.shift();
      return revision;
    },
    getWorkspaceRuntimeId: () => options.workspaceRuntimeId || "workspace-1",
    validateClient(clientId) {
      if (options.validateError) throw options.validateError;
      if (!options.clients?.includes(clientId) && clientId !== "client-1")
        throw Object.assign(new Error("missing"), { code: "CLIENT_NOT_FOUND" });
    },
    listRegularQueueGroups({ clientId }) {
      calls.regular += 1;
      return options.regular || [regularGroup(clientId)];
    },
    listPaidMediaBatches({ clientId }) {
      calls.paid += 1;
      return { items: options.paid || [paidBatch(clientId)] };
    },
    listAttention({ clientId }) {
      calls.attention += 1;
      return { revision, items: options.attention || [attentionItem(clientId)] };
    },
  });
  return { service, calls, setRevision(value) { revision = value; } };
}

test("combines badge and all sections at one revision and reuses the scoped cache", async () => {
  const { service, calls } = fixture();
  const first = await service.get({ clientId: "client-1" });
  assert.deepEqual(first.counts, {
    regularItems: 1,
    paidBatches: 1,
    attentionItems: 1,
    total: 3,
  });
  assert.equal(first.revision, 7);
  assert.equal(first.attention.items[0].targetLabel, "lieju / account-1");
  assert.throws(() => {
    first.regular.groups[0].remaining[0].articleSummary.title = "被调用方修改";
  }, TypeError);
  const second = await service.get({ clientId: "client-1" });
  assert.equal(second.regular.groups[0].remaining[0].articleSummary.title, "安全标题");
  assert.deepEqual(calls, { revision: 3, regular: 1, paid: 1, attention: 1, transport: 0 });
});

test("re-reads once when revision changes and fails closed when it changes again", async () => {
  const retrying = fixture({ revisions: [1, 2, 2, 2] });
  const snapshot = await retrying.service.get({ clientId: "client-1" });
  assert.equal(snapshot.revision, 2);
  assert.equal(retrying.calls.regular, 2);
  assert.equal(retrying.calls.paid, 2);
  assert.equal(retrying.calls.attention, 2);
  assert.ok(retrying.calls.revision <= 4);

  const stale = fixture({ revisions: [1, 2, 3, 4] });
  await assert.rejects(
    stale.service.get({ clientId: "client-1" }),
    { code: "SUBMISSION_CENTER_SNAPSHOT_STALE" },
  );
  assert.equal(stale.calls.regular, 2);
});

test("isolates client scope and rejects cross-client facts", async () => {
  const invalidClient = fixture();
  await assert.rejects(
    invalidClient.service.get({ clientId: "client-2" }),
    { code: "SUBMISSION_CENTER_CLIENT_INVALID" },
  );
  assert.equal(invalidClient.calls.regular, 0);

  const crossClient = fixture({
    regular: [regularGroup("client-2")],
  });
  await assert.rejects(
    crossClient.service.get({ clientId: "client-1" }),
    { code: "SUBMISSION_CENTER_SNAPSHOT_INVALID" },
  );
});

test("distinguishes an unknown client from a client-store read failure", async () => {
  const storeFailure = fixture({
    validateError: Object.assign(new Error("synthetic storage failure"), {
      code: "CLIENT_STORE_READ_FAILED",
    }),
  });
  await assert.rejects(
    storeFailure.service.get({ clientId: "client-1" }),
    { code: "SUBMISSION_CENTER_QUERY_FAILED" },
  );
  assert.equal(storeFailure.calls.regular, 0);
});

test("keeps the query budget constant as entity counts grow and performs no transport", async () => {
  const many = Array.from({ length: 500 }, (_, index) => {
    const group = regularGroup("client-1");
    group.queueGroupId = `group-${index}`;
    group.remaining[0].itemId = `item-${index}`;
    return group;
  });
  const { service, calls } = fixture({ regular: many });
  const snapshot = await service.get({ clientId: "client-1" });
  assert.equal(snapshot.counts.regularItems, 500);
  assert.equal(calls.regular, 1);
  assert.equal(calls.paid, 1);
  assert.equal(calls.attention, 1);
  assert.ok(calls.revision <= 2);
  assert.equal(calls.transport, 0);
});

test("publishes one exact typed IPC capability and rejects extra wire fields", async () => {
  const contract = productionIpcRegistry.byCapability(
    "content.getSubmissionCenterSnapshot",
  );
  assert.equal(contract.channel, "content:get-submission-center-snapshot");
  const requestEnvelope = productionIpcRegistry.encodeRequest(
    contract,
    { clientId: "client-1" },
  );
  assert.deepEqual(
    productionIpcRegistry.parseRequest(contract, requestEnvelope),
    { clientId: "client-1" },
  );
  const { service } = fixture();
  const data = await service.get({ clientId: "client-1" });
  const envelope = productionIpcRegistry.success(contract, data);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.counts.total, 3);
  assert.throws(() =>
    productionIpcRegistry.success(contract, Object.assign({}, data, { path: "C:/secret" })),
  );
});
