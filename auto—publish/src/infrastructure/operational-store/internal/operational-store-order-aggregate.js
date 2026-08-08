const crypto = require("node:crypto");
const domain = require("../../../domain");

const {
  canonicalDisplayPrice,
  fromText,
  rejectSensitive,
  safeDisplayText,
  text,
} = require("./operational-store-utils");
const {
  createOperationalStoreOrderLink,
} = require("./operational-store-order-link");
const {
  createOrderObservationAggregate,
  projectOrderHistoryV1,
} = require("./operational-store-order-observation-aggregate");

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

  function fingerprint(value) {
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(value), "utf8")
      .digest("hex");
  }

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
        "SELECT i.state,i.payload_json AS intent_payload,i.updated_at,s.item_id,s.batch_id,s.status AS item_status,s.claim_token,s.payload_json AS item_payload,p.publication_id,p.article_id,p.target_key,p.target_json,p.status AS publication_status,a.attempt_id,a.status AS attempt_status FROM recovery_intents i JOIN publication_attempts a ON a.attempt_id=i.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id JOIN submission_items s ON s.item_id=json_extract(i.payload_json,'$.paidSubmission.batchItemId') WHERE json_extract(i.payload_json,'$.orderCreationAttemptId')=?",
      )
      .get(value.orderCreationAttemptId);
    if (!row) throw fail("PAID_ORDER_ATTEMPT_NOT_FOUND");
    return row;
  }

  function paidResolutionRow(input) {
    const row = paidAttempt(input);
    const intent = fromText(row.intent_payload) || {};
    const phase = intent.detail && intent.detail.phase;
    if (
      ![
        "order_creation_uncertain",
        "order_creation_conflict",
        "order_created",
        "order_creation_no_order",
      ].includes(phase)
    )
      throw fail("PAID_ORDER_RESOLUTION_NOT_AVAILABLE");
    return { ...row, intent };
  }

  function safeOrderObservation(input) {
    const value = (input && input.orderObservation) || {};
    const allowed = [
      "orderId",
      "resourceId",
      "title",
      "systemSubmissionId",
      "status",
    ];
    if (
      Object.keys(value).some((key) => !allowed.includes(key)) ||
      typeof value.orderId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value.orderId) ||
      typeof value.resourceId !== "string" ||
      !value.resourceId ||
      typeof value.title !== "string" ||
      !value.title ||
      typeof value.systemSubmissionId !== "string" ||
      !value.systemSubmissionId
    )
      throw fail("PAID_ORDER_RESOLUTION_EVIDENCE_INSUFFICIENT");
    const normalized = Object.freeze({
      orderId: value.orderId,
      resourceId: value.resourceId,
      title: value.title,
      systemSubmissionId: value.systemSubmissionId,
      status: typeof value.status === "string" ? value.status : "unknown",
    });
    return Object.freeze({
      ...normalized,
      fingerprint: fingerprint(normalized),
    });
  }

  function paidResolutionBinding(row, action, observation) {
    const active = db
      .prepare(
        "SELECT publication_id,attempt_id,target_key,target_json,state,updated_at FROM article_active_targets WHERE article_id=?",
      )
      .get(row.article_id);
    const existingOrder = db
      .prepare(
        "SELECT order_id,attempt_id,remote_id,payload_json,created_at FROM remote_orders WHERE attempt_id=? ORDER BY created_at,order_id LIMIT 1",
      )
      .get(row.attempt_id);
    const published = Boolean(
      db
        .prepare(
          "SELECT 1 FROM publication_records WHERE article_id=? AND status='published' LIMIT 1",
        )
        .get(row.article_id),
    );
    return Object.freeze({
      action,
      orderCreationAttemptId:
        row.intent.orderCreationAttemptId ||
        (row.intent.orderCreationPrepared &&
          row.intent.orderCreationPrepared.orderCreationAttemptId),
      attemptId: row.attempt_id,
      intentState: row.state,
      intentFingerprint: fingerprint({
        detail: row.intent.detail,
        orderCreationPrepared: row.intent.orderCreationPrepared,
      }),
      publicationStatus: row.publication_status,
      attemptStatus: row.attempt_status,
      itemStatus: row.item_status,
      itemFingerprint: fingerprint(fromText(row.item_payload) || {}),
      activeTarget: active || null,
      existingOrder: existingOrder
        ? {
            orderId: existingOrder.order_id,
            attemptId: existingOrder.attempt_id,
            remoteId: existingOrder.remote_id,
          }
        : null,
      published,
      observationFingerprint: observation ? observation.fingerprint : null,
    });
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
        row.item_status !== "remote_started" ||
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
        "order_creation_no_order",
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
    if (!guard.existing) {
      try {
        db.prepare("INSERT INTO remote_orders VALUES(?,?,?,?,?)").run(
          snapshot.orderIdentityV1.orderId,
          row.attempt_id,
          snapshot.orderIdentityV1.orderId,
          text(snapshot),
          stamp,
        );
      } catch (error) {
        if (
          !String((error && error.code) || "").startsWith("SQLITE_CONSTRAINT")
        )
          throw error;
      }
    }

    const itemPayload = Object.assign({}, fromText(row.item_payload) || {}, {
      outcomeStatus: "uncertain",
      recoveryState: "manual_check",
      paidOrderConflict: detail,
    });
    rejectSensitive(itemPayload);
    if (
      db
        .prepare(
          "UPDATE publication_attempts SET status='uncertain',finished_at=? WHERE attempt_id=? AND status IN('remote_started','uncertain','failed')",
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
    db.prepare(
      "UPDATE article_active_targets SET state='uncertain',updated_at=? WHERE article_id=?",
    ).run(stamp, row.article_id);
    if (
      db
        .prepare(
          "UPDATE submission_items SET status='uncertain',claim_token=NULL,claim_until=NULL,revision=revision+1,payload_json=? WHERE item_id=? AND status IN('remote_started','completed','uncertain','failed')",
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
      const lateNoOrder =
        currentIntent.detail &&
        currentIntent.detail.phase === "order_creation_no_order";
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
          status: "order_created",
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
      if (lateNoOrder) {
        const active = db
          .prepare(
            "SELECT attempt_id FROM article_active_targets WHERE article_id=?",
          )
          .get(row.article_id);
        if (active && active.attempt_id !== row.attempt_id) {
          const conflict = persistPaidOrderConflict(
            row,
            snapshot,
            { existing: null },
            "PAID_ORDER_NEW_TARGET_CONFLICT",
            "new_active_target",
            stamp,
          );
          return Object.freeze({ ...conflict, throwCode: conflict.code });
        }
      }
      assertPaidAttemptInput(row, value, !lateNoOrder);
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
        outcomeStatus: "paid_processing",
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
            "UPDATE publication_attempts SET status='remote_started',finished_at=NULL WHERE attempt_id=? AND status IN('remote_started','failed','uncertain')",
          )
          .run(row.attempt_id).changes !== 1
      )
        throw fail("PAID_ORDER_PHASE_INVALID");
      db.prepare(
        "UPDATE publication_records SET status='remote_started',updated_at=? WHERE publication_id=? AND status IN('remote_started','failed','uncertain')",
      ).run(stamp, row.publication_id);
      paidFault("after-publication-order-created", {
        attemptId: row.attempt_id,
      });
      activeTarget.settle({
        articleId: row.article_id,
        publicationId: row.publication_id,
        attemptId: row.attempt_id,
        target: fromText(row.target_json),
        status: "remote_started",
        stamp,
      });
      db.prepare(
        "UPDATE submission_items SET status='completed',claim_token=NULL,claim_until=NULL,revision=revision+1,payload_json=? WHERE item_id=? AND status IN('remote_started','failed','uncertain')",
      ).run(text(itemPayload), row.item_id);
      paidFault("after-paid-item-completed", { itemId: row.item_id });
      db.prepare(
        "UPDATE recovery_intents SET state='resolved',payload_json=?,updated_at=? WHERE attempt_id=? AND state IN('remote_started','resolved')",
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
              ...(lateNoOrder
                ? {
                    resolution: {
                      decision: "order_bound",
                      successWins: true,
                      decidedAt: stamp,
                    },
                  }
                : {}),
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
        status: "order_created",
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
        "UPDATE submission_items SET status=?,claim_token=NULL,claim_until=NULL,revision=revision+1,payload_json=? WHERE item_id=? AND status='remote_started'",
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
        "UPDATE submission_items SET status='uncertain',claim_token=NULL,claim_until=NULL,revision=revision+1,payload_json=? WHERE item_id=? AND status='remote_started'",
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

  function prepareOrderCreationResolution(input) {
    open();
    const value = input || {};
    const action = value.action;
    if (!["bind_verified_order", "confirm_no_order"].includes(action))
      throw fail("PAID_ORDER_RESOLUTION_ACTION_INVALID");
    const stamp = iso(clock);
    return transaction(() => {
      const row = paidResolutionRow(value);
      const previous = row.intent.detail && row.intent.detail.resolution;
      if (previous)
        throw fail(
          previous.decision ===
            (action === "bind_verified_order" ? "order_bound" : "no_order")
            ? "PAID_ORDER_RESOLUTION_ALREADY_COMPLETED"
            : "PAID_ORDER_RESOLUTION_OPPOSITE",
        );
      if (
        row.intent.detail.phase !== "order_creation_uncertain" ||
        row.state !== "manual_check" ||
        row.item_status !== "uncertain"
      )
        throw fail("PAID_ORDER_RESOLUTION_NOT_AVAILABLE");
      const prepared = row.intent.orderCreationPrepared;
      if (!prepared || prepared.version !== 1)
        throw fail("PAID_ORDER_RESOLUTION_EVIDENCE_INSUFFICIENT");
      const observation =
        action === "bind_verified_order" ? safeOrderObservation(value) : null;
      if (
        observation &&
        (observation.resourceId !== prepared.targetIdentityV1.mediaResourceId ||
          observation.title !== prepared.submittedTitle ||
          observation.systemSubmissionId !== prepared.systemSubmissionCode)
      )
        throw fail("PAID_ORDER_RESOLUTION_EVIDENCE_MISMATCH");
      const binding = paidResolutionBinding(row, action, observation);
      const confirmationToken = `paid-order-resolution-${randomUUID()}`;
      const expiresAt = new Date(
        Date.parse(stamp) + 5 * 60 * 1000,
      ).toISOString();
      const next = Object.assign({}, row.intent, {
        orderCreationResolution: {
          action,
          confirmationToken,
          expiresAt,
          binding,
          bindingFingerprint: fingerprint(binding),
          ...(observation ? { orderObservation: observation } : {}),
        },
      });
      db.prepare(
        "UPDATE recovery_intents SET payload_json=?,updated_at=? WHERE attempt_id=? AND state='manual_check'",
      ).run(text(next), stamp, row.attempt_id);
      return Object.freeze({
        orderCreationAttemptId: value.orderCreationAttemptId,
        action,
        confirmationToken,
        expiresAt,
        ...(observation
          ? {
              orderId: observation.orderId,
              observationFingerprint: observation.fingerprint,
            }
          : {}),
      });
    });
  }

  function verifyPaidResolution(row, value, action, stamp) {
    const resolution = row.intent.orderCreationResolution;
    if (
      !resolution ||
      resolution.action !== action ||
      typeof value.confirmationToken !== "string" ||
      value.confirmationToken !== resolution.confirmationToken ||
      resolution.expiresAt <= stamp
    )
      throw fail("PAID_ORDER_RESOLUTION_TOKEN_STALE");
    const binding = paidResolutionBinding(
      row,
      action,
      resolution.orderObservation || null,
    );
    if (fingerprint(binding) !== resolution.bindingFingerprint)
      throw fail("PAID_ORDER_RESOLUTION_STATE_STALE");
    return resolution;
  }

  function verifyCompletedPaidResolution(row, value, action, stamp) {
    const resolution = row.intent.orderCreationResolution;
    if (
      !resolution ||
      resolution.action !== action ||
      typeof value.confirmationToken !== "string" ||
      value.confirmationToken !== resolution.confirmationToken ||
      resolution.expiresAt <= stamp
    )
      throw fail("PAID_ORDER_RESOLUTION_TOKEN_STALE");
    if (row.state !== "resolved")
      throw fail("PAID_ORDER_RESOLUTION_STATE_STALE");
    const decision = row.intent.detail && row.intent.detail.resolution;
    const expectedDecision =
      action === "bind_verified_order" ? "order_bound" : "no_order";
    if (
      !decision ||
      decision.decision !== expectedDecision ||
      decision.action !== action ||
      decision.bindingFingerprint !== resolution.bindingFingerprint
    )
      throw fail("PAID_ORDER_RESOLUTION_STATE_STALE");
    if (
      !resolution.binding ||
      fingerprint(resolution.binding) !== resolution.bindingFingerprint ||
      resolution.binding.action !== action ||
      resolution.binding.orderCreationAttemptId !==
        value.orderCreationAttemptId ||
      resolution.binding.attemptId !== row.attempt_id
    )
      throw fail("PAID_ORDER_RESOLUTION_STATE_STALE");
    const published = db
      .prepare(
        "SELECT 1 FROM publication_records WHERE article_id=? AND status='published' LIMIT 1",
      )
      .get(row.article_id);
    if (published) throw fail("PAID_ORDER_SUCCESS_WINS");
    const active = db
      .prepare(
        "SELECT publication_id,attempt_id,state FROM article_active_targets WHERE article_id=?",
      )
      .get(row.article_id);
    const itemPayload = fromText(row.item_payload) || {};
    const reconciliation = db
      .prepare(
        "SELECT decision,evidence_json FROM manual_reconciliation_facts WHERE attempt_id=?",
      )
      .get(row.attempt_id);
    const evidence = reconciliation
      ? fromText(reconciliation.evidence_json) || {}
      : null;
    if (
      !reconciliation ||
      reconciliation.decision !== expectedDecision ||
      !evidence ||
      evidence.decision !== expectedDecision ||
      evidence.orderCreationAttemptId !== value.orderCreationAttemptId ||
      evidence.bindingFingerprint !== resolution.bindingFingerprint
    )
      throw fail("PAID_ORDER_RESOLUTION_STATE_STALE");
    if (action === "bind_verified_order") {
      if (
        row.publication_status !== "remote_started" ||
        row.attempt_status !== "remote_started" ||
        row.item_status !== "completed"
      )
        throw fail("PAID_ORDER_RESOLUTION_STATE_STALE");
      const orderId =
        resolution.orderObservation && resolution.orderObservation.orderId;
      if (value.orderId !== orderId)
        throw fail("PAID_ORDER_RESOLUTION_EVIDENCE_MISMATCH");
      if (
        decision.orderId !== orderId ||
        decision.observationFingerprint !==
          resolution.orderObservation.fingerprint ||
        evidence.orderId !== orderId ||
        evidence.observationFingerprint !==
          resolution.orderObservation.fingerprint ||
        !active ||
        active.publication_id !== row.publication_id ||
        active.attempt_id !== row.attempt_id ||
        active.state !== "remote_started" ||
        itemPayload.outcomeStatus !== "paid_processing" ||
        itemPayload.orderId !== orderId ||
        !itemPayload.orderSnapshotV1 ||
        itemPayload.orderSnapshotV1.orderCreationAttemptId !==
          value.orderCreationAttemptId ||
        !itemPayload.paidTargetV1 ||
        itemPayload.paidTargetV1.orderCreationAttemptId !==
          value.orderCreationAttemptId
      )
        throw fail("PAID_ORDER_RESOLUTION_STATE_STALE");
      const existing = db
        .prepare(
          "SELECT order_id FROM remote_orders WHERE attempt_id=? LIMIT 1",
        )
        .get(row.attempt_id);
      if (!existing || existing.order_id !== orderId)
        throw fail("PAID_ORDER_RESOLUTION_STATE_STALE");
    } else {
      if (
        row.publication_status !== "failed" ||
        row.attempt_status !== "failed" ||
        row.item_status !== "failed"
      )
        throw fail("PAID_ORDER_RESOLUTION_STATE_STALE");
      if (
        db
          .prepare("SELECT 1 FROM remote_orders WHERE attempt_id=? LIMIT 1")
          .get(row.attempt_id)
      )
        throw fail("PAID_ORDER_SUCCESS_WINS");
      if (active || itemPayload.outcomeStatus !== "no_order")
        throw fail("PAID_ORDER_RESOLUTION_STATE_STALE");
    }
    return resolution;
  }

  function manualResolutionFact(row, decision, evidence, stamp) {
    const existing = db
      .prepare(
        "SELECT decision,evidence_json FROM manual_reconciliation_facts WHERE attempt_id=?",
      )
      .get(row.attempt_id);
    if (existing) {
      if (existing.decision !== decision)
        throw fail("PAID_ORDER_RESOLUTION_OPPOSITE");
      return false;
    }
    rejectSensitive(evidence);
    db.prepare(
      "INSERT INTO manual_reconciliation_facts VALUES(?,?,?,?,?,?)",
    ).run(
      randomUUID(),
      row.attempt_id,
      row.article_id,
      decision,
      text(evidence),
      stamp,
    );
    return true;
  }

  function verifiedOrderSnapshot(row, observation) {
    const prepared = row.intent.orderCreationPrepared;
    return domain.parseOrderSnapshotV1({
      version: 1,
      orderIdentityV1: { version: 1, orderId: observation.orderId },
      articleIdentityV1: prepared.articleIdentityV1,
      targetIdentityV1: prepared.targetIdentityV1,
      orderCreationAttemptId: prepared.orderCreationAttemptId,
      mediaName: prepared.mediaName,
      quotedPrice: prepared.quotedPrice,
      estimatedTotal: prepared.estimatedTotal,
      actualAmount: null,
      systemSubmissionCode: prepared.systemSubmissionCode,
      submittedTitle: prepared.submittedTitle,
      submittedBody: prepared.submittedBody,
      contentFingerprint: prepared.contentFingerprint,
      remoteCallStartedAt: row.intent.detail.remoteCallStartedAt,
    });
  }

  function bindVerifiedOrder(input) {
    open();
    const value = input || {};
    const stamp = iso(clock);
    const result = transaction(() => {
      const row = paidResolutionRow(value);
      const previous = row.intent.detail && row.intent.detail.resolution;
      if (previous) {
        if (previous.decision !== "order_bound")
          throw fail("PAID_ORDER_RESOLUTION_OPPOSITE");
        verifyCompletedPaidResolution(row, value, "bind_verified_order", stamp);
        return Object.freeze({
          orderCreationAttemptId: value.orderCreationAttemptId,
          orderId: previous.orderId,
          status: "order_bound",
          idempotent: true,
        });
      }
      const resolution = verifyPaidResolution(
        row,
        value,
        "bind_verified_order",
        stamp,
      );
      const observation = resolution.orderObservation;
      if (!observation || observation.orderId !== value.orderId)
        throw fail("PAID_ORDER_RESOLUTION_EVIDENCE_MISMATCH");
      const snapshot = verifiedOrderSnapshot(row, observation);
      const target = domain.parsePaidTargetV1({
        version: 1,
        articleIdentityV1: snapshot.articleIdentityV1,
        targetIdentityV1: snapshot.targetIdentityV1,
        orderCreationAttemptId: snapshot.orderCreationAttemptId,
        orderIdentityV1: snapshot.orderIdentityV1,
        state: "ACTIVE_TRACKING",
        terminalAt: null,
      });
      const guard = orderLink.orderCreationAttemptGuard({
        orderId: observation.orderId,
        attemptId: row.attempt_id,
        remoteId: observation.orderId,
      });
      if (guard.kind !== "available" && guard.kind !== "attempt_bound") {
        const conflict = persistPaidOrderConflict(
          row,
          snapshot,
          guard,
          guard.kind === "order_conflict"
            ? "OPERATIONAL_ORDER_CONFLICT"
            : "PAID_ORDER_EVIDENCE_CONFLICT",
          guard.kind === "order_conflict"
            ? "cross_attempt_order_identity"
            : "same_attempt_order_identity",
          stamp,
        );
        return Object.freeze({ ...conflict, throwCode: conflict.code });
      }
      orderLink.ensure({
        orderId: observation.orderId,
        attemptId: row.attempt_id,
        remoteId: observation.orderId,
        evidence: snapshot,
        createdAt: stamp,
      });
      paidFault("after-manual-order-link", { attemptId: row.attempt_id });
      db.prepare(
        "INSERT OR IGNORE INTO remote_evidence VALUES(?,?,?,?,?,?)",
      ).run(
        randomUUID(),
        row.attempt_id,
        observation.orderId,
        null,
        text(snapshot),
        stamp,
      );
      db.prepare(
        "INSERT OR REPLACE INTO order_display_snapshots(attempt_id,title_snapshot,filename,resource_name_snapshot,quoted_price,created_at,media_resource_id,estimated_total,system_submission_code) VALUES(?,?,?,?,?,?,?,?,?)",
      ).run(
        row.attempt_id,
        snapshot.submittedTitle,
        safeDisplayText((fromText(row.item_payload) || {}).filename, 255),
        safeDisplayText(snapshot.mediaName, 256),
        snapshot.quotedPrice,
        stamp,
        snapshot.targetIdentityV1.mediaResourceId,
        snapshot.estimatedTotal,
        snapshot.systemSubmissionCode,
      );
      db.prepare(
        "UPDATE publication_attempts SET status='remote_started',finished_at=NULL WHERE attempt_id=? AND status='uncertain'",
      ).run(row.attempt_id);
      db.prepare(
        "UPDATE publication_records SET status='remote_started',updated_at=? WHERE publication_id=? AND status='uncertain'",
      ).run(stamp, row.publication_id);
      activeTarget.settle({
        articleId: row.article_id,
        publicationId: row.publication_id,
        attemptId: row.attempt_id,
        target: snapshot.targetIdentityV1,
        status: "remote_started",
        stamp,
      });
      db.prepare(
        "UPDATE submission_items SET status='completed',claim_token=NULL,claim_until=NULL,revision=revision+1,payload_json=? WHERE item_id=? AND status='uncertain'",
      ).run(
        text(
          Object.assign({}, fromText(row.item_payload) || {}, {
            outcomeStatus: "paid_processing",
            orderId: observation.orderId,
            orderSnapshotV1: snapshot,
            paidTargetV1: target,
          }),
        ),
        row.item_id,
      );
      manualResolutionFact(
        row,
        "order_bound",
        {
          version: 1,
          decision: "order_bound",
          orderCreationAttemptId: value.orderCreationAttemptId,
          orderId: observation.orderId,
          observationFingerprint: observation.fingerprint,
          bindingFingerprint: resolution.bindingFingerprint,
        },
        stamp,
      );
      const next = Object.assign({}, row.intent, {
        detail: Object.assign({}, row.intent.detail, {
          phase: "order_created",
          resolution: {
            decision: "order_bound",
            action: "bind_verified_order",
            orderId: observation.orderId,
            decidedAt: stamp,
            observationFingerprint: observation.fingerprint,
            bindingFingerprint: resolution.bindingFingerprint,
          },
        }),
      });
      db.prepare(
        "UPDATE recovery_intents SET state='resolved',payload_json=?,updated_at=? WHERE attempt_id=? AND state='manual_check'",
      ).run(text(next), stamp, row.attempt_id);
      updatePaidBatchStatus(row.batch_id, stamp);
      paidFault("after-manual-order-resolution", { attemptId: row.attempt_id });
      return Object.freeze({
        orderCreationAttemptId: value.orderCreationAttemptId,
        orderId: observation.orderId,
        status: "order_bound",
        idempotent: false,
      });
    });
    if (result && result.throwCode) throw fail(result.throwCode);
    return result;
  }

  function confirmNoOrder(input) {
    open();
    const value = input || {};
    const stamp = iso(clock);
    return transaction(() => {
      const row = paidResolutionRow(value);
      const previous = row.intent.detail && row.intent.detail.resolution;
      if (previous) {
        if (previous.decision !== "no_order")
          throw fail("PAID_ORDER_RESOLUTION_OPPOSITE");
        verifyCompletedPaidResolution(row, value, "confirm_no_order", stamp);
        return Object.freeze({
          orderCreationAttemptId: value.orderCreationAttemptId,
          status: "no_order",
          idempotent: true,
        });
      }
      const existingOrder = db
        .prepare(
          "SELECT order_id FROM remote_orders WHERE attempt_id=? LIMIT 1",
        )
        .get(row.attempt_id);
      if (existingOrder) throw fail("PAID_ORDER_SUCCESS_WINS");
      const resolution = verifyPaidResolution(
        row,
        value,
        "confirm_no_order",
        stamp,
      );
      const published = db
        .prepare(
          "SELECT 1 FROM publication_records WHERE article_id=? AND status='published' LIMIT 1",
        )
        .get(row.article_id);
      if (published) throw fail("PAID_ORDER_SUCCESS_WINS");
      manualResolutionFact(
        row,
        "no_order",
        {
          version: 1,
          decision: "no_order",
          orderCreationAttemptId: value.orderCreationAttemptId,
          bindingFingerprint: resolution.bindingFingerprint,
        },
        stamp,
      );
      db.prepare(
        "UPDATE publication_attempts SET status='failed',finished_at=? WHERE attempt_id=? AND status='uncertain'",
      ).run(stamp, row.attempt_id);
      db.prepare(
        "UPDATE publication_records SET status='failed',updated_at=? WHERE publication_id=? AND status='uncertain'",
      ).run(stamp, row.publication_id);
      activeTarget.release({
        articleId: row.article_id,
        publicationId: row.publication_id,
        attemptId: row.attempt_id,
      });
      db.prepare(
        "UPDATE submission_items SET status='failed',claim_token=NULL,claim_until=NULL,revision=revision+1,payload_json=? WHERE item_id=? AND status='uncertain'",
      ).run(
        text(
          Object.assign({}, fromText(row.item_payload) || {}, {
            outcomeStatus: "no_order",
          }),
        ),
        row.item_id,
      );
      const next = Object.assign({}, row.intent, {
        detail: Object.assign({}, row.intent.detail, {
          phase: "order_creation_no_order",
          resolution: {
            decision: "no_order",
            action: "confirm_no_order",
            decidedAt: stamp,
            bindingFingerprint: resolution.bindingFingerprint,
          },
        }),
      });
      db.prepare(
        "UPDATE recovery_intents SET state='resolved',payload_json=?,updated_at=? WHERE attempt_id=? AND state='manual_check'",
      ).run(text(next), stamp, row.attempt_id);
      updatePaidBatchStatus(row.batch_id, stamp);
      paidFault("after-manual-no-order-resolution", {
        attemptId: row.attempt_id,
      });
      return Object.freeze({
        orderCreationAttemptId: value.orderCreationAttemptId,
        status: "no_order",
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

  function projectOrderHistory(row) {
    const history = row.history_json
      ? fromText(row.history_json)
      : {
          version: 1,
          orderIdentityV1: { version: 1, orderId: row.order_id },
          entries: [],
        };
    try {
      return projectOrderHistoryV1(history);
    } catch (error) {
      throw fail(error.code || "ORDER_HISTORY_V1_INVALID");
    }
  }

  function listRemoteOrders() {
    open();
    return Object.freeze(
      db
        .prepare(
          "SELECT o.order_id,o.remote_id,o.created_at,a.attempt_id,a.status,p.publication_id,p.article_id,p.target_json,h.evidence_json AS history_json FROM remote_orders o JOIN publication_attempts a ON a.attempt_id=o.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id LEFT JOIN remote_evidence h ON h.attempt_id=o.attempt_id AND h.remote_id=('order-history:' || o.order_id) ORDER BY o.created_at DESC",
        )
        .all()
        .map((row) => {
          const target = fromText(row.target_json) || {};
          const projection = projectOrderHistory(row);
          return Object.freeze({
            orderId: row.order_id,
            orderNid: row.order_id,
            remoteId: row.remote_id,
            publicationId: row.publication_id,
            attemptId: row.attempt_id,
            articleId: row.article_id,
            mediaResourceId: target.mediaResourceId || null,
            status: row.status,
            supplierStatusCode: projection.statusCode || null,
            supplierObservedAt: projection.observedAt,
            publishedAt: projection.publishedAt,
            remoteUrl: projection.remoteUrl,
            createdAt: row.created_at,
          });
        }),
    );
  }

  // Legacy public order reads remain for older direct callers, but their
  // status/evidence projection is delegated to the Ticket 15 history owner.
  function listOrderDisplayViews() {
    open();
    const rows = db
      .prepare(
        "SELECT o.order_id,o.remote_id,o.created_at,a.attempt_id,a.status,p.publication_id,p.article_id,p.target_json,d.title_snapshot,d.filename,d.resource_name_snapshot,d.quoted_price,d.media_resource_id,d.estimated_total,d.system_submission_code,h.evidence_json AS history_json FROM remote_orders o JOIN publication_attempts a ON a.attempt_id=o.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id LEFT JOIN order_display_snapshots d ON d.attempt_id=a.attempt_id LEFT JOIN remote_evidence h ON h.attempt_id=o.attempt_id AND h.remote_id=('order-history:' || o.order_id) ORDER BY o.created_at DESC LIMIT 20000",
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
        const projection = projectOrderHistory(row);
        const target = fromText(row.target_json) || {};
        return Object.freeze({
          orderId: row.order_id,
          orderNid: row.order_id,
          attemptId: row.attempt_id,
          publicationId: row.publication_id,
          publicationStatus:
            row.status === "published"
              ? "published"
              : row.status === "failed" || row.status === "uncertain"
                ? "manual_check"
                : row.status === "cancelled"
                  ? "cancelled"
                  : "paid_processing",
          articleId: row.article_id,
          mediaResourceId: target.mediaResourceId || null,
          submittedAt: row.created_at,
          supplierStatusCode: projection.statusCode,
          supplierObservedAt: projection.observedAt,
          publishedAt: projection.publishedAt,
          remoteUrl: projection.remoteUrl,
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

  return Object.freeze({
    attachRemoteOrderEvidence,
    listRemoteOrders,
    listOrderDisplayViews,
    recordPaidOrderCreationArticleRejection,
    recordPaidOrderCreationSystemRejection,
    recordPaidOrderCreationSuccess,
    recordPaidOrderCreationUncertain,
    prepareOrderCreationResolution,
    bindVerifiedOrder,
    confirmNoOrder,
  });
}

module.exports = { createOrderAggregate, createOrderObservationAggregate };
