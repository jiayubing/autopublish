"use strict";

const domain = require("../../../domain");
const { fromText, text } = require("./operational-store-utils");

function createPublicationSuccessPrimitive(context) {
  const { db, fail, randomUUID } = context;

  function parseEvidence(value, allowLegacy) {
    try {
      return domain.parsePublicationEvidenceV1(value, {
        allowLegacy: allowLegacy === true,
      });
    } catch (_) {
      throw fail("PUBLICATION_SUCCESS_EVIDENCE_INVALID");
    }
  }

  function refreshBatch(batchId, stamp) {
    const statuses = db
      .prepare("SELECT status FROM submission_items WHERE batch_id=?")
      .all(batchId)
      .map((row) => row.status);
    const status = statuses.some((value) =>
      ["queued", "claimed", "submitting"].includes(value),
    )
      ? "queued"
      : statuses.some((value) => ["failed", "uncertain"].includes(value))
        ? "failed"
        : "completed";
    db.prepare(
      "UPDATE submission_batches SET status=?,revision=revision+1,updated_at=? WHERE batch_id=?",
    ).run(status, stamp, batchId);
  }

  function freezeCompetingTargets(articleId, winningAttemptId, stamp) {
    const competitors = db
      .prepare(
        "SELECT a.attempt_id,a.status attempt_status,p.publication_id,p.status publication_status,i.payload_json intent_payload,s.item_id,s.batch_id,s.status item_status,s.payload_json item_payload,q.queue_group_id FROM publication_attempts a JOIN publication_records p ON p.publication_id=a.publication_id LEFT JOIN recovery_intents i ON i.attempt_id=a.attempt_id LEFT JOIN submission_items s ON json_extract(s.payload_json,'$.attemptId')=a.attempt_id LEFT JOIN submission_queue_items q ON q.item_id=s.item_id WHERE p.article_id=? AND a.attempt_id<>? AND (p.status IN('queued','remote_started','submitted','uncertain') OR s.status IN('queued','claimed','submitting','uncertain'))",
      )
      .all(articleId, winningAttemptId);
    for (const competitor of competitors) {
      const crossedBoundary = [
        "remote_started",
        "submitted",
        "uncertain",
      ].includes(competitor.attempt_status);
      const terminalStatus = crossedBoundary ? "uncertain" : "failed";
      db.prepare(
        "UPDATE publication_attempts SET status=?,finished_at=? WHERE attempt_id=? AND status IN('queued','remote_started','submitted','uncertain')",
      ).run(terminalStatus, stamp, competitor.attempt_id);
      db.prepare(
        "UPDATE publication_records SET status=?,updated_at=? WHERE publication_id=? AND status IN('queued','remote_started','submitted','uncertain')",
      ).run(terminalStatus, stamp, competitor.publication_id);
      if (competitor.item_id) {
        const payload = Object.assign(
          {},
          fromText(competitor.item_payload) || {},
          {
            outcomeStatus: "global_publication_superseded",
            reasonCode: "ARTICLE_ALREADY_PUBLISHED",
          },
        );
        db.prepare(
          "UPDATE submission_items SET status=?,claim_token=NULL,claim_until=NULL,revision=revision+1,payload_json=? WHERE item_id=?",
        ).run(terminalStatus, text(payload), competitor.item_id);
        db.prepare("DELETE FROM submission_queue_items WHERE item_id=?").run(
          competitor.item_id,
        );
        refreshBatch(competitor.batch_id, stamp);
      }
      if (competitor.queue_group_id && crossedBoundary)
        db.prepare(
          "UPDATE submission_queue_groups SET pause_intent='system',revision=revision+1,updated_at=? WHERE queue_group_id=?",
        ).run(stamp, competitor.queue_group_id);
      if (competitor.intent_payload) {
        const intent = fromText(competitor.intent_payload) || {};
        const nextIntent = Object.assign({}, intent, {
          detail: Object.assign({}, intent.detail || {}, {
            phase: "resolved",
            resolution: {
              decision: "global_publication_superseded",
              decidedAt: stamp,
              winningAttemptId,
              remoteResultUncertain: crossedBoundary,
            },
          }),
        });
        db.prepare(
          "UPDATE recovery_intents SET state='resolved',payload_json=?,updated_at=? WHERE attempt_id=?",
        ).run(text(nextIntent), stamp, competitor.attempt_id);
      }
    }
  }

  function readFirstPublicationSuccess(articleId) {
    const existing = db
      .prepare(
        "SELECT p.publication_id,a.attempt_id,e.evidence_json FROM publication_records p JOIN publication_attempts a ON a.publication_id=p.publication_id AND a.status='published' LEFT JOIN remote_evidence e ON e.attempt_id=a.attempt_id AND e.remote_id=('publication-success:' || a.attempt_id) WHERE p.article_id=? AND p.status='published' ORDER BY p.updated_at,p.publication_id LIMIT 1",
      )
      .get(articleId);
    if (!existing) return null;
    const publicationEvidenceV1 = parseEvidence(
      fromText(existing.evidence_json),
    );
    return Object.freeze({
      attemptId: existing.attempt_id,
      publicationId: existing.publication_id,
      status: "published",
      idempotent: true,
      firstWins: true,
      publicationEvidenceV1,
    });
  }

  function applyFirstPublicationSuccess(input) {
    const value = input || {};
    const attemptId = domain.AttemptId.serialize(
      domain.AttemptId.parse(value.attemptId),
    );
    const evidence = domain.parsePublicationEvidenceV1(
      value.publicationEvidenceV1,
    );
    const row = db
      .prepare(
        "SELECT a.publication_id,a.status attempt_status,p.article_id,p.status publication_status FROM publication_attempts a JOIN publication_records p ON p.publication_id=a.publication_id WHERE a.attempt_id=?",
      )
      .get(attemptId);
    if (!row) throw fail("REGULAR_SUBMISSION_ATTEMPT_NOT_FOUND");
    if (row.article_id !== evidence.articleIdentityV1.articleId)
      throw fail("PUBLICATION_EVIDENCE_ARTICLE_MISMATCH");

    const existingSuccess = readFirstPublicationSuccess(row.article_id);
    if (existingSuccess) return existingSuccess;

    const existingEvidence = db
      .prepare(
        "SELECT evidence_json FROM remote_evidence WHERE attempt_id=? AND remote_id=?",
      )
      .get(attemptId, `publication-success:${attemptId}`);
    if (existingEvidence) {
      if (
        JSON.stringify(fromText(existingEvidence.evidence_json)) !==
        JSON.stringify(evidence)
      )
        throw fail("PUBLICATION_SUCCESS_EVIDENCE_CONFLICT");
    } else {
      db.prepare(
        "INSERT INTO remote_evidence(evidence_id,attempt_id,remote_id,remote_url,evidence_json,created_at) VALUES(?,?,?,?,?,?)",
      ).run(
        `evidence-${randomUUID()}`,
        attemptId,
        `publication-success:${attemptId}`,
        evidence.remoteUrl,
        text(evidence),
        value.stamp,
      );
    }
    const attemptChanged = db
      .prepare(
        "UPDATE publication_attempts SET status='published',finished_at=? WHERE attempt_id=? AND status IN('remote_started','submitted','uncertain','failed')",
      )
      .run(value.stamp, attemptId).changes;
    if (attemptChanged !== 1) throw fail("PUBLICATION_SUCCESS_STATE_CONFLICT");
    const publicationChanged = db
      .prepare(
        "UPDATE publication_records SET status='published',updated_at=? WHERE publication_id=? AND status IN('remote_started','submitted','uncertain','failed')",
      )
      .run(value.stamp, row.publication_id).changes;
    if (publicationChanged !== 1)
      throw fail("PUBLICATION_SUCCESS_STATE_CONFLICT");
    freezeCompetingTargets(row.article_id, attemptId, value.stamp);
    db.prepare("DELETE FROM article_active_targets WHERE article_id=?").run(
      row.article_id,
    );
    return Object.freeze({
      attemptId,
      publicationId: row.publication_id,
      status: "published",
      idempotent: false,
      firstWins: true,
      publicationEvidenceV1: evidence,
    });
  }

  function listFirstPublicationSuccesses(articleIds, options) {
    if (!Array.isArray(articleIds) || articleIds.length > 5000)
      throw fail("PUBLICATION_ARCHIVE_ARTICLES_INVALID");
    if (!articleIds.length) return Object.freeze([]);
    const placeholders = articleIds.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT p.publication_id,a.attempt_id,p.article_id,e.evidence_json FROM publication_records p JOIN publication_attempts a ON a.publication_id=p.publication_id AND a.status='published' LEFT JOIN remote_evidence e ON e.attempt_id=a.attempt_id AND e.remote_id=('publication-success:' || a.attempt_id) WHERE p.article_id IN(${placeholders}) AND p.status='published' ORDER BY p.article_id,p.updated_at,p.publication_id`,
      )
      .all(...articleIds);
    const seen = new Set();
    const result = [];
    for (const row of rows) {
      if (seen.has(row.article_id)) continue;
      seen.add(row.article_id);
      result.push(
        Object.freeze({
          publicationId: row.publication_id,
          attemptId: row.attempt_id,
          articleId: row.article_id,
          status: "published",
          firstWins: true,
          publicationEvidenceV1: parseEvidence(
            fromText(row.evidence_json),
            options && options.allowLegacy === true,
          ),
        }),
      );
    }
    return Object.freeze(result);
  }

  return Object.freeze({
    applyFirstPublicationSuccess,
    listFirstPublicationSuccesses,
    readFirstPublicationSuccess,
  });
}

module.exports = { createPublicationSuccessPrimitive };
