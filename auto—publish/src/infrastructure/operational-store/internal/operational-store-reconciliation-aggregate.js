const domain = require("../../../domain");

const {
  fromText,
  rejectSensitive,
  text,
} = require("./operational-store-utils");

const DECISIONS = new Set([
  "accepted",
  "not_accepted",
  "order_bound",
  "no_order",
]);

function createOperationalStoreReconciliationAggregate(context) {
  const { db, open, transaction, clock, randomUUID, fail, iso } = context;

  function requiredText(value, max, code) {
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.length > max ||
      /[\x00-\x1f\x7f]/.test(value)
    )
      throw fail(code);
    return value.trim();
  }

  function rowView(row, idempotent) {
    if (!row) return null;
    return Object.freeze({
      reconciliationId: row.reconciliation_id,
      attemptId: row.attempt_id,
      articleId: row.article_id,
      decision: row.decision,
      evidence: fromText(row.evidence_json),
      createdAt: row.created_at,
      ...(idempotent === undefined ? {} : { idempotent }),
    });
  }

  function recordManualReconciliation(input) {
    open();
    const value = input || {};
    const attemptId = domain.AttemptId.serialize(
      domain.AttemptId.parse(value.attemptId),
    );
    if (!DECISIONS.has(value.decision))
      throw fail("OPERATIONAL_RECONCILIATION_DECISION_INVALID");
    const evidence = value.evidence === undefined ? {} : value.evidence;
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence))
      throw fail("OPERATIONAL_RECONCILIATION_EVIDENCE_INVALID");
    rejectSensitive(evidence);
    if (text(evidence).length > 32768)
      throw fail("OPERATIONAL_RECONCILIATION_EVIDENCE_INVALID");
    const hasExplicitId = value.reconciliationId !== undefined;
    const reconciliationId = hasExplicitId
      ? requiredText(
          value.reconciliationId,
          128,
          "OPERATIONAL_RECONCILIATION_ID_INVALID",
        )
      : `reconcile-${randomUUID()}`;
    const evidenceJson = text(evidence);
    const stamp = iso(clock);
    return transaction(() => {
      const attempt = db
        .prepare(
          "SELECT p.article_id,p.target_key FROM publication_attempts a JOIN publication_records p ON p.publication_id=a.publication_id WHERE a.attempt_id=?",
        )
        .get(attemptId);
      if (!attempt) throw fail("OPERATIONAL_ATTEMPT_NOT_FOUND");
      if (
        value.articleId !== undefined &&
        value.articleId !== attempt.article_id
      )
        throw fail("OPERATIONAL_RECONCILIATION_ARTICLE_MISMATCH");
      if (
        value.targetKey !== undefined &&
        value.targetKey !== attempt.target_key
      )
        throw fail("OPERATIONAL_RECONCILIATION_TARGET_MISMATCH");
      const existing = db
        .prepare("SELECT * FROM manual_reconciliation_facts WHERE attempt_id=?")
        .get(attemptId);
      if (existing) {
        if (
          existing.decision !== value.decision ||
          existing.evidence_json !== evidenceJson ||
          (hasExplicitId && existing.reconciliation_id !== reconciliationId)
        )
          throw fail("OPERATIONAL_RECONCILIATION_CONFLICT");
        return rowView(existing, true);
      }
      try {
        db.prepare(
          "INSERT INTO manual_reconciliation_facts(reconciliation_id,attempt_id,article_id,decision,evidence_json,created_at) VALUES(?,?,?,?,?,?)",
        ).run(
          reconciliationId,
          attemptId,
          attempt.article_id,
          value.decision,
          evidenceJson,
          stamp,
        );
      } catch (error) {
        if (String((error && error.code) || "").startsWith("SQLITE_CONSTRAINT"))
          throw fail("OPERATIONAL_RECONCILIATION_CONFLICT");
        throw error;
      }
      return rowView(
        db
          .prepare(
            "SELECT * FROM manual_reconciliation_facts WHERE reconciliation_id=?",
          )
          .get(reconciliationId),
        false,
      );
    });
  }

  function listManualReconciliations(input) {
    open();
    const value = input || {};
    const clauses = [];
    const params = [];
    if (Array.isArray(value.articleIds) && value.articleIds.length) {
      const articleIds = value.articleIds.map((id) =>
        domain.ArticleId.serialize(domain.ArticleId.parse(id)),
      );
      clauses.push(`article_id IN(${articleIds.map(() => "?").join(",")})`);
      params.push(...articleIds);
    }
    if (Array.isArray(value.attemptIds) && value.attemptIds.length) {
      const attemptIds = value.attemptIds.map((id) =>
        domain.AttemptId.serialize(domain.AttemptId.parse(id)),
      );
      clauses.push(`attempt_id IN(${attemptIds.map(() => "?").join(",")})`);
      params.push(...attemptIds);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return Object.freeze(
      db
        .prepare(
          "SELECT * FROM manual_reconciliation_facts " +
            where +
            " ORDER BY created_at,reconciliation_id LIMIT 20000",
        )
        .all(...params)
        .map(rowView),
    );
  }

  return Object.freeze({
    recordManualReconciliation,
    listManualReconciliations,
  });
}

module.exports = { createOperationalStoreReconciliationAggregate };
