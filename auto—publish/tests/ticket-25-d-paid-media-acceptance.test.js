"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createArticleStore } = require("../src/content/article-store");
const { createContentStore } = require("../src/content/content-store");
const {
  createArticleManagementSnapshot,
} = require("../desktop/services/article-management-snapshot");
const { createMediaPublisher } = require("../desktop/services/media-publisher");
const {
  createMediaWorkbenchApplication,
} = require("../desktop/services/media-workbench-application");
const {
  createPaidMediaBatchComposition,
} = require("../desktop/composition/paid-media-batch-composition");
const {
  createArticleMutationCoordinator,
} = require("../src/content/article-mutation-coordinator");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");

const NOW = "2026-08-12T00:00:00.000Z";

function article(articleId, overrides) {
  return {
    id: articleId,
    clientId: "client-d",
    platform: "toutiao",
    scenario: "guide",
    templateId: "template-d",
    title: `D 文章 ${articleId}`,
    content: `D 正文 ${articleId}`,
    status: "saved",
    createdAt: NOW,
    updatedAt: NOW,
    ...(overrides || {}),
  };
}

function createFixture(options) {
  const value = options || {};
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ticket-25-d-"));
  const transitionPorts = {};
  const state = {
    resource: {
      resourceId: "media-d",
      name: "D 媒体",
      remarks: "只收工作日稿件，正文风险请人工确认",
      price: 12.5,
      available: true,
    },
    orderStatus: "pending",
    orderQueryError: null,
    cancelOutcome: { kind: "order_cancelled" },
    createOrderBehaviors: [...(value.createOrderBehaviors || [])],
    onCreateOrder: null,
  };
  const createCalls = [];
  const cancelCalls = [];
  const remoteOrders = new Map();
  let orderSequence = 0;
  let store;
  let contentStore;

  try {
    store = createOperationalStore({
      workspaceRoot: root,
      clock: () => new Date(NOW),
      transitionPorts,
      articleReader: {
        getArticle(clientId, articleId) {
          return contentStore.getArticle(clientId, articleId);
        },
      },
    });
    const articleStore = createArticleStore(root);
    contentStore = createContentStore({
      articleStore,
      listClientIds: () => ["client-d"],
    });
    const initialArticles = value.articles || [article("article-d")];
    for (const item of initialArticles) contentStore.createArticle(item);
    const initialRefs = initialArticles.map((item) => ({
      clientId: item.clientId,
      articleId: item.id,
    }));
    store.addPaidStagingItems(initialRefs);
    store.setPaidStagingMedia(initialRefs, "media-d");

    const coordinator = createArticleMutationCoordinator({
      articleStore,
      contentStore,
      lifecycleFacts: transitionPorts.paidAdmissionTransitions,
      paidAdmissionTransitions: transitionPorts.paidAdmissionTransitions,
      regularQueueTransitions: transitionPorts.regularQueueTransitions,
      systemSubmissionCodeProvider: () => "system-submission-d",
      clock: () => new Date(NOW),
    });

    const supplier = {
      async createOrder(input) {
        createCalls.push({ ...input });
        if (typeof state.onCreateOrder === "function")
          await state.onCreateOrder(input, createCalls.length);
        const behavior = state.createOrderBehaviors.shift();
        if (behavior && behavior.throw) throw new Error("synthetic transport");
        if (behavior && behavior.kind === "uncertain")
          return { kind: "uncertain" };
        if (behavior && behavior.kind === "order_rejected")
          return { kind: "order_rejected" };
        const orderId = `order-d-${++orderSequence}`;
        remoteOrders.set(orderId, {
          orderId,
          resourceId: input.mediaResourceId,
          title: input.title,
          systemSubmissionId: input.systemSubmissionId,
        });
        return { kind: "order_created", orderId };
      },
      async getOrderDetails(orderIds) {
        if (state.orderQueryError) throw state.orderQueryError;
        return {
          kind: "order_details",
          orders: orderIds
            .map((orderId) => remoteOrders.get(String(orderId)))
            .filter(Boolean)
            .map((order) => ({
              ...order,
              status: state.orderStatus,
              publishedAt:
                state.orderStatus === "published"
                  ? "2026-08-12T01:00:00.000Z"
                  : null,
              remoteUrl:
                state.orderStatus === "published"
                  ? "https://publisher.example/articles/d"
                  : null,
              actualAmount: 12.5,
            })),
        };
      },
      async cancelOrder(orderId) {
        cancelCalls.push(orderId);
        if (state.cancelOutcome && state.cancelOutcome.throw)
          throw new Error("synthetic cancellation transport");
        return state.cancelOutcome;
      },
    };

    const publisher = createMediaPublisher({
      systemSubmissionIdProvider: () => "system-submission-d",
      supplierProvider: () => supplier,
    });
    const orderCreationPort = Object.freeze({
      createOrder(input) {
        return publisher.publish({
          articleId: "synthetic-article-d",
          attemptId: input.orderCreationAttemptId || "synthetic-attempt-d",
          target: {
            kind: "media",
            mediaResourceId: input.mediaResourceId,
          },
          title: input.title,
          body: input.htmlBody,
          remark: input.remark,
        });
      },
    });
    const composition = createPaidMediaBatchComposition({
      paidExecutionTransitions: transitionPorts.paidExecutionTransitions,
      orderCreationResolutionTransitions:
        transitionPorts.orderCreationResolutionTransitions,
      orderDetailsQueryPort: {
        getOrderDetails: (orderIds) => supplier.getOrderDetails(orderIds),
      },
      orderCreationPort,
    });
    const resourceService = {
      queryCurrentResource(resourceId) {
        if (resourceId !== state.resource.resourceId)
          throw new Error("synthetic resource missing");
        return { ...state.resource };
      },
    };
    const application = createMediaWorkbenchApplication({
      mediaSupplierProvider: () => supplier,
      mediaResourceService: resourceService,
      resourceStore: { getAll: () => ({ resources: [] }) },
      poolStore: { getAll: () => [], contains: () => true },
      draftStore: { getAll: () => ({}), get: () => null, set: () => {} },
      mediaWorkbenchService: {
        resolveSubmissionFile: (filename) => filename,
        scanArticles: async () => [],
        previewArticle: async () => ({}),
      },
      contentStore,
      paidAdmissionFacade: {
        admitPaidBatch: coordinator.admitPaidBatch,
      },
      paidStaging: {
        listPaidStagingItems: (input) => store.listPaidStagingItems(input),
      },
      paidLifecycleFacts: transitionPorts.paidAdmissionTransitions,
      clientSnapshotResolver: (clientId) => ({
        version: 1,
        clientId,
        displayName: "客户 D",
      }),
      systemSubmissionCodeProvider: () => "system-submission-d",
      paidMediaBatchOrchestrator: composition.orchestrator,
      paidOrderCreationResolutionService:
        composition.orderCreationResolutionService,
      orderObservationTransitions: transitionPorts.orderObservationTransitions,
      orderCancellationTransitions:
        transitionPorts.orderCancellationTransitions,
      clock: () => new Date(NOW),
    });
    const management = createArticleManagementSnapshot({
      workspaceIdentity: root,
      listArticles: () => contentStore.listArticles("client-d"),
      listTrash: () => contentStore.listTrashedArticles("client-d"),
      listBatches: () => [],
      listPlatforms: () => [],
      operationalStore: store,
      publishedArchiveQueries: transitionPorts.publishedArchiveQueries,
    });

    return {
      root,
      state,
      store,
      contentStore,
      application,
      management,
      createCalls,
      cancelCalls,
      stage(...articleIds) {
        const refs = articleIds.map((articleId) => ({
          clientId: "client-d",
          articleId,
        }));
        store.addPaidStagingItems(refs);
        store.setPaidStagingMedia(refs, "media-d");
      },
      close() {
        store.close();
        fs.rmSync(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (store) store.close();
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

async function confirmBatch(fixture, articleIds) {
  const preview = await fixture.application.preflightPaidMedia({
    articleRefs: articleIds.map((articleId) => ({
      clientId: "client-d",
      articleId,
    })),
    mediaResourceId: "media-d",
  });
  return fixture.application.confirmPaidMedia({
    confirmationToken: preview.confirmationToken,
    confirmed: true,
  });
}

function firstOrder(fixture) {
  const order = fixture.application.getOrders().items[0];
  assert.ok(order);
  return order;
}

test("paid media application exposes the fee and risk snapshot before admitting a batch", async () => {
  const fixture = createFixture({
    articles: [
      article("risk-phone", { content: "联系人 13800138000" }),
      article("risk-url", { content: "详情见 https://example.test" }),
    ],
  });
  try {
    const preview = await fixture.application.preflightPaidMedia({
      articleRefs: [
        { clientId: "client-d", articleId: "risk-phone" },
        { clientId: "client-d", articleId: "risk-url" },
      ],
      mediaResourceId: "media-d",
    });
    assert.deepEqual(
      [
        preview.articleCount,
        preview.mediaName,
        preview.mediaRemarks,
        preview.quotedPrice,
        preview.estimatedTotal,
        preview.systemSubmissionCode,
      ],
      [
        2,
        "D 媒体",
        "只收工作日稿件，正文风险请人工确认",
        12.5,
        25,
        "system-submission-d",
      ],
    );
    assert.deepEqual(
      preview.risks.map((warning) => warning.code),
      ["PHONE_NUMBER", "URL"],
    );
    assert.equal(
      fixture.contentStore.getArticle("client-d", "risk-phone").content,
      "联系人 13800138000",
    );
    assert.equal(fixture.createCalls.length, 0);

    const admitted = await fixture.application.confirmPaidMedia({
      confirmationToken: preview.confirmationToken,
      confirmed: true,
    });
    assert.deepEqual(
      [admitted.status, admitted.articleCount, admitted.estimatedTotal],
      ["queued", 2, 25],
    );
    assert.equal(fixture.application.getPaidMediaBatches().items.length, 1);
    assert.equal(fixture.createCalls.length, 0);

    fixture.contentStore.createArticle(article("new-batch-d"));
    fixture.stage("new-batch-d");
    const secondPreview = await fixture.application.preflightPaidMedia({
      articleRefs: [{ clientId: "client-d", articleId: "new-batch-d" }],
      mediaResourceId: "media-d",
    });
    const secondBatch = await fixture.application.confirmPaidMedia({
      confirmationToken: secondPreview.confirmationToken,
      confirmed: true,
    });
    assert.notEqual(secondBatch.batchId, admitted.batchId);
    assert.deepEqual(
      fixture.application
        .getPaidMediaBatches()
        .items.map((batch) => [batch.batchId, batch.articleCount])
        .sort((left, right) => left[1] - right[1]),
      [
        [secondBatch.batchId, 1],
        [admitted.batchId, 2],
      ],
    );
  } finally {
    fixture.close();
  }
});

test("paid media execution is serial and a pause stops only the next order", async () => {
  let firstStarted;
  let releaseFirst;
  const firstCall = new Promise((resolve) => {
    firstStarted = resolve;
  });
  const firstRelease = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const fixture = createFixture({
    articles: [article("serial-a"), article("serial-b")],
  });
  fixture.state.onCreateOrder = async (_input, count) => {
    if (count === 1) {
      firstStarted();
      await firstRelease;
    }
  };
  try {
    const admitted = await confirmBatch(fixture, ["serial-a", "serial-b"]);
    const running = fixture.application.startPaidMediaBatch({
      batchId: admitted.batchId,
    });
    await firstCall;
    const paused = fixture.application.pausePaidMediaBatch({
      batchId: admitted.batchId,
    });
    assert.equal(paused.batch.paused, true);
    releaseFirst();

    const result = await running;
    assert.equal(result.executionStatus, "order_created");
    assert.equal(fixture.createCalls.length, 1);
    const batch = fixture.application.getPaidMediaBatches().items[0];
    assert.equal(batch.paused, true);
    assert.deepEqual(batch.items.map((item) => item.status).sort(), [
      "completed",
      "queued",
    ]);
    assert.equal(
      fixture.createCalls[0].systemSubmissionId,
      "system-submission-d",
    );
  } finally {
    fixture.close();
  }
});

test("separate paid batches share one global execution lock", async () => {
  let firstStarted;
  let releaseFirst;
  const firstCall = new Promise((resolve) => {
    firstStarted = resolve;
  });
  const firstRelease = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const fixture = createFixture({
    articles: [article("global-a"), article("global-b")],
  });
  fixture.state.onCreateOrder = async (_input, count) => {
    if (count === 1) {
      firstStarted();
      await firstRelease;
    }
  };
  try {
    const first = await confirmBatch(fixture, ["global-a"]);
    const second = await confirmBatch(fixture, ["global-b"]);
    const running = fixture.application.startPaidMediaBatch({
      batchId: first.batchId,
    });
    await firstCall;

    const blocked = await fixture.application.startPaidMediaBatch({
      batchId: second.batchId,
    });
    assert.equal(blocked.executionStatus, "paid_execution_busy");
    assert.equal(fixture.createCalls.length, 1);

    releaseFirst();
    await running;
    const resumed = await fixture.application.startPaidMediaBatch({
      batchId: second.batchId,
    });
    assert.equal(resumed.executionStatus, "order_created");
    assert.equal(fixture.createCalls.length, 2);
  } finally {
    fixture.close();
  }
});

test("paid order views refresh through the application and preserve facts on transport failure", async () => {
  const fixture = createFixture({ articles: [article("refresh-d")] });
  try {
    const admitted = await confirmBatch(fixture, ["refresh-d"]);
    await fixture.application.startPaidMediaBatch({
      batchId: admitted.batchId,
    });
    const created = firstOrder(fixture);
    assert.deepEqual(
      [created.statusCode, created.resourceName, created.price, created.title],
      ["0", "D 媒体", "12.5", "D 文章 refresh-d"],
    );

    fixture.state.orderStatus = "scheduled";
    await fixture.application.syncOrder(created.orderNid);
    assert.equal(firstOrder(fixture).statusCode, "1");

    fixture.state.orderQueryError = new Error("synthetic sync failure");
    await assert.rejects(
      () => fixture.application.syncOrder(created.orderNid),
      { code: "MEDIA_ORDER_SYNC_FAILED" },
    );
    assert.equal(firstOrder(fixture).statusCode, "1");

    const snapshot = await fixture.management.get({ clientId: "client-d" });
    assert.equal(
      snapshot.workflowByArticle["refresh-d"].stage,
      "paid_processing",
    );
    assert.equal(snapshot.workflowByArticle["refresh-d"].locks.canEdit, false);
    assert.equal(snapshot.orders[0].quotedPrice, 12.5);
    assert.equal(snapshot.orders[0].resourceNameSnapshot, "D 媒体");
  } finally {
    fixture.close();
  }
});

test("cancellation releases an unpaid order while preserving its historical order view", async () => {
  const fixture = createFixture({ articles: [article("cancel-d")] });
  try {
    const admitted = await confirmBatch(fixture, ["cancel-d"]);
    await fixture.application.startPaidMediaBatch({
      batchId: admitted.batchId,
    });
    const created = firstOrder(fixture);
    await fixture.application.syncOrder(created.orderNid);
    const plan = fixture.application.prepareOrderCancellation({
      orderId: created.orderNid,
    });
    assert.deepEqual([plan.actionLabel, plan.riskCode], ["取消订单", null]);

    const result = await fixture.application.cancelOrder({
      orderId: created.orderNid,
      confirmationToken: plan.confirmationToken,
    });
    assert.equal(result.status, "cancelled");
    assert.deepEqual(fixture.cancelCalls, [created.orderNid]);
    assert.equal(
      fixture.application.getOrders().items[0].statusCode,
      "cancelled",
    );

    const snapshot = await fixture.management.get({ clientId: "client-d" });
    assert.equal(
      snapshot.workflowByArticle["cancel-d"].stage,
      "pending_submission",
    );
    assert.equal(snapshot.workflowByArticle["cancel-d"].locks.canEdit, true);
    assert.equal(fixture.store.listRemoteOrders().length, 1);
  } finally {
    fixture.close();
  }
});

test("published order history remains published after a later aftercare observation", async () => {
  const fixture = createFixture({ articles: [article("aftercare-d")] });
  try {
    const admitted = await confirmBatch(fixture, ["aftercare-d"]);
    await fixture.application.startPaidMediaBatch({
      batchId: admitted.batchId,
    });
    const created = firstOrder(fixture);
    const originalDisplay = fixture.store.listOrderDisplayViews()[0];
    assert.deepEqual(
      [
        originalDisplay.titleSnapshot,
        originalDisplay.resourceNameSnapshot,
        originalDisplay.quotedPrice,
        originalDisplay.estimatedTotal,
        originalDisplay.systemSubmissionCode,
      ],
      ["D 文章 aftercare-d", "D 媒体", 12.5, 12.5, "system-submission-d"],
    );
    fixture.state.orderStatus = "published";
    await fixture.application.syncOrder(created.orderNid);
    assert.equal(firstOrder(fixture).statusCode, "2");

    fixture.state.orderStatus = "aftercare";
    await fixture.application.syncOrder(created.orderNid);
    assert.equal(firstOrder(fixture).statusCode, "9");
    const snapshot = await fixture.management.get({ clientId: "client-d" });
    assert.equal(snapshot.workflowByArticle["aftercare-d"].stage, "published");
    assert.equal(
      snapshot.workflowByArticle["aftercare-d"].locks.canEdit,
      false,
    );
    assert.equal(fixture.store.listRemoteOrders().length, 1);
    const aftercareDisplay = fixture.store.listOrderDisplayViews()[0];
    assert.deepEqual(
      [
        aftercareDisplay.titleSnapshot,
        aftercareDisplay.resourceNameSnapshot,
        aftercareDisplay.quotedPrice,
        aftercareDisplay.estimatedTotal,
        aftercareDisplay.systemSubmissionCode,
      ],
      [
        originalDisplay.titleSnapshot,
        originalDisplay.resourceNameSnapshot,
        originalDisplay.quotedPrice,
        originalDisplay.estimatedTotal,
        originalDisplay.systemSubmissionCode,
      ],
    );
  } finally {
    fixture.close();
  }
});
