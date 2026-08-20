"use strict";

const crypto = require("node:crypto");
const domain = require("../../../domain");
const { fromText, text } = require("./operational-store-utils");

const OBSERVATION_CODES = /^[A-Z][A-Z0-9_]{0,127}$/;

function stableFingerprint(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}

function createRegularOutcomeAggregate(context, publicationSuccess) {
  const {
    db,
    open,
    transaction,
    clock,
    randomUUID,
    fail,
    iso,
    internalRegularOutcomeTransitionFault,
  } = context;

  function fault(point, detail) {
    if (internalRegularOutcomeTransitionFault)
      internalRegularOutcomeTransitionFault(point, detail || {});
  }

  function attemptId(input) {
    return domain.AttemptId.serialize(
      domain.AttemptId.parse(
        input && (input.regularPublicationAttemptId || input.attemptId),
      ),
    );
  }

  function safeTimestamp(value, code) {
    if (
      typeof value !== "string" ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString() !== value
    )
      throw fail(code);
    return value;
  }

  function observation(input, expectedStatus, stamp) {
    const value = (input && input.observation) || {};
    if (
      value.status !== expectedStatus ||
      typeof value.code !== "string" ||
      !OBSERVATION_CODES.test(value.code) ||
      Object.keys(value).some(
        (key) =>
          ![
            "status",
            "code",
            "observedAt",
            "providerEventAt",
            "remoteId",
            "remoteUrl",
            "articleRecoverable",
          ].includes(key),
      ) ||
      (expectedStatus === "group_blocked" &&
        typeof value.articleRecoverable !== "boolean") ||
      (value.remoteId !== undefined &&
        (typeof value.remoteId !== "string" ||
          !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value.remoteId)))
    )
      throw fail("REGULAR_OUTCOME_INVALID");
    const observedAt =
      value.observedAt === undefined
        ? stamp
        : safeTimestamp(value.observedAt, "REGULAR_OUTCOME_TIME_INVALID");
    const providerEventAt =
      value.providerEventAt === undefined || value.providerEventAt === null
        ? null
        : safeTimestamp(value.providerEventAt, "REGULAR_OUTCOME_TIME_INVALID");
    const remoteUrl =
      value.remoteUrl === undefined || value.remoteUrl === null
        ? null
        : domain.normalizePublishedArticleUrl(value.remoteUrl);
    if (value.remoteUrl !== undefined && value.remoteUrl !== null && !remoteUrl)
      throw fail("REGULAR_OUTCOME_EVIDENCE_INVALID");
    const normalized = Object.freeze({
      status: value.status,
      code: value.code,
      observedAt,
      providerEventAt,
      remoteId: value.remoteId || null,
      remoteUrl,
      ...(expectedStatus === "group_blocked"
        ? { articleRecoverable: value.articleRecoverable === true }
        : {}),
    });
    if (
      expectedStatus === "accepted" &&
      !normalized.remoteId &&
      !normalized.remoteUrl
    )
      throw fail("REGULAR_ACCEPTED_REMOTE_IDENTITY_REQUIRED");
    return Object.freeze({
      ...normalized,
      fingerprint: stableFingerprint(normalized),
    });
  }

  function loadAttempt(id, options) {
    const row = db
      .prepare(
        "SELECT i.state,i.payload_json,i.updated_at,s.item_id,s.batch_id,s.status item_status,s.payload_json item_payload,q.queue_group_id,g.pause_intent group_pause_intent,g.revision group_revision,t.state active_target_state,p.publication_id,p.article_id,p.target_json,p.status publication_status,a.status attempt_status FROM recovery_intents i JOIN publication_attempts a ON a.attempt_id=i.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id JOIN submission_items s ON json_extract(s.payload_json,'$.attemptId')=i.attempt_id LEFT JOIN submission_queue_items q ON q.item_id=s.item_id LEFT JOIN submission_queue_groups g ON g.queue_group_id=q.queue_group_id LEFT JOIN article_active_targets t ON t.attempt_id=i.attempt_id WHERE i.attempt_id=?",
      )
      .get(id);
    if (!row) throw fail("REGULAR_SUBMISSION_ATTEMPT_NOT_FOUND");
    const intent = fromText(row.payload_json) || {};
    const allowPrepared = Boolean(options && options.allowPrepared);
    const remoteStarted = Boolean(
      intent.detail &&
      intent.detail.phase === "remote_call_started" &&
      intent.detail.remoteCallStartedAt &&
      intent.preparedSubmissionEvidenceV1,
    );
    const prepared = Boolean(
      allowPrepared && intent.detail && intent.detail.phase === "prepared",
    );
    const resolvedWithEvidence = Boolean(
      intent.detail &&
      intent.detail.phase === "resolved" &&
      intent.preparedSubmissionEvidenceV1,
    );
    if (!remoteStarted && !prepared && !resolvedWithEvidence)
      throw fail("REGULAR_OUTCOME_SUBMISSION_BOUNDARY_REQUIRED");
    return { ...row, intent };
  }

  function refreshBatch(batchId, stamp) {
    const statuses = db
      .prepare("SELECT status FROM submission_items WHERE batch_id=?")
      .all(batchId)
      .map((row) => row.status);
    const status = statuses.some((value) =>
      ["queued", "claimed", "remote_started"].includes(value),
    )
      ? "queued"
      : statuses.some((value) => ["failed", "uncertain"].includes(value))
        ? "failed"
        : "completed";
    db.prepare(
      "UPDATE submission_batches SET status=?,revision=revision+1,updated_at=? WHERE batch_id=?",
    ).run(status, stamp, batchId);
  }

  function closeItem(row, status, payload, stamp) {
    db.prepare(
      "UPDATE submission_items SET status=?,claim_token=NULL,claim_until=NULL,revision=revision+1,payload_json=? WHERE item_id=?",
    ).run(status, text(payload), row.item_id);
    db.prepare("DELETE FROM submission_queue_items WHERE item_id=?").run(
      row.item_id,
    );
    refreshBatch(row.batch_id, stamp);
  }

  function canRequeueRecoverableGroupBlocked(row, status, observed) {
    return (
      status === "group_blocked" &&
      observed.articleRecoverable === true &&
      ["resolved", "remote_started"].includes(row.state) &&
      row.intent.detail &&
      ["prepared", "remote_call_started"].includes(row.intent.detail.phase) &&
      ["queued", "remote_started"].includes(row.attempt_status) &&
      ["queued", "remote_started"].includes(row.publication_status) &&
      ["claimed", "remote_started"].includes(row.item_status) &&
      ["queued", "remote_started"].includes(row.active_target_state) &&
      Boolean(row.queue_group_id)
    );
  }

  function releasedIntent(row, observed) {
    const detail = Object.assign({}, row.intent.detail || {}, {
      phase: "admitted",
    });
    delete detail.observation;
    if (observed && observed.status === "group_blocked")
      detail.lastGroupBlockedCode = observed.code;
    else delete detail.lastGroupBlockedCode;
    const next = Object.assign({}, row.intent, {
      detail,
    });
    delete next.regularSubmission;
    delete next.preparedSubmissionEvidenceV1;
    return next;
  }

  function requeueRecoverableGroupBlocked(row, id, stamp, observed) {
    const attemptChanged = db
      .prepare(
        "UPDATE publication_attempts SET status='queued',finished_at=NULL WHERE attempt_id=? AND status IN('queued','remote_started')",
      )
      .run(id).changes;
    if (attemptChanged !== 1) throw fail("REGULAR_OUTCOME_STATE_CONFLICT");
    const publicationChanged = db
      .prepare(
        "UPDATE publication_records SET status='queued',updated_at=? WHERE publication_id=? AND status IN('queued','remote_started')",
      )
      .run(stamp, row.publication_id).changes;
    if (publicationChanged !== 1) throw fail("REGULAR_OUTCOME_STATE_CONFLICT");
    const activeTargetChanged = db
      .prepare(
        "UPDATE article_active_targets SET state='queued',updated_at=? WHERE attempt_id=? AND state IN('queued','remote_started')",
      )
      .run(stamp, id).changes;
    if (activeTargetChanged !== 1) throw fail("REGULAR_OUTCOME_STATE_CONFLICT");
    const itemChanged = db
      .prepare(
        "UPDATE submission_items SET status='queued',claim_token=NULL,claim_until=NULL,revision=revision+1 WHERE item_id=? AND status IN('claimed','remote_started')",
      )
      .run(row.item_id).changes;
    if (itemChanged !== 1) throw fail("REGULAR_OUTCOME_STATE_CONFLICT");
    const queueItem = db
      .prepare("SELECT 1 FROM submission_queue_items WHERE item_id=?")
      .get(row.item_id);
    if (!queueItem) throw fail("REGULAR_OUTCOME_STATE_CONFLICT");
    const groupChanged = db
      .prepare(
        "UPDATE submission_queue_groups SET pause_intent='system',revision=revision+1,updated_at=? WHERE queue_group_id=?",
      )
      .run(stamp, row.queue_group_id).changes;
    if (groupChanged !== 1) throw fail("REGULAR_OUTCOME_STATE_CONFLICT");
    const intentChanged = db
      .prepare(
        "UPDATE recovery_intents SET state='resolved',payload_json=?,updated_at=? WHERE attempt_id=? AND state IN('resolved','remote_started','outcome_pending')",
      )
      .run(text(releasedIntent(row, observed)), stamp, id).changes;
    if (intentChanged !== 1) throw fail("REGULAR_OUTCOME_STATE_CONFLICT");
    refreshBatch(row.batch_id, stamp);
  }

  function snapshots(row) {
    const item = fromText(row.item_payload) || {};
    const target = fromText(row.target_json) || {};
    const account =
      target.kind === "platform"
        ? db
            .prepare(
              "SELECT display_name FROM account_profiles WHERE account_profile_id=?",
            )
            .get(target.accountProfileId)
        : null;
    return {
      customerSnapshotV1: domain.parseCustomerSnapshotV1(
        item.customerSnapshotV1 || {
          version: 1,
          clientId: item.clientId,
          displayName: item.clientId,
        },
      ),
      targetSnapshotV1: domain.parseTargetSnapshotV1(
        item.targetSnapshotV1 || {
          version: 1,
          kind: "platform",
          platformId: target.platformId,
          platformName: target.platformId,
          accountProfileId: target.accountProfileId,
          accountLabel:
            (account && account.display_name) || target.accountProfileId,
        },
      ),
    };
  }

  function publicationEvidence(row, observed, manualEvidence) {
    const prepared = domain.parsePreparedSubmissionEvidenceV1(
      row.intent.preparedSubmissionEvidenceV1,
    );
    const display = snapshots(row);
    const positive = manualEvidence || observed;
    const firstPublishedAt = positive.providerEventAt || positive.observedAt;
    const firstPublishedAtSource = positive.providerEventAt
      ? "provider_event_time"
      : manualEvidence
        ? "manual_positive_evidence_time"
        : "first_positive_observation_time";
    return domain.parsePublicationEvidenceV2({
      version: 2,
      articleIdentityV1: prepared.articleIdentityV1,
      customerSnapshotV1: display.customerSnapshotV1,
      contentAvailable: true,
      title: prepared.title,
      body: prepared.body,
      contentFingerprint: prepared.contentFingerprint,
      targetSnapshotV1: display.targetSnapshotV1,
      resultCode: "REGULAR_ACCEPTED",
      submittedAt: row.intent.detail.remoteCallStartedAt,
      submittedAtSource: "regular_remote_call_started",
      firstPublishedAt,
      firstPublishedAtSource,
      imageSummaryV1: {
        deliveryMode: prepared.deliveryMode,
        images: prepared.images,
        decisionKind: prepared.decisionKind,
      },
      orderNumber: null,
      remoteId: positive.remoteId || null,
      remoteUrl: positive.remoteUrl || null,
      missingReasons: [],
      safeEvidenceRefs: [
        {
          kind: "PREPARED_SUBMISSION",
          fingerprint: stableFingerprint(prepared),
        },
        {
          kind: manualEvidence
            ? "MANUAL_POSITIVE_EVIDENCE"
            : "REGULAR_ACCEPTED_OBSERVATION",
          fingerprint: positive.fingerprint,
        },
      ],
    });
  }

  function resolvedIntent(row, observed, resolution) {
    return Object.assign({}, row.intent, {
      detail: Object.assign({}, row.intent.detail, {
        phase: "resolved",
        observation: observed,
        ...(resolution ? { resolution } : {}),
      }),
    });
  }

  function observedIntent(row, observed) {
    return Object.assign({}, row.intent, {
      detail: Object.assign({}, row.intent.detail, { observation: observed }),
    });
  }

  function acceptedResolution(stamp, observed) {
    return Object.freeze({
      decision: "accepted",
      successWins: true,
      decidedAt: stamp,
      evidenceFingerprint: observed.fingerprint,
    });
  }

  function recordRegularAccepted(input) {
    open();
    const id = attemptId(input);
    const stamp = iso(clock);
    const observed = observation(input, "accepted", stamp);
    return transaction(() => {
      const row = loadAttempt(id);
      const existing = row.intent.detail.observation;
      if (row.publication_status === "published") {
        const acceptedObserved =
          existing && existing.status === "accepted" ? existing : observed;
        const evidence = publicationEvidence(row, acceptedObserved);
        const success = publicationSuccess.applyFirstPublicationSuccess({
          attemptId: id,
          publicationEvidence: evidence,
          stamp,
        });
        if (
          existing &&
          existing.status === "accepted" &&
          row.intent.detail.resolution &&
          row.intent.detail.resolution.decision === "accepted"
        )
          return success;
        db.prepare(
          "UPDATE recovery_intents SET state='resolved',payload_json=?,updated_at=? WHERE attempt_id=?",
        ).run(
          text(
            resolvedIntent(
              row,
              acceptedObserved,
              acceptedResolution(stamp, acceptedObserved),
            ),
          ),
          stamp,
          id,
        );
        return success;
      }
      const evidence = publicationEvidence(row, observed);
      const success = publicationSuccess.applyFirstPublicationSuccess({
        attemptId: id,
        publicationEvidence: evidence,
        stamp,
      });
      fault("after-publication-success", { attemptId: id });
      closeItem(
        row,
        "completed",
        Object.assign({}, fromText(row.item_payload) || {}, {
          outcomeStatus: "published",
        }),
        stamp,
      );
      fault("after-queue-close", { attemptId: id });
      db.prepare(
        "UPDATE recovery_intents SET state='resolved',payload_json=?,updated_at=? WHERE attempt_id=?",
      ).run(
        text(
          resolvedIntent(row, observed, acceptedResolution(stamp, observed)),
        ),
        stamp,
        id,
      );
      fault("after-intent-close", { attemptId: id });
      return success;
    });
  }

  function recordTerminal(input, status, options) {
    open();
    const id = attemptId(input);
    const stamp = iso(clock);
    const observed = observation(input, status, stamp);
    return transaction(() => {
      const row = loadAttempt(id, {
        allowPrepared: ["article_rejected", "group_blocked"].includes(status),
      });
      const published = db
        .prepare(
          "SELECT 1 FROM publication_records WHERE article_id=? AND status='published' LIMIT 1",
        )
        .get(row.article_id);
      if (published)
        return Object.freeze({
          attemptId: id,
          status: "published",
          firstWins: true,
        });
      if (row.intent.detail.observation) {
        if (
          row.intent.detail.observation.fingerprint === observed.fingerprint ||
          (options &&
            options.idempotentExistingOrphanedUncertain === true &&
            row.intent.detail.observation.status === "uncertain" &&
            row.intent.detail.observation.code ===
              "REGULAR_ORPHANED_REMOTE_ATTEMPT")
        )
          return Object.freeze({ attemptId: id, status, idempotent: true });
        throw fail("REGULAR_OUTCOME_CONFLICT");
      }
      const requeue = canRequeueRecoverableGroupBlocked(row, status, observed);
      if (requeue) requeueRecoverableGroupBlocked(row, id, stamp, observed);
      const keepFrozen =
        status === "uncertain" ||
        (status === "group_blocked" && observed.articleRecoverable === false);
      if (!requeue && keepFrozen) {
        db.prepare(
          "UPDATE publication_attempts SET status='uncertain',finished_at=? WHERE attempt_id=? AND status IN('queued','remote_started')",
        ).run(stamp, id);
        db.prepare(
          "UPDATE publication_records SET status='uncertain',updated_at=? WHERE publication_id=? AND status IN('queued','remote_started')",
        ).run(stamp, row.publication_id);
        db.prepare(
          "UPDATE article_active_targets SET state='uncertain',updated_at=? WHERE attempt_id=? AND state IN('queued','remote_started')",
        ).run(stamp, id);
        db.prepare(
          "UPDATE submission_items SET status='uncertain',claim_token=NULL,claim_until=NULL,revision=revision+1 WHERE item_id=?",
        ).run(row.item_id);
        if (row.queue_group_id)
          db.prepare(
            "UPDATE submission_queue_groups SET pause_intent='system',revision=revision+1,updated_at=? WHERE queue_group_id=?",
          ).run(stamp, row.queue_group_id);
        db.prepare(
          "UPDATE recovery_intents SET state='manual_check',payload_json=?,updated_at=? WHERE attempt_id=?",
        ).run(text(observedIntent(row, observed)), stamp, id);
      } else if (!requeue) {
        const allowedStatuses =
          row.attempt_status === "queued"
            ? "('queued')"
            : "('remote_started','uncertain')";
        db.prepare(
          `UPDATE publication_attempts SET status='failed',finished_at=? WHERE attempt_id=? AND status IN${allowedStatuses}`,
        ).run(stamp, id);
        db.prepare(
          `UPDATE publication_records SET status='failed',updated_at=? WHERE publication_id=? AND status IN${allowedStatuses}`,
        ).run(stamp, row.publication_id);
        db.prepare("DELETE FROM article_active_targets WHERE attempt_id=?").run(
          id,
        );
        closeItem(
          row,
          "failed",
          Object.assign({}, fromText(row.item_payload) || {}, {
            outcomeStatus: status,
            reasonCode: observed.code,
          }),
          stamp,
        );
        if (status === "group_blocked" && row.queue_group_id)
          db.prepare(
            "UPDATE submission_queue_groups SET pause_intent='system',revision=revision+1,updated_at=? WHERE queue_group_id=?",
          ).run(stamp, row.queue_group_id);
        db.prepare(
          "UPDATE recovery_intents SET state='resolved',payload_json=?,updated_at=? WHERE attempt_id=?",
        ).run(text(resolvedIntent(row, observed)), stamp, id);
      }
      fault(`after-${status}`, { attemptId: id });
      return Object.freeze({ attemptId: id, status, idempotent: false });
    });
  }

  function prepareRegularUncertainResolution(input) {
    open();
    const id = attemptId(input);
    const stamp = iso(clock);
    return transaction(() => {
      const row = loadAttempt(id);
      const observed = row.intent.detail.observation;
      if (
        row.state !== "manual_check" ||
        !observed ||
        !(
          observed.status === "uncertain" ||
          (observed.status === "group_blocked" &&
            observed.articleRecoverable === false)
        )
      )
        throw fail("REGULAR_UNCERTAIN_RESOLUTION_NOT_AVAILABLE");
      if (!row.intent.preparedSubmissionEvidenceV1)
        throw fail("REGULAR_UNCERTAIN_EVIDENCE_INSUFFICIENT");
      const preparedFingerprint = stableFingerprint(
        row.intent.preparedSubmissionEvidenceV1,
      );
      const published = Boolean(
        db
          .prepare(
            "SELECT 1 FROM publication_records WHERE article_id=? AND status='published' LIMIT 1",
          )
          .get(row.article_id),
      );
      const binding = {
        attemptId: id,
        observationFingerprint: observed.fingerprint,
        preparedEvidenceFingerprint: preparedFingerprint,
        publicationStatus: row.publication_status,
        itemStatus: row.item_status,
        queueGroupId: row.queue_group_id,
        queueGroupPauseIntent: row.group_pause_intent,
        queueGroupRevision: row.group_revision,
        activeTargetState: row.active_target_state,
        targetFingerprint: stableFingerprint(fromText(row.target_json)),
        published,
      };
      const token = `regular-resolution-${randomUUID()}`;
      const expiresAt = new Date(
        Date.parse(stamp) + 5 * 60 * 1000,
      ).toISOString();
      const next = Object.assign({}, row.intent, {
        regularResolution: {
          token,
          expiresAt,
          binding,
          bindingFingerprint: stableFingerprint(binding),
        },
      });
      db.prepare(
        "UPDATE recovery_intents SET payload_json=?,updated_at=? WHERE attempt_id=? AND state='manual_check'",
      ).run(text(next), stamp, id);
      return Object.freeze({
        regularPublicationAttemptId: id,
        confirmationToken: token,
        expiresAt,
        actions: Object.freeze(["confirm_accepted", "confirm_not_accepted"]),
        observationFingerprint: observed.fingerprint,
        preparedEvidenceFingerprint: preparedFingerprint,
      });
    });
  }

  function verifyResolution(input, row, stamp) {
    const resolution = row.intent.regularResolution;
    if (
      !resolution ||
      typeof input.confirmationToken !== "string" ||
      input.confirmationToken !== resolution.token ||
      resolution.expiresAt <= stamp
    )
      throw fail("REGULAR_UNCERTAIN_RESOLUTION_TOKEN_STALE");
    const binding = {
      attemptId: input.regularPublicationAttemptId || input.attemptId,
      observationFingerprint: row.intent.detail.observation.fingerprint,
      preparedEvidenceFingerprint: stableFingerprint(
        row.intent.preparedSubmissionEvidenceV1,
      ),
      publicationStatus: row.publication_status,
      itemStatus: row.item_status,
      queueGroupId: row.queue_group_id,
      queueGroupPauseIntent: row.group_pause_intent,
      queueGroupRevision: row.group_revision,
      activeTargetState: row.active_target_state,
      targetFingerprint: stableFingerprint(fromText(row.target_json)),
      published: Boolean(
        db
          .prepare(
            "SELECT 1 FROM publication_records WHERE article_id=? AND status='published' LIMIT 1",
          )
          .get(row.article_id),
      ),
    };
    if (stableFingerprint(binding) !== resolution.bindingFingerprint)
      throw fail("REGULAR_UNCERTAIN_RESOLUTION_STATE_STALE");
  }

  function manualEvidence(input, stamp) {
    const value = input && input.manualPositiveEvidence;
    if (
      !value ||
      Object.keys(value).some(
        (key) => !["observedAt", "remoteId", "remoteUrl"].includes(key),
      )
    )
      throw fail("REGULAR_MANUAL_POSITIVE_EVIDENCE_REQUIRED");
    let remoteId;
    try {
      remoteId = domain.parsePublicationRemoteId(
        value.remoteId === undefined ? null : value.remoteId,
      );
    } catch (_) {
      throw fail("REGULAR_MANUAL_POSITIVE_EVIDENCE_REQUIRED");
    }
    const remoteUrl =
      value.remoteUrl === undefined || value.remoteUrl === null
        ? null
        : domain.normalizePublishedArticleUrl(value.remoteUrl);
    if (value.remoteUrl !== undefined && value.remoteUrl !== null && !remoteUrl)
      throw fail("REGULAR_MANUAL_POSITIVE_EVIDENCE_REQUIRED");
    const normalized = {
      observedAt: safeTimestamp(
        value.observedAt,
        "REGULAR_OUTCOME_TIME_INVALID",
      ),
      providerEventAt: null,
      remoteId,
      remoteUrl,
    };
    if (normalized.observedAt > stamp)
      throw fail("REGULAR_OUTCOME_TIME_INVALID");
    return Object.freeze({
      ...normalized,
      fingerprint: stableFingerprint(normalized),
    });
  }

  function manualNegativeEvidence(input, stamp) {
    const value = input && input.manualNegativeEvidence;
    if (
      !value ||
      Object.keys(value).some(
        (key) => !["reasonCode", "observedAt"].includes(key),
      ) ||
      typeof value.reasonCode !== "string" ||
      !OBSERVATION_CODES.test(value.reasonCode)
    )
      throw fail("REGULAR_MANUAL_NEGATIVE_EVIDENCE_REQUIRED");
    const normalized = {
      reasonCode: value.reasonCode,
      observedAt: safeTimestamp(
        value.observedAt,
        "REGULAR_OUTCOME_TIME_INVALID",
      ),
    };
    if (normalized.observedAt > stamp)
      throw fail("REGULAR_OUTCOME_TIME_INVALID");
    return Object.freeze({
      ...normalized,
      fingerprint: stableFingerprint(normalized),
    });
  }

  function confirmRegularAccepted(input) {
    open();
    const id = attemptId(input);
    const stamp = iso(clock);
    return transaction(() => {
      const row = loadAttempt(id);
      const previous = row.intent.detail.resolution;
      if (previous) {
        if (previous.decision !== "accepted")
          throw fail("REGULAR_UNCERTAIN_RESOLUTION_OPPOSITE");
        return Object.freeze({
          attemptId: id,
          status: "published",
          idempotent: true,
        });
      }
      if (
        db
          .prepare(
            "SELECT 1 FROM publication_records WHERE article_id=? AND status='published' LIMIT 1",
          )
          .get(row.article_id)
      )
        return Object.freeze({
          attemptId: id,
          status: "published",
          idempotent: true,
          firstWins: true,
        });
      const positive = manualEvidence(input, stamp);
      verifyResolution(input, row, stamp);
      const observed = row.intent.detail.observation;
      const evidence = publicationEvidence(row, observed, positive);
      const success = publicationSuccess.applyFirstPublicationSuccess({
        attemptId: id,
        publicationEvidence: evidence,
        stamp,
      });
      fault("after-manual-publication-success", { attemptId: id });
      closeItem(
        row,
        "completed",
        Object.assign({}, fromText(row.item_payload) || {}, {
          outcomeStatus: "published",
        }),
        stamp,
      );
      db.prepare(
        "UPDATE recovery_intents SET state='resolved',payload_json=?,updated_at=? WHERE attempt_id=?",
      ).run(
        text(
          resolvedIntent(row, observed, {
            decision: "accepted",
            successWins: true,
            decidedAt: stamp,
            evidenceFingerprint: positive.fingerprint,
          }),
        ),
        stamp,
        id,
      );
      return success;
    });
  }

  function confirmRegularNotAccepted(input) {
    open();
    const id = attemptId(input);
    const stamp = iso(clock);
    return transaction(() => {
      const row = loadAttempt(id);
      const previous = row.intent.detail.resolution;
      if (previous) {
        if (previous.decision !== "not_accepted")
          throw fail("REGULAR_UNCERTAIN_RESOLUTION_OPPOSITE");
        return Object.freeze({
          attemptId: id,
          status: "not_accepted",
          idempotent: true,
        });
      }
      if (
        db
          .prepare(
            "SELECT 1 FROM publication_records WHERE article_id=? AND status='published' LIMIT 1",
          )
          .get(row.article_id)
      )
        return Object.freeze({
          attemptId: id,
          status: "published",
          idempotent: true,
          firstWins: true,
        });
      const negative = manualNegativeEvidence(input, stamp);
      verifyResolution(input, row, stamp);
      db.prepare(
        "UPDATE publication_attempts SET status='failed',finished_at=? WHERE attempt_id=? AND status='uncertain'",
      ).run(stamp, id);
      db.prepare(
        "UPDATE publication_records SET status='failed',updated_at=? WHERE publication_id=? AND status='uncertain'",
      ).run(stamp, row.publication_id);
      db.prepare("DELETE FROM article_active_targets WHERE attempt_id=?").run(
        id,
      );
      closeItem(
        row,
        "failed",
        Object.assign({}, fromText(row.item_payload) || {}, {
          outcomeStatus: "not_accepted",
        }),
        stamp,
      );
      fault("after-manual-not-accepted-close", { attemptId: id });
      const observed = row.intent.detail.observation;
      db.prepare(
        "UPDATE recovery_intents SET state='resolved',payload_json=?,updated_at=? WHERE attempt_id=?",
      ).run(
        text(
          resolvedIntent(row, observed, {
            decision: "not_accepted",
            decidedAt: stamp,
            reasonCode: negative.reasonCode,
            observedAt: negative.observedAt,
            evidenceFingerprint: negative.fingerprint,
          }),
        ),
        stamp,
        id,
      );
      return Object.freeze({
        attemptId: id,
        status: "not_accepted",
        idempotent: false,
      });
    });
  }

  function markOrphanedRegularAttemptUncertain(input) {
    return recordTerminal(
      {
        ...input,
        observation: {
          status: "uncertain",
          code: "REGULAR_ORPHANED_REMOTE_ATTEMPT",
          observedAt: iso(clock),
        },
      },
      "uncertain",
      { idempotentExistingOrphanedUncertain: true },
    );
  }

  function getRegularOutcomeSnapshot(input) {
    open();
    const id = attemptId(input);
    const row = db
      .prepare(
        "SELECT i.state,i.payload_json,p.status publication_status,a.status attempt_status,s.status item_status,q.queue_group_id,g.pause_intent,t.state active_target_state,e.evidence_json FROM recovery_intents i JOIN publication_attempts a ON a.attempt_id=i.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id JOIN submission_items s ON json_extract(s.payload_json,'$.attemptId')=i.attempt_id LEFT JOIN submission_queue_items q ON q.item_id=s.item_id LEFT JOIN submission_queue_groups g ON g.queue_group_id=q.queue_group_id LEFT JOIN article_active_targets t ON t.attempt_id=i.attempt_id LEFT JOIN remote_evidence e ON e.attempt_id=i.attempt_id AND e.remote_id=? WHERE i.attempt_id=?",
      )
      .get(`publication-success:${id}`, id);
    if (!row) throw fail("REGULAR_SUBMISSION_ATTEMPT_NOT_FOUND");
    const intent = fromText(row.payload_json) || {};
    return Object.freeze({
      regularPublicationAttemptId: id,
      intentState: row.state,
      attemptStatus: row.attempt_status,
      publicationStatus: row.publication_status,
      itemStatus: row.item_status,
      queueGroupId: row.queue_group_id || null,
      pauseIntent: row.pause_intent || null,
      activeTargetState: row.active_target_state || null,
      observation: (intent.detail && intent.detail.observation) || null,
      resolution: (intent.detail && intent.detail.resolution) || null,
      publicationEvidence: row.evidence_json
        ? domain.parsePublicationEvidence(fromText(row.evidence_json))
        : null,
    });
  }

  return Object.freeze({
    confirmRegularAccepted,
    confirmRegularNotAccepted,
    getRegularOutcomeSnapshot,
    markOrphanedRegularAttemptUncertain,
    prepareRegularUncertainResolution,
    recordRegularAccepted,
    recordRegularArticleRejected(input) {
      return recordTerminal(input, "article_rejected");
    },
    recordRegularGroupBlocked(input) {
      return recordTerminal(input, "group_blocked");
    },
    recordRegularUncertain(input) {
      return recordTerminal(input, "uncertain");
    },
  });
}

module.exports = { createRegularOutcomeAggregate };
