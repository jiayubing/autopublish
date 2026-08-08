"use strict";

const crypto = require("node:crypto");
const domain = require("../../../domain");

const { createOrderTransitionGuard } = require("./order-transition-guard");
const {
  fromText,
  rejectSensitive,
  safeDisplayText,
  text,
} = require("./operational-store-utils");

const TOKEN_TTL_MS = 5 * 60 * 1000;

function projectOrderHistoryV1(input) {
  const history = domain.parseOrderHistoryV1(input);
  const latest = history.entries[history.entries.length - 1] || null;
  const observation =
    latest && latest.kind === "observation" ? latest.orderObservationV1 : null;
  const terminal =
    latest && latest.kind === "terminal" ? latest.terminalObservationV1 : null;
  const publishedEntry = [...history.entries]
    .reverse()
    .find(
      (entry) =>
        entry.kind === "observation" &&
        entry.orderObservationV1.statusCode === "2",
    );
  const publishedObservation = publishedEntry
    ? publishedEntry.orderObservationV1
    : null;
  return Object.freeze({
    latest,
    statusCode: observation
      ? observation.statusCode
      : terminal && terminal.terminalKind === "REJECTED"
        ? "4"
        : terminal && terminal.terminalKind === "CANCELLED"
          ? "cancelled"
        : "",
    observedAt: observation
      ? observation.observedAt
      : terminal
        ? terminal.observedAt
        : null,
    actualAmount: observation
      ? observation.actualAmount
      : terminal
        ? terminal.actualAmount
        : null,
    publishedAt: publishedObservation
      ? publishedObservation.eventAt || publishedObservation.observedAt
      : null,
    remoteUrl: publishedObservation ? publishedObservation.remoteUrl : null,
  });
}

