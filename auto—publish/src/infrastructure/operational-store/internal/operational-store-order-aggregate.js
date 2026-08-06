const domain = require("../../../domain");

const {
  canonicalDisplayPrice,
  fromText,
  observationTimestamp,
  rejectSensitive,
  safeDisplayText,
  safeEvidenceUrl,
  supplierObservation,
  supplierStatusCode,
  text,
} = require("./operational-store-utils");

function createOrderAggregate(context, activeTarget) {
  const {
    db,
    open,
    transaction,
    clock,
    fail,
    iso,
    internalOrderProjectionObserver,
  } = context;

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
      // The publication outcome already records a media receipt in its
      // transaction. A legacy alias may attach the same receipt again.
      db.prepare("INSERT OR IGNORE INTO remote_orders VALUES(?,?,?,?,?)").run(
        value.orderId,
        attemptId,
        value.remoteId,
        text(value.evidence || {}),
        iso(clock),
      );
    });
  }

  function listRemoteOrders() {
    open();
    return Object.freeze(
      db
        .prepare(
          "SELECT o.order_id,o.remote_id,o.payload_json,o.created_at,a.attempt_id,a.status,p.publication_id,p.article_id,p.target_json FROM remote_orders o JOIN publication_attempts a ON a.attempt_id=o.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id ORDER BY o.created_at DESC",
        )
        .all()
        .map((row) => {
          const target = fromText(row.target_json) || {};
          const evidence = fromText(row.payload_json) || {};
          const observation = supplierObservation(evidence);
          return Object.freeze({
            orderId: row.order_id,
            orderNid: row.order_id,
            remoteId: row.remote_id,
            publicationId: row.publication_id,
            attemptId: row.attempt_id,
            articleId: row.article_id,
            mediaResourceId: target.mediaResourceId || null,
            status: row.status,
            supplierStatusCode: observation ? observation.statusCode : null,
            supplierObservedAt: observation ? observation.observedAt : null,
            publishedAt: observation ? observation.publishedAt : null,
            remoteUrl: evidence.remoteUrl || null,
            createdAt: row.created_at,
          });
        }),
    );
  }

  // This is the only order-list read model. It performs one bounded join for
  // current orders and parses only each matched display snapshot.
  function listOrderDisplayViews() {
    open();
    const rows = db
      .prepare(
        "SELECT o.order_id,o.remote_id,o.payload_json,o.created_at,a.attempt_id,a.status,p.publication_id,p.article_id,p.target_json,d.title_snapshot,d.filename,d.resource_name_snapshot,d.quoted_price,d.media_resource_id,d.estimated_total,d.system_submission_code FROM remote_orders o JOIN publication_attempts a ON a.attempt_id=o.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id LEFT JOIN order_display_snapshots d ON d.attempt_id=a.attempt_id ORDER BY o.created_at DESC LIMIT 20000",
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
        const evidence = fromText(row.payload_json) || {};
        const observation = supplierObservation(evidence);
        const target = fromText(row.target_json) || {};
        return Object.freeze({
          orderId: row.order_id,
          orderNid: row.order_id,
          attemptId: row.attempt_id,
          publicationId: row.publication_id,
          publicationStatus: row.status,
          articleId: row.article_id,
          mediaResourceId: target.mediaResourceId || null,
          submittedAt: row.created_at,
          supplierStatusCode: observation ? observation.statusCode : "",
          supplierObservedAt: observation ? observation.observedAt : null,
          publishedAt: observation ? observation.publishedAt : null,
          remoteUrl: evidence.remoteUrl || null,
          titleSnapshot: safeDisplayText(row.title_snapshot, 1000),
          filename: safeDisplayText(row.filename, 255),
          resourceNameSnapshot: safeDisplayText(
            row.resource_name_snapshot,
            500,
          ),
          quotedPrice: canonicalDisplayPrice(row.quoted_price),
          estimatedTotal: canonicalDisplayPrice(row.estimated_total),
          systemSubmissionCode: safeDisplayText(row.system_submission_code, 128) || null,
        });
      }),
    );
  }

  function recordRemoteOrderObservation(input) {
    open();
    const value = input || {};
    if (
      typeof value.orderId !== "string" ||
      !value.orderId ||
      !value.observation ||
      !supplierStatusCode(value.observation.statusCode)
    )
      throw fail("OPERATIONAL_ORDER_OBSERVATION_INVALID");
    const stamp = iso(clock);
    const publishedAt = observationTimestamp(value.observation.publishedAt);
    if (value.observation.publishedAt !== undefined && !publishedAt)
      throw fail("OPERATIONAL_ORDER_OBSERVATION_INVALID");
    return transaction(() => {
      const row = db
        .prepare(
          "SELECT o.attempt_id,o.remote_id,o.payload_json,p.publication_id,p.article_id,p.target_json,p.status FROM remote_orders o JOIN publication_attempts a ON a.attempt_id=o.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id WHERE o.order_id=?",
        )
        .get(value.orderId);
      if (!row || (fromText(row.target_json) || {}).kind !== "media")
        throw fail("OPERATIONAL_ORDER_NOT_FOUND");
      const statusCode = supplierStatusCode(value.observation.statusCode);
      let remoteUrl = null;
      if (value.observation.remoteUrl !== undefined) {
        remoteUrl = safeEvidenceUrl(value.observation.remoteUrl);
        if (!remoteUrl) throw fail("OPERATIONAL_ORDER_EVIDENCE_REQUIRED");
      }
      const currentEvidence = fromText(row.payload_json) || {};
      const previousObservation = supplierObservation(currentEvidence);
      const observation = Object.freeze({
        statusCode,
        observedAt: stamp,
        ...(publishedAt ||
        (previousObservation && previousObservation.publishedAt)
          ? { publishedAt: publishedAt || previousObservation.publishedAt }
          : {}),
      });
      const evidence = Object.assign({}, currentEvidence, {
        supplierObservation: observation,
        ...(remoteUrl ? { remoteUrl } : {}),
      });
      db.prepare(
        "UPDATE remote_orders SET payload_json=? WHERE order_id=?",
      ).run(text(evidence), value.orderId);
      if (remoteUrl)
        db.prepare(
          "UPDATE remote_evidence SET remote_url=?,evidence_json=? WHERE attempt_id=? AND remote_id=?",
        ).run(remoteUrl, text(evidence), row.attempt_id, row.remote_id);
      // A supplier observation is not a canonical workflow transition. The
      // only exception is status 2 with safe published evidence.
      let publicationStatus = row.status;
      if (
        statusCode === "2" &&
        remoteUrl &&
        ["queued", "remote_started", "submitted", "uncertain"].includes(
          row.status,
        )
      ) {
        publicationStatus = "published";
        db.prepare(
          "UPDATE publication_attempts SET status=?,finished_at=? WHERE attempt_id=?",
        ).run("published", stamp, row.attempt_id);
        db.prepare(
          "UPDATE publication_records SET status=?,updated_at=? WHERE publication_id=?",
        ).run("published", stamp, row.publication_id);
        db.prepare(
          "UPDATE recovery_intents SET state=?,payload_json=?,updated_at=? WHERE attempt_id=?",
        ).run("resolved", text(evidence), stamp, row.attempt_id);
      }
      if (statusCode === "4" || (statusCode === "2" && remoteUrl))
        activeTarget.release({
          articleId: row.article_id,
          publicationId: row.publication_id,
          attemptId: row.attempt_id,
        });
      return Object.freeze({
        orderId: value.orderId,
        attemptId: row.attempt_id,
        publicationId: row.publication_id,
        publicationStatus,
        supplierStatusCode: statusCode,
      });
    });
  }

  return Object.freeze({
    attachRemoteOrderEvidence,
    listRemoteOrders,
    listOrderDisplayViews,
    recordRemoteOrderObservation,
  });
}

module.exports = { createOrderAggregate };
