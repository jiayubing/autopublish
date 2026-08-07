const {
  createOperationalStoreOrderLink,
} = require("./operational-store-order-link");
const { text } = require("./operational-store-utils");

function createOperationalStoreOutcomeWriter(context, activeTarget) {
  const { db, randomUUID } = context;
  const orderLink = createOperationalStoreOrderLink(context);

  function apply(input) {
    const value = input || {};
    if (value.outcome && value.outcome.status === "published")
      throw context.fail("PUBLICATION_SUCCESS_WRITER_CLOSED");
    const evidence = value.outcome && value.outcome.evidence;
    const isMediaOrderOutcome =
      evidence && value.target && value.target.kind === "media";
    if (isMediaOrderOutcome)
      orderLink.ensure({
        orderId: evidence.remoteId,
        attemptId: value.attemptId,
        remoteId: evidence.remoteId,
        evidence,
        createdAt: value.stamp,
      });
    db.prepare(
      "UPDATE publication_attempts SET status=?,finished_at=? WHERE attempt_id=?",
    ).run(value.outcome.status, value.stamp, value.attemptId);
    db.prepare(
      "UPDATE publication_records SET status=?,updated_at=? WHERE publication_id=?",
    ).run(value.outcome.status, value.stamp, value.attempt.publication_id);
    activeTarget.settle({
      articleId: value.attempt.article_id,
      publicationId: value.attempt.publication_id,
      attemptId: value.attemptId,
      target: value.target,
      status: value.outcome.status,
      stamp: value.stamp,
    });
    if (evidence)
      db.prepare(
        "INSERT OR IGNORE INTO remote_evidence VALUES(?,?,?,?,?,?)",
      ).run(
        randomUUID(),
        value.attemptId,
        evidence.remoteId,
        evidence.remoteUrl || null,
        text(evidence),
        value.stamp,
      );
  }

  return Object.freeze({ apply });
}

module.exports = { createOperationalStoreOutcomeWriter };
