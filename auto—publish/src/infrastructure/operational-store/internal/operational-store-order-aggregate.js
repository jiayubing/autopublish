const domain = require("../../../domain");

const {
  canonicalDisplayPrice,
  fromText,
  observationTimestamp,
  rejectSensitive,
  safeDisplayText,
  safeEvidenceUrl,
  supplierObservation,
  supplierStatusCode,
  text,
} = require("./operational-store-utils");
const {
  createOperationalStoreOrderLink,
} = require("./operational-store-order-link");

function createOrderAggregate(context, activeTarget) {
  const {
    db,
    open,
    transaction,
    clock,
    randomUUID,
    fail,
    iso,
    internalOrderProjectionObserver,
    internalPaidExecutionTransitionFault,
  } = context;
  const orderLink = createOperationalStoreOrderLink(context);

  function paidFault(point, detail) {
    if (internalPaidExecutionTransitionFault)
      internalPaidExecutionTransitionFault(point, detail || {});
  }

  function paidAttempt(input) {
    const value = input || {};
    if (
      typeof value.orderCreationAttemptId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value.orderCreationAttemptId)
    )
      throw fail("PAID_ORDER_ATTEMPT_INVALID");
    const row = db
      .prepare(
        "SELECT i.state,i.payload_json AS intent_payload,s.item_id,s.batch_id,s.status AS item_status,s.claim_token,s.payload_json AS item_payload,p.publication_id,p.article_id,p.target_key,p.target_json,a.attempt_id,a.status AS attempt_status FROM recovery_intents i JOIN publication_attempts a ON a.attempt_id=i.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id JOIN submission_items s ON s.item_id=json_extract(i.payload_json,'$.paidSubmission.batchItemId') WHERE json_extract(i.payload_json,'$.orderCreationAttemptId')=?",
      )
      .get(value.orderCreationAttemptId);
    if (!row) throw fail("PAID_ORDER_ATTEMPT_NOT_FOUND");
    return row;
  }

  function paidTarget(row) {
    let target;
    try {
      target = domain.parseTargetIdentityV1({
        version: 1,
        ...fromText(row.target_json),
      });
    } catch (_) {
      throw fail("PAID_ORDER_TARGET_INVALID");
    }
    if (target.kind !== "media") throw fail("PAID_ORDER_MEDIA_TARGET_REQUIRED");
    return target;
  }

  function assertPaidAttemptInput(
    row,
    input,
    requireRemoteStarted,
    checkClaimToken = true,
  ) {
    const value = input || {};
    if (value.batchId !== undefined && value.batchId !== row.batch_id)
      throw fail("PAID_ORDER_BATCH_MISMATCH");
    if (value.batchItemId !== undefined && value.batchItemId !== row.item_id)
      throw fail("PAID_ORDER_ITEM_MISMATCH");
    if (
      checkClaimToken &&
      value.claimToken !== undefined &&
      value.claimToken !== row.claim_token
    )
      throw fail("PAID_ORDER_CLAIM_CONFLICT");
    if (requireRemoteStarted) {
      const intent = fromText(row.intent_payload) || {};
      if (
        row.state !== "remote_started" ||
        row.item_status !== "submitting" ||
        row.attempt_status !== "remote_started" ||
        !intent.detail ||
        intent.detail.phase !== "remote_call_started"
      )
        throw fail("PAID_ORDER_PHASE_INVALID");
    }
  }

  function updatePaidBatchStatus(batchId, stamp) {
    const openItems = db
      .prepare(
        "SELECT COUNT(*) count FROM submission_items WHERE batch_id=? AND status NOT IN('completed','failed','blocked','uncertain','cancelled')",
      )
      .get(batchId).count;
    db.prepare(
      "UPDATE submission_batches SET status=?,updated_at=? WHERE batch_id=?",
    ).run(openItems === 0 ? "completed" : "queued", stamp, batchId);
  }

  function paidOutcomePayload(row, detail, extra) {
    const current = fromText(row.intent_payload) || {};
    return Object.assign({}, current, {
      paidSubmission: Object.assign({}, current.paidSubmission || {}, {
        batchItemId: row.item_id,
      }),
      detail: Object.assign({}, current.detail || {}, detail),
      ...(extra || {}),
    });
  }

  function sameJson(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function sameFrozenOrderEvidence(left, right) {
    return (
      sameJson(left.articleIdentityV1, right.articleIdentityV1) &&
      sameJson(left.targetIdentityV1, right.targetIdentityV1) &&
      left.orderCreationAttemptId === right.orderCreationAttemptId &&
      left.mediaName === right.mediaName &&
      left.quotedPrice === right.quotedPrice &&
      left.estimatedTotal === right.estimatedTotal &&
      left.systemSubmissionCode === right.systemSubmissionCode &&
      left.submittedTitle === right.submittedTitle &&
      left.submittedBody === right.submittedBody &&
      left.contentFingerprint === right.contentFingerprint
    );
  }

  function assertPaidOrderEvidence(row, snapshot) {
    if (row.article_id !== snapshot.articleIdentityV1.articleId)
      throw fail("PAID_ORDER_EVIDENCE_MISMATCH");
    let persistedTarget;
    try {
      persistedTarget = paidTarget(row);
    } catch (_) {
      throw fail("PAID_ORDER_EVIDENCE_MISMATCH");
    }
    if (
      !sameJson(persistedTarget, snapshot.targetIdentityV1) ||
      row.target_key !==
        `media-resource:${snapshot.targetIdentityV1.mediaResourceId}`
    )
      throw fail("PAID_ORDER_EVIDENCE_MISMATCH");

    const currentIntent = fromText(row.intent_payload) || {};
    const prepared = currentIntent.orderCreationPrepared;
    const detail = currentIntent.detail || {};
    const phase = detail.phase;
    if (
      !prepared ||
      prepared.version !== 1 ||
      prepared.preparedAt !== detail.preparedAt ||
      ![
        "remote_call_started",
        "order_created",
        "order_creation_conflict",
      ].includes(phase) ||
      detail.remoteCallStartedAt !== snapshot.remoteCallStartedAt ||
      !sameFrozenOrderEvidence(prepared, snapshot)
    )
      throw fail("PAID_ORDER_EVIDENCE_MISMATCH");
  }

  function conflictOrderSummary(snapshot, attemptId) {
    return Object.freeze({
      version: 1,
      orderIdentityV1: snapshot.orderIdentityV1,
      articleIdentityV1: snapshot.articleIdentityV1,
      targetIdentityV1: snapshot.targetIdentityV1,
      orderCreationAttemptId: snapshot.orderCreationAttemptId,
      attemptId,
      mediaName: snapshot.mediaName,
      quotedPrice: snapshot.quotedPrice,
      estimatedTotal: snapshot.estimatedTotal,
      actualAmount: snapshot.actualAmount,
      systemSubmissionCode: snapshot.systemSubmissionCode,
      contentFingerprint: snapshot.contentFingerprint,
      remoteCallStartedAt: snapshot.remoteCallStartedAt,
    });
  }

  function persistedOrderSummary(existing) {
    if (!existing) return null;
    try {
      return conflictOrderSummary(
        domain.parseOrderSnapshotV1(fromText(existing.payload_json)),
        existing.attempt_id,
      );
    } catch (_) {
      return Object.freeze({
        version: 1,
        orderIdentityV1: { version: 1, orderId: existing.order_id },
        attemptId: existing.attempt_id,
        evidenceAvailable: false,
      });
    }
  }

  function persistPaidOrderConflict(row, snapshot, guard, code, kind, stamp) {
    const detail = Object.freeze({
      phase: "order_creation_conflict",
      code,
      conflictKind: kind,
      orderCreationAttemptId: snapshot.orderCreationAttemptId,
      existingOrderEvidence: persistedOrderSummary(guard.existing),
      conflictingOrderEvidence: conflictOrderSummary(snapshot, row.attempt_id),
    });
    rejectSensitive(detail);
    db.prepare("INSERT OR IGNORE INTO remote_evidence VALUES(?,?,?,?,?,?)").run(
      randomUUID(),
      row.attempt_id,
      snapshot.orderIdentityV1.orderId,
      null,
      text(snapshot),
      stamp,
    );

    const itemPayload = Object.assign({}, fromText(row.item_payload) || {}, {
      outcomeStatus: "uncertain",
      recoveryState: "manual_check",
      paidOrderConflict: detail,
    });
    rejectSensitive(itemPayload);
    if (
      db
        .prepare(
          "UPDATE publication_attempts SET status='uncertain',finished_at=? WHERE attempt_id=? AND status IN('remote_started','submitted','uncertain')",
        )
        .run(stamp, row.attempt_id).changes !== 1
    )
      throw fail("PAID_ORDER_PHASE_INVALID");
    db.prepare(
      "UPDATE publication_records SET status='uncertain',updated_at=? WHERE publication_id=?",
    ).run(stamp, row.publication_id);
    activeTarget.markUncertain({
      articleId: row.article_id,
      publicationId: row.publication_id,
      attemptId: row.attempt_id,
      stamp,
    });
    if (
      db
        .prepare(
          "UPDATE submission_items SET status='uncertain',claim_token=NULL,claim_until=NULL,revision=revision+1,payload_json=? WHERE item_id=? AND status IN('submitting','completed','uncertain')",
        )
        .run(text(itemPayload), row.item_id).changes !== 1
    )
      throw fail("PAID_ORDER_PHASE_INVALID");
    db.prepare(
      "UPDATE paid_submission_batches SET pause_intent='system',updated_at=? WHERE batch_id=?",
    ).run(stamp, row.batch_id);
    const changed = db
      .prepare(
        "UPDATE recovery_intents SET state='manual_check',payload_json=?,updated_at=? WHERE attempt_id=? AND state IN('remote_started','resolved','manual_check')",
      )
      .run(
        text(paidOutcomePayload(row, detail)),
        stamp,
        row.attempt_id,
      ).changes;
    if (changed !== 1) throw fail("PAID_ORDER_PHASE_INVALID");
    updatePaidBatchStatus(row.batch_id, stamp);
    return Object.freeze({
      conflict: true,
      code,
      batchId: row.batch_id,
      batchItemId: row.item_id,
      attemptId: row.attempt_id,
      status: "uncertain",
    });
  }

  function recordPaidOrderCreationSuccess(input) {
    open();
    const value = input || {};
    let snapshot;
    let target;
    try {
      snapshot = domain.parseOrderSnapshotV1(value.orderSnapshotV1);
      target = domain.parsePaidTargetV1(value.paidTargetV1);
    } catch (error) {
      throw fail(
        error && error.code ? error.code : "PAID_ORDER_EVIDENCE_INVALID",
      );
    }
    if (
      snapshot.orderCreationAttemptId !== value.orderCreationAttemptId ||
      target.orderCreationAttemptId !== snapshot.orderCreationAttemptId ||
      JSON.stringify(target.articleIdentityV1) !==
        JSON.stringify(snapshot.articleIdentityV1) ||
      JSON.stringify(target.targetIdentityV1) !==
        JSON.stringify(snapshot.targetIdentityV1) ||
      JSON.stringify(target.orderIdentityV1) !==
        JSON.stringify(snapshot.orderIdentityV1)
    )
      throw fail("PAID_ORDER_EVIDENCE_MISMATCH");
    const stamp = iso(clock);
    const result = transaction(() => {
      const row = paidAttempt(value);
      // Batch/item references are checked before the guard, while the lease
      // token is checked only for a first write.  A repeated outcome must be
      // able to reach the guard after the item has become terminal.
      assertPaidAttemptInput(row, value, false, false);
      const currentIntent = fromText(row.intent_payload) || {};
      assertPaidOrderEvidence(row, snapshot);
      const guard = orderLink.orderCreationAttemptGuard({
        orderId: snapshot.orderIdentityV1.orderId,
        attemptId: row.attempt_id,
        remoteId: snapshot.orderIdentityV1.orderId,
      });
      if (guard.kind === "attempt_bound") {
        let persisted;
        try {
          persisted = domain.parseOrderSnapshotV1(
            fromText(guard.existing.payload_json),
          );
        } catch (_) {
          throw fail("PAID_ORDER_EVIDENCE_CONFLICT");
        }
        if (!sameFrozenOrderEvidence(persisted, snapshot))
          throw fail("PAID_ORDER_EVIDENCE_CONFLICT");
        if (
          currentIntent.detail &&
          currentIntent.detail.phase === "order_creation_conflict"
        )
          return Object.freeze({
            conflict: true,
            code: "PAID_ORDER_EVIDENCE_CONFLICT",
          });
        return Object.freeze({
          orderId: guard.existing.order_id,
          attemptId: row.attempt_id,
          batchId: row.batch_id,
          batchItemId: row.item_id,
          status: "submitted",
          idempotent: true,
        });
      }
      if (guard.kind !== "available") {
        const code =
          guard.kind === "order_conflict"
            ? "OPERATIONAL_ORDER_CONFLICT"
            : "PAID_ORDER_EVIDENCE_CONFLICT";
        const kind =
          guard.kind === "order_conflict"
            ? "cross_attempt_order_identity"
            : "same_attempt_order_identity";
        if (
          currentIntent.detail &&
          currentIntent.detail.phase === "order_creation_conflict" &&
          guard.kind === "attempt_conflict"
        )
          return Object.freeze({ conflict: true, code });
        return persistPaidOrderConflict(
          row,
          snapshot,
          guard,
          code,
          kind,
          stamp,
        );
      }
      assertPaidAttemptInput(row, value, true);
      paidFault("before-order-success");
      const linked = orderLink.ensure({
        orderId: snapshot.orderIdentityV1.orderId,
        attemptId: row.attempt_id,
        remoteId: snapshot.orderIdentityV1.orderId,
        evidence: snapshot,
        createdAt: stamp,
      });
      paidFault("after-order-link", {
        orderId: snapshot.orderIdentityV1.orderId,
      });
      db.prepare(
        "INSERT OR IGNORE INTO remote_evidence VALUES(?,?,?,?,?,?)",
      ).run(
        randomUUID(),
        row.attempt_id,
        snapshot.orderIdentityV1.orderId,
        null,
        text(snapshot),
        stamp,
      );
      paidFault("after-order-evidence", { attemptId: row.attempt_id });
      const itemPayload = Object.assign({}, fromText(row.item_payload) || {}, {
        orderCreationAttemptId: snapshot.orderCreationAttemptId,
        orderSnapshotV1: snapshot,
        paidTargetV1: target,
        orderId: snapshot.orderIdentityV1.orderId,
        outcomeStatus: "submitted",
      });
      rejectSensitive(itemPayload);
      db.prepare(
        "INSERT OR REPLACE INTO order_display_snapshots(attempt_id,title_snapshot,filename,resource_name_snapshot,quoted_price,created_at,media_resource_id,estimated_total,system_submission_code) VALUES(?,?,?,?,?,?,?,?,?)",
      ).run(
        row.attempt_id,
        snapshot.submittedTitle,
        safeDisplayText(itemPayload.filename, 255),
        safeDisplayText(snapshot.mediaName, 256),
        snapshot.quotedPrice,
        stamp,
        snapshot.targetIdentityV1.mediaResourceId,
        snapshot.estimatedTotal,
        snapshot.systemSubmissionCode,
      );
      paidFault("after-order-snapshot", { attemptId: row.attempt_id });
      if (
        db
          .prepare(
            "UPDATE publication_attempts SET status='submitted',finished_at=NULL WHERE attempt_id=? AND status='remote_started'",
          )
          .run(row.attempt_id).changes !== 1
      )
        throw fail("PAID_ORDER_PHASE_INVALID");
      db.prepare(
        "UPDATE publication_records SET status='submitted',updated_at=? WHERE publication_id=? AND status='remote_started'",
      ).run(stamp, row.publication_id);
      paidFault("after-publication-order-created", {
        attemptId: row.attempt_id,
      });
      activeTarget.settle({
        articleId: row.article_id,
        publicationId: row.publication_id,
        attemptId: row.attempt_id,
        target: fromText(row.target_json),
        status: "submitted",
        stamp,
      });
      db.prepare(
        "UPDATE submission_items SET status='completed',claim_token=NULL,claim_until=NULL,revision=revision+1,payload_json=? WHERE item_id=? AND status='submitting'",
      ).run(text(itemPayload), row.item_id);
      paidFault("after-paid-item-completed", { itemId: row.item_id });
      db.prepare(
        "UPDATE recovery_intents SET state='resolved',payload_json=?,updated_at=? WHERE attempt_id=? AND state='remote_started'",
      ).run(
        text(
          paidOutcomePayload(
            row,
            {
              phase: "order_created",
              orderCreationAttemptId: snapshot.orderCreationAttemptId,
              orderIdentityV1: snapshot.orderIdentityV1,
              observation: {
                kind: "order_created",
                orderId: snapshot.orderIdentityV1.orderId,
              },
            },
            { orderCreationAttemptId: snapshot.orderCreationAttemptId },
          ),
        ),
        stamp,
        row.attempt_id,
      );
      if (db.prepare("SELECT changes() AS count").get().count !== 1)
        throw fail("PAID_ORDER_PHASE_INVALID");
      updatePaidBatchStatus(row.batch_id, stamp);
      paidFault("after-paid-success", { attemptId: row.attempt_id });
      return Object.freeze({
        orderId: snapshot.orderIdentityV1.orderId,
        attemptId: row.attempt_id,
        batchId: row.batch_id,
        batchItemId: row.item_id,
        status: "submitted",
        idempotent: Boolean(linked && linked.idempotent),
      });
    });
    if (result && result.conflict) throw fail(result.code);
    return result;
  }

  function finalizePaidRejection(input, kind) {
    open();
    const value = input || {};
    const stamp = iso(clock);
    return transaction(() => {
      const row = paidAttempt(value);
      const existing = db
        .prepare("SELECT order_id FROM remote_orders WHERE attempt_id=?")
        .get(row.attempt_id);
      if (existing) throw fail("PAID_ORDER_SUCCESS_WINS");
      if (row.state === "resolved" && row.item_status === "failed")
        return Object.freeze({
          batchId: row.batch_id,
          batchItemId: row.item_id,
          attemptId: row.attempt_id,
          status: "rejected",
          idempotent: true,
        });
      if (row.state === "manual_check" && row.item_status === "blocked")
        return Object.freeze({
          batchId: row.batch_id,
          batchItemId: row.item_id,
          attemptId: row.attempt_id,
          status: "blocked",
          idempotent: true,
        });
      assertPaidAttemptInput(row, value, true);
      const detail = {
        phase:
          kind === "article_rejected" ? "article_rejected" : "system_rejected",
        rejectionKind: kind,
        scope: value.scope || null,
        reasonCode:
          typeof value.reasonCode === "string"
            ? value.reasonCode.slice(0, 128)
            : null,
      };
      paidFault("before-paid-rejection", { attemptId: row.attempt_id, kind });
      const itemStatus = kind === "article_rejected" ? "failed" : "blocked";
      const publicationStatus =
        kind === "article_rejected" ? "failed" : "uncertain";
      db.prepare(
        "UPDATE publication_attempts SET status=?,finished_at=? WHERE attempt_id=? AND status='remote_started'",
      ).run(publicationStatus, stamp, row.attempt_id);
      db.prepare(
        "UPDATE publication_records SET status=?,updated_at=? WHERE publication_id=? AND status='remote_started'",
      ).run(publicationStatus, stamp, row.publication_id);
      paidFault("after-paid-publication-rejection", {
        attemptId: row.attempt_id,
      });
      if (kind === "article_rejected") {
        activeTarget.release({
          articleId: row.article_id,
          publicationId: row.publication_id,
          attemptId: row.attempt_id,
        });
      } else {
        activeTarget.markUncertain({
          articleId: row.article_id,
          publicationId: row.publication_id,
          attemptId: row.attempt_id,
          stamp,
        });
        db.prepare(
          "UPDATE paid_submission_batches SET pause_intent='system',updated_at=? WHERE batch_id=?",
        ).run(stamp, row.batch_id);
      }
      db.prepare(
        "UPDATE submission_items SET status=?,claim_token=NULL,claim_until=NULL,revision=revision+1,payload_json=? WHERE item_id=? AND status='submitting'",
      ).run(
        itemStatus,
        text(
          Object.assign({}, fromText(row.item_payload) || {}, {
            outcomeStatus: itemStatus,
            paidOrderRejection: detail,
          }),
        ),
        row.item_id,
      );
      paidFault("after-paid-item-rejection", { itemId: row.item_id, kind });
      const changed = db
        .prepare(
          "UPDATE recovery_intents SET state=?,payload_json=?,updated_at=? WHERE attempt_id=? AND state='remote_started'",
        )
        .run(
          kind === "article_rejected" ? "resolved" : "manual_check",
          text(paidOutcomePayload(row, detail)),
          stamp,
          row.attempt_id,
        ).changes;
      if (changed !== 1) throw fail("PAID_ORDER_PHASE_INVALID");
      updatePaidBatchStatus(row.batch_id, stamp);
      paidFault("after-paid-rejection", { attemptId: row.attempt_id, kind });
      return Object.freeze({
        batchId: row.batch_id,
        batchItemId: row.item_id,
        attemptId: row.attempt_id,
        status: kind === "article_rejected" ? "rejected" : "blocked",
        idempotent: false,
      });
    });
  }

  function recordPaidOrderCreationArticleRejection(input) {
    return finalizePaidRejection(input, "article_rejected");
  }

  function recordPaidOrderCreationSystemRejection(input) {
    return finalizePaidRejection(input, "system_rejected");
  }

  function recordPaidOrderCreationUncertain(input) {
    open();
    const value = input || {};
    return transaction(() => {
      const row = paidAttempt(value);
      if (row.state === "manual_check" && row.item_status === "uncertain")
        return Object.freeze({
          batchId: row.batch_id,
          batchItemId: row.item_id,
          attemptId: row.attempt_id,
          status: "uncertain",
          idempotent: true,
        });
      assertPaidAttemptInput(row, value, true);
      const stamp = iso(clock);
      const detail = {
        phase: "order_creation_uncertain",
        reason:
          typeof value.reason === "string"
            ? value.reason.slice(0, 128)
            : "remote-uncertain",
      };
      db.prepare(
        "UPDATE publication_attempts SET status='uncertain',finished_at=? WHERE attempt_id=? AND status='remote_started'",
      ).run(stamp, row.attempt_id);
      db.prepare(
        "UPDATE publication_records SET status='uncertain',updated_at=? WHERE publication_id=? AND status='remote_started'",
      ).run(stamp, row.publication_id);
      activeTarget.markUncertain({
        articleId: row.article_id,
        publicationId: row.publication_id,
        attemptId: row.attempt_id,
        stamp,
      });
      db.prepare(
        "UPDATE submission_items SET status='uncertain',claim_token=NULL,claim_until=NULL,revision=revision+1,payload_json=? WHERE item_id=? AND status='submitting'",
      ).run(
        text(
          Object.assign({}, fromText(row.item_payload) || {}, {
            outcomeStatus: "uncertain",
            orderCreationUncertain: detail,
          }),
        ),
        row.item_id,
      );
      db.prepare(
        "UPDATE paid_submission_batches SET pause_intent='system',updated_at=? WHERE batch_id=?",
      ).run(stamp, row.batch_id);
      const changed = db
        .prepare(
          "UPDATE recovery_intents SET state='manual_check',payload_json=?,updated_at=? WHERE attempt_id=? AND state='remote_started'",
        )
        .run(
          text(paidOutcomePayload(row, detail)),
          stamp,
          row.attempt_id,
        ).changes;
      if (changed !== 1) throw fail("PAID_ORDER_PHASE_INVALID");
      updatePaidBatchStatus(row.batch_id, stamp);
      return Object.freeze({
        batchId: row.batch_id,
        batchItemId: row.item_id,
        attemptId: row.attempt_id,
        status: "uncertain",
        idempotent: false,
      });
    });
  }

  function attachRemoteOrderEvidence(input) {
    open();
    const value = input || {};
    rejectSensitive(value.evidence || {});
    const attemptId = domain.AttemptId.serialize(
      domain.AttemptId.parse(value.attemptId),
    );
    if (
      typeof value.orderId !== "string" ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(value.orderId) ||
      typeof value.remoteId !== "string"
    )
      throw fail("OPERATIONAL_ORDER_INVALID");
    transaction(() => {
      if (
        !db
          .prepare("SELECT 1 FROM publication_attempts WHERE attempt_id=?")
          .get(attemptId)
      )
        throw fail("OPERATIONAL_ATTEMPT_NOT_FOUND");
      orderLink.ensure({
        orderId: value.orderId,
        attemptId,
        remoteId: value.remoteId,
        evidence: value.evidence,
        createdAt: iso(clock),
      });
    });
  }

  function listRemoteOrders() {
    open();
    return Object.freeze(
      db
        .prepare(
          "SELECT o.order_id,o.remote_id,o.payload_json,o.created_at,a.attempt_id,a.status,p.publication_id,p.article_id,p.target_json FROM remote_orders o JOIN publication_attempts a ON a.attempt_id=o.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id ORDER BY o.created_at DESC",
        )
        .all()
        .map((row) => {
          const target = fromText(row.target_json) || {};
          const evidence = fromText(row.payload_json) || {};
          const observation = supplierObservation(evidence);
          return Object.freeze({
            orderId: row.order_id,
            orderNid: row.order_id,
            remoteId: row.remote_id,
            publicationId: row.publication_id,
            attemptId: row.attempt_id,
            articleId: row.article_id,
            mediaResourceId: target.mediaResourceId || null,
            status: row.status,
            supplierStatusCode: observation ? observation.statusCode : null,
            supplierObservedAt: observation ? observation.observedAt : null,
            publishedAt: observation ? observation.publishedAt : null,
            remoteUrl: evidence.remoteUrl || null,
            createdAt: row.created_at,
          });
        }),
    );
  }

  // This is the only order-list read model. It performs one bounded join for
  // current orders and parses only each matched display snapshot.
  function listOrderDisplayViews() {
    open();
    const rows = db
      .prepare(
        "SELECT o.order_id,o.remote_id,o.payload_json,o.created_at,a.attempt_id,a.status,p.publication_id,p.article_id,p.target_json,d.title_snapshot,d.filename,d.resource_name_snapshot,d.quoted_price,d.media_resource_id,d.estimated_total,d.system_submission_code FROM remote_orders o JOIN publication_attempts a ON a.attempt_id=o.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id LEFT JOIN order_display_snapshots d ON d.attempt_id=a.attempt_id ORDER BY o.created_at DESC LIMIT 20000",
      )
      .all();
    if (internalOrderProjectionObserver)
      internalOrderProjectionObserver({
        sqlCount: 1,
        rowCount: rows.length,
        parsedPayloadCount: rows.length,
      });
    return Object.freeze(
      rows.map((row) => {
        const evidence = fromText(row.payload_json) || {};
        const observation = supplierObservation(evidence);
        const target = fromText(row.target_json) || {};
        return Object.freeze({
          orderId: row.order_id,
          orderNid: row.order_id,
          attemptId: row.attempt_id,
          publicationId: row.publication_id,
          publicationStatus: row.status,
          articleId: row.article_id,
          mediaResourceId: target.mediaResourceId || null,
          submittedAt: row.created_at,
          supplierStatusCode: observation ? observation.statusCode : "",
          supplierObservedAt: observation ? observation.observedAt : null,
          publishedAt: observation ? observation.publishedAt : null,
          remoteUrl: evidence.remoteUrl || null,
          titleSnapshot: safeDisplayText(row.title_snapshot, 1000),
          filename: safeDisplayText(row.filename, 255),
          resourceNameSnapshot: safeDisplayText(
            row.resource_name_snapshot,
            500,
          ),
          quotedPrice: canonicalDisplayPrice(row.quoted_price),
          estimatedTotal: canonicalDisplayPrice(row.estimated_total),
          systemSubmissionCode:
            safeDisplayText(row.system_submission_code, 128) || null,
        });
      }),
    );
  }

  function recordRemoteOrderObservation(input) {
    open();
    const value = input || {};
    if (
      typeof value.orderId !== "string" ||
      !value.orderId ||
      !value.observation ||
      !supplierStatusCode(value.observation.statusCode)
    )
      throw fail("OPERATIONAL_ORDER_OBSERVATION_INVALID");
    if (String(value.observation.statusCode) === "2")
      throw fail("PAID_PUBLICATION_SUCCESS_PATH_CLOSED");
    const stamp = iso(clock);
    const publishedAt = observationTimestamp(value.observation.publishedAt);
    if (value.observation.publishedAt !== undefined && !publishedAt)
      throw fail("OPERATIONAL_ORDER_OBSERVATION_INVALID");
    return transaction(() => {
      const row = db
        .prepare(
          "SELECT o.attempt_id,o.remote_id,o.payload_json,p.publication_id,p.article_id,p.target_json,p.status FROM remote_orders o JOIN publication_attempts a ON a.attempt_id=o.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id WHERE o.order_id=?",
        )
        .get(value.orderId);
      if (!row || (fromText(row.target_json) || {}).kind !== "media")
        throw fail("OPERATIONAL_ORDER_NOT_FOUND");
      const statusCode = supplierStatusCode(value.observation.statusCode);
      let remoteUrl = null;
      if (value.observation.remoteUrl !== undefined) {
        remoteUrl = safeEvidenceUrl(value.observation.remoteUrl);
        if (!remoteUrl) throw fail("OPERATIONAL_ORDER_EVIDENCE_REQUIRED");
      }
      const currentEvidence = fromText(row.payload_json) || {};
      const previousObservation = supplierObservation(currentEvidence);
      const observation = Object.freeze({
        statusCode,
        observedAt: stamp,
        ...(publishedAt ||
        (previousObservation && previousObservation.publishedAt)
          ? { publishedAt: publishedAt || previousObservation.publishedAt }
          : {}),
      });
      const evidence = Object.assign({}, currentEvidence, {
        supplierObservation: observation,
        ...(remoteUrl ? { remoteUrl } : {}),
      });
      db.prepare(
        "UPDATE remote_orders SET payload_json=? WHERE order_id=?",
      ).run(text(evidence), value.orderId);
      if (remoteUrl)
        db.prepare(
          "UPDATE remote_evidence SET remote_url=?,evidence_json=? WHERE attempt_id=? AND remote_id=?",
        ).run(remoteUrl, text(evidence), row.attempt_id, row.remote_id);
      // Supplier observations do not transition publication success in Ticket
      // 09; the paid publication success port is owned by Ticket 15.
      let publicationStatus = row.status;
      if (statusCode === "4" && row.status !== "published") {
        publicationStatus = "failed";
        db.prepare(
          "UPDATE publication_attempts SET status=?,finished_at=? WHERE attempt_id=?",
        ).run("failed", stamp, row.attempt_id);
        db.prepare(
          "UPDATE publication_records SET status=?,updated_at=? WHERE publication_id=?",
        ).run("failed", stamp, row.publication_id);
        db.prepare(
          "UPDATE recovery_intents SET state=?,payload_json=?,updated_at=? WHERE attempt_id=?",
        ).run("resolved", text(evidence), stamp, row.attempt_id);
      }
      if (statusCode === "4" || (statusCode === "2" && remoteUrl))
        activeTarget.release({
          articleId: row.article_id,
          publicationId: row.publication_id,
          attemptId: row.attempt_id,
        });
      return Object.freeze({
        orderId: value.orderId,
        attemptId: row.attempt_id,
        publicationId: row.publication_id,
        publicationStatus,
        supplierStatusCode: statusCode,
      });
    });
  }

  return Object.freeze({
    attachRemoteOrderEvidence,
    listRemoteOrders,
    listOrderDisplayViews,
    recordRemoteOrderObservation,
    recordPaidOrderCreationArticleRejection,
    recordPaidOrderCreationSystemRejection,
    recordPaidOrderCreationSuccess,
    recordPaidOrderCreationUncertain,
  });
}

module.exports = { createOrderAggregate };
