const domain = require("../../../domain");

const {
  fromText,
  rejectSensitive,
  text,
} = require("./operational-store-utils");
const {
  projectPaidOrderResolutionAttention,
} = require("./operational-store-paid-resolution-attention");

const RECOVERY_PAGE_SIZE = 256;

function recoveryDetail(value) {
  const payload = fromText(value);
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    payload.submission &&
    typeof payload.submission === "object" &&
    !Array.isArray(payload.submission)
  )
    return payload.detail;
  return payload;
}

function recoverySubmission(value) {
  const payload = fromText(value);
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    payload.submission &&
    typeof payload.submission === "object" &&
    !Array.isArray(payload.submission)
  )
    return payload.submission;
  return null;
}

function recoveryArticleRef(submission) {
  const ref =
    submission &&
    submission.postProcessingPayload &&
    submission.postProcessingPayload.articleRef;
  if (!ref || typeof ref !== "object" || Array.isArray(ref)) return null;
  if (
    typeof ref.clientId !== "string" ||
    !ref.clientId.trim() ||
    typeof ref.articleId !== "string" ||
    !ref.articleId.trim()
  )
    return null;
  if (
    /[\u0000-\u001f\\/]/.test(ref.clientId) ||
    /[\u0000-\u001f\\/]/.test(ref.articleId)
  )
    return null;
  return { clientId: ref.clientId.trim(), articleId: ref.articleId.trim() };
}

function recoveryClientId(value) {
  const ref = recoveryArticleRef(recoverySubmission(value));
  if (ref) return ref.clientId;
  const payload = fromText(value);
  const identity =
    payload &&
    payload.preparedSubmissionEvidenceV1 &&
    payload.preparedSubmissionEvidenceV1.articleIdentityV1;
  const clientId = identity && identity.clientId;
  if (
    typeof clientId !== "string" ||
    !clientId.trim() ||
    clientId.length > 200 ||
    /[\u0000-\u001f\\/]/.test(clientId)
  )
    return null;
  return clientId.trim();
}

function safePostProcessingErrorCode(value) {
  return typeof value === "string" &&
    /^[A-Z0-9][A-Z0-9_.:-]{0,127}$/.test(value)
    ? value
    : null;
}

