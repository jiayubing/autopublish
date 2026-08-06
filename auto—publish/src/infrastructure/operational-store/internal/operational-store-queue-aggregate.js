const domain = require("../../../domain");

const { fromText, rejectSensitive, safeOperationalPayload, text } = require("./operational-store-utils");

const PLATFORM_ID = /^[a-z][a-z0-9-]{0,63}$/;
const PAUSE_INTENTS = new Set(["none", "manual", "system"]);

function createOperationalStoreQueueAggregate(context) {
  const { db, open, transaction, clock, randomUUID, fail, iso } = context;

  function requiredText(value, max, code) {
    if (typeof value !== "string" || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value))
      throw fail(code);
    return value.trim();
  }

  function pauseIntent(input, fallback) {
    if (input === true) return "manual";
    if (input === false) return "none";
    if (input === undefined) return fallback;
    if (!PAUSE_INTENTS.has(input)) throw fail("OPERATIONAL_PAUSE_INTENT_INVALID");
    return input;
  }

  function queueGroupRow(row) {
    if (!row) return null;
    return Object.freeze({
      queueGroupId: row.queue_group_id,
      platformId: row.platform_id,
      accountProfileId: row.account_profile_id,
      pauseIntent: row.pause_intent,
      paused: row.pause_intent !== "none",
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  function createSubmissionQueueGroup(input) {
    open();
    const value = input || {};
    if (typeof value.platformId !== "string" || !PLATFORM_ID.test(value.platformId.trim()))
      throw fail("OPERATIONAL_QUEUE_GROUP_PLATFORM_INVALID");
    const platformId = value.platformId.trim();
    const accountProfileId = domain.AccountProfileId.serialize(
      domain.AccountProfileId.parse(value.accountProfileId),
    );
    const queueGroupId = value.queueGroupId === undefined
      ? `queue-group-${randomUUID()}`
      : requiredText(value.queueGroupId, 128, "OPERATIONAL_QUEUE_GROUP_ID_INVALID");
    const intent = pauseIntent(value.pauseIntent, value.paused === false ? "none" : "manual");
    const stamp = iso(clock);
    return transaction(() => {
      const profile = db
        .prepare("SELECT platform_id FROM account_profiles WHERE account_profile_id=?")
        .get(accountProfileId);
      if (!profile) throw fail("ACCOUNT_PROFILE_NOT_FOUND");
      if (profile.platform_id !== platformId) throw fail("ACCOUNT_PROFILE_PLATFORM_MISMATCH");
      try {
        db.prepare(
          "INSERT INTO submission_queue_groups(queue_group_id,platform_id,account_profile_id,pause_intent,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        ).run(queueGroupId, platformId, accountProfileId, intent, 1, stamp, stamp);
      } catch (error) {
        if (String(error && error.code || "").startsWith("SQLITE_CONSTRAINT"))
          throw fail("OPERATIONAL_QUEUE_GROUP_EXISTS");
        throw error;
      }
      return queueGroupRow(
        db.prepare("SELECT * FROM submission_queue_groups WHERE queue_group_id=?").get(queueGroupId),
      );
    });
  }

  function setSubmissionQueueGroupPause(input) {
    open();
    const value = input || {};
    const queueGroupId = requiredText(value.queueGroupId, 128, "OPERATIONAL_QUEUE_GROUP_ID_INVALID");
    const intent = pauseIntent(value.pauseIntent, value.paused === false ? "none" : "manual");
    const stamp = iso(clock);
    return transaction(() => {
      const changed = db.prepare(
        "UPDATE submission_queue_groups SET pause_intent=?,revision=revision+1,updated_at=? WHERE queue_group_id=?",
      ).run(intent, stamp, queueGroupId).changes;
      if (changed !== 1) throw fail("OPERATIONAL_QUEUE_GROUP_NOT_FOUND");
      return queueGroupRow(
        db.prepare("SELECT * FROM submission_queue_groups WHERE queue_group_id=?").get(queueGroupId),
      );
    });
  }

  function listSubmissionQueueGroups() {
    open();
    return Object.freeze(
      db
        .prepare("SELECT * FROM submission_queue_groups ORDER BY platform_id,account_profile_id,queue_group_id LIMIT 20000")
        .all()
        .map(queueGroupRow),
    );
  }

  function enqueueSubmissionQueueItem(input) {
    open();
    const value = input || {};
    const itemId = requiredText(value.itemId, 128, "OPERATIONAL_BATCH_ITEM_INVALID");
    const queueGroupId = requiredText(value.queueGroupId, 128, "OPERATIONAL_QUEUE_GROUP_ID_INVALID");
    const stamp = iso(clock);
    return transaction(() => {
      const item = db
        .prepare("SELECT item_id,batch_id,article_id,target_key,status FROM submission_items WHERE item_id=?")
        .get(itemId);
      if (!item) throw fail("OPERATIONAL_BATCH_ITEM_NOT_FOUND");
      if (item.status !== "queued") throw fail("OPERATIONAL_QUEUE_ITEM_STATUS_INVALID");
      const group = db
        .prepare("SELECT platform_id,account_profile_id FROM submission_queue_groups WHERE queue_group_id=?")
        .get(queueGroupId);
      if (!group) throw fail("OPERATIONAL_QUEUE_GROUP_NOT_FOUND");
      const expectedTarget = `platform:${group.platform_id}:account:${group.account_profile_id}`;
      if (item.target_key !== expectedTarget) throw fail("OPERATIONAL_QUEUE_ITEM_TARGET_MISMATCH");
      const existing = db.prepare("SELECT * FROM submission_queue_items WHERE item_id=?").get(itemId);
      if (existing) {
        if (existing.queue_group_id !== queueGroupId) throw fail("OPERATIONAL_QUEUE_ITEM_CONFLICT");
        return Object.freeze({ itemId, queueGroupId, position: existing.position, idempotent: true });
      }
      const requested = value.position;
      const position = requested === undefined
        ? db.prepare("SELECT COALESCE(MAX(position),0)+1 position FROM submission_queue_items WHERE queue_group_id=?").get(queueGroupId).position
        : requested;
      if (!Number.isSafeInteger(position) || position < 1) throw fail("OPERATIONAL_QUEUE_POSITION_INVALID");
      try {
        db.prepare(
          "INSERT INTO submission_queue_items(item_id,queue_group_id,position,created_at) VALUES(?,?,?,?)",
        ).run(itemId, queueGroupId, position, stamp);
      } catch (error) {
        if (String(error && error.code || "").startsWith("SQLITE_CONSTRAINT"))
          throw fail("OPERATIONAL_QUEUE_POSITION_CONFLICT");
        throw error;
      }
      return Object.freeze({ itemId, batchId: item.batch_id, articleId: item.article_id, queueGroupId, position, status: item.status, idempotent: false });
    });
  }

  function listSubmissionQueueItems(input) {
    open();
    const value = input || {};
    const clauses = [];
    const params = [];
    if (value.queueGroupId !== undefined) {
      clauses.push("q.queue_group_id=?");
      params.push(requiredText(value.queueGroupId, 128, "OPERATIONAL_QUEUE_GROUP_ID_INVALID"));
    }
    if (Array.isArray(value.articleIds) && value.articleIds.length) {
      const ids = value.articleIds.map((id) => domain.ArticleId.serialize(domain.ArticleId.parse(id)));
      clauses.push(`s.article_id IN(${ids.map(() => "?").join(",")})`);
      params.push(...ids);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return Object.freeze(
      db
        .prepare(
          "SELECT q.item_id,q.queue_group_id,q.position,q.created_at,s.batch_id,s.article_id,s.target_key,s.revision,s.status,s.payload_json,g.platform_id,g.account_profile_id,g.pause_intent FROM submission_queue_items q JOIN submission_items s ON s.item_id=q.item_id JOIN submission_queue_groups g ON g.queue_group_id=q.queue_group_id " +
            where +
            " ORDER BY q.queue_group_id,q.position LIMIT 20000",
        )
        .all(...params)
        .map((row) => Object.freeze({
          itemId: row.item_id,
          batchId: row.batch_id,
          articleId: row.article_id,
          targetKey: row.target_key,
          revision: row.revision,
          status: row.status,
          payload: safeOperationalPayload(row.payload_json),
          queueGroupId: row.queue_group_id,
          position: row.position,
          platformId: row.platform_id,
          accountProfileId: row.account_profile_id,
          pauseIntent: row.pause_intent,
          createdAt: row.created_at,
        })),
    );
  }

  function paidBatchRow(row, idempotent) {
    if (!row) return null;
    return Object.freeze({
      batchId: row.batch_id,
      mediaResourceId: row.media_resource_id,
      confirmationFingerprint: row.confirmation_fingerprint,
      confirmation: fromText(row.confirmation_json),
      systemSubmissionCode: row.system_submission_code,
      quotedPrice: row.quoted_price,
      estimatedTotal: row.estimated_total,
      articleCount: row.article_count,
      pauseIntent: row.pause_intent,
      paused: row.pause_intent !== "none",
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
      updatedAt: row.updated_at,
      ...(idempotent === undefined ? {} : { idempotent }),
    });
  }

  function createPaidSubmissionBatch(input) {
    open();
    const value = input || {};
    const batchId = domain.BatchId.serialize(domain.BatchId.parse(value.batchId));
    const mediaResourceId = domain.MediaResourceId.serialize(domain.MediaResourceId.parse(value.mediaResourceId));
    const fingerprint = requiredText(value.confirmationFingerprint, 512, "OPERATIONAL_CONFIRMATION_FINGERPRINT_INVALID");
    const systemSubmissionCode = requiredText(value.systemSubmissionCode, 128, "OPERATIONAL_SYSTEM_SUBMISSION_CODE_REQUIRED");
    const confirmation = value.confirmation === undefined ? {} : value.confirmation;
    if (!confirmation || typeof confirmation !== "object" || Array.isArray(confirmation))
      throw fail("OPERATIONAL_CONFIRMATION_INVALID");
    rejectSensitive(confirmation);
    if (text(confirmation).length > 32768) throw fail("OPERATIONAL_CONFIRMATION_INVALID");
    const quotedPrice = value.quotedPrice;
    const estimatedTotal = value.estimatedTotal === undefined ? value.expectedTotal : value.estimatedTotal;
    if (![quotedPrice, estimatedTotal].every((number) => typeof number === "number" && Number.isFinite(number) && number >= 0 && number <= 100000000))
      throw fail("OPERATIONAL_CONFIRMATION_PRICE_INVALID");
    const stamp = iso(clock);
    return transaction(() => {
      const batch = db.prepare("SELECT batch_id FROM submission_batches WHERE batch_id=?").get(batchId);
      if (!batch) throw fail("OPERATIONAL_BATCH_NOT_FOUND");
      const count = db.prepare("SELECT COUNT(*) count FROM submission_items WHERE batch_id=? AND target_key=?").get(batchId, `media-resource:${mediaResourceId}`).count;
      const total = db.prepare("SELECT COUNT(*) count FROM submission_items WHERE batch_id=?").get(batchId).count;
      const articleCount = value.articleCount === undefined ? count : value.articleCount;
      if (total !== count || !Number.isSafeInteger(articleCount) || articleCount < 1 || articleCount !== count)
        throw fail("OPERATIONAL_CONFIRMATION_ARTICLE_COUNT_INVALID");
      const existing = db.prepare("SELECT * FROM paid_submission_batches WHERE batch_id=?").get(batchId);
      if (existing) {
        if (existing.confirmation_fingerprint !== fingerprint) throw fail("OPERATIONAL_PAID_BATCH_CONFLICT");
        return paidBatchRow(existing, true);
      }
      try {
        db.prepare(
          "INSERT INTO paid_submission_batches(batch_id,media_resource_id,confirmation_fingerprint,confirmation_json,system_submission_code,quoted_price,estimated_total,article_count,pause_intent,created_at,confirmed_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        ).run(batchId, mediaResourceId, fingerprint, text(confirmation), systemSubmissionCode, quotedPrice, estimatedTotal, articleCount, "manual", stamp, stamp, stamp);
      } catch (error) {
        if (String(error && error.code || "").startsWith("SQLITE_CONSTRAINT"))
          throw fail("OPERATIONAL_PAID_BATCH_CONFLICT");
        throw error;
      }
      return paidBatchRow(db.prepare("SELECT * FROM paid_submission_batches WHERE batch_id=?").get(batchId), false);
    });
  }

  function getPaidSubmissionBatch(input) {
    open();
    const batchId = domain.BatchId.serialize(domain.BatchId.parse(typeof input === "string" ? input : input && input.batchId));
    const row = db.prepare("SELECT * FROM paid_submission_batches WHERE batch_id=?").get(batchId);
    if (!row) throw fail("OPERATIONAL_PAID_BATCH_NOT_FOUND");
    return paidBatchRow(row);
  }

  function listPaidSubmissionBatches() {
    open();
    return Object.freeze(db.prepare("SELECT * FROM paid_submission_batches ORDER BY created_at DESC,batch_id DESC LIMIT 20000").all().map(paidBatchRow));
  }

  function setPaidSubmissionBatchPause(input) {
    open();
    const value = input || {};
    const batchId = domain.BatchId.serialize(domain.BatchId.parse(value.batchId));
    const intent = pauseIntent(value.pauseIntent, value.paused === false ? "none" : "manual");
    const stamp = iso(clock);
    return transaction(() => {
      const changed = db.prepare("UPDATE paid_submission_batches SET pause_intent=?,updated_at=? WHERE batch_id=?").run(intent, stamp, batchId).changes;
      if (changed !== 1) throw fail("OPERATIONAL_PAID_BATCH_NOT_FOUND");
      return paidBatchRow(db.prepare("SELECT * FROM paid_submission_batches WHERE batch_id=?").get(batchId));
    });
  }

  return Object.freeze({
    createSubmissionQueueGroup,
    setSubmissionQueueGroupPause,
    listSubmissionQueueGroups,
    enqueueSubmissionQueueItem,
    listSubmissionQueueItems,
    createPaidSubmissionBatch,
    getPaidSubmissionBatch,
    listPaidSubmissionBatches,
    setPaidSubmissionBatchPause,
  });
}

module.exports = { createOperationalStoreQueueAggregate };
