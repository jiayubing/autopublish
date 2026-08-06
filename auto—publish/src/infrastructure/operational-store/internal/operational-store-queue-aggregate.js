const domain = require("../../../domain");

const {
  fromText,
  rejectSensitive,
  safeOperationalPayload,
  text,
} = require("./operational-store-utils");

const PLATFORM_ID = /^[a-z][a-z0-9-]{0,63}$/;
const PAUSE_INTENTS = new Set(["none", "manual", "system"]);
const FINGERPRINT = /^[a-f0-9]{64}$/;

function createOperationalStoreQueueAggregate(context) {
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

  function pauseIntent(input, fallback) {
    if (input === true) return "manual";
    if (input === false) return "none";
    if (input === undefined) return fallback;
    if (!PAUSE_INTENTS.has(input))
      throw fail("OPERATIONAL_PAUSE_INTENT_INVALID");
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
    if (
      typeof value.platformId !== "string" ||
      !PLATFORM_ID.test(value.platformId.trim())
    )
      throw fail("OPERATIONAL_QUEUE_GROUP_PLATFORM_INVALID");
    const platformId = value.platformId.trim();
    const accountProfileId = domain.AccountProfileId.serialize(
      domain.AccountProfileId.parse(value.accountProfileId),
    );
    const queueGroupId =
      value.queueGroupId === undefined
        ? `queue-group-${randomUUID()}`
        : requiredText(
            value.queueGroupId,
            128,
            "OPERATIONAL_QUEUE_GROUP_ID_INVALID",
          );
    const intent = pauseIntent(
      value.pauseIntent,
      value.paused === false ? "none" : "manual",
    );
    const stamp = iso(clock);
    return transaction(() => {
      const profile = db
        .prepare(
          "SELECT platform_id FROM account_profiles WHERE account_profile_id=?",
        )
        .get(accountProfileId);
      if (!profile) throw fail("ACCOUNT_PROFILE_NOT_FOUND");
      if (profile.platform_id !== platformId)
        throw fail("ACCOUNT_PROFILE_PLATFORM_MISMATCH");
      try {
        db.prepare(
          "INSERT INTO submission_queue_groups(queue_group_id,platform_id,account_profile_id,pause_intent,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        ).run(
          queueGroupId,
          platformId,
          accountProfileId,
          intent,
          1,
          stamp,
          stamp,
        );
      } catch (error) {
        if (String((error && error.code) || "").startsWith("SQLITE_CONSTRAINT"))
          throw fail("OPERATIONAL_QUEUE_GROUP_EXISTS");
        throw error;
      }
      return queueGroupRow(
        db
          .prepare(
            "SELECT * FROM submission_queue_groups WHERE queue_group_id=?",
          )
          .get(queueGroupId),
      );
    });
  }

  function setSubmissionQueueGroupPause(input) {
    open();
    const value = input || {};
    const queueGroupId = requiredText(
      value.queueGroupId,
      128,
      "OPERATIONAL_QUEUE_GROUP_ID_INVALID",
    );
    const intent = pauseIntent(
      value.pauseIntent,
      value.paused === false ? "none" : "manual",
    );
    const stamp = iso(clock);
    return transaction(() => {
      const changed = db
        .prepare(
          "UPDATE submission_queue_groups SET pause_intent=?,revision=revision+1,updated_at=? WHERE queue_group_id=?",
        )
        .run(intent, stamp, queueGroupId).changes;
      if (changed !== 1) throw fail("OPERATIONAL_QUEUE_GROUP_NOT_FOUND");
      return queueGroupRow(
        db
          .prepare(
            "SELECT * FROM submission_queue_groups WHERE queue_group_id=?",
          )
          .get(queueGroupId),
      );
    });
  }

  function listSubmissionQueueGroups() {
    open();
    return Object.freeze(
      db
        .prepare(
          "SELECT * FROM submission_queue_groups ORDER BY platform_id,account_profile_id,queue_group_id LIMIT 20000",
        )
        .all()
        .map(queueGroupRow),
    );
  }

  function enqueueSubmissionQueueItem(input) {
    open();
    const value = input || {};
    const itemId = requiredText(
      value.itemId,
      128,
      "OPERATIONAL_BATCH_ITEM_INVALID",
    );
    const queueGroupId = requiredText(
      value.queueGroupId,
      128,
      "OPERATIONAL_QUEUE_GROUP_ID_INVALID",
    );
    const stamp = iso(clock);
    return transaction(() => {
      const item = db
        .prepare(
          "SELECT item_id,batch_id,article_id,target_key,status FROM submission_items WHERE item_id=?",
        )
        .get(itemId);
      if (!item) throw fail("OPERATIONAL_BATCH_ITEM_NOT_FOUND");
      if (item.status !== "queued")
        throw fail("OPERATIONAL_QUEUE_ITEM_STATUS_INVALID");
      const group = db
        .prepare(
          "SELECT platform_id,account_profile_id FROM submission_queue_groups WHERE queue_group_id=?",
        )
        .get(queueGroupId);
      if (!group) throw fail("OPERATIONAL_QUEUE_GROUP_NOT_FOUND");
      const expectedTarget = `platform:${group.platform_id}:account:${group.account_profile_id}`;
      if (item.target_key !== expectedTarget)
        throw fail("OPERATIONAL_QUEUE_ITEM_TARGET_MISMATCH");
      const existing = db
        .prepare("SELECT * FROM submission_queue_items WHERE item_id=?")
        .get(itemId);
      if (existing) {
        if (existing.queue_group_id !== queueGroupId)
          throw fail("OPERATIONAL_QUEUE_ITEM_CONFLICT");
        return Object.freeze({
          itemId,
          queueGroupId,
          position: existing.position,
          idempotent: true,
        });
      }
      const requested = value.position;
      const position =
        requested === undefined
          ? db
              .prepare(
                "SELECT COALESCE(MAX(position),0)+1 position FROM submission_queue_items WHERE queue_group_id=?",
              )
              .get(queueGroupId).position
          : requested;
      if (!Number.isSafeInteger(position) || position < 1)
        throw fail("OPERATIONAL_QUEUE_POSITION_INVALID");
      try {
        db.prepare(
          "INSERT INTO submission_queue_items(item_id,queue_group_id,position,created_at) VALUES(?,?,?,?)",
        ).run(itemId, queueGroupId, position, stamp);
      } catch (error) {
        if (String((error && error.code) || "").startsWith("SQLITE_CONSTRAINT"))
          throw fail("OPERATIONAL_QUEUE_POSITION_CONFLICT");
        throw error;
      }
      return Object.freeze({
        itemId,
        batchId: item.batch_id,
        articleId: item.article_id,
        queueGroupId,
        position,
        status: item.status,
        idempotent: false,
      });
    });
  }

  function listSubmissionQueueItems(input) {
    open();
    const value = input || {};
    const clauses = [];
    const params = [];
    if (value.queueGroupId !== undefined) {
      clauses.push("q.queue_group_id=?");
      params.push(
        requiredText(
          value.queueGroupId,
          128,
          "OPERATIONAL_QUEUE_GROUP_ID_INVALID",
        ),
      );
    }
    if (Array.isArray(value.articleIds) && value.articleIds.length) {
      const ids = value.articleIds.map((id) =>
        domain.ArticleId.serialize(domain.ArticleId.parse(id)),
      );
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
        .map((row) =>
          Object.freeze({
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
          }),
        ),
    );
  }

  function regularTarget(input) {
    let target;
    try {
      target = domain.parsePublicationTarget(input);
    } catch (_) {
      throw fail("REGULAR_QUEUE_TARGET_INVALID");
    }
    if (target.kind !== "platform")
      throw fail("REGULAR_QUEUE_PLATFORM_REQUIRED");
    return target;
  }

  function regularSnapshot(input) {
    const value = input || {};
    const snapshot = value.publicationSnapshot;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
      throw fail("REGULAR_QUEUE_SNAPSHOT_INVALID");
    if (
      typeof snapshot.articleId !== "string" ||
      typeof snapshot.title !== "string" ||
      typeof snapshot.body !== "string" ||
      !FINGERPRINT.test(snapshot.fingerprint) ||
      snapshot.title.trim() === "" ||
      snapshot.body.trim() === "" ||
      snapshot.title.length > 256 ||
      snapshot.body.length > 200000 ||
      /[\x00-\x1f\x7f]/.test(snapshot.title) ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(snapshot.body)
    )
      throw fail("REGULAR_QUEUE_SNAPSHOT_INVALID");
    return Object.freeze({
      articleId: domain.ArticleId.serialize(
        domain.ArticleId.parse(snapshot.articleId),
      ),
      title: snapshot.title.trim(),
      body: snapshot.body,
      fingerprint: snapshot.fingerprint,
    });
  }

  function regularBatchId(input) {
    const value = input || {};
    if (value.batchId === undefined) return `regular-batch-${randomUUID()}`;
    return domain.BatchId.serialize(domain.BatchId.parse(value.batchId));
  }

  function regularItemId(input) {
    const value = input || {};
    if (value.itemId === undefined) return randomUUID();
    return requiredText(value.itemId, 128, "REGULAR_QUEUE_ITEM_INVALID");
  }

  function regularGroup(input, target, stamp) {
    const value = input || {};
    const queueConfig =
      value.queueConfig === undefined ? {} : value.queueConfig;
    if (
      !queueConfig ||
      typeof queueConfig !== "object" ||
      Array.isArray(queueConfig)
    )
      throw fail("REGULAR_QUEUE_CONFIG_INVALID");
    for (const key of Object.keys(queueConfig))
      if (key !== "queueGroupId") throw fail("REGULAR_QUEUE_CONFIG_INVALID");
    const requestedId =
      queueConfig.queueGroupId === undefined
        ? undefined
        : requiredText(
            queueConfig.queueGroupId,
            128,
            "OPERATIONAL_QUEUE_GROUP_ID_INVALID",
          );
    const accountProfileId = target.accountProfileId;
    const profile = db
      .prepare(
        "SELECT platform_id FROM account_profiles WHERE account_profile_id=?",
      )
      .get(accountProfileId);
    if (!profile) throw fail("ACCOUNT_PROFILE_NOT_FOUND");
    if (profile.platform_id !== target.platformId)
      throw fail("ACCOUNT_PROFILE_PLATFORM_MISMATCH");
    const existing = db
      .prepare(
        "SELECT * FROM submission_queue_groups WHERE platform_id=? AND account_profile_id=?",
      )
      .get(target.platformId, accountProfileId);
    if (existing) {
      if (requestedId !== undefined && existing.queue_group_id !== requestedId)
        throw fail("REGULAR_QUEUE_GROUP_CONFLICT");
      return existing;
    }
    const queueGroupId = requestedId || `queue-group-${randomUUID()}`;
    try {
      db.prepare(
        "INSERT INTO submission_queue_groups(queue_group_id,platform_id,account_profile_id,pause_intent,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
      ).run(
        queueGroupId,
        target.platformId,
        accountProfileId,
        "manual",
        1,
        stamp,
        stamp,
      );
    } catch (error) {
      if (String((error && error.code) || "").startsWith("SQLITE_CONSTRAINT")) {
        const raced = db
          .prepare(
            "SELECT * FROM submission_queue_groups WHERE platform_id=? AND account_profile_id=?",
          )
          .get(target.platformId, accountProfileId);
        if (
          raced &&
          (requestedId === undefined || raced.queue_group_id === requestedId)
        )
          return raced;
        throw fail("REGULAR_QUEUE_GROUP_CONFLICT");
      }
      throw error;
    }
    return db
      .prepare("SELECT * FROM submission_queue_groups WHERE queue_group_id=?")
      .get(queueGroupId);
  }

  function regularItemRow(input) {
    const value = input || {};
    if (
      typeof value.articleId !== "string" ||
      typeof value.publicationId !== "string" ||
      typeof value.attemptId !== "string" ||
      typeof value.target !== "object" ||
      !value.target
    )
      throw fail("REGULAR_QUEUE_ADMISSION_INVALID");
    if (typeof value.clientId !== "string" || !value.clientId.trim())
      throw fail("REGULAR_QUEUE_ARTICLE_IDENTITY_INVALID");
    const target = regularTarget(value.target);
    const articleId = domain.ArticleId.serialize(
      domain.ArticleId.parse(value.articleId),
    );
    const publicationId = domain.PublicationId.serialize(
      domain.PublicationId.parse(value.publicationId),
    );
    const attemptId = domain.AttemptId.serialize(
      domain.AttemptId.parse(value.attemptId),
    );
    const batchId = regularBatchId(value);
    const itemId = regularItemId(value);
    const snapshot = regularSnapshot(value);
    if (snapshot.articleId !== articleId)
      throw fail("REGULAR_QUEUE_SNAPSHOT_INVALID");
    return {
      target,
      articleId,
      publicationId,
      attemptId,
      batchId,
      itemId,
      snapshot,
      clientId: value.clientId.trim(),
      articleRef: value.articleRef || {
        clientId: value.clientId.trim(),
        articleId,
      },
      queueConfig: value.queueConfig,
      payload:
        value.payload &&
        typeof value.payload === "object" &&
        !Array.isArray(value.payload)
          ? value.payload
          : {},
    };
  }

  function existingRegularAdmission(dbHandle, articleId, targetKey, snapshot) {
    const active = dbHandle
      .prepare(
        "SELECT article_id,publication_id,attempt_id,target_key,state FROM article_active_targets WHERE article_id=?",
      )
      .get(articleId);
    if (active) {
      if (active.target_key !== targetKey)
        throw fail("PUBLICATION_TARGET_CONFLICT");
      if (active.state !== "queued") throw fail("PUBLICATION_DUPLICATE");
      const row = dbHandle
        .prepare(
          "SELECT s.item_id,s.batch_id,s.payload_json,q.queue_group_id,q.position FROM submission_items s JOIN submission_queue_items q ON q.item_id=s.item_id WHERE s.item_id=? AND s.article_id=? AND s.target_key=? AND s.status='queued'",
        )
        .get(
          dbHandle
            .prepare(
              "SELECT item_id FROM submission_queue_items WHERE item_id IN (SELECT item_id FROM submission_items WHERE article_id=? AND target_key=? AND status='queued') ORDER BY item_id LIMIT 1",
            )
            .get(articleId, targetKey)?.item_id || "",
          articleId,
          targetKey,
        );
      if (!row || row.payload_json === undefined)
        throw fail("REGULAR_QUEUE_FACT_CONFLICT");
      const payload = fromText(row.payload_json) || {};
      const existingSnapshot = payload.publicationSnapshot;
      if (
        !existingSnapshot ||
        existingSnapshot.fingerprint !== snapshot.fingerprint
      )
        throw fail("REGULAR_QUEUE_FACT_CONFLICT");
      return Object.freeze({
        itemId: row.item_id,
        batchId: row.batch_id,
        articleId,
        publicationId: active.publication_id,
        attemptId: active.attempt_id,
        targetKey,
        queueGroupId: row.queue_group_id,
        position: row.position,
        status: "queued",
        idempotent: true,
      });
    }
    const legacy = dbHandle
      .prepare(
        "SELECT item_id,status FROM submission_items WHERE article_id=? AND target_key=? AND status IN('queued','claimed','submitting','submitted','reserving','uncertain') LIMIT 1",
      )
      .get(articleId, targetKey);
    if (legacy) throw fail("REGULAR_QUEUE_FACT_CONFLICT");
    return null;
  }

  function admitRegularQueueItem(input) {
    open();
    const item = regularItemRow(input);
    const targetKey = domain.publicationTargetKey(item.target);
    const stamp = iso(clock);
    return transaction(() => {
      const existing = existingRegularAdmission(
        db,
        item.articleId,
        targetKey,
        item.snapshot,
      );
      if (existing) return existing;
      try {
        db.prepare("INSERT INTO submission_batches VALUES(?,?,?,?,?)").run(
          item.batchId,
          "queued",
          1,
          stamp,
          stamp,
        );
      } catch (error) {
        const code = String((error && error.code) || "");
        const message = String((error && error.message) || "");
        if (
          !code.startsWith("SQLITE_CONSTRAINT") &&
          !message.includes(
            "UNIQUE constraint failed: submission_batches.batch_id",
          )
        )
          throw error;
        const existingBatch = db
          .prepare("SELECT status FROM submission_batches WHERE batch_id=?")
          .get(item.batchId);
        if (!existingBatch || existingBatch.status === "cancelled")
          throw fail("REGULAR_QUEUE_BATCH_CONFLICT");
      }
      const group = regularGroup(item, item.target, stamp);
      const payload = Object.assign({}, item.payload || {}, {
        clientId: item.clientId,
        sourcePlatformId: item.target.platformId,
        targetPlatformId: item.target.platformId,
        accountProfileId: item.target.accountProfileId,
        publicationSnapshot: item.snapshot,
        publicationId: item.publicationId,
        attemptId: item.attemptId,
      });
      rejectSensitive(payload);
      const oldPublication = db
        .prepare(
          "SELECT status FROM publication_records WHERE article_id=? AND target_key=?",
        )
        .get(item.articleId, targetKey);
      if (oldPublication)
        throw fail(
          oldPublication.status === "uncertain"
            ? "PUBLICATION_UNCERTAIN"
            : "PUBLICATION_DUPLICATE",
        );
      const batchItem = db
        .prepare("SELECT item_id FROM submission_items WHERE item_id=?")
        .get(item.itemId);
      if (batchItem) throw fail("REGULAR_QUEUE_ITEM_CONFLICT");
      db.prepare("INSERT INTO publication_records VALUES(?,?,?,?,?,?,?)").run(
        item.publicationId,
        item.articleId,
        targetKey,
        text(item.target),
        "queued",
        stamp,
        stamp,
      );
      db.prepare("INSERT INTO publication_attempts VALUES(?,?,?,?,?)").run(
        item.attemptId,
        item.publicationId,
        "queued",
        stamp,
        null,
      );
      db.prepare("INSERT INTO recovery_intents VALUES(?,?,?,?,?,?)").run(
        randomUUID(),
        item.attemptId,
        "resolved",
        text({
          submission: {
            batchItemId: item.itemId,
            postProcessingPayload: { articleRef: item.articleRef || null },
          },
          detail: { phase: "admitted" },
        }),
        stamp,
        stamp,
      );
      db.prepare("INSERT INTO submission_items VALUES(?,?,?,?,?,?,?,?,?)").run(
        item.itemId,
        item.batchId,
        item.articleId,
        targetKey,
        1,
        "queued",
        null,
        null,
        text(payload),
      );
      const position = db
        .prepare(
          "SELECT COALESCE(MAX(position),0)+1 position FROM submission_queue_items WHERE queue_group_id=?",
        )
        .get(group.queue_group_id).position;
      db.prepare(
        "INSERT INTO submission_queue_items(item_id,queue_group_id,position,created_at) VALUES(?,?,?,?)",
      ).run(item.itemId, group.queue_group_id, position, stamp);
      const active = db
        .prepare(
          "INSERT INTO article_active_targets(article_id,publication_id,attempt_id,target_key,target_json,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(
          item.articleId,
          item.publicationId,
          item.attemptId,
          targetKey,
          text(item.target),
          "queued",
          stamp,
          stamp,
        );
      if (!active) throw fail("REGULAR_QUEUE_ADMISSION_FAILED");
      return Object.freeze({
        itemId: item.itemId,
        batchId: item.batchId,
        articleId: item.articleId,
        publicationId: item.publicationId,
        attemptId: item.attemptId,
        targetKey,
        queueGroupId: group.queue_group_id,
        position,
        status: "queued",
        idempotent: false,
      });
    });
  }

  function removePendingQueueItem(input) {
    open();
    const value = input || {};
    if (
      typeof value.itemId !== "string" ||
      !value.itemId ||
      typeof value.batchId !== "string" ||
      !value.batchId ||
      typeof value.articleId !== "string" ||
      !value.articleId
    )
      throw fail("REGULAR_QUEUE_REMOVAL_INVALID");
    const itemId = requiredText(
      value.itemId,
      128,
      "REGULAR_QUEUE_ITEM_INVALID",
    );
    const batchId = domain.BatchId.serialize(
      domain.BatchId.parse(value.batchId),
    );
    const articleId = domain.ArticleId.serialize(
      domain.ArticleId.parse(value.articleId),
    );
    const stamp = iso(clock);
    return transaction(() => {
      const row = db
        .prepare(
          "SELECT s.item_id,s.batch_id,s.article_id,s.target_key,s.status,s.claim_token,s.payload_json,q.queue_group_id,q.position,p.publication_id,p.status publication_status,a.attempt_id,a.status attempt_status FROM submission_items s LEFT JOIN submission_queue_items q ON q.item_id=s.item_id LEFT JOIN publication_records p ON p.article_id=s.article_id AND p.target_key=s.target_key LEFT JOIN publication_attempts a ON a.publication_id=p.publication_id WHERE s.item_id=? AND s.batch_id=?",
        )
        .get(itemId, batchId);
      if (!row) throw fail("REGULAR_QUEUE_ITEM_NOT_FOUND");
      if (row.article_id !== articleId)
        throw fail("REGULAR_QUEUE_ITEM_CONFLICT");
      if (row.status === "cancelled" && !row.queue_group_id)
        return Object.freeze({
          itemId,
          batchId,
          articleId,
          status: "cancelled",
          idempotent: true,
        });
      if (row.status !== "queued" || row.claim_token || !row.queue_group_id)
        throw fail("REGULAR_QUEUE_ITEM_NOT_REMOVABLE");
      if (
        row.publication_status !== "queued" ||
        row.attempt_status !== "queued"
      )
        throw fail("REGULAR_QUEUE_ITEM_NOT_REMOVABLE");
      const active = db
        .prepare(
          "SELECT publication_id,attempt_id,target_key,state FROM article_active_targets WHERE article_id=?",
        )
        .get(articleId);
      if (
        !active ||
        active.publication_id !== row.publication_id ||
        active.attempt_id !== row.attempt_id ||
        active.target_key !== row.target_key ||
        active.state !== "queued"
      )
        throw fail("REGULAR_QUEUE_FACT_CONFLICT");
      const evidence = db
        .prepare(
          "SELECT (SELECT COUNT(*) FROM remote_evidence WHERE attempt_id=?) + (SELECT COUNT(*) FROM remote_orders WHERE attempt_id=?) count",
        )
        .get(row.attempt_id, row.attempt_id).count;
      if (evidence !== 0) throw fail("REGULAR_QUEUE_ITEM_NOT_REMOVABLE");
      const payload = Object.assign({}, fromText(row.payload_json) || {}, {
        cancelledAt: stamp,
        ...(typeof value.operationId === "string" && value.operationId
          ? { removalOperationId: value.operationId }
          : {}),
      });
      const cancellationResolution = {
        status: "cancelled",
        reasonCode: "REGULAR_QUEUE_ITEM_CANCELLED",
        batchId,
        itemId,
        articleId,
        targetKey: row.target_key,
        cancelledAt: stamp,
        ...(typeof value.operationId === "string" && value.operationId
          ? { operationId: value.operationId }
          : {}),
      };
      const cancellationIntent = {
        submission: {
          batchItemId: itemId,
          postProcessingPayload: { articleRef: value.articleRef || null },
        },
        detail: { resolution: cancellationResolution },
      };
      rejectSensitive(cancellationIntent);
      db.prepare(
        "UPDATE submission_items SET status='cancelled',claim_token=NULL,claim_until=NULL,revision=revision+1,payload_json=? WHERE item_id=? AND status='queued'",
      ).run(text(payload), itemId);
      db.prepare("DELETE FROM submission_queue_items WHERE item_id=?").run(
        itemId,
      );
      db.prepare(
        "DELETE FROM article_active_targets WHERE article_id=? AND publication_id=? AND attempt_id=?",
      ).run(articleId, row.publication_id, row.attempt_id);
      const intentChanged = db
        .prepare(
          "UPDATE recovery_intents SET state='resolved',payload_json=?,updated_at=? WHERE attempt_id=?",
        )
        .run(text(cancellationIntent), stamp, row.attempt_id).changes;
      if (intentChanged !== 1) throw fail("REGULAR_QUEUE_FACT_CONFLICT");
      const attemptChanged = db
        .prepare(
          "UPDATE publication_attempts SET finished_at=? WHERE attempt_id=? AND status='queued'",
        )
        .run(stamp, row.attempt_id).changes;
      if (attemptChanged !== 1) throw fail("REGULAR_QUEUE_FACT_CONFLICT");
      const publicationChanged = db
        .prepare(
          "UPDATE publication_records SET updated_at=? WHERE publication_id=? AND status='queued'",
        )
        .run(stamp, row.publication_id).changes;
      if (publicationChanged !== 1) throw fail("REGULAR_QUEUE_FACT_CONFLICT");
      const remaining = db
        .prepare(
          "SELECT COUNT(*) count FROM submission_items WHERE batch_id=? AND status!='cancelled'",
        )
        .get(batchId).count;
      if (remaining === 0)
        db.prepare(
          "UPDATE submission_batches SET status='cancelled',revision=revision+1,updated_at=? WHERE batch_id=?",
        ).run(stamp, batchId);
      return Object.freeze({
        itemId,
        batchId,
        articleId,
        publicationId: row.publication_id,
        attemptId: row.attempt_id,
        targetKey: row.target_key,
        status: "cancelled",
        idempotent: false,
      });
    });
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
    const batchId = domain.BatchId.serialize(
      domain.BatchId.parse(value.batchId),
    );
    const mediaResourceId = domain.MediaResourceId.serialize(
      domain.MediaResourceId.parse(value.mediaResourceId),
    );
    const fingerprint = requiredText(
      value.confirmationFingerprint,
      512,
      "OPERATIONAL_CONFIRMATION_FINGERPRINT_INVALID",
    );
    const systemSubmissionCode = requiredText(
      value.systemSubmissionCode,
      128,
      "OPERATIONAL_SYSTEM_SUBMISSION_CODE_REQUIRED",
    );
    const confirmation =
      value.confirmation === undefined ? {} : value.confirmation;
    if (
      !confirmation ||
      typeof confirmation !== "object" ||
      Array.isArray(confirmation)
    )
      throw fail("OPERATIONAL_CONFIRMATION_INVALID");
    rejectSensitive(confirmation);
    if (text(confirmation).length > 32768)
      throw fail("OPERATIONAL_CONFIRMATION_INVALID");
    const quotedPrice = value.quotedPrice;
    const estimatedTotal =
      value.estimatedTotal === undefined
        ? value.expectedTotal
        : value.estimatedTotal;
    if (
      ![quotedPrice, estimatedTotal].every(
        (number) =>
          typeof number === "number" &&
          Number.isFinite(number) &&
          number >= 0 &&
          number <= 100000000,
      )
    )
      throw fail("OPERATIONAL_CONFIRMATION_PRICE_INVALID");
    const stamp = iso(clock);
    return transaction(() => {
      const batch = db
        .prepare("SELECT batch_id FROM submission_batches WHERE batch_id=?")
        .get(batchId);
      if (!batch) throw fail("OPERATIONAL_BATCH_NOT_FOUND");
      const count = db
        .prepare(
          "SELECT COUNT(*) count FROM submission_items WHERE batch_id=? AND target_key=?",
        )
        .get(batchId, `media-resource:${mediaResourceId}`).count;
      const total = db
        .prepare("SELECT COUNT(*) count FROM submission_items WHERE batch_id=?")
        .get(batchId).count;
      const articleCount =
        value.articleCount === undefined ? count : value.articleCount;
      if (
        total !== count ||
        !Number.isSafeInteger(articleCount) ||
        articleCount < 1 ||
        articleCount !== count
      )
        throw fail("OPERATIONAL_CONFIRMATION_ARTICLE_COUNT_INVALID");
      const existing = db
        .prepare("SELECT * FROM paid_submission_batches WHERE batch_id=?")
        .get(batchId);
      if (existing) {
        if (existing.confirmation_fingerprint !== fingerprint)
          throw fail("OPERATIONAL_PAID_BATCH_CONFLICT");
        return paidBatchRow(existing, true);
      }
      try {
        db.prepare(
          "INSERT INTO paid_submission_batches(batch_id,media_resource_id,confirmation_fingerprint,confirmation_json,system_submission_code,quoted_price,estimated_total,article_count,pause_intent,created_at,confirmed_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        ).run(
          batchId,
          mediaResourceId,
          fingerprint,
          text(confirmation),
          systemSubmissionCode,
          quotedPrice,
          estimatedTotal,
          articleCount,
          "manual",
          stamp,
          stamp,
          stamp,
        );
      } catch (error) {
        if (String((error && error.code) || "").startsWith("SQLITE_CONSTRAINT"))
          throw fail("OPERATIONAL_PAID_BATCH_CONFLICT");
        throw error;
      }
      return paidBatchRow(
        db
          .prepare("SELECT * FROM paid_submission_batches WHERE batch_id=?")
          .get(batchId),
        false,
      );
    });
  }

  function getPaidSubmissionBatch(input) {
    open();
    const batchId = domain.BatchId.serialize(
      domain.BatchId.parse(
        typeof input === "string" ? input : input && input.batchId,
      ),
    );
    const row = db
      .prepare("SELECT * FROM paid_submission_batches WHERE batch_id=?")
      .get(batchId);
    if (!row) throw fail("OPERATIONAL_PAID_BATCH_NOT_FOUND");
    return paidBatchRow(row);
  }

  function listPaidSubmissionBatches() {
    open();
    return Object.freeze(
      db
        .prepare(
          "SELECT * FROM paid_submission_batches ORDER BY created_at DESC,batch_id DESC LIMIT 20000",
        )
        .all()
        .map(paidBatchRow),
    );
  }

  function setPaidSubmissionBatchPause(input) {
    open();
    const value = input || {};
    const batchId = domain.BatchId.serialize(
      domain.BatchId.parse(value.batchId),
    );
    const intent = pauseIntent(
      value.pauseIntent,
      value.paused === false ? "none" : "manual",
    );
    const stamp = iso(clock);
    return transaction(() => {
      const changed = db
        .prepare(
          "UPDATE paid_submission_batches SET pause_intent=?,updated_at=? WHERE batch_id=?",
        )
        .run(intent, stamp, batchId).changes;
      if (changed !== 1) throw fail("OPERATIONAL_PAID_BATCH_NOT_FOUND");
      return paidBatchRow(
        db
          .prepare("SELECT * FROM paid_submission_batches WHERE batch_id=?")
          .get(batchId),
      );
    });
  }

  return Object.freeze({
    createSubmissionQueueGroup,
    setSubmissionQueueGroupPause,
    listSubmissionQueueGroups,
    enqueueSubmissionQueueItem,
    listSubmissionQueueItems,
    admitRegularQueueItem,
    removePendingQueueItem,
    createPaidSubmissionBatch,
    getPaidSubmissionBatch,
    listPaidSubmissionBatches,
    setPaidSubmissionBatchPause,
  });
}

module.exports = { createOperationalStoreQueueAggregate };