function createRecoveryAggregate(context, activeTarget) {
  const { db, open, transaction, clock, fail, iso } = context;

  function refreshSubmissionBatchStatus(dbHandle, batchId, stamp) {
    const rows = dbHandle
      .prepare("SELECT status FROM submission_items WHERE batch_id=?")
      .all(batchId);
    if (!rows.length) return;
    const statuses = rows.map((row) => row.status);
    let status = "queued";
    if (statuses.some((value) => ["queued", "claimed"].includes(value))) {
      status = "queued";
    } else if (
      statuses.some((value) => ["failed", "failed-cleaned"].includes(value))
    ) {
      status = "failed";
    } else if (
      statuses.every((value) =>
        [
          "cancelled",
          "cancelled-cleaned",
          "completed",
          "published-cleaned",
        ].includes(value),
      )
    ) {
      status = statuses.some((value) =>
        ["completed", "published-cleaned"].includes(value),
      )
        ? "completed"
        : "cancelled";
    } else {
      return;
    }
    dbHandle
      .prepare(
        "UPDATE submission_batches SET status=?,revision=revision+1,updated_at=? WHERE batch_id=?",
      )
      .run(status, stamp, batchId);
  }

  function listActionableRecovery(options) {
    open();
    const includeManualCheck = !options || options.includeManualCheck !== false;
    const states = includeManualCheck
      ? "'remote_started','outcome_pending','manual_check'"
      : "'remote_started','outcome_pending'";
    const rows = db
      .prepare(
        "SELECT i.attempt_id,i.state,i.payload_json,p.publication_id,p.article_id,p.target_key,p.status FROM recovery_intents i JOIN publication_attempts a ON a.attempt_id=i.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id WHERE i.state IN(" +
          states +
          ") ORDER BY i.updated_at,i.attempt_id LIMIT ?",
      )
      .all(RECOVERY_PAGE_SIZE);
    const result = rows.map((row) => {
      const submission = recoverySubmission(row.payload_json);
      return {
        attemptId: row.attempt_id,
        state: row.state,
        publicationId: row.publication_id,
        articleId: row.article_id,
        targetKey: row.target_key,
        status: row.status,
        detail: recoveryDetail(row.payload_json),
        ...(recoveryArticleRef(submission)
          ? { articleRef: recoveryArticleRef(submission) }
          : {}),
      };
    });
    Object.defineProperty(result, "hasMore", {
      value: rows.length === RECOVERY_PAGE_SIZE,
      enumerable: false,
    });
    return result;
  }

  function markRecoveryUncertain(input) {
    open();
    const value = input || {};
    const attemptId = domain.AttemptId.serialize(
      domain.AttemptId.parse(value.attemptId),
    );
    const error = domain.parseSafeOperationalError(value.error);
    const stamp = iso(clock);
    return transaction(() => {
      const attempt = db
        .prepare(
          "SELECT a.publication_id,p.article_id,p.target_key,i.payload_json AS intent_payload FROM publication_attempts a JOIN publication_records p ON p.publication_id=a.publication_id JOIN recovery_intents i ON i.attempt_id=a.attempt_id WHERE a.attempt_id=?",
        )
        .get(attemptId);
      if (!attempt) throw fail("OPERATIONAL_ATTEMPT_NOT_FOUND");
      const submission = recoverySubmission(attempt.intent_payload);
      const batchItemId = submission ? submission.batchItemId : undefined;
      if (batchItemId !== undefined) {
        if (typeof batchItemId !== "string" || !batchItemId)
          throw fail("OPERATIONAL_BATCH_ITEM_INVALID");
        const item = db
          .prepare(
            "SELECT batch_id,article_id,target_key,status,payload_json FROM submission_items WHERE item_id=?",
          )
          .get(batchItemId);
        if (!item) throw fail("OPERATIONAL_BATCH_ITEM_NOT_FOUND");
        if (
          item.article_id !== attempt.article_id ||
          item.target_key !== attempt.target_key
        )
          throw fail("OPERATIONAL_BATCH_ITEM_MISMATCH");
        if (["queued", "claimed", "failed"].includes(item.status)) {
          const payload = Object.assign({}, fromText(item.payload_json) || {}, {
            outcomeStatus: "uncertain",
            recoveryState: "manual_check",
          });
          db.prepare(
            "UPDATE submission_items SET status='failed',claim_token=NULL,claim_until=NULL,revision=revision+1,payload_json=? WHERE item_id=? AND status IN('queued','claimed','failed')",
          ).run(text(payload), batchItemId);
          refreshSubmissionBatchStatus(db, item.batch_id, stamp);
        }
      }
      const intentPayload = submission ? { submission, detail: error } : error;
      const changed = db
        .prepare(
          "UPDATE recovery_intents SET state='manual_check',payload_json=?,updated_at=? WHERE attempt_id=? AND state IN('remote_started','outcome_pending')",
        )
        .run(text(intentPayload), stamp, attemptId).changes;
      if (changed !== 1) throw fail("OPERATIONAL_RECOVERY_NOT_ACTIONABLE");
      db.prepare(
        "UPDATE publication_attempts SET status='uncertain',finished_at=? WHERE attempt_id=?",
      ).run(stamp, attemptId);
      db.prepare(
        "UPDATE publication_records SET status='uncertain',updated_at=? WHERE publication_id=?",
      ).run(stamp, attempt.publication_id);
      activeTarget.markUncertain({
        articleId: attempt.article_id,
        publicationId: attempt.publication_id,
        attemptId,
        stamp,
      });
      return { attemptId, status: "uncertain" };
    });
  }

  function claimPostProcessing(input) {
    open();
    const value = input || {};
    const stamp = iso(clock);
    if (typeof value.claimToken !== "string" || !value.claimToken)
      throw fail("OPERATIONAL_CLAIM_INVALID");
    return transaction(() => {
      // A failed local action is deliberately not claimed again by the
      // normal recovery loop. Retrying it requires an explicit operator
      // action and never starts a new remote publication attempt.
      const states =
        value.retryFailed === true
          ? "status IN('queued','failed') OR(status='claimed' AND claim_until<?)"
          : "status='queued' OR(status='claimed' AND claim_until<?)";
      const row = db
        .prepare(
          "SELECT * FROM post_processing_jobs WHERE " +
            states +
            " ORDER BY created_at LIMIT 1",
        )
        .get(stamp);
      if (!row) return null;
      const until = new Date(
        Date.parse(stamp) + (value.leaseMs || 30000),
      ).toISOString();
      db.prepare(
        "UPDATE post_processing_jobs SET status='claimed',claim_token=?,claim_until=?,attempts=attempts+1,updated_at=? WHERE job_id=?",
      ).run(value.claimToken, until, stamp, row.job_id);
      return {
        jobId: row.job_id,
        attemptId: row.attempt_id,
        kind: row.kind,
        payload: fromText(row.payload_json),
      };
    });
  }

  function completePostProcessing(input) {
    open();
    const value = input || {};
    const current = db
      .prepare(
        "SELECT payload_json FROM post_processing_jobs WHERE job_id=? AND claim_token=?",
      )
      .get(value.jobId, value.claimToken);
    if (!current) throw fail("OPERATIONAL_CLAIM_CONFLICT");
    let payload = fromText(current.payload_json) || {};
    if (value.output !== undefined) {
      rejectSensitive(value.output);
      payload = Object.assign({}, payload, {
        postProcessingOutput: value.output,
      });
      delete payload.postProcessingErrorCode;
    }
    const errorCode = safePostProcessingErrorCode(value.errorCode);
    if (errorCode)
      payload = Object.assign({}, payload, {
        postProcessingErrorCode: errorCode,
      });
    const changed = db
      .prepare(
        "UPDATE post_processing_jobs SET status=?,claim_token=NULL,claim_until=NULL,payload_json=?,updated_at=? WHERE job_id=? AND claim_token=?",
      )
      .run(
        value.retry === true
          ? "queued"
          : value.success === false
            ? "failed"
            : "completed",
        text(payload),
        iso(clock),
        value.jobId,
        value.claimToken,
      ).changes;
    if (changed !== 1) throw fail("OPERATIONAL_CLAIM_CONFLICT");
  }

  function retryPostProcessing(input) {
    open();
    const value = input || {};
    if (typeof value.jobId !== "string" || !value.jobId)
      throw fail("OPERATIONAL_POST_PROCESSING_INVALID");
    const changed = db
      .prepare(
        "UPDATE post_processing_jobs SET status='queued',claim_token=NULL,claim_until=NULL,updated_at=? WHERE job_id=? AND status='failed'",
      )
      .run(iso(clock), value.jobId).changes;
    if (changed !== 1) throw fail("OPERATIONAL_POST_PROCESSING_NOT_RETRYABLE");
  }

  function listPostProcessingAttention() {
    open();
    return Object.freeze(
      db
        .prepare(
          "SELECT j.job_id,j.attempt_id,j.kind,j.attempts,j.payload_json,j.updated_at,p.article_id,p.target_key FROM post_processing_jobs j JOIN publication_attempts a ON a.attempt_id=j.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id WHERE j.status='failed' ORDER BY j.updated_at",
        )
        .all()
        .map((row) => {
          const payload = fromText(row.payload_json);
          const autoTrash =
            payload &&
            payload.postProcessingOutput &&
            payload.postProcessingOutput.autoTrash;
          const errorCode =
            (payload &&
              safePostProcessingErrorCode(payload.postProcessingErrorCode)) ||
            (autoTrash && safePostProcessingErrorCode(autoTrash.reasonCode));
          return Object.freeze({
            jobId: row.job_id,
            attemptId: row.attempt_id,
            platformId: /^platform:([^:]+):/.exec(row.target_key)?.[1] || null,
            accountProfileId:
              /^platform:[^:]+:account:(.+)$/.exec(row.target_key)?.[1] || null,
            kind: row.kind,
            attempts: row.attempts,
            articleId: row.article_id,
            targetKey: row.target_key,
            payload,
            errorCode: errorCode || null,
            reasonCode: errorCode || null,
            updatedAt: row.updated_at,
          });
        }),
    );
  }

  function listPublicationAttention() {
    open();
    return Object.freeze(
      db
        .prepare(
          "SELECT p.publication_id,p.article_id,p.target_key,p.status,p.updated_at,a.attempt_id,e.remote_id,e.remote_url,i.payload_json AS intent_payload FROM publication_records p JOIN publication_attempts a ON a.rowid=(SELECT latest.rowid FROM publication_attempts latest WHERE latest.publication_id=p.publication_id ORDER BY latest.rowid DESC LIMIT 1) LEFT JOIN recovery_intents i ON i.attempt_id=a.attempt_id LEFT JOIN remote_evidence e ON e.attempt_id=a.attempt_id WHERE p.status IN('uncertain','failed') AND a.finished_at IS NOT NULL AND (p.status!='failed' OR NOT EXISTS (SELECT 1 FROM publication_records newer WHERE newer.article_id=p.article_id AND newer.rowid>p.rowid)) ORDER BY p.updated_at",
        )
        .all()
        .map((row) => {
          const intent = fromText(row.intent_payload) || {};
          const resolution = intent.detail && intent.detail.resolution;
          if (
            row.status === "failed" &&
            resolution &&
            resolution.decision === "not_accepted"
          )
            return null;
          const resolutionAttention =
            projectPaidOrderResolutionAttention(intent);
          const failure =
            row.status === "failed"
              ? domain.projectRegularPublicationFailure(
                  intent.detail && intent.detail.observation
                    ? intent.detail.observation.code
                    : null,
                )
              : null;
          return Object.freeze({
            publicationId: row.publication_id,
            articleId: row.article_id,
            clientId: recoveryClientId(row.intent_payload),
            targetKey: row.target_key,
            status: row.status,
            updatedAt: row.updated_at,
            attemptId: row.attempt_id,
            remoteId: row.remote_id || null,
            remoteUrl: row.remote_url || null,
            platformId: /^platform:([^:]+):/.exec(row.target_key)?.[1] || null,
            accountProfileId:
              /^platform:[^:]+:account:(.+)$/.exec(row.target_key)?.[1] || null,
            ...(failure || {}),
            ...resolutionAttention,
          });
        })
        .filter(Boolean),
    );
  }

  return Object.freeze({
    listActionableRecovery,
    markRecoveryUncertain,
    claimPostProcessing,
    completePostProcessing,
    retryPostProcessing,
    listPostProcessingAttention,
    listPublicationAttention,
  });
}

module.exports = { createRecoveryAggregate, RECOVERY_PAGE_SIZE };