function createOrderObservationAggregate(
  context,
  activeTarget,
  publicationSuccess,
) {
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

  function orderRow(orderId) {
    const row = db
      .prepare(
        "SELECT o.order_id,o.attempt_id,o.payload_json,o.created_at,p.publication_id,p.article_id,p.target_json,p.status AS publication_status,a.status AS attempt_status,s.item_id,s.payload_json AS item_payload,i.state AS intent_state,i.payload_json AS intent_payload FROM remote_orders o JOIN publication_attempts a ON a.attempt_id=o.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id LEFT JOIN submission_items s ON json_extract(s.payload_json,'$.attemptId')=a.attempt_id LEFT JOIN recovery_intents i ON i.attempt_id=a.attempt_id WHERE o.order_id=?",
      )
      .get(orderId);
    if (!row) throw fail("OPERATIONAL_ORDER_NOT_FOUND");
    try {
      row.orderSnapshotV1 = domain.parseOrderSnapshotV1(
        fromText(row.payload_json),
      );
    } catch (_) {
      throw fail("ORDER_SNAPSHOT_V1_INVALID");
    }
    row.itemPayload = fromText(row.item_payload) || {};
    row.intentPayload = fromText(row.intent_payload) || {};
    return row;
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
    } else {
      db.prepare(
        "INSERT INTO remote_evidence(evidence_id,attempt_id,remote_id,remote_url,evidence_json,created_at) VALUES(?,?,?,?,?,?)",
      ).run(randomUUID(), attemptId, remoteId, null, text(value), stamp);
    }
  }

  function historyFor(row) {
    if (row.history_json)
      return domain.parseOrderHistoryV1(fromText(row.history_json));
    const saved = evidenceRow(row.attempt_id, `order-history:${row.order_id}`);
    if (!saved)
      return domain.parseOrderHistoryV1({
        version: 1,
        orderIdentityV1: row.orderSnapshotV1.orderIdentityV1,
        entries: [],
      });
    return domain.parseOrderHistoryV1(fromText(saved.evidence_json));
  }

  function appendHistory(row, kind, fact, stamp) {
    const current = historyFor(row);
    const entry =
      kind === "observation"
        ? {
            sequence: current.entries.length + 1,
            kind,
            orderObservationV1: fact,
          }
        : {
            sequence: current.entries.length + 1,
            kind,
            terminalObservationV1: fact,
          };
    const next = domain.parseOrderHistoryV1({
      version: 1,
      orderIdentityV1: current.orderIdentityV1,
      entries: [...current.entries, entry],
    });
    writeEvidence(row.attempt_id, `order-history:${row.order_id}`, next, stamp);
    return next;
  }

  function sameLatest(history, observation) {
    const last = history.entries[history.entries.length - 1];
    return Boolean(
      last &&
      ((last.kind === "observation" &&
        last.orderObservationV1.evidenceFingerprint ===
          observation.evidenceFingerprint) ||
        (last.kind === "terminal" &&
          observation.statusCode === "4" &&
          last.terminalObservationV1.evidenceFingerprint ===
            observation.evidenceFingerprint)),
    );
  }

  function currentQueryBinding(row) {
    const history = historyFor(row);
    const latest = history.entries[history.entries.length - 1] || null;
    const anomaly = evidenceRow(
      row.attempt_id,
      `order-status-anomaly:${row.order_id}`,
    );
    const anomalyFact = anomaly ? fromText(anomaly.evidence_json) : null;
    const facts = guard.readFacts(row.order_id);
    return Object.freeze({
      orderRevision: history.entries.length,
      latestFactFingerprint: latest
        ? latest.kind === "observation"
          ? latest.orderObservationV1.evidenceFingerprint
          : latest.terminalObservationV1.evidenceFingerprint
        : null,
      anomalyFingerprint: anomalyFact ? fingerprint(anomalyFact) : null,
      published: facts.published,
    });
  }

  function expectedQueryBinding(value) {
    if (value === undefined || value === null) return null;
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some(
        (key) =>
          ![
            "orderRevision",
            "latestFactFingerprint",
            "anomalyFingerprint",
            "published",
          ].includes(key),
      ) ||
      !Number.isSafeInteger(value.orderRevision) ||
      value.orderRevision < 0 ||
      ![value.latestFactFingerprint, value.anomalyFingerprint].every(
        (candidate) =>
          candidate === null ||
          (typeof candidate === "string" && /^[a-f0-9]{64}$/u.test(candidate)),
      ) ||
      typeof value.published !== "boolean"
    )
      throw fail("ORDER_QUERY_BINDING_INVALID");
    return Object.freeze({
      orderRevision: value.orderRevision,
      latestFactFingerprint: value.latestFactFingerprint,
      anomalyFingerprint: value.anomalyFingerprint,
      published: value.published,
    });
  }

  function assertQueryBinding(row, expected, code, publishedWins) {
    const parsed = expectedQueryBinding(expected);
    if (!parsed) return;
    const current = currentQueryBinding(row);
    if (JSON.stringify(current) === JSON.stringify(parsed)) return;
    if (publishedWins === true) return;
    throw fail(code);
  }

  function paidTarget(row, state, terminalAt) {
    return domain.parsePaidTargetV1({
      version: 1,
      articleIdentityV1: row.orderSnapshotV1.articleIdentityV1,
      targetIdentityV1: row.orderSnapshotV1.targetIdentityV1,
      orderCreationAttemptId: row.orderSnapshotV1.orderCreationAttemptId,
      orderIdentityV1: row.orderSnapshotV1.orderIdentityV1,
      state,
      terminalAt,
    });
  }

  function updateItemTarget(row, state, terminalAt, outcomeStatus) {
    if (!row.item_id) return;
    const payload = Object.assign({}, row.itemPayload, {
      paidTargetV1: paidTarget(row, state, terminalAt),
      outcomeStatus,
    });
    db.prepare(
      "UPDATE submission_items SET payload_json=?,revision=revision+1 WHERE item_id=?",
    ).run(text(payload), row.item_id);
  }

  function publicationEvidence(row, observation, manual, stamp) {
    const snapshot = row.orderSnapshotV1;
    const firstPublishedAt =
      observation.eventAt || (manual ? stamp : observation.observedAt);
    const firstPublishedAtSource = observation.eventAt
      ? observation.eventAtSource
      : manual
        ? "manual_positive_evidence_time"
        : "first_positive_observation_time";
    let customerSnapshotV1;
    try {
      customerSnapshotV1 = domain.parseCustomerSnapshotV1(
        row.itemPayload.customerSnapshotV1,
      );
    } catch (_) {
      throw fail("ORDER_CUSTOMER_SNAPSHOT_UNAVAILABLE");
    }
    if (customerSnapshotV1.clientId !== snapshot.articleIdentityV1.clientId)
      throw fail("ORDER_CUSTOMER_SNAPSHOT_UNAVAILABLE");
    return domain.parsePublicationEvidenceV1({
      version: 1,
      articleIdentityV1: snapshot.articleIdentityV1,
      customerSnapshotV1,
      contentAvailable: true,
      title: snapshot.submittedTitle,
      body: snapshot.submittedBody,
      contentFingerprint: domain.preparedContentFingerprint({
        title: snapshot.submittedTitle,
        body: snapshot.submittedBody,
      }),
      targetSnapshotV1: {
        version: 1,
        kind: "media",
        mediaResourceId: snapshot.targetIdentityV1.mediaResourceId,
        mediaName: snapshot.mediaName,
      },
      resultCode: "PAID_PUBLISHED",
      submittedAt: snapshot.remoteCallStartedAt,
      submittedAtSource: "paid_order_remote_call_started",
      firstPublishedAt,
      firstPublishedAtSource,
      imageSummaryV1: {
        deliveryMode: "text_only",
        images: [],
        decisionKind: "initial",
      },
      orderNumber: snapshot.orderIdentityV1.orderId,
      remoteUrl: observation.remoteUrl,
      missingReasons: [],
      safeEvidenceRefs: [
        {
          kind: "PAID_ORDER_SNAPSHOT",
          fingerprint: observation.orderSnapshotFingerprint,
        },
        {
          kind: manual
            ? "MANUAL_POSITIVE_EVIDENCE"
            : "PAID_PUBLISHED_OBSERVATION",
          fingerprint: observation.evidenceFingerprint,
        },
      ],
    });
  }

  function resolveRecovery(row, phase, stamp) {
    if (!row.intent_state) return;
    const next = Object.assign({}, row.intentPayload, {
      detail: Object.assign({}, row.intentPayload.detail || {}, { phase }),
    });
    db.prepare(
      "UPDATE recovery_intents SET state='resolved',payload_json=?,updated_at=? WHERE attempt_id=?",
    ).run(text(next), stamp, row.attempt_id);
  }

  function applyPublished(row, observation, stamp, manual) {
    const existingSuccess = publicationSuccess.readFirstPublicationSuccess(
      row.article_id,
    );
    const success =
      existingSuccess ||
      publicationSuccess.applyFirstPublicationSuccess({
        attemptId: row.attempt_id,
        publicationEvidenceV1: publicationEvidence(
          row,
          observation,
          manual,
          stamp,
        ),
        stamp,
      });
    fault("after-paid-publication-success", { orderId: row.order_id });

    // The primitive owns the article-global first-publication fact.  Even when
    // another target won first, this order's trusted status-2 observation must
    // still close its own recovery/anomaly facts and paid target projection.
    updateItemTarget(row, "TERMINAL_PUBLISHED", stamp, "published");
    resolveRecovery(row, "order_published", stamp);
    const anomaly = evidenceRow(
      row.attempt_id,
      `order-status-anomaly:${row.order_id}`,
    );
    const anomalyFact = anomaly && fromText(anomaly.evidence_json);
    if (anomalyFact && anomalyFact.state === "open")
      writeEvidence(
        row.attempt_id,
        `order-status-anomaly:${row.order_id}`,
        Object.freeze({
          ...anomalyFact,
          state: "resolved",
          resolution: Object.freeze({
            action: manual ? "confirmOrderPublished" : "publishedObservation",
            status: "published",
            decidedAt: stamp,
          }),
        }),
        stamp,
      );
    return success;
  }

  function applyRejected(
    row,
    observation,
    stamp,
    terminalFact,
    resolvingAnomaly,
  ) {
    const facts = guard.readFacts(row.order_id);
    const decision = resolvingAnomaly
      ? facts.published
        ? "published_wins"
        : "apply_terminal"
      : guard.assertAllowed(facts, "non_published_terminal");
    if (decision === "published_wins") return { publishedWins: true };
    db.prepare(
      "UPDATE publication_attempts SET status='failed',finished_at=? WHERE attempt_id=? AND status<>'published'",
    ).run(stamp, row.attempt_id);
    db.prepare(
      "UPDATE publication_records SET status='failed',updated_at=? WHERE publication_id=? AND status<>'published'",
    ).run(stamp, row.publication_id);
    updateItemTarget(row, "TERMINAL_REJECTED", stamp, "failed");
    resolveRecovery(row, "order_rejected", stamp);
    activeTarget.release({
      articleId: row.article_id,
      publicationId: row.publication_id,
      attemptId: row.attempt_id,
    });
    const terminal =
      terminalFact ||
      domain.parseTerminalObservationV1({
        version: 1,
        orderIdentityV1: observation.orderIdentityV1,
        terminalKind: "REJECTED",
        observedAt: observation.observedAt,
        eventAt: observation.eventAt,
        eventAtSource: observation.eventAtSource,
        actualAmount: observation.actualAmount,
        evidenceFingerprint: observation.evidenceFingerprint,
        orderSnapshotFingerprint: observation.orderSnapshotFingerprint,
      });
    appendHistory(row, "terminal", terminal, stamp);
    return { publishedWins: false };
  }

  function recordOrderObservation(input) {
    open();
    let observation;
    try {
      observation = domain.parseOrderObservationV1(
        input && input.orderObservationV1,
      );
    } catch (error) {
      throw fail(error.code || "ORDER_OBSERVATION_V1_INVALID");
    }
    const stamp = iso(clock);
    return transaction(() => {
      const row = orderRow(observation.orderIdentityV1.orderId);
      if (
        observation.orderSnapshotFingerprint !==
        domain.orderSnapshotFingerprint(row.orderSnapshotV1)
      )
        throw fail("ORDER_OBSERVATION_SNAPSHOT_MISMATCH");
      const current = historyFor(row);
      if (sameLatest(current, observation))
        return Object.freeze({
          orderId: row.order_id,
          statusCode: observation.statusCode,
          idempotent: true,
        });
      assertQueryBinding(
        row,
        input && input.queryBinding,
        "ORDER_OBSERVATION_QUERY_STALE",
        observation.statusCode === "2",
      );
      const facts = guard.readFacts(row.order_id);
      guard.assertObservationAllowed(facts, observation.statusCode);
      appendHistory(row, "observation", observation, stamp);
      fault("after-order-observation", { orderId: row.order_id });
      let publication = null;
      let anomaly = null;
      if (observation.statusCode === "2")
        publication = applyPublished(row, observation, stamp, false);
      else if (observation.statusCode === "4")
        applyRejected(row, observation, stamp);
      else if (observation.statusCode === "9" && !facts.published)
        anomaly = openAnomaly(
          row,
          observation.evidenceFingerprint,
          stamp,
          "unsettled-aftercare",
        );
      return Object.freeze({
        orderId: row.order_id,
        statusCode: observation.statusCode,
        idempotent: false,
        publication,
        mutation: anomaly
          ? Object.freeze({
              changed: true,
              kind: "order_status_anomaly_recorded",
              orderId: row.order_id,
            })
          : null,
      });
    });
  }

  function openAnomaly(row, evidenceFingerprint, stamp, reason) {
    const history = historyFor(row);
    const latest = history.entries[history.entries.length - 1] || null;
    const fact = Object.freeze({
      version: 1,
      state: "open",
      orderIdentityV1: row.orderSnapshotV1.orderIdentityV1,
      reason,
      openedAt: stamp,
      latestObservationFingerprint: latest
        ? latest.kind === "observation"
          ? latest.orderObservationV1.evidenceFingerprint
          : latest.terminalObservationV1.evidenceFingerprint
        : null,
      evidenceFingerprint,
      resolution: null,
    });
    writeEvidence(
      row.attempt_id,
      `order-status-anomaly:${row.order_id}`,
      fact,
      stamp,
    );
    db.prepare(
      "UPDATE publication_attempts SET status='uncertain',finished_at=? WHERE attempt_id=? AND status<>'published'",
    ).run(stamp, row.attempt_id);
    db.prepare(
      "UPDATE publication_records SET status='uncertain',updated_at=? WHERE publication_id=? AND status<>'published'",
    ).run(stamp, row.publication_id);
    if (!guard.readFacts(row.order_id).published)
      activeTarget.markUncertain({
        articleId: row.article_id,
        publicationId: row.publication_id,
        attemptId: row.attempt_id,
        stamp,
      });
    const intent = Object.assign({}, row.intentPayload, {
      detail: Object.assign({}, row.intentPayload.detail || {}, {
        phase: "order_status_anomaly",
      }),
    });
    if (row.intent_state)
      db.prepare(
        "UPDATE recovery_intents SET state='manual_check',payload_json=?,updated_at=? WHERE attempt_id=?",
      ).run(text(intent), stamp, row.attempt_id);
    return fact;
  }

  function recordOrderStatusAnomaly(input) {
    open();
    const value = input || {};
    if (
      typeof value.orderId !== "string" ||
      typeof value.evidenceFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/u.test(value.evidenceFingerprint)
    )
      throw fail("ORDER_STATUS_ANOMALY_INVALID");
    const stamp = iso(clock);
    return transaction(() => {
      const row = orderRow(value.orderId);
      const facts = guard.readFacts(value.orderId);
      if (facts.published)
        return Object.freeze({ orderId: value.orderId, publishedWins: true });
      assertQueryBinding(
        row,
        value.queryBinding,
        "ORDER_OBSERVATION_QUERY_STALE",
        false,
      );
      const fact = openAnomaly(
        row,
        value.evidenceFingerprint,
        stamp,
        value.reason === "unknown-status" ? "unknown-status" : "order-missing",
      );
      return Object.freeze({ orderId: value.orderId, anomaly: fact });
    });
  }

  function verification(input) {
    const value = input || {};
    const allowed = [
      "verified_trackable",
      "verified_published",
      "verified_non_published_terminal",
      "inconclusive",
    ];
    if (
      !allowed.includes(value.classification) ||
      typeof value.evidenceFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/u.test(value.evidenceFingerprint)
    )
      throw fail("ORDER_STATUS_ANOMALY_EVIDENCE_INVALID");
    let observation = null;
    let terminalObservation = null;
    try {
      observation = value.orderObservationV1
        ? domain.parseOrderObservationV1(value.orderObservationV1)
        : null;
      terminalObservation = value.terminalObservationV1
        ? domain.parseTerminalObservationV1(value.terminalObservationV1)
        : null;
    } catch (error) {
      throw fail(error.code || "ORDER_STATUS_ANOMALY_EVIDENCE_INVALID");
    }
    if (
      (value.classification === "verified_non_published_terminal") !==
        Boolean(terminalObservation) ||
      ["verified_trackable", "verified_published"].includes(
        value.classification,
      ) !== Boolean(observation)
    )
      throw fail("ORDER_STATUS_ANOMALY_EVIDENCE_INVALID");
    return Object.freeze({
      classification: value.classification,
      evidenceFingerprint: value.evidenceFingerprint,
      orderObservationV1: observation,
      terminalObservationV1: terminalObservation,
    });
  }

  function anomalyBinding(row, fact, verified) {
    const facts = guard.readFacts(row.order_id);
    return Object.freeze({
      orderIdentityV1: row.orderSnapshotV1.orderIdentityV1,
      anomalyFingerprint: fingerprint(fact),
      latestObservationFingerprint: fact.latestObservationFingerprint,
      published: facts.published,
      publicationStatus: facts.publicationStatus,
      attemptStatus: facts.attemptStatus,
      orderRevision: facts.orderRevision,
      latestOrderFactKind: facts.latestOrderFactKind,
      latestOrderFactFingerprint: facts.latestOrderFactFingerprint,
      latestStatusCode: facts.latestStatusCode,
      latestTerminalKind: facts.latestTerminalKind,
      openCancellationIntent: facts.openCancellationIntent,
      evidenceFingerprint: verified.evidenceFingerprint,
      classification: verified.classification,
    });
  }

  function prepareOrderStatusAnomalyResolution(input) {
    open();
    const value = input || {};
    const verified = verification(value.verification);
    const stamp = iso(clock);
    return transaction(() => {
      const row = orderRow(value.orderId);
      assertQueryBinding(
        row,
        value.queryBinding,
        "ORDER_STATUS_ANOMALY_QUERY_STALE",
        false,
      );
      const saved = evidenceRow(
        row.attempt_id,
        `order-status-anomaly:${row.order_id}`,
      );
      const fact = saved && fromText(saved.evidence_json);
      if (!fact || fact.state !== "open")
        throw fail("ORDER_STATUS_ANOMALY_NOT_OPEN");
      const binding = anomalyBinding(row, fact, verified);
      const confirmationToken = `order-anomaly-${randomUUID()}`;
      const prepared = Object.freeze({
        version: 1,
        state: "prepared",
        confirmationToken,
        expiresAt: new Date(Date.parse(stamp) + TOKEN_TTL_MS).toISOString(),
        binding,
        bindingFingerprint: fingerprint(binding),
        verification: verified,
      });
      writeEvidence(
        row.attempt_id,
        `order-status-anomaly-resolution:${row.order_id}`,
        prepared,
        stamp,
      );
      return Object.freeze({
        orderId: row.order_id,
        classification: verified.classification,
        confirmationToken,
        expiresAt: prepared.expiresAt,
        allowedActions:
          verified.classification === "verified_trackable"
            ? Object.freeze(["resumeOrderTracking"])
            : verified.classification === "verified_published"
              ? Object.freeze(["confirmOrderPublished"])
              : verified.classification === "verified_non_published_terminal"
                ? Object.freeze(["confirmOrderNotPublished"])
                : Object.freeze([]),
      });
    });
  }

  function resolveAnomaly(input, action) {
    open();
    const value = input || {};
    const stamp = iso(clock);
    return transaction(() => {
      const row = orderRow(value.orderId);
      const anomalySaved = evidenceRow(
        row.attempt_id,
        `order-status-anomaly:${row.order_id}`,
      );
      const fact = anomalySaved && fromText(anomalySaved.evidence_json);
      if (fact && fact.state === "resolved") {
        if (fact.resolution && fact.resolution.action === action)
          return Object.freeze({
            orderId: row.order_id,
            status: fact.resolution.status,
            idempotent: true,
          });
        throw fail("ORDER_STATUS_ANOMALY_RESOLUTION_OPPOSITE");
      }
      if (!fact || fact.state !== "open")
        throw fail("ORDER_STATUS_ANOMALY_NOT_OPEN");
      const preparedSaved = evidenceRow(
        row.attempt_id,
        `order-status-anomaly-resolution:${row.order_id}`,
      );
      const prepared = preparedSaved && fromText(preparedSaved.evidence_json);
      if (
        !prepared ||
        prepared.state !== "prepared" ||
        prepared.confirmationToken !== value.confirmationToken ||
        prepared.expiresAt <= stamp
      )
        throw fail("ORDER_STATUS_ANOMALY_TOKEN_STALE");
      const verified = verification(prepared.verification);
      const binding = anomalyBinding(row, fact, verified);
      if (fingerprint(binding) !== prepared.bindingFingerprint)
        throw fail("ORDER_STATUS_ANOMALY_STATE_STALE");
      const expected = {
        resumeOrderTracking: "verified_trackable",
        confirmOrderPublished: "verified_published",
        confirmOrderNotPublished: "verified_non_published_terminal",
      }[action];
      if (verified.classification !== expected)
        throw fail("ORDER_STATUS_ANOMALY_RESOLUTION_EVIDENCE_MISMATCH");
      const facts = guard.readFacts(row.order_id);
      if (facts.openCancellationIntent && action !== "confirmOrderPublished")
        throw fail("ORDER_CANCELLATION_INTENT_OPEN");
      let status;
      if (action === "resumeOrderTracking") {
        appendHistory(row, "observation", verified.orderObservationV1, stamp);
        db.prepare(
          "UPDATE publication_attempts SET status='submitted',finished_at=NULL WHERE attempt_id=? AND status='uncertain'",
        ).run(row.attempt_id);
        db.prepare(
          "UPDATE publication_records SET status='submitted',updated_at=? WHERE publication_id=? AND status='uncertain'",
        ).run(stamp, row.publication_id);
        activeTarget.settle({
          articleId: row.article_id,
          publicationId: row.publication_id,
          attemptId: row.attempt_id,
          target: row.orderSnapshotV1.targetIdentityV1,
          status: "submitted",
          stamp,
        });
        resolveRecovery(row, "order_tracking_resumed", stamp);
        status = "tracking_resumed";
      } else if (action === "confirmOrderPublished") {
        appendHistory(row, "observation", verified.orderObservationV1, stamp);
        applyPublished(row, verified.orderObservationV1, stamp, true);
        status = "published";
      } else {
        const synthetic = {
          orderIdentityV1: verified.terminalObservationV1.orderIdentityV1,
          observedAt: verified.terminalObservationV1.observedAt,
          eventAt: verified.terminalObservationV1.eventAt,
          eventAtSource: verified.terminalObservationV1.eventAtSource,
          actualAmount: verified.terminalObservationV1.actualAmount,
          evidenceFingerprint:
            verified.terminalObservationV1.evidenceFingerprint,
          orderSnapshotFingerprint:
            verified.terminalObservationV1.orderSnapshotFingerprint,
        };
        applyRejected(
          row,
          synthetic,
          stamp,
          verified.terminalObservationV1,
          true,
        );
        status = "not_published";
      }
      fault("after-order-anomaly-resolution", {
        orderId: row.order_id,
        action,
      });
      const resolved = Object.freeze({
        ...fact,
        state: "resolved",
        resolution: Object.freeze({ action, status, decidedAt: stamp }),
      });
      writeEvidence(
        row.attempt_id,
        `order-status-anomaly:${row.order_id}`,
        resolved,
        stamp,
      );
      return Object.freeze({
        orderId: row.order_id,
        status,
        idempotent: false,
      });
    });
  }

  function listOrderObservationViews() {
    open();
    return Object.freeze(
      db
        .prepare(
          "SELECT o.order_id,o.attempt_id,o.payload_json,o.created_at,p.status AS publication_status,d.title_snapshot,d.filename,d.resource_name_snapshot,d.quoted_price,h.evidence_json AS history_json,x.evidence_json AS anomaly_json FROM remote_orders o JOIN publication_attempts a ON a.attempt_id=o.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id LEFT JOIN order_display_snapshots d ON d.attempt_id=o.attempt_id LEFT JOIN remote_evidence h ON h.attempt_id=o.attempt_id AND h.remote_id=('order-history:' || o.order_id) LEFT JOIN remote_evidence x ON x.attempt_id=o.attempt_id AND x.remote_id=('order-status-anomaly:' || o.order_id) ORDER BY o.created_at DESC,o.order_id DESC LIMIT 20000",
        )
        .all()
        .map((row) => {
          const snapshot = domain.parseOrderSnapshotV1(
            fromText(row.payload_json),
          );
          const history = historyFor({ ...row, orderSnapshotV1: snapshot });
          const projection = projectOrderHistoryV1(history);
          const anomalyFact = row.anomaly_json
            ? fromText(row.anomaly_json)
            : null;
          return Object.freeze({
            orderId: row.order_id,
            title: safeDisplayText(row.title_snapshot, 1000),
            filename: safeDisplayText(row.filename, 255),
            resourceName: safeDisplayText(row.resource_name_snapshot, 500),
            quotedPrice: row.quoted_price,
            createdAt: row.created_at,
            submittedAt: snapshot.remoteCallStartedAt,
            statusCode: projection.statusCode || "0",
            observedAt: projection.observedAt,
            publishedAt: projection.publishedAt,
            remoteUrl: projection.remoteUrl,
            actualAmount: projection.actualAmount,
            publicationStatus: row.publication_status,
            anomaly:
              anomalyFact && anomalyFact.state === "open"
                ? Object.freeze({
                    reason: anomalyFact.reason,
                    openedAt: anomalyFact.openedAt,
                  })
                : null,
          });
        }),
    );
  }

  function getOrderObservationContext(orderId) {
    open();
    const row = orderRow(orderId);
    const history = historyFor(row);
    const projection = projectOrderHistoryV1(history);
    const queryBinding = currentQueryBinding(row);
    return Object.freeze({
      orderId: row.order_id,
      orderSnapshotFingerprint: domain.orderSnapshotFingerprint(
        row.orderSnapshotV1,
      ),
      orderRevision: queryBinding.orderRevision,
      latestFactFingerprint: queryBinding.latestFactFingerprint,
      anomalyFingerprint: queryBinding.anomalyFingerprint,
      published: queryBinding.published,
      queryBinding,
      latestObservationFingerprint:
        projection.latest && projection.latest.kind === "observation"
          ? projection.latest.orderObservationV1.evidenceFingerprint
          : null,
      remoteUrl: projection.remoteUrl,
    });
  }

  // Internal capability for the cancellation aggregate.  Order history and
  // paid-target projection stay owned here; this is deliberately not exposed
  // through orderObservationTransitions.
  function cancellationSnapshot(orderId) {
    const row = orderRow(orderId);
    return Object.freeze({
      row,
      history: historyFor(row),
      orderSnapshotFingerprint: domain.orderSnapshotFingerprint(
        row.orderSnapshotV1,
      ),
    });
  }

  function recordCancellationTerminal(input) {
    const value = input || {};
    const snapshot = cancellationSnapshot(value.orderId);
    const terminal = domain.parseTerminalObservationV1(
      value.terminalObservationV1,
    );
    if (
      terminal.terminalKind !== "CANCELLED" ||
      terminal.orderIdentityV1.orderId !== snapshot.row.order_id ||
      terminal.orderSnapshotFingerprint !== snapshot.orderSnapshotFingerprint
    )
      throw fail("ORDER_CANCELLATION_OUTCOME_INVALID");
    const last = snapshot.history.entries.at(-1);
    if (
      last &&
      last.kind === "terminal" &&
      last.terminalObservationV1.evidenceFingerprint ===
        terminal.evidenceFingerprint
    )
      return Object.freeze({
        orderHistoryV1: snapshot.history,
        publishedWins: guard.readFacts(snapshot.row.order_id).published,
        idempotent: true,
      });
    if (last && last.kind === "terminal")
      throw fail("ORDER_CANCELLATION_OUTCOME_CONFLICT");
    const history = appendHistory(
      snapshot.row,
      "terminal",
      terminal,
      value.stamp,
    );
    const publishedWins = guard.readFacts(snapshot.row.order_id).published;
    if (!publishedWins) {
      db.prepare(
        "UPDATE publication_attempts SET status='failed',finished_at=? WHERE attempt_id=? AND status<>'published'",
      ).run(value.stamp, snapshot.row.attempt_id);
      db.prepare(
        "UPDATE publication_records SET status='failed',updated_at=? WHERE publication_id=? AND status<>'published'",
      ).run(value.stamp, snapshot.row.publication_id);
      updateItemTarget(
        snapshot.row,
        "TERMINAL_CANCELLED",
        value.stamp,
        "cancelled",
      );
      resolveRecovery(snapshot.row, "order_cancelled", value.stamp);
      activeTarget.release({
        articleId: snapshot.row.article_id,
        publicationId: snapshot.row.publication_id,
        attemptId: snapshot.row.attempt_id,
      });
    }
    return Object.freeze({
      orderHistoryV1: history,
      publishedWins,
      idempotent: false,
    });
  }

  return Object.freeze({
    recordOrderObservation,
    recordOrderStatusAnomaly,
    prepareOrderStatusAnomalyResolution,
    resumeOrderTracking: (input) =>
      resolveAnomaly(input, "resumeOrderTracking"),
    confirmOrderPublished: (input) =>
      resolveAnomaly(input, "confirmOrderPublished"),
    confirmOrderNotPublished: (input) =>
      resolveAnomaly(input, "confirmOrderNotPublished"),
    listOrderObservationViews,
    getOrderObservationContext,
    readOrderTransitionFacts: guard.readFacts,
    cancellationSnapshot,
    recordCancellationTerminal,
  });
}

module.exports = { createOrderObservationAggregate, projectOrderHistoryV1 };
