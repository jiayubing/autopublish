const domain = require("../../../domain");

const { text } = require("./operational-store-utils");

function createOperationalStoreActiveTargetAggregate(context) {
  const { db, fail } = context;

  function stateFor(status, target) {
    if (status === "uncertain") return "uncertain";
    if (["queued", "remote_started"].includes(status)) return status;
    return null;
  }

  function assertReservationAvailable(articleId) {
    const active = db
      .prepare("SELECT state FROM article_active_targets WHERE article_id=?")
      .get(articleId);
    if (active)
      throw fail(
        active.state === "uncertain"
          ? "PUBLICATION_UNCERTAIN"
          : "PUBLICATION_DUPLICATE",
      );
    const legacy = db
      .prepare(
        "SELECT status FROM publication_records WHERE article_id=? AND status IN('queued','remote_started','published','uncertain') ORDER BY updated_at DESC LIMIT 1",
      )
      .get(articleId);
    if (legacy)
      throw fail(
        legacy.status === "uncertain"
          ? "PUBLICATION_UNCERTAIN"
          : "PUBLICATION_DUPLICATE",
      );
  }

  function recordReservation(input) {
    const value = input || {};
    if (!value.state) return;
    try {
      db.prepare(
        "INSERT INTO article_active_targets(article_id,publication_id,attempt_id,target_key,target_json,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
      ).run(
        value.articleId,
        value.publicationId,
        value.attemptId,
        value.targetKey,
        text(value.target),
        value.state,
        value.stamp,
        value.stamp,
      );
    } catch (error) {
      if (String((error && error.code) || "").startsWith("SQLITE_CONSTRAINT"))
        throw fail("PUBLICATION_TARGET_CONFLICT");
      throw error;
    }
  }

  function settle(input) {
    const value = input || {};
    const state = stateFor(value.status, value.target);
    if (!state) {
      release(value);
      return;
    }
    const changed = db
      .prepare(
        "UPDATE article_active_targets SET state=?,target_json=?,updated_at=? WHERE article_id=? AND publication_id=? AND attempt_id=?",
      )
      .run(
        state,
        text(value.target),
        value.stamp,
        value.articleId,
        value.publicationId,
        value.attemptId,
      ).changes;
    if (changed !== 1)
      recordReservation({
        ...value,
        state,
        targetKey: value.targetKey || domain.publicationTargetKey(value.target),
      });
  }

  function markUncertain(input) {
    const value = input || {};
    db.prepare(
      "UPDATE article_active_targets SET state='uncertain',updated_at=? WHERE article_id=? AND publication_id=? AND attempt_id=?",
    ).run(value.stamp, value.articleId, value.publicationId, value.attemptId);
  }

  function release(input) {
    const value = input || {};
    db.prepare(
      "DELETE FROM article_active_targets WHERE article_id=? AND publication_id=? AND attempt_id=?",
    ).run(value.articleId, value.publicationId, value.attemptId);
  }

  return Object.freeze({
    assertReservationAvailable,
    recordReservation,
    settle,
    markUncertain,
    release,
  });
}

module.exports = { createOperationalStoreActiveTargetAggregate };
