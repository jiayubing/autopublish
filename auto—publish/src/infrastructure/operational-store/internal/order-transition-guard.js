"use strict";

const domain = require("../../../domain");
const { fromText } = require("./operational-store-utils");

const TRACKING_STATUS_PRIORITY = Object.freeze({
  0: 0,
  1: 1,
});

function createOrderTransitionGuard(context) {
  const { db, fail } = context;

  function readFacts(orderId) {
    const row = db
      .prepare(
        "SELECT o.order_id,o.attempt_id,p.article_id,p.status AS publication_status,a.status AS attempt_status,i.state AS intent_state,i.payload_json AS intent_payload FROM remote_orders o JOIN publication_attempts a ON a.attempt_id=o.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id LEFT JOIN recovery_intents i ON i.attempt_id=a.attempt_id WHERE o.order_id=?",
      )
      .get(orderId);
    if (!row) throw fail("OPERATIONAL_ORDER_NOT_FOUND");
    const published = Boolean(
      db
        .prepare(
          "SELECT 1 FROM publication_records WHERE article_id=? AND status='published' LIMIT 1",
        )
        .get(row.article_id),
    );
    const anomaly = db
      .prepare(
        "SELECT evidence_json FROM remote_evidence WHERE attempt_id=? AND remote_id=?",
      )
      .get(row.attempt_id, `order-status-anomaly:${orderId}`);
    const anomalyFact = anomaly ? fromText(anomaly.evidence_json) : null;
    const intent = fromText(row.intent_payload) || {};
    const phase = intent.detail && intent.detail.phase;
    const cancellationEvidenceRows = db
      .prepare(
        "SELECT evidence_json FROM remote_evidence WHERE attempt_id=? AND remote_id LIKE 'order-cancellation-intent:%'",
      )
      .all(row.attempt_id);
    const cancellationEvidence = cancellationEvidenceRows.some((entry) => {
      const value = fromText(entry.evidence_json);
      return value && value.state === "open";
    });
    const historyRow = db
      .prepare(
        "SELECT evidence_json FROM remote_evidence WHERE attempt_id=? AND remote_id=?",
      )
      .get(row.attempt_id, `order-history:${orderId}`);
    let history;
    try {
      history = historyRow
        ? domain.parseOrderHistoryV1(fromText(historyRow.evidence_json))
        : null;
    } catch (error) {
      throw fail(error.code || "ORDER_HISTORY_V1_INVALID");
    }
    const latest =
      history && history.entries.length
        ? history.entries[history.entries.length - 1]
        : null;
    const latestFingerprint = latest
      ? latest.kind === "observation"
        ? latest.orderObservationV1.evidenceFingerprint
        : latest.terminalObservationV1.evidenceFingerprint
      : null;
    return Object.freeze({
      orderId: row.order_id,
      attemptId: row.attempt_id,
      articleId: row.article_id,
      publicationStatus: row.publication_status,
      attemptStatus: row.attempt_status,
      published,
      openAnomaly: Boolean(anomalyFact && anomalyFact.state === "open"),
      anomalyFact,
      orderRevision: history ? history.entries.length : 0,
      latestOrderFactKind: latest ? latest.kind : null,
      latestOrderFactFingerprint: latestFingerprint,
      latestStatusCode:
        latest && latest.kind === "observation"
          ? latest.orderObservationV1.statusCode
          : null,
      latestTerminalKind:
        latest && latest.kind === "terminal"
          ? latest.terminalObservationV1.terminalKind
          : null,
      openCancellationIntent: Boolean(
        cancellationEvidence ||
        (typeof phase === "string" && phase.startsWith("order_cancellation_")),
      ),
    });
  }

  function decide(facts, transition) {
    if (facts.published) return "published_wins";
    if (transition === "published") return "apply_published";
    if (
      facts.openCancellationIntent &&
      transition !== "cancellation_resolution"
    )
      return "cancellation_conflict";
    if (facts.openAnomaly && transition !== "anomaly_resolution")
      return "anomaly_frozen";
    if (transition === "non_published_terminal") return "apply_terminal";
    return "keep_tracking";
  }

  function assertAllowed(facts, transition) {
    const decision = decide(facts, transition);
    if (decision === "cancellation_conflict")
      throw fail("ORDER_CANCELLATION_INTENT_OPEN");
    if (decision === "anomaly_frozen") throw fail("ORDER_STATUS_ANOMALY_OPEN");
    return decision;
  }

  function assertObservationAllowed(facts, statusCode) {
    if (statusCode === "2") return "apply_published";
    // Article-global publication success only suppresses lifecycle side effects.
    // The order's own remote observation remains an append-only fact and must
    // still be recorded in orderHistoryV1 after the article is published.
    if (facts.published) return "record_after_publication";
    if (facts.latestOrderFactKind === "terminal")
      throw fail("ORDER_TRANSITION_TERMINAL");
    const previousPriority = TRACKING_STATUS_PRIORITY[facts.latestStatusCode];
    const nextPriority = TRACKING_STATUS_PRIORITY[statusCode];
    if (
      previousPriority !== undefined &&
      nextPriority !== undefined &&
      nextPriority < previousPriority
    )
      throw fail("ORDER_OBSERVATION_STATUS_REGRESSION");
    return assertAllowed(facts, "observation");
  }

  return Object.freeze({
    readFacts,
    decide,
    assertAllowed,
    assertObservationAllowed,
  });
}

module.exports = { createOrderTransitionGuard };
