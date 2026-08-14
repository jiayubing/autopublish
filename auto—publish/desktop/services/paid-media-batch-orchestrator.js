"use strict";

const crypto = require("node:crypto");
const domain = require("../../src/domain");

const TRANSITION_METHODS = Object.freeze([
  "beginOrderCreationRemoteCall",
  "cancelRemainingPaidSubmissionBatchItems",
  "claimPaidSubmissionBatchItem",
  "listPaidSubmissionBatchSnapshots",
  "pauseAllPaidSubmissionBatches",
  "pausePaidSubmissionBatchesOnStartup",
  "recordPaidOrderCreationArticleRejection",
  "recordPaidOrderCreationSuccess",
  "recordPaidOrderCreationSystemRejection",
  "recordPaidOrderCreationUncertain",
  "releasePaidOrderCreationClaim",
  "renewPaidOrderCreationClaim",
  "setPaidSubmissionBatchRunIntent",
  "startAllPaidSubmissionBatches",
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function validateTransitions(value) {
  if (
    !value ||
    Object.keys(value).sort().join("\u0000") !==
      [...TRANSITION_METHODS].sort().join("\u0000") ||
    TRANSITION_METHODS.some((method) => typeof value[method] !== "function")
  )
    throw fail("PAID_EXECUTION_TRANSITIONS_INVALID");
  return value;
}

function validateOrderCreationPort(value) {
  if (
    !value ||
    Object.keys(value).join("\u0000") !== "createOrder" ||
    typeof value.createOrder !== "function"
  )
    throw fail("PAID_ORDER_CREATION_PORT_INVALID");
  return value;
}

function titleAndBody(claim) {
  const snapshot = claim.publicationSnapshot || {};
  if (typeof snapshot.title !== "string" || typeof snapshot.body !== "string")
    throw fail("PAID_ORDER_CONTENT_INVALID");
  return {
    title: snapshot.title.trim(),
    body: snapshot.body,
    contentFingerprint: domain.contentFingerprint(
      snapshot.title.trim(),
      snapshot.body,
    ),
  };
}

function preparedOrder(claim) {
  const content = titleAndBody(claim);
  return Object.freeze({
    version: 1,
    articleIdentityV1: claim.articleIdentityV1,
    targetIdentityV1: claim.targetIdentityV1,
    orderCreationAttemptId: claim.orderCreationAttemptId,
    mediaName: claim.mediaName || "",
    quotedPrice: claim.quotedPrice,
    estimatedTotal: claim.estimatedTotal,
    systemSubmissionCode: claim.systemSubmissionCode,
    submittedTitle: content.title,
    submittedBody: content.body,
    contentFingerprint: content.contentFingerprint,
    preparedAt: claim.preparedAt,
  });
}

function orderSnapshot(claim, started, result) {
  const prepared = started.orderCreationPrepared;
  const orderId = result && result.orderId;
  if (typeof orderId !== "string" || !orderId)
    throw fail("PAID_ORDER_ID_REQUIRED");
  return domain.parseOrderSnapshotV1({
    version: 1,
    orderIdentityV1: { version: 1, orderId },
    articleIdentityV1: prepared.articleIdentityV1,
    targetIdentityV1: prepared.targetIdentityV1,
    orderCreationAttemptId: prepared.orderCreationAttemptId,
    mediaName: prepared.mediaName,
    quotedPrice: prepared.quotedPrice,
    estimatedTotal: prepared.estimatedTotal,
    actualAmount:
      result && result.actualAmount !== undefined ? result.actualAmount : null,
    systemSubmissionCode: prepared.systemSubmissionCode,
    submittedTitle: prepared.submittedTitle,
    submittedBody: prepared.submittedBody,
    contentFingerprint: prepared.contentFingerprint,
    remoteCallStartedAt: started.remoteCallStartedAt,
  });
}

function paidTarget(snapshot) {
  return domain.parsePaidTargetV1({
    version: 1,
    articleIdentityV1: snapshot.articleIdentityV1,
    targetIdentityV1: snapshot.targetIdentityV1,
    orderCreationAttemptId: snapshot.orderCreationAttemptId,
    orderIdentityV1: snapshot.orderIdentityV1,
    state: "ACTIVE_TRACKING",
    terminalAt: null,
  });
}

function articleRejection(scope) {
  return scope === "article" || scope === "resource";
}

const SUCCESS_CONFLICT_CODES = new Set([
  "OPERATIONAL_ORDER_CONFLICT",
  "PAID_ORDER_EVIDENCE_CONFLICT",
  "PAID_ORDER_EVIDENCE_MISMATCH",
  "PAID_ORDER_SUCCESS_WINS",
]);

function createPaidMediaBatchOrchestrator(options) {
  const value = options || {};
  const transitions = validateTransitions(value.paidExecutionTransitions);
  const orderCreationPort = validateOrderCreationPort(value.orderCreationPort);
  const randomUUID = value.randomUUID || crypto.randomUUID;
  const active = new Map();
  let globalRun = null;

  function snapshot(input) {
    return transitions.listPaidSubmissionBatchSnapshots(input || {});
  }

  function initializePaused() {
    return transitions.pausePaidSubmissionBatchesOnStartup();
  }

  function pauseBatch(input) {
    return transitions.setPaidSubmissionBatchRunIntent({
      batchId: input && input.batchId,
      running: false,
    });
  }

  function pauseAll() {
    return transitions.pauseAllPaidSubmissionBatches();
  }

  function callPreflight(claim) {
    if (typeof value.recheckPaidOrder !== "function")
      return Promise.resolve(null);
    return Promise.resolve()
      .then(() => value.recheckPaidOrder(claim))
      .then((result) => {
        if (result === true || result === null || result === undefined)
          return null;
        if (result.ok === true || result.status === "ready") return null;
        return result;
      })
      .catch(() => ({ reasonCode: "PAID_ORDER_PRECHECK_FAILED" }));
  }

  async function executeClaim(claim) {
    const preflight = await callPreflight(claim);
    if (preflight) {
      transitions.releasePaidOrderCreationClaim({
        orderCreationAttemptId: claim.orderCreationAttemptId,
        claimToken: claim.claimToken,
        reasonCode: preflight.reasonCode,
      });
      transitions.setPaidSubmissionBatchRunIntent({
        batchId: claim.batchId,
        running: false,
      });
      return Object.freeze({
        status: "preflight_changed",
        batchId: claim.batchId,
        batchItemId: claim.batchItemId,
        reasonCode: preflight.reasonCode || "PAID_ORDER_PRECHECK_FAILED",
      });
    }

    const prepared = preparedOrder(claim);
    const started = transitions.beginOrderCreationRemoteCall({
      batchId: claim.batchId,
      batchItemId: claim.batchItemId,
      orderCreationAttemptId: claim.orderCreationAttemptId,
      claimToken: claim.claimToken,
      orderCreationPrepared: prepared,
    });
    if (!started.submitAuthorized)
      return Object.freeze({
        status: "order_creation_already_started",
        batchId: claim.batchId,
        batchItemId: claim.batchItemId,
        orderCreationAttemptId: claim.orderCreationAttemptId,
      });

    let result;
    try {
      result = await orderCreationPort.createOrder({
        mediaResourceId: claim.targetIdentityV1.mediaResourceId,
        title: prepared.submittedTitle,
        htmlBody: prepared.submittedBody,
        ...(claim.mediaRemarks ? { remark: claim.mediaRemarks } : {}),
        systemSubmissionId: prepared.systemSubmissionCode,
      });
    } catch (_) {
      result = { kind: "uncertain", reason: "transport" };
    }

    if (result && result.kind === "order_created") {
      let snapshotValue;
      try {
        snapshotValue = orderSnapshot(claim, started, result);
      } catch (_) {
        return transitions.recordPaidOrderCreationUncertain({
          batchId: claim.batchId,
          batchItemId: claim.batchItemId,
          claimToken: claim.claimToken,
          orderCreationAttemptId: claim.orderCreationAttemptId,
          reason: "invalid-order-evidence",
        });
      }
      const outcome = {
        batchId: claim.batchId,
        batchItemId: claim.batchItemId,
        claimToken: claim.claimToken,
        orderCreationAttemptId: claim.orderCreationAttemptId,
        orderSnapshotV1: snapshotValue,
        paidTargetV1: paidTarget(snapshotValue),
      };
      try {
        return transitions.recordPaidOrderCreationSuccess(outcome);
      } catch (error) {
        if (SUCCESS_CONFLICT_CODES.has(error && error.code)) throw error;
        return transitions.recordPaidOrderCreationUncertain({
          batchId: claim.batchId,
          batchItemId: claim.batchItemId,
          claimToken: claim.claimToken,
          orderCreationAttemptId: claim.orderCreationAttemptId,
          reason: "local-outcome-failed",
        });
      }
    }
    if (result && result.kind === "order_rejected") {
      if (articleRejection(result.scope))
        return transitions.recordPaidOrderCreationArticleRejection({
          batchId: claim.batchId,
          batchItemId: claim.batchItemId,
          claimToken: claim.claimToken,
          orderCreationAttemptId: claim.orderCreationAttemptId,
          scope: result.scope,
          reasonCode: result.error && result.error.code,
        });
      return transitions.recordPaidOrderCreationSystemRejection({
        batchId: claim.batchId,
        batchItemId: claim.batchItemId,
        claimToken: claim.claimToken,
        orderCreationAttemptId: claim.orderCreationAttemptId,
        scope: result.scope || "service",
        reasonCode: result.error && result.error.code,
      });
    }
    if (
      result &&
      (result.kind === "configuration_error" || result.kind === "invalid_input")
    )
      return transitions.recordPaidOrderCreationSystemRejection({
        batchId: claim.batchId,
        batchItemId: claim.batchItemId,
        claimToken: claim.claimToken,
        orderCreationAttemptId: claim.orderCreationAttemptId,
        scope: "service",
        reasonCode: result.error && result.error.code,
      });
    return transitions.recordPaidOrderCreationUncertain({
      batchId: claim.batchId,
      batchItemId: claim.batchItemId,
      claimToken: claim.claimToken,
      orderCreationAttemptId: claim.orderCreationAttemptId,
      reason: result && result.reason,
    });
  }

  function runBatch(batchId) {
    if (active.has(batchId)) return active.get(batchId);
    if (globalRun)
      return Promise.resolve(
        Object.freeze({ status: "paid_execution_busy", batchId }),
      );
    const operation = (async () => {
      let last = Object.freeze({ batchId, status: "idle" });
      while (true) {
        const claim = transitions.claimPaidSubmissionBatchItem({
          batchId,
          claimToken: `paid-claim-${randomUUID()}`,
          leaseMs: 30000,
        });
        if (!claim) return last;
        last = await executeClaim(claim);
        if (
          [
            "preflight_changed",
            "order_creation_already_started",
            "uncertain",
            "blocked",
          ].includes(last.status)
        )
          return last;
      }
    })().finally(() => {
      active.delete(batchId);
      if (globalRun === operation) globalRun = null;
    });
    active.set(batchId, operation);
    globalRun = operation;
    return operation;
  }

  function startBatch(input) {
    const batchId = input && input.batchId;
    if (globalRun && !active.has(batchId))
      return Promise.resolve(
        Object.freeze({ status: "paid_execution_busy", batchId }),
      );
    transitions.setPaidSubmissionBatchRunIntent({ batchId, running: true });
    return runBatch(batchId);
  }

  function cancelRemaining(input) {
    return transitions.cancelRemainingPaidSubmissionBatchItems(input || {});
  }

  async function startAll() {
    transitions.startAllPaidSubmissionBatches();
    const batches = snapshot({});
    const results = [];
    for (const batch of batches) {
      if (batch.pauseIntent === "none")
        results.push(await runBatch(batch.batchId));
    }
    return Object.freeze({ results: Object.freeze(results) });
  }

  return Object.freeze({
    initializePaused,
    pauseAll,
    pauseBatch,
    cancelRemaining,
    snapshot,
    startAll,
    startBatch,
  });
}

module.exports = { createPaidMediaBatchOrchestrator };
