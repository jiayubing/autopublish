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
  createPaidMediaBatchOrchestrator,
} = require("../desktop/services/paid-media-batch-orchestrator");

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "paid-execution-13-"));
  const transitionPorts = {};
  const store = createOperationalStore({
    workspaceRoot: root,
    clock: () => new Date(NOW),
    transitionPorts,
    internalPaidExecutionTransitionFault: (point) => {
      if (point === settings.faultPoint) throw new Error(`fault:${point}`);
    },
  });
  const articleStore = createArticleStore(root);
  const contentStore = createContentStore({
    articleStore,
    listClientIds: () => ["client-a"],
  });
  const code = "系统投稿标识-13";
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
    resourceId: "media-13",
    name: "媒体十三",
    remarks: "仅工作日接单",
    price: 12.5,
    available: true,
  };
  const preflight = createPaidMediaPreflightService({
    contentStore,
    paidAdmission: { admitPaidBatch: coordinator.admitPaidBatch },
    lifecycleFacts: transitionPorts.paidAdmissionTransitions,
    queryResource: async () => Object.assign({}, resource),
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
    root,
    store,
    contentStore,
    preflight,
    transitions: transitionPorts.paidExecutionTransitions,
    close() {
      store.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

async function admit(fixtureValue) {
  const preview = await fixtureValue.preflight.preflight({
    articleRefs: [
      { clientId: "client-a", articleId: "article-b" },
      { clientId: "client-a", articleId: "article-a" },
    ],
    mediaResourceId: "media-13",
  });
  return fixtureValue.preflight.confirm({
    confirmationToken: preview.confirmationToken,
  });
}

function orderPort(calls) {
  let inFlight = 0;
  let maximumInFlight = 0;
  return {
    port: Object.freeze({
      createOrder: async (input) => {
        inFlight += 1;
        maximumInFlight = Math.max(maximumInFlight, inFlight);
        calls.push(input);
        await Promise.resolve();
        inFlight -= 1;
        return { kind: "order_created", orderId: `order-${calls.length}` };
      },
    }),
    maximumInFlight: () => maximumInFlight,
  };
}

function claimAndPrepare(value, batchId, claimToken) {
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
  return {
    claim,
    prepared: {
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
    },
  };
}

function beginAndBuildEvidence(value, batchId, claimToken, orderId) {
  const execution = claimAndPrepare(value, batchId, claimToken);
  const started = value.transitions.beginOrderCreationRemoteCall({
    batchId,
    batchItemId: execution.claim.batchItemId,
    orderCreationAttemptId: execution.claim.orderCreationAttemptId,
    claimToken,
    orderCreationPrepared: execution.prepared,
  });
  const snapshot = domain.parseOrderSnapshotV1({
    version: 1,
    orderIdentityV1: { version: 1, orderId },
    articleIdentityV1: execution.prepared.articleIdentityV1,
    targetIdentityV1: execution.prepared.targetIdentityV1,
    orderCreationAttemptId: execution.prepared.orderCreationAttemptId,
    mediaName: execution.prepared.mediaName,
    quotedPrice: execution.prepared.quotedPrice,
    estimatedTotal: execution.prepared.estimatedTotal,
    actualAmount: null,
    systemSubmissionCode: execution.prepared.systemSubmissionCode,
    submittedTitle: execution.prepared.submittedTitle,
    submittedBody: execution.prepared.submittedBody,
    contentFingerprint: execution.prepared.contentFingerprint,
    remoteCallStartedAt: started.remoteCallStartedAt,
  });
  const paidTarget = domain.parsePaidTargetV1({
    version: 1,
    articleIdentityV1: snapshot.articleIdentityV1,
    targetIdentityV1: snapshot.targetIdentityV1,
    orderCreationAttemptId: snapshot.orderCreationAttemptId,
    orderIdentityV1: snapshot.orderIdentityV1,
    state: "ACTIVE_TRACKING",
    terminalAt: null,
  });
  return { execution, started, snapshot, paidTarget };
}

test("order V1 contracts are recursive, exact, and bind the paid target", () => {
  const articleIdentityV1 = {
    version: 1,
    clientId: "client-a",
    articleId: "article-a",
  };
  const targetIdentityV1 = {
    version: 1,
    kind: "media",
    mediaResourceId: "media-13",
  };
  const title = "一篇订单标题";
  const body = "订单正文";
  const snapshot = domain.parseOrderSnapshotV1({
    version: 1,
    orderIdentityV1: { version: 1, orderId: "order-1" },
    articleIdentityV1,
    targetIdentityV1,
    orderCreationAttemptId: "paid-attempt-1",
    mediaName: "媒体十三",
    quotedPrice: 12.5,
    estimatedTotal: 25,
    actualAmount: null,
    systemSubmissionCode: "系统投稿标识-13",
    submittedTitle: title,
    submittedBody: body,
    contentFingerprint: domain.contentFingerprint(title, body),
    remoteCallStartedAt: NOW,
  });
  assert.equal(snapshot.orderIdentityV1.orderId, "order-1");
  assert.throws(
    () =>
      domain.parseOrderSnapshotV1(Object.assign({}, snapshot, { extra: true })),
    { code: "DTO_UNKNOWN_FIELD" },
  );
  assert.throws(
    () =>
      domain.parsePaidTargetV1({
        version: 1,
        articleIdentityV1,
        targetIdentityV1,
        orderCreationAttemptId: "paid-attempt-1",
        orderIdentityV1: { version: 1, orderId: "order-1" },
        state: "ACTIVE_TRACKING",
        terminalAt: NOW,
      }),
    { code: "PAID_TARGET_V1_INVALID" },
  );
});

test("begin-order remote boundary binds every prepared field to the confirmed batch snapshot", async () => {
  const value = fixture();
  try {
    const admitted = await admit(value);
    const execution = claimAndPrepare(
      value,
      admitted.batchId,
      "manual-claim-snapshot",
    );
    const mutations = [
      { mediaName: "另一媒体" },
      { quotedPrice: 99 },
      { estimatedTotal: 198 },
      { systemSubmissionCode: "另一个系统标识" },
      { preparedAt: "2026-08-07T00:00:01.000Z" },
      {
        targetIdentityV1: {
          version: 1,
          kind: "media",
          mediaResourceId: "media-other",
        },
      },
      {
        articleIdentityV1: {
          version: 1,
          clientId: "client-a",
          articleId:
            execution.claim.articleIdentityV1.articleId === "article-a"
              ? "article-b"
              : "article-a",
        },
      },
    ];
    for (const [index, mutation] of mutations.entries()) {
      assert.throws(
        () =>
          value.transitions.beginOrderCreationRemoteCall({
            batchId: admitted.batchId,
            batchItemId: execution.claim.batchItemId,
            orderCreationAttemptId: execution.claim.orderCreationAttemptId,
            claimToken: execution.claim.claimToken,
            orderCreationPrepared: Object.assign(
              {},
              execution.prepared,
              mutation,
            ),
          }),
        { code: "PAID_ORDER_PREPARED_MISMATCH" },
        `mutation ${index}`,
      );
    }
  } finally {
    value.close();
  }
});

test("success rejects forged frozen order evidence before writing an order fact", async () => {
  const value = fixture();
  try {
    const admitted = await admit(value);
    const first = beginAndBuildEvidence(
      value,
      admitted.batchId,
      "manual-claim-forged-evidence",
      "order-forged-evidence",
    );
    const mutations = [
      { mediaName: "伪造媒体" },
      { quotedPrice: 99 },
      { estimatedTotal: 198 },
      { systemSubmissionCode: "伪造系统标识" },
      { remoteCallStartedAt: "2026-08-07T00:00:01.000Z" },
      {
        articleIdentityV1: {
          version: 1,
          clientId: "client-forged",
          articleId: first.snapshot.articleIdentityV1.articleId,
        },
      },
      {
        submittedTitle: "伪造标题",
        contentFingerprint: domain.contentFingerprint(
          "伪造标题",
          first.snapshot.submittedBody,
        ),
      },
      {
        submittedBody: "伪造正文",
        contentFingerprint: domain.contentFingerprint(
          first.snapshot.submittedTitle,
          "伪造正文",
        ),
      },
    ];
    for (const mutation of mutations) {
      const forgedSnapshot = domain.parseOrderSnapshotV1(
        Object.assign({}, first.snapshot, mutation),
      );
      const forgedTarget = domain.parsePaidTargetV1(
        Object.assign({}, first.paidTarget, {
          articleIdentityV1: forgedSnapshot.articleIdentityV1,
          targetIdentityV1: forgedSnapshot.targetIdentityV1,
          orderIdentityV1: forgedSnapshot.orderIdentityV1,
        }),
      );
      assert.throws(
        () =>
          value.transitions.recordPaidOrderCreationSuccess({
            batchId: admitted.batchId,
            batchItemId: first.execution.claim.batchItemId,
            claimToken: first.execution.claim.claimToken,
            orderCreationAttemptId:
              first.execution.claim.orderCreationAttemptId,
            orderSnapshotV1: forgedSnapshot,
            paidTargetV1: forgedTarget,
          }),
        { code: "PAID_ORDER_EVIDENCE_MISMATCH" },
      );
    }
    assert.deepEqual(value.store.listRemoteOrders(), []);
    assert.equal(
      value.transitions.listPaidSubmissionBatchSnapshots({
        batchId: admitted.batchId,
      })[0].items[0].status,
      "submitting",
    );
  } finally {
    value.close();
  }
});

test("paid order guard persists a same-attempt conflict and freezes the current order", async () => {
  const value = fixture();
  try {
    const admitted = await admit(value);
    const first = beginAndBuildEvidence(
      value,
      admitted.batchId,
      "manual-claim-first",
      "order-guard-1",
    );
    const successInput = {
      batchId: admitted.batchId,
      batchItemId: first.execution.claim.batchItemId,
      claimToken: first.execution.claim.claimToken,
      orderCreationAttemptId: first.execution.claim.orderCreationAttemptId,
      orderSnapshotV1: first.snapshot,
      paidTargetV1: first.paidTarget,
    };
    value.transitions.recordPaidOrderCreationSuccess(successInput);
    const actualAmountReplay = domain.parseOrderSnapshotV1(
      Object.assign({}, first.snapshot, { actualAmount: 12.5 }),
    );
    const actualAmountTarget = domain.parsePaidTargetV1(
      Object.assign({}, first.paidTarget, {
        orderIdentityV1: actualAmountReplay.orderIdentityV1,
      }),
    );
    const replay = value.transitions.recordPaidOrderCreationSuccess(
      Object.assign({}, successInput, {
        orderSnapshotV1: actualAmountReplay,
        paidTargetV1: actualAmountTarget,
      }),
    );
    assert.equal(replay.idempotent, true);

    const changedOrderSnapshot = domain.parseOrderSnapshotV1(
      Object.assign({}, first.snapshot, {
        orderIdentityV1: { version: 1, orderId: "order-guard-other" },
      }),
    );
    const changedOrderTarget = domain.parsePaidTargetV1(
      Object.assign({}, first.paidTarget, {
        orderIdentityV1: changedOrderSnapshot.orderIdentityV1,
      }),
    );
    assert.throws(
      () =>
        value.transitions.recordPaidOrderCreationSuccess(
          Object.assign({}, successInput, {
            orderSnapshotV1: changedOrderSnapshot,
            paidTargetV1: changedOrderTarget,
          }),
        ),
      { code: "PAID_ORDER_EVIDENCE_CONFLICT" },
    );

    const snapshot = value.transitions.listPaidSubmissionBatchSnapshots({
      batchId: admitted.batchId,
    })[0];
    assert.equal(snapshot.items[0].status, "uncertain");
    assert.equal(snapshot.items[0].phase, "order_creation_conflict");
    assert.equal(snapshot.paused, true);
    const recovery = value.store.listActionableRecovery();
    assert.equal(recovery.length, 1);
    assert.equal(recovery[0].detail.code, "PAID_ORDER_EVIDENCE_CONFLICT");
    assert.equal(
      recovery[0].detail.existingOrderEvidence.orderIdentityV1.orderId,
      "order-guard-1",
    );
    assert.equal(
      recovery[0].detail.conflictingOrderEvidence.orderIdentityV1.orderId,
      "order-guard-other",
    );
  } finally {
    value.close();
  }
});

test("paid order guard persists a cross-attempt order conflict and pauses the batch", async () => {
  const value = fixture();
  try {
    const admitted = await admit(value);
    const first = beginAndBuildEvidence(
      value,
      admitted.batchId,
      "manual-claim-cross-first",
      "order-cross-guard",
    );
    value.transitions.recordPaidOrderCreationSuccess({
      batchId: admitted.batchId,
      batchItemId: first.execution.claim.batchItemId,
      claimToken: first.execution.claim.claimToken,
      orderCreationAttemptId: first.execution.claim.orderCreationAttemptId,
      orderSnapshotV1: first.snapshot,
      paidTargetV1: first.paidTarget,
    });

    const second = beginAndBuildEvidence(
      value,
      admitted.batchId,
      "manual-claim-cross-second",
      "order-cross-guard",
    );
    assert.throws(
      () =>
        value.transitions.recordPaidOrderCreationSuccess({
          batchId: admitted.batchId,
          batchItemId: second.execution.claim.batchItemId,
          claimToken: second.execution.claim.claimToken,
          orderCreationAttemptId: second.execution.claim.orderCreationAttemptId,
          orderSnapshotV1: second.snapshot,
          paidTargetV1: second.paidTarget,
        }),
      { code: "OPERATIONAL_ORDER_CONFLICT" },
    );
    const snapshot = value.transitions.listPaidSubmissionBatchSnapshots({
      batchId: admitted.batchId,
    })[0];
    assert.equal(snapshot.items[0].status, "completed");
    assert.equal(snapshot.items[1].status, "uncertain");
    assert.equal(snapshot.items[1].phase, "order_creation_conflict");
    assert.equal(snapshot.paused, true);
    const recovery = value.store.listActionableRecovery();
    assert.equal(recovery.length, 1);
    assert.equal(recovery[0].detail.code, "OPERATIONAL_ORDER_CONFLICT");
    assert.equal(
      recovery[0].detail.existingOrderEvidence.orderIdentityV1.orderId,
      "order-cross-guard",
    );
    assert.equal(
      recovery[0].detail.conflictingOrderEvidence.orderIdentityV1.orderId,
      "order-cross-guard",
    );
  } finally {
    value.close();
  }
});

test("paid execution creates orders one at a time and completes the confirmed batch", async () => {
  const value = fixture();
  try {
    const admitted = await admit(value);
    const calls = [];
    const provider = orderPort(calls);
    const orchestrator = createPaidMediaBatchOrchestrator({
      paidExecutionTransitions: value.transitions,
      orderCreationPort: provider.port,
    });
    orchestrator.initializePaused();
    const result = await orchestrator.startBatch({ batchId: admitted.batchId });
    assert.equal(result.status, "submitted");
    assert.equal(calls.length, 2);
    assert.equal(provider.maximumInFlight(), 1);
    assert.deepEqual(
      value.store
        .listRemoteOrders()
        .map((item) => item.orderId)
        .sort(),
      ["order-1", "order-2"],
    );
    assert.equal(
      value.transitions.listPaidSubmissionBatchSnapshots({
        batchId: admitted.batchId,
      })[0].status,
      "completed",
    );
  } finally {
    value.close();
  }
});

test("a paid order recheck freezes the batch before remote submission when the snapshot is stale", async () => {
  const value = fixture();
  try {
    const admitted = await admit(value);
    let calls = 0;
    const orchestrator = createPaidMediaBatchOrchestrator({
      paidExecutionTransitions: value.transitions,
      recheckPaidOrder: async () => ({
        reasonCode: "PAID_MEDIA_CONFIRMATION_STALE",
      }),
      orderCreationPort: Object.freeze({
        createOrder: async () => {
          calls += 1;
          return { kind: "order_created", orderId: "must-not-create" };
        },
      }),
    });
    const result = await orchestrator.startBatch({ batchId: admitted.batchId });
    assert.equal(result.status, "preflight_changed");
    assert.equal(calls, 0);
    const snapshot = value.transitions.listPaidSubmissionBatchSnapshots({
      batchId: admitted.batchId,
    })[0];
    assert.equal(snapshot.paused, true);
    assert.equal(snapshot.items[0].status, "queued");
  } finally {
    value.close();
  }
});

test("a success outcome transaction failure keeps the remote-started item frozen and unreplayable", async () => {
  const value = fixture({ faultPoint: "after-order-link" });
  try {
    const admitted = await admit(value);
    const calls = [];
    const orchestrator = createPaidMediaBatchOrchestrator({
      paidExecutionTransitions: value.transitions,
      orderCreationPort: Object.freeze({
        createOrder: async () => {
          calls.push(1);
          return { kind: "order_created", orderId: "order-rollback" };
        },
      }),
    });
    const result = await orchestrator.startBatch({ batchId: admitted.batchId });
    assert.equal(result.status, "uncertain");
    assert.deepEqual(calls, [1]);
    assert.deepEqual(value.store.listRemoteOrders(), []);
    const afterFailure = value.transitions.listPaidSubmissionBatchSnapshots({
      batchId: admitted.batchId,
    })[0];
    assert.equal(afterFailure.items[0].status, "uncertain");
    assert.equal(afterFailure.items[0].phase, "order_creation_uncertain");

    const restarted = createPaidMediaBatchOrchestrator({
      paidExecutionTransitions: value.transitions,
      orderCreationPort: Object.freeze({
        createOrder: async () => {
          calls.push(2);
          return { kind: "order_created", orderId: "must-not-replay" };
        },
      }),
    });
    restarted.initializePaused();
    assert.equal(
      value.transitions.listPaidSubmissionBatchSnapshots({
        batchId: admitted.batchId,
      })[0].paused,
      true,
    );
    assert.deepEqual(calls, [1]);
  } finally {
    value.close();
  }
});

test("success and rejection outcome write-point failures never advance the paid batch", async () => {
  for (const faultPoint of [
    "before-order-success",
    "after-order-link",
    "after-order-evidence",
    "after-order-snapshot",
    "after-publication-order-created",
    "after-paid-item-completed",
    "after-paid-success",
  ]) {
    const value = fixture({ faultPoint });
    try {
      const admitted = await admit(value);
      const orchestrator = createPaidMediaBatchOrchestrator({
        paidExecutionTransitions: value.transitions,
        orderCreationPort: Object.freeze({
          createOrder: async () => ({
            kind: "order_created",
            orderId: `order-fault-${faultPoint}`,
          }),
        }),
      });
      const result = await orchestrator.startBatch({
        batchId: admitted.batchId,
      });
      assert.equal(result.status, "uncertain");
      const snapshot = value.transitions.listPaidSubmissionBatchSnapshots({
        batchId: admitted.batchId,
      })[0];
      assert.equal(snapshot.items[0].status, "uncertain");
      assert.equal(snapshot.items[1].status, "queued");
      assert.equal(snapshot.paused, true);
    } finally {
      value.close();
    }
  }

  for (const kind of ["article", "account"]) {
    for (const faultPoint of [
      "before-paid-rejection",
      "after-paid-publication-rejection",
      "after-paid-item-rejection",
      "after-paid-rejection",
    ]) {
      const value = fixture({ faultPoint });
      try {
        const admitted = await admit(value);
        const orchestrator = createPaidMediaBatchOrchestrator({
          paidExecutionTransitions: value.transitions,
          orderCreationPort: Object.freeze({
            createOrder: async () => ({
              kind: "order_rejected",
              scope: kind,
            }),
          }),
        });
        await assert.rejects(
          orchestrator.startBatch({ batchId: admitted.batchId }),
          new RegExp(`fault:${faultPoint}`),
        );
        const snapshot = value.transitions.listPaidSubmissionBatchSnapshots({
          batchId: admitted.batchId,
        })[0];
        assert.equal(snapshot.items[0].status, "submitting");
        assert.equal(snapshot.items[1].status, "queued");
        assert.equal(snapshot.paused, false);
      } finally {
        value.close();
      }
    }
  }
});

test("begin-order boundary failures happen before the supplier call and restart paused", async () => {
  for (const faultPoint of [
    "after-paid-evidence-freeze",
    "after-paid-publication-remote-started",
    "after-paid-submission-start",
  ]) {
    const value = fixture({ faultPoint });
    try {
      const admitted = await admit(value);
      let calls = 0;
      const orchestrator = createPaidMediaBatchOrchestrator({
        paidExecutionTransitions: value.transitions,
        orderCreationPort: Object.freeze({
          createOrder: async () => {
            calls += 1;
            return { kind: "order_created", orderId: "must-not-cross" };
          },
        }),
      });
      await assert.rejects(
        orchestrator.startBatch({ batchId: admitted.batchId }),
        new RegExp(`fault:${faultPoint}`),
      );
      assert.equal(calls, 0);
      const afterFailure = value.transitions.listPaidSubmissionBatchSnapshots({
        batchId: admitted.batchId,
      })[0];
      assert.equal(afterFailure.items[0].status, "claimed");
      assert.equal(afterFailure.items[0].phase, "prepared");

      const restarted = createPaidMediaBatchOrchestrator({
        paidExecutionTransitions: value.transitions,
        orderCreationPort: Object.freeze({
          createOrder: async () => {
            calls += 1;
            return { kind: "order_created", orderId: "must-not-replay" };
          },
        }),
      });
      restarted.initializePaused();
      assert.equal(
        value.transitions.listPaidSubmissionBatchSnapshots({
          batchId: admitted.batchId,
        })[0].paused,
        true,
      );
      assert.equal(calls, 0);
    } finally {
      value.close();
    }
  }
});

test("a paid batch remains paused after restart and an in-flight uncertain result is not retried", async () => {
  const value = fixture();
  try {
    const admitted = await admit(value);
    const calls = [];
    const transitions = value.transitions;
    transitions.pausePaidSubmissionBatchesOnStartup();
    const first = transitions.listPaidSubmissionBatchSnapshots({
      batchId: admitted.batchId,
    })[0];
    assert.equal(first.paused, true);
    let callCount = 0;
    const orchestrator = createPaidMediaBatchOrchestrator({
      paidExecutionTransitions: transitions,
      orderCreationPort: Object.freeze({
        createOrder: async () => {
          callCount += 1;
          calls.push(callCount);
          return { kind: "uncertain", reason: "transport" };
        },
      }),
    });
    const result = await orchestrator.startBatch({ batchId: admitted.batchId });
    assert.equal(result.status, "uncertain");
    assert.equal(callCount, 1);
    const paused = transitions.listPaidSubmissionBatchSnapshots({
      batchId: admitted.batchId,
    })[0];
    assert.equal(paused.paused, true);
    assert.equal(paused.items[0].status, "uncertain");
    assert.throws(
      () => orchestrator.startBatch({ batchId: admitted.batchId }),
      { code: "PAID_EXECUTION_MANUAL_RESOLUTION_REQUIRED" },
    );
    assert.deepEqual(calls, [1]);
  } finally {
    value.close();
  }
});

test("article/resource rejection continues the batch while account/service rejection blocks it", async () => {
  const value = fixture();
  try {
    const admitted = await admit(value);
    let calls = 0;
    const orchestrator = createPaidMediaBatchOrchestrator({
      paidExecutionTransitions: value.transitions,
      orderCreationPort: Object.freeze({
        createOrder: async () => {
          calls += 1;
          return calls === 1
            ? { kind: "order_rejected", scope: "article" }
            : {
                kind: "order_created",
                orderId: "order-after-article-rejection",
              };
        },
      }),
    });
    const result = await orchestrator.startBatch({ batchId: admitted.batchId });
    assert.equal(result.status, "submitted");
    assert.equal(calls, 2);
    const facts = value.store.listArticleLifecycleFacts({
      articleIds: ["article-a"],
    });
    assert.equal(facts.publications[0].status, "failed");
    assert.equal(facts.submissionItems[0].status, "failed");
  } finally {
    value.close();
  }

  const blocked = fixture();
  try {
    const admitted = await admit(blocked);
    let calls = 0;
    const orchestrator = createPaidMediaBatchOrchestrator({
      paidExecutionTransitions: blocked.transitions,
      orderCreationPort: Object.freeze({
        createOrder: async () => {
          calls += 1;
          return { kind: "order_rejected", scope: "account" };
        },
      }),
    });
    const result = await orchestrator.startBatch({ batchId: admitted.batchId });
    assert.equal(result.status, "blocked");
    assert.equal(calls, 1);
    const snapshot = blocked.transitions.listPaidSubmissionBatchSnapshots({
      batchId: admitted.batchId,
    })[0];
    assert.equal(snapshot.paused, true);
    assert.equal(snapshot.items[0].status, "blocked");
    assert.equal(snapshot.items[1].status, "queued");

    const restartedAll = await orchestrator.startAll();
    assert.deepEqual(restartedAll.results, []);
    assert.equal(calls, 1);
    const afterRestartAll =
      blocked.transitions.listPaidSubmissionBatchSnapshots({
        batchId: admitted.batchId,
      })[0];
    assert.equal(afterRestartAll.paused, true);
    assert.deepEqual(
      afterRestartAll.items.map((item) => item.status),
      ["blocked", "queued"],
    );
  } finally {
    blocked.close();
  }
});

test("pause waits for the current order request and prevents the next claim", async () => {
  const value = fixture();
  try {
    const admitted = await admit(value);
    let resolveOrder;
    let finishOrder;
    const requestStarted = new Promise((resolve) => {
      resolveOrder = resolve;
    });
    const orchestrator = createPaidMediaBatchOrchestrator({
      paidExecutionTransitions: value.transitions,
      orderCreationPort: Object.freeze({
        createOrder: async () => {
          resolveOrder();
          return new Promise((resolve) => {
            finishOrder = resolve;
          });
        },
      }),
    });
    const running = orchestrator.startBatch({ batchId: admitted.batchId });
    await requestStarted;
    const paused = orchestrator.pauseBatch({ batchId: admitted.batchId });
    assert.equal(paused.paused, true);
    const snapshot = value.transitions.listPaidSubmissionBatchSnapshots({
      batchId: admitted.batchId,
    })[0];
    assert.equal(
      snapshot.items.filter((item) => item.status === "submitting").length,
      1,
    );
    assert.equal(
      snapshot.items.filter((item) => item.status === "queued").length,
      1,
    );
    finishOrder({
      kind: "order_created",
      orderId: "order-paused-after-current",
    });
    const result = await running;
    assert.equal(result.status, "submitted");
  } finally {
    value.close();
  }
});
