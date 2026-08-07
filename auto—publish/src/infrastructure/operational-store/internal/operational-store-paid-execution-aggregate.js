"use strict";

const domain = require("../../../domain");
const {
  fromText,
  rejectSensitive,
  text,
} = require("./operational-store-utils");

const PAUSE_INTENTS = new Set(["none", "manual", "system"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const FINGERPRINT = /^[a-f0-9]{64}$/u;

function createPaidExecutionAggregate(context) {
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

  function paidFault(point, detail) {
    if (internalPaidExecutionTransitionFault)
      internalPaidExecutionTransitionFault(point, detail || {});
  }

  function requiredText(value, max, code) {
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.length > max ||
      /[\x00-\x1f\x7f]/u.test(value)
    )
      throw fail(code);
    return value.trim();
  }

  function pauseIntent(input, fallback) {
    if (input === true) return "manual";
    if (input === false) return "none";
    if (input === undefined) return fallback;
    if (!PAUSE_INTENTS.has(input)) throw fail("PAID_EXECUTION_PAUSE_INVALID");
    return input;
  }

  function batchRow(batchId) {
    const row = db
      .prepare("SELECT * FROM paid_submission_batches WHERE batch_id=?")
      .get(batchId);
    if (!row) throw fail("PAID_EXECUTION_BATCH_NOT_FOUND");
    return row;
  }

  function targetFor(row) {
    try {
      const target = domain.parseTargetIdentityV1({
        version: 1,
        ...fromText(row.target_json),
      });
      if (target.kind !== "media") throw new Error();
      return target;
    } catch (_) {
      throw fail("PAID_EXECUTION_TARGET_INVALID");
    }
  }

  function articleFor(row, payload) {
    try {
      return domain.parseArticleIdentityV1({
        version: 1,
        clientId: payload.clientId,
        articleId: row.article_id,
      });
    } catch (_) {
      throw fail("PAID_EXECUTION_ARTICLE_INVALID");
    }
  }

  function intentFor(row) {
    return fromText(row.intent_payload) || {};
  }

  function rowForAttempt(orderCreationAttemptId) {
    if (
      typeof orderCreationAttemptId !== "string" ||
      !SAFE_ID.test(orderCreationAttemptId)
    )
      throw fail("PAID_ORDER_ATTEMPT_INVALID");
    const row = db
      .prepare(
        "SELECT s.item_id,s.batch_id,s.article_id,s.status item_status,s.claim_token,s.claim_until,s.payload_json item_payload,p.publication_id,p.target_key,p.target_json,a.status attempt_status,i.state,i.payload_json intent_payload FROM submission_items s JOIN publication_records p ON p.article_id=s.article_id AND p.target_key=s.target_key JOIN publication_attempts a ON a.publication_id=p.publication_id AND a.attempt_id=json_extract(s.payload_json,'$.attemptId') JOIN recovery_intents i ON i.attempt_id=a.attempt_id WHERE json_extract(i.payload_json,'$.orderCreationAttemptId')=?",
      )
      .get(orderCreationAttemptId);
    if (!row) throw fail("PAID_ORDER_ATTEMPT_NOT_FOUND");
    return row;
  }

  function paidBatchSnapshot(row, itemRows) {
    const confirmation = fromText(row.confirmation_json) || {};
    const items = (itemRows || []).map((item) => {
      const payload = fromText(item.item_payload) || {};
      const intent = fromText(item.intent_payload) || {};
      const target = targetFor(item);
      const articleIdentityV1 = articleFor(item, payload);
      let orderCreationAttemptId =
        intent.orderCreationAttemptId || payload.orderCreationAttemptId || null;
      if (typeof orderCreationAttemptId !== "string")
        orderCreationAttemptId = null;
      return Object.freeze({
        itemId: item.item_id,
        batchId: item.batch_id,
        articleIdentityV1,
        targetIdentityV1: target,
        orderCreationAttemptId,
        status: item.item_status,
        claimToken: item.claim_token || null,
        claimUntil: item.claim_until || null,
        publicationSnapshot: Object.freeze(payload.publicationSnapshot || {}),
        mediaResourceId: target.mediaResourceId,
        mediaName: payload.resourceNameSnapshot || "",
        systemSubmissionCode: payload.systemSubmissionCode || "",
        resourceFingerprint: confirmation.resourceFingerprint || null,
        quotedPrice: payload.quotedPrice,
        estimatedTotal: payload.estimatedTotal,
        phase:
          intent.detail && intent.detail.phase
            ? intent.detail.phase
            : "paid-admitted",
      });
    });
    const first = items[0];
    return Object.freeze({
      batchId: row.batch_id,
      mediaResourceId: row.media_resource_id,
      status: items.some(
        (item) => item.status === "uncertain" || item.status === "blocked",
      )
        ? "needs_attention"
        : items.every((item) =>
              ["completed", "failed", "cancelled"].includes(item.status),
            )
          ? "completed"
          : "queued",
      pauseIntent: row.pause_intent,
      paused: row.pause_intent !== "none",
      runState:
        row.pause_intent !== "none"
          ? "paused"
          : items.some((item) =>
                ["claimed", "submitting"].includes(item.status),
              )
            ? "in_flight"
            : "running",
      articleCount: row.article_count,
      quotedPrice: row.quoted_price,
      estimatedTotal: row.estimated_total,
      systemSubmissionCode: row.system_submission_code,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
      updatedAt: row.updated_at,
      targetIdentityV1: first ? first.targetIdentityV1 : null,
      items: Object.freeze(items),
    });
  }

  function itemRows(batchId) {
    return db
      .prepare(
        "SELECT s.item_id,s.batch_id,s.article_id,s.revision,s.status item_status,s.claim_token,s.claim_until,s.payload_json item_payload,p.publication_id,p.target_key,p.target_json,i.payload_json intent_payload,i.state FROM submission_items s JOIN publication_records p ON p.article_id=s.article_id AND p.target_key=s.target_key JOIN publication_attempts a ON a.publication_id=p.publication_id AND a.attempt_id=json_extract(s.payload_json,'$.attemptId') JOIN recovery_intents i ON i.attempt_id=a.attempt_id WHERE s.batch_id=? ORDER BY s.rowid LIMIT 1000",
      )
      .all(batchId);
  }

  function listPaidSubmissionBatchSnapshots(input) {
    open();
    const value = input || {};
    const rows =
      value.batchId === undefined
        ? db
            .prepare(
              "SELECT * FROM paid_submission_batches ORDER BY created_at,batch_id LIMIT 20000",
            )
            .all()
        : [
            batchRow(
              requiredText(value.batchId, 128, "PAID_EXECUTION_BATCH_INVALID"),
            ),
          ];
    return Object.freeze(
      rows.map((row) => paidBatchSnapshot(row, itemRows(row.batch_id))),
    );
  }

  function setPaidSubmissionBatchRunIntent(input) {
    open();
    const value = input || {};
    const batchId = requiredText(
      value.batchId,
      128,
      "PAID_EXECUTION_BATCH_INVALID",
    );
    const intent = value.running === true ? "none" : "manual";
    const stamp = iso(clock);
    return transaction(() => {
      if (
        value.running === true &&
        itemRows(batchId).some((item) =>
          ["uncertain", "blocked"].includes(item.item_status),
        )
      )
        throw fail("PAID_EXECUTION_MANUAL_RESOLUTION_REQUIRED");
      const changed = db
        .prepare(
          "UPDATE paid_submission_batches SET pause_intent=?,updated_at=? WHERE batch_id=?",
        )
        .run(intent, stamp, batchId).changes;
      if (changed !== 1) throw fail("PAID_EXECUTION_BATCH_NOT_FOUND");
      return paidBatchSnapshot(batchRow(batchId), itemRows(batchId));
    });
  }

  function updateAllRunIntent(mode) {
    open();
    const stamp = iso(clock);
    return transaction(() => {
      const changed =
        mode === "start"
          ? db
              .prepare(
                "UPDATE paid_submission_batches SET pause_intent='none',updated_at=? WHERE pause_intent='system'",
              )
              .run(stamp).changes
          : db
              .prepare(
                "UPDATE paid_submission_batches SET pause_intent='system',updated_at=? WHERE pause_intent='none'",
              )
              .run(stamp).changes;
      return Object.freeze({
        mode,
        changedCount: changed,
        batches: listPaidSubmissionBatchSnapshots({}),
      });
    });
  }

  function startAllPaidSubmissionBatches() {
    return updateAllRunIntent("start");
  }

  function pauseAllPaidSubmissionBatches() {
    return updateAllRunIntent("pause");
  }

  function pausePaidSubmissionBatchesOnStartup() {
    return updateAllRunIntent("startup");
  }

  function claimPaidSubmissionBatchItem(input) {
    open();
    const value = input || {};
    const batchId = requiredText(
      value.batchId,
      128,
      "PAID_EXECUTION_BATCH_INVALID",
    );
    const claimToken = requiredText(
      value.claimToken,
      128,
      "PAID_EXECUTION_CLAIM_INVALID",
    );
    const leaseMs =
      Number.isSafeInteger(value.leaseMs) && value.leaseMs > 0
        ? value.leaseMs
        : 30000;
    if (leaseMs > 300000) throw fail("PAID_EXECUTION_CLAIM_INVALID");
    const stamp = iso(clock);
    const claimUntil = new Date(Date.parse(stamp) + leaseMs).toISOString();
    return transaction(() => {
      const batch = batchRow(batchId);
      if (batch.pause_intent !== "none") return null;
      const rows = itemRows(batchId);
      const candidate = rows.find((row) => {
        const intent = intentFor(row);
        const phase = intent.detail && intent.detail.phase;
        if (phase === "remote_call_started" || row.state !== "resolved")
          return false;
        return (
          row.item_status === "queued" ||
          (row.item_status === "claimed" &&
            row.claim_until &&
            row.claim_until <= stamp &&
            phase === "prepared")
        );
      });
      if (!candidate) return null;
      const payload = fromText(candidate.item_payload) || {};
      const intent = intentFor(candidate);
      const target = targetFor(candidate);
      const articleIdentityV1 = articleFor(candidate, payload);
      const orderCreationAttemptId =
        intent.orderCreationAttemptId ||
        payload.orderCreationAttemptId ||
        `paid-order-attempt-${randomUUID()}`;
      if (!SAFE_ID.test(orderCreationAttemptId))
        throw fail("PAID_ORDER_ATTEMPT_INVALID");
      const nextPayload = Object.assign({}, payload, {
        orderCreationAttemptId,
      });
      const nextIntent = Object.assign({}, intent, {
        orderCreationAttemptId,
        paidSubmission: Object.assign({}, intent.paidSubmission || {}, {
          batchItemId: candidate.item_id,
          batchId,
          claimToken,
          claimUntil,
        }),
        detail: Object.assign({}, intent.detail || {}, {
          phase: "prepared",
          preparedAt: (intent.detail && intent.detail.preparedAt) || stamp,
        }),
      });
      rejectSensitive(nextPayload);
      rejectSensitive(nextIntent);
      db.prepare(
        "UPDATE submission_items SET status='claimed',claim_token=?,claim_until=?,revision=revision+1,payload_json=? WHERE item_id=? AND revision=?",
      ).run(
        claimToken,
        claimUntil,
        text(nextPayload),
        candidate.item_id,
        candidate.revision,
      );
      if (db.prepare("SELECT changes() AS count").get().count !== 1)
        throw fail("PAID_EXECUTION_CLAIM_CONFLICT");
      paidFault("after-paid-claim", { batchId, itemId: candidate.item_id });
      const intentChanged = db
        .prepare(
          "UPDATE recovery_intents SET payload_json=?,updated_at=? WHERE attempt_id=json_extract(?, '$.attemptId') AND state='resolved'",
        )
        .run(text(nextIntent), stamp, text(nextPayload)).changes;
      if (intentChanged !== 1) throw fail("PAID_EXECUTION_CLAIM_CONFLICT");
      paidFault("after-paid-prepared-intent", {
        batchId,
        itemId: candidate.item_id,
      });
      return Object.freeze({
        batchId,
        paidBatchId: batchId,
        batchItemId: candidate.item_id,
        itemId: candidate.item_id,
        publicationId: candidate.publication_id,
        attemptId: payload.attemptId,
        orderCreationAttemptId,
        articleIdentityV1,
        targetIdentityV1: target,
        publicationSnapshot: Object.freeze(payload.publicationSnapshot || {}),
        mediaName:
          payload.resourceNameSnapshot ||
          fromText(batch.confirmation_json)?.mediaName ||
          fromText(batch.confirmation_json)?.resourceName ||
          "",
        mediaRemarks: fromText(batch.confirmation_json)?.mediaRemarks || "",
        resourceFingerprint:
          fromText(batch.confirmation_json)?.resourceFingerprint || null,
        quotedPrice: batch.quoted_price,
        estimatedTotal: batch.estimated_total,
        systemSubmissionCode: batch.system_submission_code,
        claimToken,
        claimUntil,
        preparedAt: nextIntent.detail.preparedAt,
      });
    });
  }

  function renewPaidOrderCreationClaim(input) {
    open();
    const value = input || {};
    const row = rowForAttempt(value.orderCreationAttemptId);
    const claimToken = requiredText(
      value.claimToken,
      128,
      "PAID_EXECUTION_CLAIM_INVALID",
    );
    const leaseMs =
      Number.isSafeInteger(value.leaseMs) && value.leaseMs > 0
        ? value.leaseMs
        : 30000;
    if (leaseMs > 300000) throw fail("PAID_EXECUTION_CLAIM_INVALID");
    const stamp = iso(clock);
    const claimUntil = new Date(Date.parse(stamp) + leaseMs).toISOString();
    return transaction(() => {
      if (
        row.item_status !== "claimed" ||
        row.claim_token !== claimToken ||
        !row.claim_until ||
        row.claim_until <= stamp
      )
        throw fail("PAID_EXECUTION_CLAIM_STALE");
      const changed = db
        .prepare(
          "UPDATE submission_items SET claim_until=?,revision=revision+1 WHERE item_id=? AND status='claimed' AND claim_token=? AND claim_until>?",
        )
        .run(claimUntil, row.item_id, claimToken, stamp).changes;
      if (changed !== 1) throw fail("PAID_EXECUTION_CLAIM_STALE");
      const intent = intentFor(row);
      db.prepare(
        "UPDATE recovery_intents SET payload_json=?,updated_at=? WHERE attempt_id=json_extract(?, '$.attemptId') AND state='resolved'",
      ).run(
        text(
          Object.assign({}, intent, {
            paidSubmission: Object.assign({}, intent.paidSubmission || {}, {
              claimUntil,
            }),
          }),
        ),
        stamp,
        row.item_payload,
      );
      return Object.freeze({
        orderCreationAttemptId: value.orderCreationAttemptId,
        claimToken,
        claimUntil,
      });
    });
  }

  function releasePaidOrderCreationClaim(input) {
    open();
    const value = input || {};
    const row = rowForAttempt(value.orderCreationAttemptId);
    const stamp = iso(clock);
    return transaction(() => {
      if (row.item_status !== "claimed" || row.claim_token !== value.claimToken)
        throw fail("PAID_EXECUTION_CLAIM_STALE");
      const intent = intentFor(row);
      const nextIntent = Object.assign({}, intent, {
        detail: Object.assign({}, intent.detail || {}, {
          phase: "paid-admitted",
        }),
        paidSubmission: Object.assign({}, intent.paidSubmission || {}, {
          batchItemId: row.item_id,
          claimToken: null,
          claimUntil: null,
        }),
      });
      db.prepare(
        "UPDATE submission_items SET status='queued',claim_token=NULL,claim_until=NULL,revision=revision+1 WHERE item_id=? AND status='claimed' AND claim_token=?",
      ).run(row.item_id, value.claimToken);
      if (db.prepare("SELECT changes() AS count").get().count !== 1)
        throw fail("PAID_EXECUTION_CLAIM_STALE");
      db.prepare(
        "UPDATE recovery_intents SET payload_json=?,updated_at=? WHERE attempt_id=json_extract(?, '$.attemptId') AND state='resolved'",
      ).run(text(nextIntent), stamp, row.item_payload);
      return Object.freeze({
        batchId: row.batch_id,
        batchItemId: row.item_id,
        orderCreationAttemptId: value.orderCreationAttemptId,
        status: "queued",
      });
    });
  }

  function beginOrderCreationRemoteCall(input) {
    open();
    const value = input || {};
    const row = rowForAttempt(value.orderCreationAttemptId);
    const batch = batchRow(row.batch_id);
    const claimToken = requiredText(
      value.claimToken,
      128,
      "PAID_EXECUTION_CLAIM_INVALID",
    );
    const prepared = value.orderCreationPrepared || {
      version: 1,
      articleIdentityV1: value.articleIdentityV1,
      targetIdentityV1: value.targetIdentityV1,
      orderCreationAttemptId: value.orderCreationAttemptId,
      mediaName: value.mediaName,
      quotedPrice: value.quotedPrice,
      estimatedTotal: value.estimatedTotal,
      systemSubmissionCode: value.systemSubmissionCode,
      submittedTitle: value.submittedTitle,
      submittedBody: value.submittedBody,
      contentFingerprint: value.contentFingerprint,
      preparedAt: value.preparedAt,
    };
    if (
      !prepared ||
      prepared.orderCreationAttemptId !== value.orderCreationAttemptId ||
      !FINGERPRINT.test(prepared.contentFingerprint || "") ||
      !prepared.articleIdentityV1 ||
      !prepared.targetIdentityV1
    )
      throw fail("PAID_ORDER_PREPARED_INVALID");
    let normalizedPrepared;
    try {
      const checked = domain.parseOrderSnapshotV1({
        version: 1,
        orderIdentityV1: { version: 1, orderId: "prepared-order" },
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
        remoteCallStartedAt: prepared.preparedAt,
      });
      normalizedPrepared = Object.freeze({
        version: 1,
        articleIdentityV1: checked.articleIdentityV1,
        targetIdentityV1: checked.targetIdentityV1,
        orderCreationAttemptId: checked.orderCreationAttemptId,
        mediaName: checked.mediaName,
        quotedPrice: checked.quotedPrice,
        estimatedTotal: checked.estimatedTotal,
        systemSubmissionCode: checked.systemSubmissionCode,
        submittedTitle: checked.submittedTitle,
        submittedBody: checked.submittedBody,
        contentFingerprint: checked.contentFingerprint,
        preparedAt: prepared.preparedAt,
      });
    } catch (error) {
      throw fail(
        error && error.code ? error.code : "PAID_ORDER_PREPARED_INVALID",
      );
    }
    const stamp = iso(clock);
    return transaction(() => {
      const intent = intentFor(row);
      if (
        row.state === "remote_started" &&
        intent.detail &&
        intent.detail.phase === "remote_call_started"
      ) {
        if (
          JSON.stringify(intent.orderCreationPrepared) !==
          JSON.stringify(normalizedPrepared)
        )
          throw fail("PAID_ORDER_PREPARED_CONFLICT");
        return Object.freeze({
          orderCreationAttemptId: value.orderCreationAttemptId,
          remoteCallStartedAt: intent.detail.remoteCallStartedAt,
          orderCreationPrepared: intent.orderCreationPrepared,
          submitAuthorized: false,
          idempotent: true,
        });
      }
      if (
        row.state !== "resolved" ||
        !intent.detail ||
        intent.detail.phase !== "prepared" ||
        row.item_status !== "claimed" ||
        row.claim_token !== claimToken ||
        !row.claim_until ||
        row.claim_until <= stamp ||
        row.attempt_status !== "queued"
      )
        throw fail("PAID_ORDER_PHASE_INVALID");
      const payload = fromText(row.item_payload) || {};
      const target = targetFor(row);
      const articleIdentityV1 = articleFor(row, payload);
      const confirmation = fromText(batch.confirmation_json) || {};
      const confirmedMediaName =
        typeof confirmation.resourceName === "string"
          ? confirmation.resourceName
          : typeof confirmation.mediaName === "string"
            ? confirmation.mediaName
            : payload.resourceNameSnapshot;
      if (
        JSON.stringify(articleIdentityV1) !==
          JSON.stringify(normalizedPrepared.articleIdentityV1) ||
        JSON.stringify(target) !==
          JSON.stringify(normalizedPrepared.targetIdentityV1) ||
        target.mediaResourceId !== batch.media_resource_id ||
        payload.orderCreationAttemptId !== value.orderCreationAttemptId ||
        normalizedPrepared.preparedAt !==
          (intent.detail && intent.detail.preparedAt) ||
        typeof confirmedMediaName !== "string" ||
        normalizedPrepared.mediaName !== confirmedMediaName ||
        normalizedPrepared.quotedPrice !== batch.quoted_price ||
        normalizedPrepared.estimatedTotal !== batch.estimated_total ||
        normalizedPrepared.systemSubmissionCode !==
          batch.system_submission_code ||
        (payload.resourceNameSnapshot !== undefined &&
          payload.resourceNameSnapshot !== normalizedPrepared.mediaName) ||
        (payload.quotedPrice !== undefined &&
          payload.quotedPrice !== normalizedPrepared.quotedPrice) ||
        (payload.estimatedTotal !== undefined &&
          payload.estimatedTotal !== normalizedPrepared.estimatedTotal) ||
        (payload.systemSubmissionCode !== undefined &&
          payload.systemSubmissionCode !==
            normalizedPrepared.systemSubmissionCode) ||
        !payload.publicationSnapshot ||
        domain.contentFingerprint(
          payload.publicationSnapshot.title,
          payload.publicationSnapshot.body,
        ) !== normalizedPrepared.contentFingerprint
      )
        throw fail("PAID_ORDER_PREPARED_MISMATCH");
      const nextIntent = Object.assign({}, intent, {
        orderCreationPrepared: normalizedPrepared,
        detail: Object.assign({}, intent.detail, {
          phase: "remote_call_started",
          remoteCallStartedAt: stamp,
        }),
      });
      db.prepare(
        "UPDATE recovery_intents SET state='remote_started',payload_json=?,updated_at=? WHERE attempt_id=json_extract(?, '$.attemptId') AND state='resolved'",
      ).run(text(nextIntent), stamp, row.item_payload);
      if (db.prepare("SELECT changes() AS count").get().count !== 1)
        throw fail("PAID_ORDER_PHASE_INVALID");
      paidFault("after-paid-evidence-freeze", {
        attemptId: value.orderCreationAttemptId,
      });
      db.prepare(
        "UPDATE publication_attempts SET status='remote_started' WHERE attempt_id=json_extract(?, '$.attemptId') AND status='queued'",
      ).run(row.item_payload);
      if (db.prepare("SELECT changes() AS count").get().count !== 1)
        throw fail("PAID_ORDER_PHASE_INVALID");
      db.prepare(
        "UPDATE publication_records SET status='remote_started',updated_at=? WHERE publication_id=? AND status='queued'",
      ).run(stamp, row.publication_id);
      paidFault("after-paid-publication-remote-started", {
        attemptId: value.orderCreationAttemptId,
      });
      db.prepare(
        "UPDATE article_active_targets SET state='remote_started',updated_at=? WHERE attempt_id=json_extract(?, '$.attemptId') AND state='queued'",
      ).run(stamp, row.item_payload);
      if (db.prepare("SELECT changes() AS count").get().count !== 1)
        throw fail("PAID_ORDER_PHASE_INVALID");
      db.prepare(
        "UPDATE submission_items SET status='submitting',claim_until=NULL,revision=revision+1 WHERE item_id=? AND status='claimed' AND claim_token=?",
      ).run(row.item_id, claimToken);
      if (db.prepare("SELECT changes() AS count").get().count !== 1)
        throw fail("PAID_ORDER_PHASE_INVALID");
      paidFault("after-paid-submission-start", { itemId: row.item_id });
      return Object.freeze({
        orderCreationAttemptId: value.orderCreationAttemptId,
        remoteCallStartedAt: stamp,
        orderCreationPrepared: normalizedPrepared,
        submitAuthorized: true,
        idempotent: false,
      });
    });
  }

  return Object.freeze({
    beginOrderCreationRemoteCall,
    claimPaidSubmissionBatchItem,
    listPaidSubmissionBatchSnapshots,
    pauseAllPaidSubmissionBatches,
    pausePaidSubmissionBatchesOnStartup,
    releasePaidOrderCreationClaim,
    renewPaidOrderCreationClaim,
    setPaidSubmissionBatchRunIntent,
    startAllPaidSubmissionBatches,
  });
}

module.exports = { createPaidExecutionAggregate };
