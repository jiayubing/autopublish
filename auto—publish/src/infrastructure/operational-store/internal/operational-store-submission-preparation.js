"use strict";

const domain = require("../../../domain");

const {
  fromText,
  rejectSensitive,
  text,
} = require("./operational-store-utils");

function createSubmissionPreparationAggregate(context) {
  const { db, open, transaction, clock, randomUUID, fail, iso } = context;

  function batchIdFrom(input) {
    const value = input || {};
    return domain.BatchId.serialize(
      domain.BatchId.parse(typeof input === "string" ? input : value.batchId),
    );
  }

  function createSubmissionBatch(input) {
    open();
    const value = input || {};
    const batchId = batchIdFrom(value);
    const status = value.status === undefined ? "queued" : value.status;
    if (!["prepared", "queued"].includes(status))
      throw fail("OPERATIONAL_BATCH_STATUS_INVALID");
    const stamp = iso(clock);
    return transaction(() => {
      db.prepare("INSERT INTO submission_batches VALUES(?,?,?,?,?)").run(
        batchId,
        status,
        1,
        stamp,
        stamp,
      );
      const items = [];
      for (const item of value.items || []) {
        const target = domain.parsePublicationTarget(item.target);
        const articleId = domain.ArticleId.serialize(
          domain.ArticleId.parse(item.articleId),
        );
        rejectSensitive(item.payload || {});
        const itemId = randomUUID();
        const targetKey = domain.publicationTargetKey(target);
        db.prepare(
          "INSERT INTO submission_items VALUES(?,?,?,?,?,?,?,?,?)",
        ).run(
          itemId,
          batchId,
          articleId,
          targetKey,
          1,
          status,
          null,
          null,
          text(item.payload || {}),
        );
        items.push(
          Object.freeze({ itemId, articleId, targetKey, revision: 1 }),
        );
      }
      return Object.freeze({ batchId, items: Object.freeze(items) });
    });
  }

  function queueSubmissionBatch(input) {
    open();
    const batchId = batchIdFrom(input);
    const stamp = iso(clock);
    return transaction(() => {
      const batch = db
        .prepare("SELECT status FROM submission_batches WHERE batch_id=?")
        .get(batchId);
      if (!batch) throw fail("OPERATIONAL_BATCH_NOT_FOUND");
      if (batch.status === "queued")
        return Object.freeze({ batchId, status: "queued", idempotent: true });
      if (batch.status !== "prepared")
        throw fail("OPERATIONAL_BATCH_STATUS_CONFLICT");
      const items = db
        .prepare("SELECT status FROM submission_items WHERE batch_id=?")
        .all(batchId);
      if (items.some((item) => item.status !== "prepared"))
        throw fail("OPERATIONAL_BATCH_STATUS_CONFLICT");
      db.prepare(
        "UPDATE submission_items SET status='queued',revision=revision+1 WHERE batch_id=? AND status='prepared'",
      ).run(batchId);
      db.prepare(
        "UPDATE submission_batches SET status='queued',revision=revision+1,updated_at=? WHERE batch_id=? AND status='prepared'",
      ).run(stamp, batchId);
      return Object.freeze({ batchId, status: "queued", idempotent: false });
    });
  }

  function discardPreparedSubmissionBatch(input) {
    open();
    const batchId = batchIdFrom(input);
    return transaction(() => {
      const batch = db
        .prepare("SELECT status FROM submission_batches WHERE batch_id=?")
        .get(batchId);
      if (!batch)
        return Object.freeze({
          batchId,
          status: "discarded",
          idempotent: true,
        });
      if (batch.status !== "prepared")
        throw fail("OPERATIONAL_BATCH_STATUS_CONFLICT");
      const items = db
        .prepare("SELECT status FROM submission_items WHERE batch_id=?")
        .all(batchId);
      if (items.some((item) => item.status !== "prepared"))
        throw fail("OPERATIONAL_BATCH_STATUS_CONFLICT");
      db.prepare("DELETE FROM submission_items WHERE batch_id=?").run(batchId);
      db.prepare("DELETE FROM submission_batches WHERE batch_id=?").run(
        batchId,
      );
      return Object.freeze({ batchId, status: "discarded", idempotent: false });
    });
  }

  return Object.freeze({
    createSubmissionBatch,
    queueSubmissionBatch,
    discardPreparedSubmissionBatch,
  });
}

module.exports = { createSubmissionPreparationAggregate };
