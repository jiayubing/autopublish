"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const domain = require("../src/domain");
const { createArticleStore } = require("../src/content/article-store");
const { createContentStore } = require("../src/content/content-store");
const {
  createArticleMutationCoordinator,
} = require("../src/content/article-mutation-coordinator");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  createPaidMediaPreflightService,
} = require("../desktop/services/paid-media-preflight-service");
const {
  createPaidOrderCreationResolutionService,
} = require("../desktop/services/paid-order-creation-resolution-service");
const { createAuthenticatedIpcMain } = require("../desktop/ipc/register");
const { registerMediaIpc } = require("../desktop/ipc/media-ipc");
const { loadPreloadHarness } = require("./helpers/preload-harness");
const {
  createArticleAttentionQuery,
} = require("../desktop/services/article-attention-query");
const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");

const NOW = "2026-08-07T00:00:00.000Z";

function article(articleId) {
  return {
    id: articleId,
    clientId: "client-a",
    platform: "toutiao",
    scenario: "guide",
    templateId: "template-1",
    title: `标题 ${articleId}`,
    content: `正文 ${articleId}`,
    status: "saved",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function fixture(options) {
  const settings = options || {};
  let currentNow = settings.now || NOW;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "paid-resolution-14-"));
  const transitionPorts = {};
  let contentStore;
  const store = createOperationalStore({
    workspaceRoot: root,
    clock: () => new Date(currentNow),
    transitionPorts,
    internalPaidExecutionTransitionFault: (point) => {
      if (point === settings.faultPoint) throw new Error(`fault:${point}`);
    },
  });
  const articleStore = createArticleStore(root);
  contentStore = createContentStore({
    articleStore,
    listClientIds: () => ["client-a"],
  });
  const code = "系统投稿标识-14";
  const coordinator = createArticleMutationCoordinator({
    articleStore,
    contentStore,
    lifecycleFacts: transitionPorts.paidAdmissionTransitions,
    paidAdmissionTransitions: transitionPorts.paidAdmissionTransitions,
    regularQueueTransitions: transitionPorts.regularQueueTransitions,
    systemSubmissionCodeProvider: () => code,
    clock: () => new Date(NOW),
  });
  const resource = {
    resourceId: "media-14",
    name: "媒体十四",
    remarks: "",
    price: 14,
    available: true,
  };
  const preflight = createPaidMediaPreflightService({
    contentStore,
    paidAdmission: { admitPaidBatch: coordinator.admitPaidBatch },
    mediaPoolStore: { contains: () => true },
    lifecycleFacts: transitionPorts.paidAdmissionTransitions,
    queryResource: async (input) => ({
      ...resource,
      resourceId:
        (typeof input === "string" ? input : input && input.mediaResourceId) ||
        resource.resourceId,
    }),
    systemSubmissionCodeProvider: () => code,
    clientSnapshotResolver: (clientId) => ({
      version: 1,
      clientId,
      displayName: "客户甲",
    }),
    clock: () => new Date(NOW),
  });
  contentStore.createArticle(article("article-a"));
  contentStore.createArticle(article("article-b"));
  return {
    store,
    preflight,
    transitions: transitionPorts.paidExecutionTransitions,
    resolutions: transitionPorts.orderCreationResolutionTransitions,
    setNow(value) {
      currentNow = value;
    },
    close() {
      store.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

async function admit(value) {
  const preview = await value.preflight.preflight({
    articleRefs: [
      { clientId: "client-a", articleId: "article-a" },
      { clientId: "client-a", articleId: "article-b" },
    ],
    mediaResourceId: "media-14",
  });
  return value.preflight.confirm({
    confirmationToken: preview.confirmationToken,
  });
}

async function admitArticle(value, articleId, mediaResourceId = "media-14") {
  const preview = await value.preflight.preflight({
    articleRefs: [{ clientId: "client-a", articleId }],
    mediaResourceId,
  });
  return value.preflight.confirm({
    confirmationToken: preview.confirmationToken,
  });
}

function makeUncertain(value, batchId, claimToken) {
  value.transitions.setPaidSubmissionBatchRunIntent({
    batchId,
    running: true,
  });
  const claim = value.transitions.claimPaidSubmissionBatchItem({
    batchId,
    claimToken,
    leaseMs: 30000,
  });
  const submittedTitle = claim.publicationSnapshot.title.trim();
  const submittedBody = claim.publicationSnapshot.body;
  const prepared = {
    version: 1,
    articleIdentityV1: claim.articleIdentityV1,
    targetIdentityV1: claim.targetIdentityV1,
    orderCreationAttemptId: claim.orderCreationAttemptId,
    mediaName: claim.mediaName,
    quotedPrice: claim.quotedPrice,
    estimatedTotal: claim.estimatedTotal,
    systemSubmissionCode: claim.systemSubmissionCode,
    submittedTitle,
    submittedBody,
    contentFingerprint: domain.contentFingerprint(
      submittedTitle,
      submittedBody,
    ),
    preparedAt: claim.preparedAt,
  };
  const started = value.transitions.beginOrderCreationRemoteCall({
    batchId,
    batchItemId: claim.batchItemId,
    orderCreationAttemptId: claim.orderCreationAttemptId,
    claimToken,
    orderCreationPrepared: prepared,
  });
  value.transitions.recordPaidOrderCreationUncertain({
    batchId,
    batchItemId: claim.batchItemId,
    orderCreationAttemptId: claim.orderCreationAttemptId,
    claimToken,
    reason: "transport",
  });
  return { claim, prepared, started };
}

function lateSuccessInput(uncertain, orderId) {
  const snapshot = domain.parseOrderSnapshotV1({
    version: 1,
    orderIdentityV1: { version: 1, orderId },
    articleIdentityV1: uncertain.prepared.articleIdentityV1,
    targetIdentityV1: uncertain.prepared.targetIdentityV1,
    orderCreationAttemptId: uncertain.prepared.orderCreationAttemptId,
    mediaName: uncertain.prepared.mediaName,
    quotedPrice: uncertain.prepared.quotedPrice,
    estimatedTotal: uncertain.prepared.estimatedTotal,
    actualAmount: null,
    systemSubmissionCode: uncertain.prepared.systemSubmissionCode,
    submittedTitle: uncertain.prepared.submittedTitle,
    submittedBody: uncertain.prepared.submittedBody,
    contentFingerprint: uncertain.prepared.contentFingerprint,
    remoteCallStartedAt: uncertain.started.remoteCallStartedAt,
  });
  return {
    batchId: uncertain.claim.batchId,
    batchItemId: uncertain.claim.batchItemId,
    orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
    orderSnapshotV1: snapshot,
    paidTargetV1: domain.parsePaidTargetV1({
      version: 1,
      articleIdentityV1: snapshot.articleIdentityV1,
      targetIdentityV1: snapshot.targetIdentityV1,
      orderCreationAttemptId: snapshot.orderCreationAttemptId,
      orderIdentityV1: snapshot.orderIdentityV1,
      state: "ACTIVE_TRACKING",
      terminalAt: null,
    }),
  };
}

function service(value, query) {
  return createPaidOrderCreationResolutionService({
    orderCreationResolutionTransitions: value.resolutions,
    orderDetailsQueryPort: Object.freeze({ getOrderDetails: query }),
  });
}

function remoteOrder(orderId, prepared, overrides) {
  return {
    orderId,
    status: "pending",
    resourceId: prepared.targetIdentityV1.mediaResourceId,
    title: prepared.submittedTitle,
    systemSubmissionId: prepared.systemSubmissionCode,
    ...(overrides || {}),
  };
}

test("uncertain order creation stays frozen and can bind only a fully matched queried order", async () => {
  const value = fixture();
  try {
    const admitted = await admit(value);
    const uncertain = makeUncertain(value, admitted.batchId, "claim-bind");
    const queried = [];
    const resolution = service(value, async (ids) => {
      queried.push(ids);
      return {
        kind: "order_details",
        orders: [remoteOrder("order-14", uncertain.prepared)],
      };
    });
    const before = value.transitions.listPaidSubmissionBatchSnapshots({
      batchId: admitted.batchId,
    })[0];
    assert.equal(before.paused, true);
    assert.equal(before.items[0].phase, "order_creation_uncertain");
    assert.equal(
      value.store.listArticleLifecycleFacts({ articleIds: ["article-a"] })
        .publications[0].status,
      "uncertain",
    );
    const attention = createArticleAttentionQuery({
      operationalStore: value.store,
      paidOrderCreationResolutionService: {
        prepareBindOrderNumber: async () => ({}),
        bindOrderNumber: () => ({}),
        prepareConfirmNoOrder: () => ({}),
        confirmNoOrder: () => ({}),
      },
    }).list({}).items[0];
    assert.equal(attention.kind, "paid_order_creation_uncertain");
    assert.equal(
      attention.orderCreationAttemptId,
      uncertain.claim.orderCreationAttemptId,
    );
    assert.equal(
      attention.allowedActions.includes("bind-paid-order-number"),
      true,
    );
    assert.equal(
      attention.allowedActions.includes("confirm-paid-order-absent"),
      true,
    );
    assert.equal("resolutionActions" in attention, false);
    const lifecycleAttention = value.store.listArticleLifecycleFacts({
      articleIds: ["article-a"],
    }).attentionItems[0];
    const publicationAttention = value.store
      .listPublicationAttention()
      .find((item) => item.articleId === "article-a");
    assert.deepEqual(
      {
        orderCreationAttemptId: lifecycleAttention.orderCreationAttemptId,
        resolutionActions: lifecycleAttention.resolutionActions,
      },
      {
        orderCreationAttemptId: publicationAttention.orderCreationAttemptId,
        resolutionActions: publicationAttention.resolutionActions,
      },
    );
    assert.deepEqual(
      attention.allowedActions.slice(0, 2),
      lifecycleAttention.resolutionActions,
    );

    const prepared = await resolution.prepareBindOrderNumber({
      orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
      orderId: "order-14",
    });
    assert.deepEqual(queried, [["order-14"]]);
    const bound = resolution.bindOrderNumber({
      orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
      orderId: "order-14",
      confirmationToken: prepared.confirmationToken,
    });
    assert.equal(bound.status, "order_bound");
    assert.equal(value.store.listRemoteOrders()[0].orderId, "order-14");
    assert.equal(
      value.transitions.listPaidSubmissionBatchSnapshots({
        batchId: admitted.batchId,
      })[0].items[0].status,
      "completed",
    );
    assert.equal(
      resolution.bindOrderNumber({
        orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
        orderId: "order-14",
        confirmationToken: prepared.confirmationToken,
      }).idempotent,
      true,
    );
    assert.throws(
      () =>
        resolution.bindOrderNumber({
          orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
          orderId: "order-14",
          confirmationToken: "wrong-token",
        }),
      { code: "PAID_ORDER_RESOLUTION_TOKEN_STALE" },
    );
    assert.throws(
      () =>
        resolution.bindOrderNumber({
          orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
          orderId: "order-14",
        }),
      { code: "PAID_ORDER_RESOLUTION_TOKEN_STALE" },
    );
    assert.throws(
      () =>
        resolution.bindOrderNumber({
          orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
          orderId: "other-order",
          confirmationToken: prepared.confirmationToken,
        }),
      { code: "PAID_ORDER_RESOLUTION_EVIDENCE_MISMATCH" },
    );
  } finally {
    value.close();
  }
});

test("query failure, mismatch, and incomplete supplier identity all keep the attempt frozen", async () => {
  for (const result of [
    { kind: "transport_error", operation: "order_details" },
    { kind: "order_details", orders: [] },
  ]) {
    const value = fixture();
    try {
      const admitted = await admit(value);
      const uncertain = makeUncertain(value, admitted.batchId, "claim-query");
      await assert.rejects(
        service(value, async () => result).prepareBindOrderNumber({
          orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
          orderId: "order-query",
        }),
        {
          code:
            result.kind === "transport_error"
              ? "PAID_ORDER_RESOLUTION_QUERY_FAILED"
              : "PAID_ORDER_RESOLUTION_EVIDENCE_INSUFFICIENT",
        },
      );
      assert.equal(value.store.listRemoteOrders().length, 0);
      assert.equal(
        value.transitions.listPaidSubmissionBatchSnapshots({
          batchId: admitted.batchId,
        })[0].items[0].status,
        "uncertain",
      );
    } finally {
      value.close();
    }
  }

  for (const overrides of [
    { resourceId: "wrong-resource" },
    { title: "错误标题" },
    { systemSubmissionId: "wrong-code" },
    { title: undefined },
  ]) {
    const value = fixture();
    try {
      const admitted = await admit(value);
      const uncertain = makeUncertain(value, admitted.batchId, "claim-match");
      await assert.rejects(
        service(value, async () => ({
          kind: "order_details",
          orders: [remoteOrder("order-match", uncertain.prepared, overrides)],
        })).prepareBindOrderNumber({
          orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
          orderId: "order-match",
        }),
        {
          code:
            Object.hasOwn(overrides, "title") && overrides.title === undefined
              ? "PAID_ORDER_RESOLUTION_EVIDENCE_INSUFFICIENT"
              : "PAID_ORDER_RESOLUTION_EVIDENCE_MISMATCH",
        },
      );
      assert.equal(value.store.listRemoteOrders().length, 0);
    } finally {
      value.close();
    }
  }
});

test("confirming no order is token-bound, idempotent, and releases only the original target", async () => {
  const value = fixture();
  try {
    const admitted = await admit(value);
    const uncertain = makeUncertain(value, admitted.batchId, "claim-none");
    const resolution = service(value, async () => {
      throw new Error("no query is allowed for this decision");
    });
    const prepared = resolution.prepareConfirmNoOrder({
      orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
    });
    assert.throws(
      () =>
        resolution.confirmNoOrder({
          orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
          confirmationToken: "wrong-token",
        }),
      { code: "PAID_ORDER_RESOLUTION_TOKEN_STALE" },
    );
    const confirmed = resolution.confirmNoOrder({
      orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
      confirmationToken: prepared.confirmationToken,
    });
    assert.equal(confirmed.status, "no_order");
    assert.equal(
      resolution.confirmNoOrder({
        orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
        confirmationToken: prepared.confirmationToken,
      }).idempotent,
      true,
    );
    assert.throws(
      () =>
        resolution.confirmNoOrder({
          orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
          confirmationToken: "wrong-token",
        }),
      { code: "PAID_ORDER_RESOLUTION_TOKEN_STALE" },
    );
    const facts = value.store.listArticleLifecycleFacts({
      articleIds: ["article-a"],
    });
    assert.equal(facts.publications[0].status, "failed");
    assert.equal(
      facts.publications.some(
        (item) => item.articleId === "article-a" && item.status === "failed",
      ),
      true,
    );
    assert.equal(value.store.listRemoteOrders().length, 0);
  } finally {
    value.close();
  }
});

test("opposite manual decisions and state drift return stable conflicts without partial writes", async () => {
  const value = fixture();
  try {
    const admitted = await admit(value);
    const uncertain = makeUncertain(value, admitted.batchId, "claim-opposite");
    const resolution = service(value, async () => ({
      kind: "order_details",
      orders: [remoteOrder("order-opposite", uncertain.prepared)],
    }));
    const bind = await resolution.prepareBindOrderNumber({
      orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
      orderId: "order-opposite",
    });
    const noOrder = resolution.prepareConfirmNoOrder({
      orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
    });
    assert.throws(
      () =>
        resolution.bindOrderNumber({
          orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
          orderId: "order-opposite",
          confirmationToken: bind.confirmationToken,
        }),
      { code: "PAID_ORDER_RESOLUTION_TOKEN_STALE" },
    );
    resolution.confirmNoOrder({
      orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
      confirmationToken: noOrder.confirmationToken,
    });
    assert.throws(
      () =>
        resolution.bindOrderNumber({
          orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
          orderId: "order-opposite",
          confirmationToken: bind.confirmationToken,
        }),
      { code: "PAID_ORDER_RESOLUTION_OPPOSITE" },
    );
    assert.equal(value.store.listRemoteOrders().length, 0);
  } finally {
    value.close();
  }
});

test("an expired token cannot replay an otherwise identical completed resolution", async () => {
  const value = fixture();
  try {
    const admitted = await admitArticle(value, "article-a");
    const uncertain = makeUncertain(value, admitted.batchId, "claim-expired");
    const resolution = service(value, async () => ({
      kind: "order_details",
      orders: [],
    }));
    const prepared = resolution.prepareConfirmNoOrder({
      orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
    });
    resolution.confirmNoOrder({
      orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
      confirmationToken: prepared.confirmationToken,
    });
    value.setNow("2026-08-07T00:06:00.000Z");
    assert.throws(
      () =>
        resolution.confirmNoOrder({
          orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
          confirmationToken: prepared.confirmationToken,
        }),
      { code: "PAID_ORDER_RESOLUTION_TOKEN_STALE" },
    );
  } finally {
    value.close();
  }
});

test("two attempts competing for one remote order leave exactly one bound and the other frozen", async () => {
  const value = fixture();
  try {
    const admitted = await admitArticle(value, "article-a");
    const first = makeUncertain(value, admitted.batchId, "claim-first");
    const secondBatch = await admitArticle(value, "article-b");
    const second = makeUncertain(value, secondBatch.batchId, "claim-second");
    const query = async (_ids, prepared) => ({
      kind: "order_details",
      orders: [remoteOrder("shared-order", prepared)],
    });
    const firstService = service(value, (ids) => query(ids, first.prepared));
    const secondService = service(value, (ids) => query(ids, second.prepared));
    const firstToken = await firstService.prepareBindOrderNumber({
      orderCreationAttemptId: first.claim.orderCreationAttemptId,
      orderId: "shared-order",
    });
    const secondToken = await secondService.prepareBindOrderNumber({
      orderCreationAttemptId: second.claim.orderCreationAttemptId,
      orderId: "shared-order",
    });
    firstService.bindOrderNumber({
      orderCreationAttemptId: first.claim.orderCreationAttemptId,
      orderId: "shared-order",
      confirmationToken: firstToken.confirmationToken,
    });
    assert.throws(
      () =>
        secondService.bindOrderNumber({
          orderCreationAttemptId: second.claim.orderCreationAttemptId,
          orderId: "shared-order",
          confirmationToken: secondToken.confirmationToken,
        }),
      { code: "OPERATIONAL_ORDER_CONFLICT" },
    );
    assert.equal(value.store.listRemoteOrders().length, 1);
    const firstSnapshot = value.transitions.listPaidSubmissionBatchSnapshots({
      batchId: admitted.batchId,
    })[0];
    const secondSnapshot = value.transitions.listPaidSubmissionBatchSnapshots({
      batchId: secondBatch.batchId,
    })[0];
    assert.equal(firstSnapshot.items[0].status, "completed");
    assert.equal(secondSnapshot.items[0].status, "uncertain");
    assert.equal(secondSnapshot.items[0].phase, "order_creation_conflict");
  } finally {
    value.close();
  }
});

test("resolution transaction faults roll back order, evidence, item, and target changes", async () => {
  const value = fixture({ faultPoint: "after-manual-order-link" });
  try {
    const admitted = await admit(value);
    const uncertain = makeUncertain(value, admitted.batchId, "claim-fault");
    const resolution = service(value, async () => ({
      kind: "order_details",
      orders: [remoteOrder("order-fault", uncertain.prepared)],
    }));
    const prepared = await resolution.prepareBindOrderNumber({
      orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
      orderId: "order-fault",
    });
    assert.throws(
      () =>
        resolution.bindOrderNumber({
          orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
          orderId: "order-fault",
          confirmationToken: prepared.confirmationToken,
        }),
      /fault:after-manual-order-link/,
    );
    assert.equal(value.store.listRemoteOrders().length, 0);
    const snapshot = value.transitions.listPaidSubmissionBatchSnapshots({
      batchId: admitted.batchId,
    })[0];
    assert.equal(snapshot.items[0].status, "uncertain");
    assert.equal(snapshot.items[0].phase, "order_creation_uncertain");
  } finally {
    value.close();
  }
});

test("a trusted late order success wins after no-order confirmation and is never replayed", async () => {
  const value = fixture();
  try {
    const admitted = await admitArticle(value, "article-a");
    const uncertain = makeUncertain(value, admitted.batchId, "claim-late");
    const resolution = service(value, async () => ({
      kind: "order_details",
      orders: [],
    }));
    const noOrder = resolution.prepareConfirmNoOrder({
      orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
    });
    resolution.confirmNoOrder({
      orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
      confirmationToken: noOrder.confirmationToken,
    });
    const late = value.transitions.recordPaidOrderCreationSuccess(
      lateSuccessInput(uncertain, "late-order-14"),
    );
    assert.equal(late.status, "order_created");
    assert.equal(value.store.listRemoteOrders()[0].orderId, "late-order-14");
    assert.throws(
      () =>
        resolution.confirmNoOrder({
          orderCreationAttemptId: uncertain.claim.orderCreationAttemptId,
          confirmationToken: noOrder.confirmationToken,
        }),
      { code: "PAID_ORDER_RESOLUTION_OPPOSITE" },
    );
  } finally {
    value.close();
  }
});

test("a late order after manual unfreeze and a new target is preserved as a freeze conflict", async () => {
  const value = fixture();
  try {
    const firstBatch = await admitArticle(value, "article-a");
    const first = makeUncertain(value, firstBatch.batchId, "claim-old-target");
    const noOrderService = service(value, async () => ({
      kind: "order_details",
      orders: [],
    }));
    const noOrder = noOrderService.prepareConfirmNoOrder({
      orderCreationAttemptId: first.claim.orderCreationAttemptId,
    });
    noOrderService.confirmNoOrder({
      orderCreationAttemptId: first.claim.orderCreationAttemptId,
      confirmationToken: noOrder.confirmationToken,
    });
    const secondBatch = await admitArticle(value, "article-a", "media-15");
    assert.throws(
      () =>
        noOrderService.confirmNoOrder({
          orderCreationAttemptId: first.claim.orderCreationAttemptId,
          confirmationToken: noOrder.confirmationToken,
        }),
      { code: "PAID_ORDER_RESOLUTION_STATE_STALE" },
    );
    assert.equal(
      value.transitions.listPaidSubmissionBatchSnapshots({
        batchId: secondBatch.batchId,
      })[0].items[0].status,
      "queued",
    );
    const second = makeUncertain(
      value,
      secondBatch.batchId,
      "claim-new-target",
    );
    const late = lateSuccessInput(first, "late-conflict-14");
    assert.throws(
      () => value.transitions.recordPaidOrderCreationSuccess(late),
      { code: "PAID_ORDER_NEW_TARGET_CONFLICT" },
    );
    assert.equal(value.store.listRemoteOrders()[0].orderId, "late-conflict-14");
    const current = value.store.listArticleLifecycleFacts({
      articleIds: ["article-a"],
    });
    assert.equal(
      current.publications.some((item) => item.status === "uncertain"),
      true,
    );
    assert.equal(
      second.claim.orderCreationAttemptId !==
        first.claim.orderCreationAttemptId,
      true,
    );
  } finally {
    value.close();
  }
});

test("resolution composition accepts only the two narrow capabilities", () => {
  const calls = [];
  const resolution = createPaidOrderCreationResolutionService({
    orderCreationResolutionTransitions: Object.freeze({
      prepareOrderCreationResolution: (input) => calls.push(["prepare", input]),
      bindVerifiedOrder: (input) => calls.push(["bind", input]),
      confirmNoOrder: (input) => calls.push(["none", input]),
    }),
    orderDetailsQueryPort: Object.freeze({
      getOrderDetails: async () => ({ kind: "order_details", orders: [] }),
    }),
  });
  assert.deepEqual(Object.keys(resolution).sort(), [
    "bindOrderNumber",
    "confirmNoOrder",
    "prepareBindOrderNumber",
    "prepareConfirmNoOrder",
  ]);
  assert.throws(
    () =>
      createPaidOrderCreationResolutionService({
        orderCreationResolutionTransitions: {
          prepareOrderCreationResolution() {},
          bindVerifiedOrder() {},
          confirmNoOrder() {},
          createOrder() {},
        },
        orderDetailsQueryPort: { getOrderDetails() {} },
      }),
    { code: "PAID_ORDER_RESOLUTION_TRANSITIONS_INVALID" },
  );
  assert.deepEqual(calls, []);
});

test("typed IPC contracts expose only four named paid-order resolution commands", () => {
  const fixtures = [
    [
      "media:prepare-bind-paid-order-number",
      { orderCreationAttemptId: "paid-attempt-1", orderId: "order-1" },
    ],
    [
      "media:bind-paid-order-number",
      {
        orderCreationAttemptId: "paid-attempt-1",
        orderId: "order-1",
        confirmationToken: "paid-order-resolution-token",
      },
    ],
    [
      "media:prepare-confirm-paid-order-absent",
      { orderCreationAttemptId: "paid-attempt-1" },
    ],
    [
      "media:confirm-paid-order-absent",
      {
        orderCreationAttemptId: "paid-attempt-1",
        confirmationToken: "paid-order-resolution-token",
      },
    ],
  ];
  for (const [channel, payload] of fixtures) {
    const contract = productionIpcRegistry.byChannel(channel);
    assert.equal(contract.kind, "command");
    assert.deepEqual(
      productionIpcRegistry.encodeRequest(contract, payload).payload,
      payload,
    );
    assert.throws(
      () =>
        productionIpcRegistry.encodeRequest(contract, {
          ...payload,
          createOrder: true,
        }),
      { code: "IPC_UNKNOWN_FIELD" },
    );
  }
});

test("paid-order IPC errors close to safe known mappings and hide unknown errors", () => {
  const errorsByChannel = new Map([
    [
      "media:prepare-bind-paid-order-number",
      [
        "PAID_ORDER_ATTEMPT_NOT_FOUND",
        "PAID_ORDER_RESOLUTION_ALREADY_COMPLETED",
        "PAID_ORDER_RESOLUTION_EVIDENCE_MISMATCH",
      ],
    ],
    [
      "media:bind-paid-order-number",
      [
        "PAID_ORDER_RESOLUTION_TOKEN_STALE",
        "PAID_ORDER_RESOLUTION_STATE_STALE",
        "PAID_ORDER_EVIDENCE_CONFLICT",
      ],
    ],
    [
      "media:prepare-confirm-paid-order-absent",
      [
        "PAID_ORDER_ATTEMPT_NOT_FOUND",
        "PAID_ORDER_RESOLUTION_ALREADY_COMPLETED",
      ],
    ],
    [
      "media:confirm-paid-order-absent",
      [
        "PAID_ORDER_RESOLUTION_TOKEN_STALE",
        "PAID_ORDER_RESOLUTION_STATE_STALE",
        "PAID_ORDER_SUCCESS_WINS",
      ],
    ],
  ]);
  for (const [channel, codes] of errorsByChannel) {
    const contract = productionIpcRegistry.byChannel(channel);
    for (const code of codes) {
      const response = productionIpcRegistry.failure(contract, { code });
      assert.equal(response.error.code, code, `${channel}:${code}`);
      assert.equal(typeof response.error.userMessage, "string");
    }
    assert.equal(
      productionIpcRegistry.failure(contract, {
        code: "PRIVATE_SUPPLIER_SECRET",
      }).error.code,
      "IPC_INTERNAL",
    );
  }
});

test("production registrar and preload forward the four named commands without exposing create-order", async () => {
  const handlers = new Map();
  const applicationCalls = [];
  const safeFailure = () => {
    const error = new Error("isolated registrar failure");
    error.code = "IPC_INTERNAL";
    throw error;
  };
  const application = {
    prepareBindPaidOrderNumber: (input) => {
      applicationCalls.push(["prepare-bind", input]);
      return safeFailure();
    },
    bindPaidOrderNumber: (input) => {
      applicationCalls.push(["bind", input]);
      return safeFailure();
    },
    prepareConfirmPaidOrderAbsent: (input) => {
      applicationCalls.push(["prepare-none", input]);
      return safeFailure();
    },
    confirmPaidOrderAbsent: (input) => {
      applicationCalls.push(["none", input]);
      return safeFailure();
    },
  };
  const ipcMain = createAuthenticatedIpcMain(
    { handle: (channel, handler) => handlers.set(channel, handler) },
    async () => undefined,
  );
  registerMediaIpc({
    ipcMain,
    mediaApplication: application,
  });
  const commands = [
    [
      "media:prepare-bind-paid-order-number",
      { orderCreationAttemptId: "a", orderId: "o" },
    ],
    [
      "media:bind-paid-order-number",
      { orderCreationAttemptId: "a", orderId: "o", confirmationToken: "t" },
    ],
    [
      "media:prepare-confirm-paid-order-absent",
      { orderCreationAttemptId: "a" },
    ],
    [
      "media:confirm-paid-order-absent",
      { orderCreationAttemptId: "a", confirmationToken: "t" },
    ],
  ];
  for (const [channel, input] of commands) {
    const contract = productionIpcRegistry.byChannel(channel);
    const response = await handlers.get(channel)(
      null,
      productionIpcRegistry.encodeRequest(contract, input),
    );
    assert.equal(response.ok, false);
    assert.equal(response.error.code, "IPC_INTERNAL");
  }
  assert.deepEqual(
    applicationCalls.map(([name]) => name),
    ["prepare-bind", "bind", "prepare-none", "none"],
  );

  const preload = loadPreloadHarness({
    invoke: (channel) => {
      const contract = productionIpcRegistry.byChannel(channel);
      return productionIpcRegistry.failure(contract, { code: "IPC_INTERNAL" });
    },
  });
  for (const [channel, input] of commands) {
    const method = {
      "media:prepare-bind-paid-order-number": "prepareBindPaidOrderNumber",
      "media:bind-paid-order-number": "bindPaidOrderNumber",
      "media:prepare-confirm-paid-order-absent":
        "prepareConfirmPaidOrderAbsent",
      "media:confirm-paid-order-absent": "confirmPaidOrderAbsent",
    }[channel];
    await preload.api.orders[method](input);
  }
  assert.deepEqual(
    preload.transportCalls.map(([channel]) => channel),
    commands.map(([channel]) => channel),
  );
  for (const [index, [channel, input]] of commands.entries()) {
    const contract = productionIpcRegistry.byChannel(channel);
    assert.deepEqual(
      productionIpcRegistry.parseRequest(
        contract,
        preload.transportCalls[index][1],
      ),
      input,
      channel,
    );
  }
  assert.equal(Object.hasOwn(preload.api.orders, "createOrder"), false);
});
