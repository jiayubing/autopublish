const domain = require("../../../domain");

const { fromText, text } = require("./operational-store-utils");

function createRecoveryAggregate(context) {
  const { db, open, transaction, clock, fail, iso } = context;

  function listActionableRecovery() {
    open();
    return db
      .prepare(
        "SELECT i.attempt_id,i.state,i.payload_json,p.publication_id,p.article_id,p.target_key,p.status FROM recovery_intents i JOIN publication_attempts a ON a.attempt_id=i.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id WHERE i.state IN('remote_started','outcome_pending','manual_check') ORDER BY i.updated_at",
      )
      .all()
      .map((row) => ({
        attemptId: row.attempt_id,
        state: row.state,
        publicationId: row.publication_id,
        articleId: row.article_id,
        targetKey: row.target_key,
        status: row.status,
        detail: fromText(row.payload_json),
      }));
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
          "SELECT publication_id FROM publication_attempts WHERE attempt_id=?",
        )
        .get(attemptId);
      if (!attempt) throw fail("OPERATIONAL_ATTEMPT_NOT_FOUND");
      const changed = db
        .prepare(
          "UPDATE recovery_intents SET state='manual_check',payload_json=?,updated_at=? WHERE attempt_id=? AND state IN('remote_started','outcome_pending')",
        )
        .run(text(error), stamp, attemptId).changes;
      if (changed !== 1) throw fail("OPERATIONAL_RECOVERY_NOT_ACTIONABLE");
      db.prepare(
        "UPDATE publication_attempts SET status='uncertain',finished_at=? WHERE attempt_id=?",
      ).run(stamp, attemptId);
      db.prepare(
        "UPDATE publication_records SET status='uncertain',updated_at=? WHERE publication_id=?",
      ).run(stamp, attempt.publication_id);
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
    const changed = db
      .prepare(
        "UPDATE post_processing_jobs SET status=?,claim_token=NULL,claim_until=NULL,updated_at=? WHERE job_id=? AND claim_token=?",
      )
      .run(
        value.success === false ? "failed" : "completed",
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
        .map((row) =>
          Object.freeze({
            jobId: row.job_id,
            attemptId: row.attempt_id,
            platformId: /^platform:([^:]+):/.exec(row.target_key)?.[1] || null,
            accountProfileId:
              /^platform:[^:]+:account:(.+)$/.exec(row.target_key)?.[1] || null,
            kind: row.kind,
            attempts: row.attempts,
            articleId: row.article_id,
            targetKey: row.target_key,
            payload: fromText(row.payload_json),
            updatedAt: row.updated_at,
          }),
        ),
    );
  }

  function listPublicationAttention() {
    open();
    return Object.freeze(
      db
        .prepare(
          "SELECT p.publication_id,p.article_id,p.target_key,p.status,p.updated_at,a.attempt_id FROM publication_records p JOIN publication_attempts a ON a.publication_id=p.publication_id WHERE p.status IN('uncertain','failed') AND a.finished_at IS NOT NULL ORDER BY p.updated_at",
        )
        .all()
        .map((row) =>
          Object.freeze({
            publicationId: row.publication_id,
            articleId: row.article_id,
            targetKey: row.target_key,
            status: row.status,
            updatedAt: row.updated_at,
            attemptId: row.attempt_id,
            platformId: /^platform:([^:]+):/.exec(row.target_key)?.[1] || null,
            accountProfileId:
              /^platform:[^:]+:account:(.+)$/.exec(row.target_key)?.[1] || null,
          }),
        ),
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

module.exports = { createRecoveryAggregate };
