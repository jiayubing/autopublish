const domain = require("../../../domain");

const {
  fromText,
  rejectSensitive,
  text,
} = require("./operational-store-utils");

function createSubmissionAggregate(context) {
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

  function claimSubmissionItem(input) {
    open();
    const value = input || {};
    const stamp = iso(clock);
    if (typeof value.claimToken !== "string" || !value.claimToken)
      throw fail("OPERATIONAL_CLAIM_INVALID");
    return transaction(() => {
      const row = db
        .prepare(
          "SELECT s.* FROM submission_items s WHERE s.batch_id=? AND (s.status='queued' OR(s.status='claimed' AND s.claim_until<?)) AND NOT EXISTS (SELECT 1 FROM publication_attempts a JOIN publication_records p ON p.publication_id=a.publication_id JOIN recovery_intents i ON i.attempt_id=a.attempt_id WHERE p.article_id=s.article_id AND p.target_key=s.target_key AND i.state IN('remote_started','outcome_pending') AND i.payload_json LIKE '%\"batchItemId\":\"' || s.item_id || '\"%') ORDER BY s.item_id LIMIT 1",
        )
        .get(value.batchId, stamp);
      if (!row) return null;
      const until = new Date(
        Date.parse(stamp) + (value.leaseMs || 30000),
      ).toISOString();
      db.prepare(
        "UPDATE submission_items SET status='claimed',claim_token=?,claim_until=?,revision=revision+1 WHERE item_id=? AND revision=?",
      ).run(value.claimToken, until, row.item_id, row.revision);
      return {
        itemId: row.item_id,
        batchId: row.batch_id,
        articleId: row.article_id,
        targetKey: row.target_key,
        revision: row.revision + 1,
        payload: fromText(row.payload_json),
      };
    });
  }

  function claimSubmissionItemById(input) {
    open();
    const value = input || {};
    const stamp = iso(clock);
    if (
      typeof value.claimToken !== "string" ||
      !value.claimToken ||
      typeof value.itemId !== "string" ||
      !value.itemId ||
      typeof value.batchId !== "string" ||
      !value.batchId
    )
      throw fail("OPERATIONAL_CLAIM_INVALID");
    return transaction(() => {
      const row = db
        .prepare(
          "SELECT * FROM submission_items WHERE item_id=? AND batch_id=?",
        )
        .get(value.itemId, value.batchId);
      if (!row) throw fail("OPERATIONAL_BATCH_ITEM_NOT_FOUND");
      const activePublication = db
        .prepare(
          "SELECT 1 FROM publication_attempts a JOIN publication_records p ON p.publication_id=a.publication_id JOIN recovery_intents i ON i.attempt_id=a.attempt_id WHERE p.article_id=? AND p.target_key=? AND i.state IN('remote_started','outcome_pending') AND i.payload_json LIKE ? LIMIT 1",
        )
        .get(
          row.article_id,
          row.target_key,
          `%"batchItemId":"${row.item_id}"%`,
        );
      const retryFailed = value.retryFailed === true;
      if (retryFailed) {
        const payload = fromText(row.payload_json) || {};
        const failed = db
          .prepare(
            "SELECT p.publication_id FROM publication_records p JOIN publication_attempts a ON a.publication_id=p.publication_id WHERE p.article_id=? AND p.target_key=? AND p.status='failed' AND a.attempt_id=? AND a.status='failed' LIMIT 1",
          )
          .get(row.article_id, row.target_key, payload.attemptId || "");
        if (!failed || row.status !== "failed")
          throw fail("PUBLICATION_RETRY_NOT_ELIGIBLE");
      }
      if (
        activePublication ||
        (!retryFailed &&
          row.status !== "queued" &&
          !(row.status === "claimed" && row.claim_until < stamp))
      )
        throw fail("OPERATIONAL_BATCH_ITEM_NOT_EXECUTABLE");
      const until = new Date(
        Date.parse(stamp) + (value.leaseMs || 30000),
      ).toISOString();
      const changed = db
        .prepare(
          "UPDATE submission_items SET status='claimed',claim_token=?,claim_until=?,revision=revision+1 WHERE item_id=? AND revision=?",
        )
        .run(value.claimToken, until, row.item_id, row.revision).changes;
      if (changed !== 1) throw fail("OPERATIONAL_BATCH_REVISION_CONFLICT");
      return Object.freeze({
        itemId: row.item_id,
        batchId: row.batch_id,
        articleId: row.article_id,
        targetKey: row.target_key,
        revision: row.revision + 1,
        claimToken: value.claimToken,
        payload: fromText(row.payload_json),
      });
    });
  }

  function renewSubmissionItemClaim(input) {
    open();
    const value = input || {};
    const stamp = iso(clock);
    if (
      typeof value.claimToken !== "string" ||
      !value.claimToken ||
      typeof value.itemId !== "string" ||
      !value.itemId ||
      typeof value.batchId !== "string" ||
      !value.batchId
    )
      throw fail("OPERATIONAL_CLAIM_INVALID");
    const leaseMs =
      Number.isFinite(value.leaseMs) && value.leaseMs > 0
        ? value.leaseMs
        : 30000;
    const claimUntil = new Date(Date.parse(stamp) + leaseMs).toISOString();
    const changed = db
      .prepare(
        "UPDATE submission_items SET claim_until=? WHERE item_id=? AND batch_id=? AND status='claimed' AND claim_token=? AND claim_until>=?",
      )
      .run(
        claimUntil,
        value.itemId,
        value.batchId,
        value.claimToken,
        stamp,
      ).changes;
    if (changed !== 1) throw fail("OPERATIONAL_CLAIM_CONFLICT");
    return Object.freeze({
      itemId: value.itemId,
      batchId: value.batchId,
      claimToken: value.claimToken,
      claimUntil,
    });
  }

  function updateSubmissionItem(input) {
    open();
    const value = input || {};
    const stamp = iso(clock);
    if (
      !Number.isInteger(value.revision) ||
      !["queued", "completed", "failed"].includes(value.status)
    )
      throw fail("OPERATIONAL_BATCH_UPDATE_INVALID");
    return transaction(() => {
      const item = db
        .prepare("SELECT batch_id FROM submission_items WHERE item_id=?")
        .get(value.itemId);
      if (!item) throw fail("OPERATIONAL_BATCH_ITEM_NOT_FOUND");
      const changed = db
        .prepare(
          "UPDATE submission_items SET status=?,claim_token=NULL,claim_until=NULL,revision=revision+1,payload_json=? WHERE item_id=? AND revision=? AND claim_token=?",
        )
        .run(
          value.status,
          text(value.payload || {}),
          value.itemId,
          value.revision,
          value.claimToken,
        ).changes;
      if (changed !== 1) throw fail("OPERATIONAL_BATCH_REVISION_CONFLICT");
      refreshSubmissionBatchStatus(db, item.batch_id, stamp);
    });
  }

  function cancelQueuedSubmissionItem(input) {
    open();
    const value = input || {};
    if (
      typeof value.itemId !== "string" ||
      !value.itemId ||
      typeof value.batchId !== "string" ||
      !value.batchId
    )
      throw fail("OPERATIONAL_BATCH_ITEM_INVALID");
    const stamp = iso(clock);
    return transaction(() => {
      const item = db
        .prepare(
          "SELECT item_id,status,claim_token,payload_json FROM submission_items WHERE item_id=? AND batch_id=?",
        )
        .get(value.itemId, value.batchId);
      if (!item) throw fail("OPERATIONAL_BATCH_ITEM_NOT_FOUND");
      const operation = operationForTransition(db, value, "cancel");
      if (item.status === "cancelled")
        return Object.freeze({
          itemId: item.item_id,
          status: "cancelled",
          idempotent: true,
        });
      if (item.status !== "queued" || item.claim_token)
        throw fail("OPERATIONAL_BATCH_ITEM_NOT_CANCELLABLE");
      const payload = Object.assign({}, fromText(item.payload_json) || {}, {
        cancelledAt: stamp,
        ...(typeof value.operationId === "string" && value.operationId
          ? { removalOperationId: value.operationId }
          : {}),
      });
      db.prepare(
        "UPDATE submission_items SET status='cancelled',revision=revision+1,payload_json=? WHERE item_id=?",
      ).run(text(payload), item.item_id);
      if (operation)
        db.prepare(
          "UPDATE submission_item_operations SET state='state_applied',updated_at=? WHERE operation_id=?",
        ).run(stamp, value.operationId);
      const remaining = db
        .prepare(
          "SELECT COUNT(*) count FROM submission_items WHERE batch_id=? AND status!='cancelled'",
        )
        .get(value.batchId).count;
      if (remaining === 0)
        db.prepare(
          "UPDATE submission_batches SET status='cancelled',revision=revision+1,updated_at=? WHERE batch_id=?",
        ).run(stamp, value.batchId);
      return Object.freeze({
        itemId: item.item_id,
        status: "cancelled",
        idempotent: false,
      });
    });
  }

  function markSubmissionItemCleaned(input) {
    open();
    const value = input || {};
    const transitions = {
      failed: "failed-cleaned",
      published: "published-cleaned",
      completed: "published-cleaned",
      cancelled: "cancelled-cleaned",
    };
    if (
      typeof value.itemId !== "string" ||
      !value.itemId ||
      typeof value.batchId !== "string" ||
      !value.batchId ||
      !transitions[value.fromStatus]
    )
      throw fail("OPERATIONAL_BATCH_CLEANUP_INVALID");
    const targetStatus = transitions[value.fromStatus];
    const stamp = iso(clock);
    return transaction(() => {
      const item = db
        .prepare(
          "SELECT item_id,status,payload_json FROM submission_items WHERE item_id=? AND batch_id=?",
        )
        .get(value.itemId, value.batchId);
      if (!item) throw fail("OPERATIONAL_BATCH_ITEM_NOT_FOUND");
      const operationAction =
        value.action ||
        (value.fromStatus === "failed"
          ? "cleanup"
          : value.fromStatus === "cancelled"
            ? "cleanupCancelledLocal"
            : "cleanupPublishedLocal");
      const operation = operationForTransition(db, value, operationAction);
      if (item.status === targetStatus)
        return Object.freeze({
          itemId: item.item_id,
          status: targetStatus,
          idempotent: true,
        });
      if (item.status !== value.fromStatus)
        throw fail("OPERATIONAL_BATCH_ITEM_STATUS_CONFLICT");
      const payload = Object.assign({}, fromText(item.payload_json) || {}, {
        localCleanupAt: stamp,
        ...(typeof value.operationId === "string" && value.operationId
          ? { removalOperationId: value.operationId }
          : {}),
      });
      db.prepare(
        "UPDATE submission_items SET status=?,revision=revision+1,payload_json=? WHERE item_id=? AND status=?",
      ).run(targetStatus, text(payload), item.item_id, value.fromStatus);
      if (operation)
        db.prepare(
          "UPDATE submission_item_operations SET state='state_applied',updated_at=? WHERE operation_id=?",
        ).run(stamp, value.operationId);
      return Object.freeze({
        itemId: item.item_id,
        status: targetStatus,
        idempotent: false,
      });
    });
  }

  function submissionActionRow(row) {
    if (!row) return null;
    return Object.freeze({
      operationId: row.operation_id,
      batchId: row.batch_id,
      itemId: row.item_id,
      action: row.action,
      state: row.state,
      expectedFingerprint: row.expected_fingerprint,
      payload: fromText(row.payload_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  function prepareSubmissionItemAction(input) {
    open();
    const value = input || {};
    if (
      typeof value.operationId !== "string" ||
      !value.operationId ||
      typeof value.batchId !== "string" ||
      !value.batchId ||
      typeof value.itemId !== "string" ||
      !value.itemId ||
      ![
        "cancel",
        "cleanup",
        "cleanupPublishedLocal",
        "cleanupCancelledLocal",
      ].includes(value.action) ||
      typeof value.expectedFingerprint !== "string" ||
      !value.expectedFingerprint
    )
      throw fail("OPERATIONAL_SUBMISSION_OPERATION_INVALID");
    const stamp = iso(clock);
    return transaction(() => {
      const existing = db
        .prepare(
          "SELECT * FROM submission_item_operations WHERE batch_id=? AND item_id=? AND action=?",
        )
        .get(value.batchId, value.itemId, value.action);
      if (existing) {
        if (
          existing.operation_id !== value.operationId ||
          existing.expected_fingerprint !== value.expectedFingerprint
        )
          throw fail("OPERATIONAL_SUBMISSION_OPERATION_CONFLICT");
        return submissionActionRow(existing);
      }
      const item = db
        .prepare(
          "SELECT status FROM submission_items WHERE item_id=? AND batch_id=?",
        )
        .get(value.itemId, value.batchId);
      if (!item) throw fail("OPERATIONAL_BATCH_ITEM_NOT_FOUND");
      if (value.expectedStatus && item.status !== value.expectedStatus)
        throw fail("OPERATIONAL_BATCH_ITEM_STATUS_CONFLICT");
      const payload = Object.assign({}, value.payload || {}, {
        expectedStatus: value.expectedStatus || item.status,
      });
      db.prepare(
        "INSERT INTO submission_item_operations VALUES(?,?,?,?,?,?,?,?,?)",
      ).run(
        value.operationId,
        value.batchId,
        value.itemId,
        value.action,
        "prepared",
        value.expectedFingerprint,
        text(payload),
        stamp,
        stamp,
      );
      return submissionActionRow(
        db
          .prepare(
            "SELECT * FROM submission_item_operations WHERE operation_id=?",
          )
          .get(value.operationId),
      );
    });
  }

  function getSubmissionItemAction(input) {
    open();
    const operationId =
      typeof input === "string" ? input : input && input.operationId;
    if (typeof operationId !== "string" || !operationId)
      throw fail("OPERATIONAL_SUBMISSION_OPERATION_INVALID");
    return submissionActionRow(
      db
        .prepare(
          "SELECT * FROM submission_item_operations WHERE operation_id=?",
        )
        .get(operationId),
    );
  }

  function checkpointSubmissionItemAction(input) {
    open();
    const value = input || {};
    if (
      typeof value.operationId !== "string" ||
      !value.operationId ||
      ![
        "prepared",
        "main_staged",
        "sidecar_staged",
        "staged",
        "state_applied",
        "complete",
      ].includes(value.state)
    )
      throw fail("OPERATIONAL_SUBMISSION_CHECKPOINT_INVALID");
    const stamp = iso(clock);
    return transaction(() => {
      const current = db
        .prepare(
          "SELECT * FROM submission_item_operations WHERE operation_id=?",
        )
        .get(value.operationId);
      if (!current) throw fail("OPERATIONAL_SUBMISSION_OPERATION_NOT_FOUND");
      if (current.state === value.state) return submissionActionRow(current);
      const changed = db
        .prepare(
          "UPDATE submission_item_operations SET state=?,payload_json=?,updated_at=? WHERE operation_id=? AND state=?",
        )
        .run(
          value.state,
          text(value.payload || fromText(current.payload_json) || {}),
          stamp,
          value.operationId,
          current.state,
        ).changes;
      if (changed !== 1)
        throw fail("OPERATIONAL_SUBMISSION_OPERATION_CONFLICT");
      return submissionActionRow(
        db
          .prepare(
            "SELECT * FROM submission_item_operations WHERE operation_id=?",
          )
          .get(value.operationId),
      );
    });
  }

  function operationForTransition(dbHandle, value, action) {
    if (!value.operationId) return null;
    const operation = dbHandle
      .prepare("SELECT * FROM submission_item_operations WHERE operation_id=?")
      .get(value.operationId);
    if (
      !operation ||
      operation.batch_id !== value.batchId ||
      operation.item_id !== value.itemId ||
      operation.action !== action
    )
      throw fail("OPERATIONAL_SUBMISSION_OPERATION_CONFLICT");
    if (!["staged", "state_applied", "complete"].includes(operation.state))
      throw fail("OPERATIONAL_SUBMISSION_OPERATION_STATE_INVALID");
    return operation;
  }

  function getSubmissionBatch(input) {
    open();
    const batchId = domain.BatchId.serialize(
      domain.BatchId.parse(
        typeof input === "string" ? input : (input || {}).batchId,
      ),
    );
    const batch = db
      .prepare(
        "SELECT batch_id,status,revision,created_at,updated_at FROM submission_batches WHERE batch_id=?",
      )
      .get(batchId);
    if (!batch) throw fail("OPERATIONAL_BATCH_NOT_FOUND");
    const items = db
      .prepare(
        "SELECT item_id,article_id,target_key,revision,status,payload_json FROM submission_items WHERE batch_id=? ORDER BY item_id",
      )
      .all(batchId)
      .map((row) =>
        Object.freeze({
          itemId: row.item_id,
          articleId: row.article_id,
          targetKey: row.target_key,
          revision: row.revision,
          status: row.status,
          payload: fromText(row.payload_json),
        }),
      );
    return Object.freeze({
      batchId: batch.batch_id,
      status: batch.status,
      revision: batch.revision,
      createdAt: batch.created_at,
      updatedAt: batch.updated_at,
      items: Object.freeze(items),
    });
  }

  function listSubmissionBatches(input) {
    open();
    const value = input || {};
    if (
      value.clientId !== undefined &&
      (typeof value.clientId !== "string" || !value.clientId.trim())
    )
      throw fail("OPERATIONAL_BATCH_CLIENT_INVALID");
    const batches = db
      .prepare(
        "SELECT batch_id FROM submission_batches ORDER BY created_at DESC,batch_id DESC",
      )
      .all();
    return Object.freeze(
      batches
        .map((row) => getSubmissionBatch(row.batch_id))
        .filter((batch) => {
          if (value.clientId === undefined) return true;
          return batch.items.some(
            (item) =>
              item.payload && item.payload.clientId === value.clientId.trim(),
          );
        }),
    );
  }

  function findSubmissionItem(input) {
    open();
    const value = input || {};
    const batchId = domain.BatchId.serialize(
      domain.BatchId.parse(value.batchId),
    );
    const articleId = domain.ArticleId.serialize(
      domain.ArticleId.parse(value.articleId),
    );
    const targetKey = domain.publicationTargetKey(
      domain.parsePublicationTarget(value.target),
    );
    const rows = db
      .prepare(
        "SELECT item_id,batch_id,article_id,target_key,revision,status,payload_json FROM submission_items WHERE batch_id=? AND article_id=? AND target_key=?",
      )
      .all(batchId, articleId, targetKey);
    if (rows.length !== 1) throw fail("OPERATIONAL_BATCH_ITEM_NOT_FOUND");
    const row = rows[0];
    return Object.freeze({
      itemId: row.item_id,
      batchId: row.batch_id,
      articleId: row.article_id,
      targetKey: row.target_key,
      revision: row.revision,
      status: row.status,
      payload: fromText(row.payload_json),
    });
  }

  function getArchiveEligibility(input) {
    const value = input || {};
    if (
      typeof value.sourcePlatformId !== "string" ||
      !value.sourcePlatformId ||
      typeof value.filename !== "string" ||
      !value.filename
    )
      throw fail("OPERATIONAL_ARCHIVE_GROUP_INVALID");
    const batch = getSubmissionBatch(value.batchId);
    const items = batch.items.filter(
      (item) =>
        item.payload &&
        item.payload.sourcePlatformId === value.sourcePlatformId &&
        item.payload.filename === value.filename,
    );
    if (!items.length) throw fail("OPERATIONAL_ARCHIVE_GROUP_NOT_FOUND");
    return Object.freeze({
      batchId: batch.batchId,
      sourcePlatformId: value.sourcePlatformId,
      filename: value.filename,
      eligible: items.every(
        (item) =>
          item.status === "completed" &&
          item.payload.outcomeStatus === "published",
      ),
      retryable: items.some((item) =>
        ["queued", "claimed"].includes(item.status),
      ),
      items: Object.freeze(items),
    });
  }

  return Object.freeze({
    claimSubmissionItem,
    claimSubmissionItemById,
    renewSubmissionItemClaim,
    updateSubmissionItem,
    cancelQueuedSubmissionItem,
    markSubmissionItemCleaned,
    prepareSubmissionItemAction,
    getSubmissionItemAction,
    checkpointSubmissionItemAction,
    getSubmissionBatch,
    listSubmissionBatches,
    findSubmissionItem,
    getArchiveEligibility,
  });
}

module.exports = { createSubmissionAggregate };
