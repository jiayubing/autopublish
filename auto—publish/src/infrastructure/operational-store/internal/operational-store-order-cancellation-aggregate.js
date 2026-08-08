"use strict";

const crypto = require("node:crypto");
const domain = require("../../../domain");
const { createOrderTransitionGuard } = require("./order-transition-guard");
const {
  fromText,
  rejectSensitive,
  text,
} = require("./operational-store-utils");

const TOKEN_TTL_MS = 5 * 60 * 1000;

function createOrderCancellationAggregate(context, orderHistoryOwner) {
  const {
    db,
    open,
    transaction,
    clock,
    randomUUID,
    fail,
    iso,
    internalPaidExecutionTransitionFault,
  } = context;
  const guard = createOrderTransitionGuard(context);

  function fault(point, detail) {
    if (internalPaidExecutionTransitionFault)
      internalPaidExecutionTransitionFault(point, detail || {});
  }

  function fingerprint(value) {
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(value), "utf8")
      .digest("hex");
  }

  function evidenceRow(attemptId, remoteId) {
    return db
      .prepare(
        "SELECT evidence_id,evidence_json,created_at FROM remote_evidence WHERE attempt_id=? AND remote_id=?",
      )
      .get(attemptId, remoteId);
  }

  function writeEvidence(attemptId, remoteId, value, stamp) {
    rejectSensitive(value);
    const existing = evidenceRow(attemptId, remoteId);
    if (existing) {
      db.prepare(
        "UPDATE remote_evidence SET evidence_json=?,created_at=? WHERE evidence_id=?",
      ).run(text(value), stamp, existing.evidence_id);
      return;
    }
    db.prepare(
      "INSERT INTO remote_evidence(evidence_id,attempt_id,remote_id,remote_url,evidence_json,created_at) VALUES(?,?,?,?,?,?)",
    ).run(randomUUID(), attemptId, remoteId, null, text(value), stamp);
  }

  function readEvidence(attemptId, remoteId) {
    const row = evidenceRow(attemptId, remoteId);
    return row ? fromText(row.evidence_json) : null;
  }

  function cancellationRows(orderAttemptId) {
    return db
      .prepare(
        "SELECT evidence_json FROM remote_evidence WHERE attempt_id=? AND remote_id LIKE 'order-cancellation-intent:%' ORDER BY created_at DESC,rowid DESC",
      )
      .all(orderAttemptId)
      .map((row) => fromText(row.evidence_json))
      .filter(Boolean);
  }

  function openIntent(facts) {
    return cancellationRows(facts.attemptId).find(
      (value) => value.state === "open",
    );
  }

  function requiredText(value, code) {
    if (typeof value !== "string" || !value) throw fail(code);
    return value;
  }

  function assertPrepared(input, stamp) {
    const value = input || {};
    const orderId = requiredText(
      value.orderId,
      "ORDER_CANCELLATION_INPUT_INVALID",
    );
    const facts = guard.readFacts(orderId);
    const prepared = readEvidence(
      facts.attemptId,
      `order-cancellation-preflight:${orderId}`,
    );
    if (
      !prepared ||
      prepared.state !== "prepared" ||
      prepared.confirmationToken !== value.confirmationToken ||
      (value.cancellationAttemptId !== undefined &&
        prepared.cancellationAttemptId !== value.cancellationAttemptId) ||
      Date.parse(prepared.expiresAt) < Date.parse(stamp)
    )
      throw fail("ORDER_CANCELLATION_CONFIRMATION_STALE");
    if (
      prepared.expectedOrderRevision !== facts.orderRevision ||
      prepared.expectedObservationFingerprint !==
        facts.latestOrderFactFingerprint ||
      prepared.expectedStatusCode !== facts.latestStatusCode
    )
      throw fail("ORDER_CANCELLATION_OBSERVATION_STALE");
    return { facts, prepared };
  }

  function prepareOrderCancellation(input) {
    open();
    const orderId = requiredText(
      input && input.orderId,
      "ORDER_CANCELLATION_INPUT_INVALID",
    );
    const stamp = iso(clock);
    return transaction(() => {
      const facts = guard.readFacts(orderId);
      if (openIntent(facts)) throw fail("ORDER_CANCELLATION_INTENT_OPEN");
      if (
        facts.published ||
        facts.latestOrderFactKind !== "observation" ||
        !["0", "1"].includes(facts.latestStatusCode)
      )
        throw fail("ORDER_CANCELLATION_NOT_ALLOWED");
      guard.assertAllowed(facts, "cancellation_begin");
      const cancellationAttemptId = `order-cancellation-${randomUUID()}`;
      const confirmationToken = `order-cancellation-confirm-${randomUUID()}`;
      const prepared = Object.freeze({
        version: 1,
        state: "prepared",
        orderId,
        orderAttemptId: facts.attemptId,
        cancellationAttemptId,
        expectedOrderRevision: facts.orderRevision,
        expectedObservationFingerprint: facts.latestOrderFactFingerprint,
        expectedStatusCode: facts.latestStatusCode,
        confirmationToken,
        preparedAt: stamp,
        expiresAt: new Date(Date.parse(stamp) + TOKEN_TTL_MS).toISOString(),
      });
      writeEvidence(
        facts.attemptId,
        `order-cancellation-preflight:${orderId}`,
        prepared,
        stamp,
      );
      return Object.freeze({
        orderId,
        cancellationAttemptId,
        expectedObservationFingerprint: facts.latestOrderFactFingerprint,
        actionLabel: facts.latestStatusCode === "0" ? "取消订单" : "尝试取消",
        riskCode:
          facts.latestStatusCode === "1"
            ? "CANCELLATION_MAY_BE_REJECTED"
            : null,
        confirmationToken,
        expiresAt: prepared.expiresAt,
      });
    });
  }

  function beginOrderCancellation(input) {
    open();
    const stamp = iso(clock);
    return transaction(() => {
      const value = input || {};
      const factsBefore = guard.readFacts(
        requiredText(value.orderId, "ORDER_CANCELLATION_INPUT_INVALID"),
      );
      const existingPreflight = readEvidence(
        factsBefore.attemptId,
        `order-cancellation-preflight:${factsBefore.orderId}`,
      );
      if (
        existingPreflight &&
        existingPreflight.state === "consumed" &&
        existingPreflight.confirmationToken === value.confirmationToken
      ) {
        const existing = locateIntent(
          existingPreflight.cancellationAttemptId,
        ).intent;
        if (existing.state === "resolved")
          return Object.freeze({ ...existing, idempotent: true });
        throw fail("ORDER_CANCELLATION_INTENT_OPEN");
      }
      const { facts, prepared } = assertPrepared(input, stamp);
      if (openIntent(facts)) throw fail("ORDER_CANCELLATION_INTENT_OPEN");
      guard.assertAllowed(facts, "cancellation_begin");
      const intent = Object.freeze({
        version: 1,
        state: "open",
        outcome: null,
        orderId: prepared.orderId,
        orderAttemptId: prepared.orderAttemptId,
        cancellationAttemptId: prepared.cancellationAttemptId,
        expectedOrderRevision: prepared.expectedOrderRevision,
        expectedObservationFingerprint: prepared.expectedObservationFingerprint,
        expectedStatusCode: prepared.expectedStatusCode,
        openedAt: stamp,
        resolvedAt: null,
        resolution: null,
      });
      writeEvidence(
        facts.attemptId,
        `order-cancellation-intent:${prepared.cancellationAttemptId}`,
        intent,
        stamp,
      );
      writeEvidence(
        facts.attemptId,
        `order-cancellation-preflight:${prepared.orderId}`,
        Object.freeze({ ...prepared, state: "consumed", consumedAt: stamp }),
        stamp,
      );
      fault("after-order-cancellation-intent", {
        orderId: prepared.orderId,
        cancellationAttemptId: prepared.cancellationAttemptId,
      });
      return intent;
    });
  }

  function locateIntent(cancellationAttemptId) {
    requiredText(cancellationAttemptId, "ORDER_CANCELLATION_ATTEMPT_REQUIRED");
    const row = db
      .prepare(
        "SELECT attempt_id,evidence_json FROM remote_evidence WHERE remote_id=?",
      )
      .get(`order-cancellation-intent:${cancellationAttemptId}`);
    if (!row) throw fail("ORDER_CANCELLATION_ATTEMPT_NOT_FOUND");
    return {
      orderAttemptId: row.attempt_id,
      intent: fromText(row.evidence_json),
    };
  }

  function recordOrderCancellationOutcome(input) {
    open();
    const value = input || {};
    const stamp = iso(clock);
    return transaction(() => {
      const located = locateIntent(value.cancellationAttemptId);
      const intent = located.intent;
      if (intent.state === "resolved") {
        if (intent.outcome === value.outcome)
          return Object.freeze({ status: intent.outcome, idempotent: true });
        throw fail("ORDER_CANCELLATION_OUTCOME_CONFLICT");
      }
      if (!["cancelled", "rejected"].includes(value.outcome))
        throw fail("ORDER_CANCELLATION_OUTCOME_INVALID");
      const facts = guard.readFacts(intent.orderId);
      guard.assertAllowed(facts, "cancellation_resolution");
      if (
        !facts.published &&
        (facts.orderRevision !== intent.expectedOrderRevision ||
          facts.latestOrderFactFingerprint !==
            intent.expectedObservationFingerprint ||
          facts.latestStatusCode !== intent.expectedStatusCode)
      )
        throw fail("ORDER_CANCELLATION_OBSERVATION_STALE");
      let historyResult = null;
      const evidenceFingerprint =
        typeof value.evidenceFingerprint === "string" &&
        /^[a-f0-9]{64}$/u.test(value.evidenceFingerprint)
          ? value.evidenceFingerprint
          : fingerprint({
              cancellationAttemptId: intent.cancellationAttemptId,
              orderId: intent.orderId,
              outcome: value.outcome,
            });
      if (value.outcome === "cancelled") {
        const snapshot = orderHistoryOwner.cancellationSnapshot(intent.orderId);
        historyResult = orderHistoryOwner.recordCancellationTerminal({
          orderId: intent.orderId,
          stamp,
          terminalObservationV1: domain.parseTerminalObservationV1({
            version: 1,
            orderIdentityV1: { version: 1, orderId: intent.orderId },
            terminalKind: "CANCELLED",
            observedAt: stamp,
            eventAt: null,
            eventAtSource: "not_available",
            actualAmount: null,
            evidenceFingerprint,
            orderSnapshotFingerprint: snapshot.orderSnapshotFingerprint,
          }),
        });
      }
      fault("after-order-cancellation-outcome", {
        orderId: intent.orderId,
        outcome: value.outcome,
      });
      const resolved = Object.freeze({
        ...intent,
        state: "resolved",
        outcome: value.outcome,
        resolvedAt: stamp,
        resolution: Object.freeze({
          kind:
            value.resolutionKind === "manual_resolution"
              ? "manual_resolution"
              : "remote_outcome",
          evidenceFingerprint,
        }),
      });
      writeEvidence(
        located.orderAttemptId,
        `order-cancellation-intent:${intent.cancellationAttemptId}`,
        resolved,
        stamp,
      );
      return Object.freeze({
        status: value.outcome,
        idempotent: false,
        publishedWins: Boolean(historyResult && historyResult.publishedWins),
      });
    });
  }

  function getOrderCancellationContext(input) {
    open();
    const located = locateIntent(input && input.cancellationAttemptId);
    const snapshot = orderHistoryOwner.cancellationSnapshot(
      located.intent.orderId,
    );
    return Object.freeze({
      ...located.intent,
      orderHistoryV1: snapshot.history,
      published: guard.readFacts(located.intent.orderId).published,
    });
  }

  function getOrderCancellationView(input) {
    open();
    const orderId = requiredText(
      input && input.orderId,
      "ORDER_CANCELLATION_INPUT_INVALID",
    );
    const facts = guard.readFacts(orderId);
    const latest = cancellationRows(facts.attemptId)[0] || null;
    const allowed =
      !facts.published &&
      !facts.openCancellationIntent &&
      facts.latestOrderFactKind === "observation" &&
      ["0", "1"].includes(facts.latestStatusCode);
    return Object.freeze({
      orderId,
      state: latest ? latest.state : "none",
      cancellationAttemptId: latest ? latest.cancellationAttemptId : null,
      outcome: latest ? latest.outcome : null,
      actionLabel: allowed
        ? facts.latestStatusCode === "0"
          ? "取消订单"
          : "尝试取消"
        : null,
      riskCode:
        allowed && facts.latestStatusCode === "1"
          ? "CANCELLATION_MAY_BE_REJECTED"
          : null,
      manualResolutionRequired: Boolean(latest && latest.state === "open"),
    });
  }

  function prepareCancellationResolution(input) {
    open();
    const value = input || {};
    const stamp = iso(clock);
    return transaction(() => {
      const located = locateIntent(value.cancellationAttemptId);
      if (located.intent.state !== "open")
        throw fail("ORDER_CANCELLATION_ALREADY_RESOLVED");
      if (
        !["verified_cancelled", "verified_active", "inconclusive"].includes(
          value.classification,
        ) ||
        typeof value.evidenceFingerprint !== "string" ||
        !/^[a-f0-9]{64}$/u.test(value.evidenceFingerprint)
      )
        throw fail("ORDER_CANCELLATION_VERIFICATION_INVALID");
      const confirmationToken = `order-cancellation-resolution-${randomUUID()}`;
      const prepared = Object.freeze({
        version: 1,
        cancellationAttemptId: located.intent.cancellationAttemptId,
        orderId: located.intent.orderId,
        expectedObservationFingerprint:
          located.intent.expectedObservationFingerprint,
        classification: value.classification,
        evidenceFingerprint: value.evidenceFingerprint,
        evidenceSummary:
          value.evidenceSummary && typeof value.evidenceSummary === "object"
            ? value.evidenceSummary
            : Object.freeze({ source: "supplier_query" }),
        confirmationToken,
        preparedAt: stamp,
        expiresAt: new Date(Date.parse(stamp) + TOKEN_TTL_MS).toISOString(),
      });
      writeEvidence(
        located.orderAttemptId,
        `order-cancellation-resolution:${located.intent.cancellationAttemptId}`,
        prepared,
        stamp,
      );
      return prepared;
    });
  }

  function resolveCancellation(input, expectedClassification, outcome) {
    open();
    const value = input || {};
    const located = locateIntent(value.cancellationAttemptId);
    if (located.intent.state === "resolved") {
      if (located.intent.outcome === outcome)
        return Object.freeze({ status: outcome, idempotent: true });
      throw fail("ORDER_CANCELLATION_RESOLUTION_CONFLICT");
    }
    const prepared = readEvidence(
      located.orderAttemptId,
      `order-cancellation-resolution:${located.intent.cancellationAttemptId}`,
    );
    const stamp = iso(clock);
    if (
      !prepared ||
      prepared.classification !== expectedClassification ||
      prepared.confirmationToken !== value.confirmationToken ||
      prepared.evidenceFingerprint !== value.evidenceFingerprint ||
      Date.parse(prepared.expiresAt) < Date.parse(stamp)
    )
      throw fail("ORDER_CANCELLATION_RESOLUTION_STALE");
    return recordOrderCancellationOutcome({
      cancellationAttemptId: located.intent.cancellationAttemptId,
      outcome,
      evidenceFingerprint: prepared.evidenceFingerprint,
      resolutionKind: "manual_resolution",
    });
  }

  return Object.freeze({
    prepareOrderCancellation,
    beginOrderCancellation,
    recordOrderCancellationOutcome,
    getOrderCancellationContext,
    getOrderCancellationView,
    prepareCancellationResolution,
    confirmCancellationSucceeded: (input) =>
      resolveCancellation(input, "verified_cancelled", "cancelled"),
    confirmCancellationNotApplied: (input) =>
      resolveCancellation(input, "verified_active", "rejected"),
  });
}

module.exports = { createOrderCancellationAggregate };
