const domain = require("../../../domain");

const {
  canonicalDisplayPrice,
  fromText,
  rejectSensitive,
  safeDisplayText,
  text,
} = require("./operational-store-utils");

function publicationIntentPayload(context, detail) {
  if (!context) return detail === undefined ? null : detail;
  return {
    submission: context,
    detail: detail === undefined ? null : detail,
  };
}

function parsePublicationIntentPayload(value) {
  const parsed = fromText(value);
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    parsed.submission &&
    typeof parsed.submission === "object" &&
    !Array.isArray(parsed.submission)
  )
    return { context: parsed.submission, detail: parsed.detail };
  return { context: null, detail: parsed };
}

function createPublicationAggregate(context) {
  const { db, open, transaction, clock, randomUUID, fail, iso } = context;

  function submissionContext(input) {
    const value = input || {};
    if (
      value.batchItemId === undefined &&
      value.postProcessingPayload === undefined
    )
      return null;
    if (
      value.batchItemId !== undefined &&
      (typeof value.batchItemId !== "string" || !value.batchItemId)
    )
      throw fail("OPERATIONAL_BATCH_ITEM_INVALID");
    const postProcessingPayload =
      value.postProcessingPayload === undefined
        ? {}
        : value.postProcessingPayload;
    rejectSensitive(postProcessingPayload);
    return {
      ...(value.batchItemId !== undefined
        ? { batchItemId: value.batchItemId }
        : {}),
      postProcessingPayload,
    };
  }

  function refreshSubmissionBatchStatus(dbHandle, batchId, stamp) {
    const rows = dbHandle
      .prepare("SELECT status FROM submission_items WHERE batch_id=?")
      .all(batchId);
    if (!rows.length) return;
    const statuses = rows.map((row) => row.status);
    let status = "queued";
    if (statuses.some((value) => ["queued", "claimed"].includes(value))) {
      status = "queued";
    } else if (statuses.some((value) => ["failed", "failed-cleaned"].includes(value))) {
      status = "failed";
    } else if (
      statuses.every((value) =>
        ["cancelled", "cancelled-cleaned", "completed", "published-cleaned"].includes(value),
      )
    ) {
      status = statuses.some((value) => ["completed", "published-cleaned"].includes(value))
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

  function createAccountProfile(input) {
    open();
    const value = input || {};
    if (Object.prototype.hasOwnProperty.call(value, "accountProfileId"))
      throw fail("ACCOUNT_PROFILE_ID_SYSTEM_ASSIGNED");
    if (
      typeof value.platformId !== "string" ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(value.platformId)
    )
      throw fail("ACCOUNT_PROFILE_PLATFORM_INVALID");
    if (
      typeof value.displayName !== "string" ||
      !value.displayName.trim() ||
      value.displayName.trim().length > 128
    )
      throw fail("ACCOUNT_PROFILE_DISPLAY_NAME_INVALID");
    const accountProfileId = `account-${randomUUID()}`;
    db.prepare(
      "INSERT INTO account_profiles(account_profile_id,platform_id,display_name,created_at) VALUES(?,?,?,?)",
    ).run(
      accountProfileId,
      value.platformId,
      value.displayName.trim(),
      iso(clock),
    );
    return Object.freeze({
      accountProfileId,
      platformId: value.platformId,
      displayName: value.displayName.trim(),
    });
  }

  function listAccountProfiles() {
    open();
    return Object.freeze(
      db
        .prepare(
          "SELECT account_profile_id,platform_id,display_name,created_at FROM account_profiles ORDER BY created_at,account_profile_id LIMIT 1000",
        )
        .all()
        .map((profile) =>
          Object.freeze({
            accountProfileId: profile.account_profile_id,
            platformId: profile.platform_id,
            displayName: profile.display_name,
            createdAt: profile.created_at,
          }),
        ),
    );
  }

  function assertExecutableAccountProfile(input) {
    open();
    const value = input || {};
    const accountProfileId = domain.AccountProfileId.serialize(
      domain.AccountProfileId.parse(value.accountProfileId),
    );
    if (
      typeof value.platformId !== "string" ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(value.platformId)
    )
      throw fail("ACCOUNT_PROFILE_PLATFORM_INVALID");
    const profile = db
      .prepare(
        "SELECT account_profile_id,platform_id,display_name FROM account_profiles WHERE account_profile_id=?",
      )
      .get(accountProfileId);
    if (!profile) throw fail("ACCOUNT_PROFILE_NOT_FOUND");
    if (profile.platform_id !== value.platformId)
      throw fail("ACCOUNT_PROFILE_PLATFORM_MISMATCH");
    return Object.freeze({
      accountProfileId: profile.account_profile_id,
      platformId: profile.platform_id,
      displayName: profile.display_name,
    });
  }

  function reservePublicationTarget(input) {
    open();
    const value = input || {};
    const submission = submissionContext(value);
    const articleId = domain.ArticleId.serialize(
        domain.ArticleId.parse(value.articleId),
      ),
      target = domain.parsePublicationTarget(value.target),
      targetKey = domain.publicationTargetKey(target),
      publicationId = domain.PublicationId.serialize(
        domain.PublicationId.parse(value.publicationId),
      ),
      attemptId = domain.AttemptId.serialize(
        domain.AttemptId.parse(value.attemptId),
      ),
      stamp = iso(clock);
    return transaction(() => {
      const old = db
        .prepare(
          "SELECT status FROM publication_records WHERE article_id=? AND target_key=?",
        )
        .get(articleId, targetKey);
      if (old)
        throw fail(
          old.status === "uncertain"
            ? "PUBLICATION_UNCERTAIN"
            : "PUBLICATION_DUPLICATE",
        );
      db.prepare("INSERT INTO publication_records VALUES(?,?,?,?,?,?,?)").run(
        publicationId,
        articleId,
        targetKey,
        text(target),
        "queued",
        stamp,
        stamp,
      );
      db.prepare("INSERT INTO publication_attempts VALUES(?,?,?,?,?)").run(
        attemptId,
        publicationId,
        "queued",
        stamp,
        null,
      );
      db.prepare("INSERT INTO recovery_intents VALUES(?,?,?,?,?,?)").run(
        randomUUID(),
        attemptId,
        "remote_started",
        text(publicationIntentPayload(submission)),
        stamp,
        stamp,
      );
      return { publicationId, attemptId, targetKey, status: "queued" };
    });
  }

  function commitRemoteOutcome(input) {
    open();
    const value = input || {};
    const attemptId = domain.AttemptId.serialize(
      domain.AttemptId.parse(value.attemptId),
    );
    const outcome = value.outcome;
    if (
      !outcome ||
      !["published", "submitted", "failed", "uncertain"].includes(
        outcome.status,
      )
    )
      throw fail("OPERATIONAL_OUTCOME_INVALID");
    if (
      value.batchClaimToken !== undefined &&
      (typeof value.batchClaimToken !== "string" || !value.batchClaimToken)
    )
      throw fail("OPERATIONAL_CLAIM_INVALID");
    rejectSensitive(outcome);
    rejectSensitive(value.postProcessingPayload || {});
    const stamp = iso(clock);
    return transaction(() => {
      const attempt = db
        .prepare(
          "SELECT a.publication_id,p.article_id,p.target_key,p.target_json,i.payload_json AS intent_payload FROM publication_attempts a JOIN publication_records p ON p.publication_id=a.publication_id JOIN recovery_intents i ON i.attempt_id=a.attempt_id WHERE a.attempt_id=?",
        )
        .get(attemptId);
      if (!attempt) throw fail("OPERATIONAL_ATTEMPT_NOT_FOUND");
      const persisted = parsePublicationIntentPayload(
        attempt.intent_payload,
      );
      const persistedSubmission = persisted.context || {};
      const batchItemId =
        value.batchItemId !== undefined
          ? value.batchItemId
          : persistedSubmission.batchItemId;
      const postProcessingPayload =
        value.postProcessingPayload !== undefined
          ? value.postProcessingPayload
          : persistedSubmission.postProcessingPayload || {};
      if (
        batchItemId !== undefined &&
        (typeof batchItemId !== "string" || !batchItemId)
      )
        throw fail("OPERATIONAL_BATCH_ITEM_INVALID");
      const submission =
        batchItemId !== undefined || value.postProcessingPayload !== undefined
          ? {
              ...(batchItemId !== undefined ? { batchItemId } : {}),
              postProcessingPayload,
            }
          : persisted.context;
      rejectSensitive(postProcessingPayload);
      db.prepare(
        "UPDATE publication_attempts SET status=?,finished_at=? WHERE attempt_id=?",
      ).run(outcome.status, stamp, attemptId);
      db.prepare(
        "UPDATE publication_records SET status=?,updated_at=? WHERE publication_id=?",
      ).run(outcome.status, stamp, attempt.publication_id);
      if (outcome.evidence)
        db.prepare("INSERT INTO remote_evidence VALUES(?,?,?,?,?,?)").run(
          randomUUID(),
          attemptId,
          outcome.evidence.remoteId,
          outcome.evidence.remoteUrl || null,
          text(outcome.evidence),
          stamp,
        );
      const target = fromText(attempt.target_json);
      if (outcome.evidence && target && target.kind === "media")
        db.prepare("INSERT OR IGNORE INTO remote_orders VALUES(?,?,?,?,?)").run(
          outcome.evidence.remoteId,
          attemptId,
          outcome.evidence.remoteId,
          text(outcome.evidence),
          stamp,
        );
      if (batchItemId !== undefined) {
        const item = db
          .prepare(
            "SELECT batch_id,article_id,target_key,payload_json,claim_token FROM submission_items WHERE item_id=?",
          )
          .get(batchItemId);
        if (!item) throw fail("OPERATIONAL_BATCH_ITEM_NOT_FOUND");
        if (
          value.batchClaimToken !== undefined &&
          item.claim_token !== value.batchClaimToken
        )
          throw fail("OPERATIONAL_CLAIM_CONFLICT");
        const itemPayload = fromText(item.payload_json) || {};
        if (
          item.article_id !== attempt.article_id ||
          item.target_key !== attempt.target_key ||
          (target &&
            target.kind === "media" &&
            itemPayload.attemptId !== attemptId) ||
          (itemPayload.attemptId !== undefined &&
            itemPayload.attemptId !== attemptId)
        )
          throw fail("OPERATIONAL_BATCH_ITEM_MISMATCH");
        const payload = Object.assign({}, itemPayload, postProcessingPayload, {
          attemptId,
          outcomeStatus: outcome.status,
          ...(outcome.evidence ? { remoteId: outcome.evidence.remoteId } : {}),
        });
        if (
          outcome.evidence &&
          (fromText(attempt.target_json) || {}).kind === "media"
        )
          db.prepare(
            "INSERT OR REPLACE INTO order_display_snapshots(attempt_id,title_snapshot,filename,resource_name_snapshot,quoted_price,created_at) VALUES(?,?,?,?,?,?)",
          ).run(
            attemptId,
            safeDisplayText(payload.titleSnapshot, 1000),
            safeDisplayText(payload.filename, 255),
            safeDisplayText(payload.resourceNameSnapshot, 500),
            canonicalDisplayPrice(payload.quotedPrice),
            stamp,
          );
        const itemStatus = ["published", "submitted"].includes(outcome.status)
          ? "completed"
          : "failed";
        const updateItem =
          value.batchClaimToken === undefined
            ? db.prepare(
                "UPDATE submission_items SET status=?,claim_token=NULL,claim_until=NULL,revision=revision+1,payload_json=? WHERE item_id=?",
              )
            : db.prepare(
                "UPDATE submission_items SET status=?,claim_token=NULL,claim_until=NULL,revision=revision+1,payload_json=? WHERE item_id=? AND claim_token=?",
              );
        const changed =
          value.batchClaimToken === undefined
            ? updateItem.run(itemStatus, text(payload), batchItemId).changes
            : updateItem.run(
                itemStatus,
                text(payload),
                batchItemId,
                value.batchClaimToken,
              ).changes;
        if (changed !== 1) throw fail("OPERATIONAL_CLAIM_CONFLICT");
        refreshSubmissionBatchStatus(db, item.batch_id, stamp);
      }
      db.prepare(
        "UPDATE recovery_intents SET state=?,payload_json=?,updated_at=? WHERE attempt_id=?",
      ).run(
        outcome.status === "uncertain" ? "manual_check" : "resolved",
        text(
          publicationIntentPayload(
            submission,
            outcome.error || outcome.evidence || null,
          ),
        ),
        stamp,
        attemptId,
      );
      if (outcome.status === "published")
        db.prepare(
          "INSERT INTO post_processing_jobs VALUES(?,?,?,?,?,?,?,?,?,?)",
        ).run(
          randomUUID(),
          attemptId,
          "archive",
          "queued",
          0,
          null,
          null,
          text(postProcessingPayload),
          stamp,
          stamp,
        );
      return { attemptId, status: outcome.status };
    });
  }

  function listPublicationRecords(input) {
    open();
    const value = input || {};
    const articleIds = Array.isArray(value.articleIds)
      ? value.articleIds.map((articleId) =>
          domain.ArticleId.serialize(domain.ArticleId.parse(articleId)),
        )
      : [];
    const publicationIds = Array.isArray(value.publicationIds)
      ? value.publicationIds.map((publicationId) =>
          domain.PublicationId.serialize(
            domain.PublicationId.parse(publicationId),
          ),
        )
      : [];
    if (!articleIds.length && !publicationIds.length)
      return Object.freeze([]);
    const clauses = [];
    const params = [];
    if (articleIds.length) {
      clauses.push(`article_id IN(${articleIds.map(() => "?").join(",")})`);
      params.push(...articleIds);
    }
    if (publicationIds.length) {
      clauses.push(
        `publication_id IN(${publicationIds.map(() => "?").join(",")})`,
      );
      params.push(...publicationIds);
    }
    const records = db
      .prepare(
        "SELECT publication_id,article_id,target_key,status,created_at,updated_at FROM publication_records WHERE " +
          clauses.map((clause) => `(${clause})`).join(" OR ") +
          " ORDER BY created_at",
      )
      .all(...params);
    return Object.freeze(
      records.map((record) => {
        const attempts = db
          .prepare(
            "SELECT attempt_id,status,created_at,finished_at FROM publication_attempts WHERE publication_id=? ORDER BY created_at",
          )
          .all(record.publication_id)
          .map((attempt) => {
            const evidence = db
              .prepare(
                "SELECT remote_id,remote_url,created_at FROM remote_evidence WHERE attempt_id=? ORDER BY created_at DESC LIMIT 1",
              )
              .get(attempt.attempt_id);
            return Object.freeze({
              attemptId: attempt.attempt_id,
              status: attempt.status,
              startedAt: attempt.created_at,
              finishedAt: attempt.finished_at,
              createdAt: attempt.created_at,
              updatedAt: attempt.finished_at || attempt.created_at,
              remoteId: (evidence && evidence.remote_id) || null,
              remoteUrl: (evidence && evidence.remote_url) || null,
            });
          });
        return Object.freeze({
          version: 1,
          publicationId: record.publication_id,
          clientId: null,
          articleId: record.article_id,
          articleKey: record.article_id,
          targetKey: record.target_key,
          status: record.status,
          createdAt: record.created_at,
          updatedAt: record.updated_at,
          attempts: Object.freeze(attempts),
        });
      }),
    );
  }

  return Object.freeze({
    createAccountProfile,
    listAccountProfiles,
    assertExecutableAccountProfile,
    reservePublicationTarget,
    commitRemoteOutcome,
    listPublicationRecords,
  });
}

module.exports = { createPublicationAggregate };
