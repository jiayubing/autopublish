const domain = require("../../../domain");

const {
  fromText,
  safeOperationalPayload,
  text,
} = require("./operational-store-utils");

const PLATFORM_ID = /^[a-z][a-z0-9-]{0,63}$/;
const PAUSE_INTENTS = new Set(["none", "manual", "system"]);
const PAUSE_REASON_CODE = /^[A-Z][A-Z0-9_]{0,127}$/;

function createRegularQueueRuntime(context) {
  const {
    db,
    open,
    transaction,
    clock,
    randomUUID,
    fail,
    iso,
    internalRegularQueueTransitionFault,
  } = context;
  function regularQueueFault(point, detail) {
    if (internalRegularQueueTransitionFault)
      internalRegularQueueTransitionFault(point, detail || {});
  }

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

  function safePauseReasonCode(value) {
    return typeof value === "string" && PAUSE_REASON_CODE.test(value)
      ? value
      : null;
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

  function regularQueueGroupRows(input) {
    const value = input || {};
    const params = [];
    let where = "";
    if (value.queueGroupId !== undefined) {
      where = "WHERE g.queue_group_id=?";
      params.push(
        requiredText(
          value.queueGroupId,
          128,
          "OPERATIONAL_QUEUE_GROUP_ID_INVALID",
        ),
      );
    }
    return db
      .prepare(
        "SELECT g.*,s.item_id current_item_id,s.batch_id current_batch_id,s.article_id current_article_id,s.claim_until current_claim_until,json_extract(s.payload_json,'$.attemptId') current_attempt_id,json_extract(i.payload_json,'$.detail.phase') current_phase,(SELECT json_extract(i2.payload_json,'$.detail.lastGroupBlockedCode') FROM submission_queue_items q2 JOIN submission_items s2 ON s2.item_id=q2.item_id JOIN recovery_intents i2 ON i2.attempt_id=json_extract(s2.payload_json,'$.attemptId') WHERE q2.queue_group_id=g.queue_group_id AND json_extract(i2.payload_json,'$.detail.lastGroupBlockedCode') IS NOT NULL ORDER BY q2.position LIMIT 1) last_group_blocked_code FROM submission_queue_groups g LEFT JOIN submission_queue_items q ON q.queue_group_id=g.queue_group_id LEFT JOIN submission_items s ON s.item_id=q.item_id AND s.status IN('claimed','remote_started') LEFT JOIN recovery_intents i ON i.attempt_id=json_extract(s.payload_json,'$.attemptId') " +
          where +
          " ORDER BY g.platform_id,g.account_profile_id,g.queue_group_id,q.position",
      )
      .all(...params)
      .filter(
        (row, index, rows) =>
          index === 0 || row.queue_group_id !== rows[index - 1].queue_group_id,
      );
  }

  function regularQueueRemainingRows(input) {
    const value = input || {};
    const params = [];
    let groupFilter = "";
    if (value.queueGroupId !== undefined) {
      groupFilter = " AND q.queue_group_id=?";
      params.push(
        requiredText(
          value.queueGroupId,
          128,
          "OPERATIONAL_QUEUE_GROUP_ID_INVALID",
        ),
      );
    }
    return db
      .prepare(
        "SELECT q.queue_group_id,q.item_id,s.batch_id,s.article_id,json_extract(s.payload_json,'$.attemptId') attempt_id,q.position FROM submission_queue_items q JOIN submission_items s ON s.item_id=q.item_id WHERE s.status='queued'" +
          groupFilter +
          " ORDER BY q.queue_group_id,q.position LIMIT 20000",
      )
      .all(...params);
  }

  function regularQueueGroupSnapshot(row, remainingRows) {
    if (!row) return null;
    const current = row.current_item_id
      ? Object.freeze({
          itemId: row.current_item_id,
          batchId: row.current_batch_id,
          articleId: row.current_article_id,
          regularPublicationAttemptId: row.current_attempt_id,
          phase: row.current_phase,
          claimUntil: row.current_claim_until,
        })
      : null;
    const remaining = (
      remainingRows ||
      regularQueueRemainingRows({ queueGroupId: row.queue_group_id })
    ).map((item) =>
      Object.freeze({
        itemId: item.item_id,
        batchId: item.batch_id,
        articleId: item.article_id,
        regularPublicationAttemptId: item.attempt_id,
        position: item.position,
      }),
    );
    const hasWork = Boolean(current) || remaining.length > 0;
    const lastGroupBlockedCode = safePauseReasonCode(
      row.last_group_blocked_code,
    );
    return Object.freeze({
      queueGroupId: row.queue_group_id,
      platformId: row.platform_id,
      accountProfileId: row.account_profile_id,
      runState: current
        ? "in_flight"
        : row.pause_intent === "none"
          ? "running"
          : "paused",
      pauseIntent: row.pause_intent,
      manuallyPaused: row.pause_intent === "manual",
      current,
      remaining: Object.freeze(remaining),
      actions: Object.freeze({
        canStart: hasWork && row.pause_intent !== "none",
        canPause: hasWork && row.pause_intent === "none",
        reasonCode: hasWork
          ? lastGroupBlockedCode
          : lastGroupBlockedCode || "REGULAR_QUEUE_GROUP_EMPTY",
      }),
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  function regularQueueGroupSnapshots(input) {
    const groupRows = regularQueueGroupRows(input);
    const remainingByGroup = new Map();
    for (const item of regularQueueRemainingRows(input)) {
      const rows = remainingByGroup.get(item.queue_group_id) || [];
      rows.push(item);
      remainingByGroup.set(item.queue_group_id, rows);
    }
    return groupRows.map((row) =>
      regularQueueGroupSnapshot(
        row,
        remainingByGroup.get(row.queue_group_id) || [],
      ),
    );
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
      value.paused === false ? "none" : "system",
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

  function listRegularQueueGroupSnapshots(input) {
    open();
    return Object.freeze(regularQueueGroupSnapshots(input));
  }

  function setRegularQueueGroupRunIntent(input) {
    open();
    const value = input || {};
    const queueGroupId = requiredText(
      value.queueGroupId,
      128,
      "OPERATIONAL_QUEUE_GROUP_ID_INVALID",
    );
    const intent = value.running === true ? "none" : "manual";
    const stamp = iso(clock);
    return transaction(() => {
      const changed = db
        .prepare(
          "UPDATE submission_queue_groups SET pause_intent=?,revision=revision+1,updated_at=? WHERE queue_group_id=?",
        )
        .run(intent, stamp, queueGroupId).changes;
      if (changed !== 1) throw fail("OPERATIONAL_QUEUE_GROUP_NOT_FOUND");
      regularQueueFault("after-group-run-intent", { queueGroupId, intent });
      return regularQueueGroupSnapshots({ queueGroupId })[0];
    });
  }

  function updateRegularQueueGroupsForGlobalIntent(mode) {
    open();
    const stamp = iso(clock);
    return transaction(() => {
      const changed =
        mode === "start"
          ? db
              .prepare(
                "UPDATE submission_queue_groups SET pause_intent='none',revision=revision+1,updated_at=? WHERE pause_intent='system'",
              )
              .run(stamp).changes
          : db
              .prepare(
                "UPDATE submission_queue_groups SET pause_intent='system',revision=revision+1,updated_at=? WHERE pause_intent='none'",
              )
              .run(stamp).changes;
      regularQueueFault("after-global-run-intent", { mode, changed });
      return Object.freeze({
        mode,
        changedCount: changed,
        groups: Object.freeze(regularQueueGroupSnapshots({})),
      });
    });
  }

  function startAllRegularQueueGroups() {
    return updateRegularQueueGroupsForGlobalIntent("start");
  }

  function pauseAllRegularQueueGroups() {
    return updateRegularQueueGroupsForGlobalIntent("pause");
  }

  function pauseRegularQueueGroupsOnStartup() {
    return updateRegularQueueGroupsForGlobalIntent("startup");
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

  function claimRegularQueueGroupHead(input) {
    open();
    const value = input || {};
    const queueGroupId = requiredText(
      value.queueGroupId,
      128,
      "OPERATIONAL_QUEUE_GROUP_ID_INVALID",
    );
    const claimToken = requiredText(
      value.claimToken,
      128,
      "OPERATIONAL_CLAIM_INVALID",
    );
    const leaseMs =
      Number.isSafeInteger(value.leaseMs) && value.leaseMs > 0
        ? value.leaseMs
        : 30000;
    if (leaseMs > 300000) throw fail("OPERATIONAL_CLAIM_INVALID");
    const stamp = iso(clock);
    const claimUntil = new Date(Date.parse(stamp) + leaseMs).toISOString();
    return transaction(() => {
      const group = db
        .prepare("SELECT * FROM submission_queue_groups WHERE queue_group_id=?")
        .get(queueGroupId);
      if (!group) throw fail("OPERATIONAL_QUEUE_GROUP_NOT_FOUND");
      if (group.pause_intent !== "none") return null;
      const head = db
        .prepare(
          "SELECT q.position,s.*,i.state intent_state,i.payload_json intent_payload,p.publication_id,p.target_json FROM submission_queue_items q JOIN submission_items s ON s.item_id=q.item_id JOIN publication_attempts a ON a.attempt_id=json_extract(s.payload_json,'$.attemptId') JOIN publication_records p ON p.publication_id=a.publication_id JOIN recovery_intents i ON i.attempt_id=a.attempt_id WHERE q.queue_group_id=? ORDER BY q.position LIMIT 1",
        )
        .get(queueGroupId);
      if (!head) return null;
      const intent = fromText(head.intent_payload) || {};
      const phase = intent.detail && intent.detail.phase;
      if (phase === "remote_call_started" || head.intent_state !== "resolved")
        return null;
      const reclaimable =
        head.status === "queued" ||
        (head.status === "claimed" &&
          typeof head.claim_until === "string" &&
          head.claim_until <= stamp &&
          phase === "prepared");
      if (!reclaimable) return null;
      const payload = fromText(head.payload_json) || {};
      const snapshot = payload.publicationSnapshot;
      if (
        !snapshot ||
        typeof payload.attemptId !== "string" ||
        typeof payload.clientId !== "string"
      )
        throw fail("REGULAR_QUEUE_FACT_CONFLICT");
      const changed = db
        .prepare(
          "UPDATE submission_items SET status='claimed',claim_token=?,claim_until=?,revision=revision+1 WHERE item_id=? AND revision=?",
        )
        .run(claimToken, claimUntil, head.item_id, head.revision).changes;
      if (changed !== 1) throw fail("REGULAR_QUEUE_CLAIM_CONFLICT");
      regularQueueFault("after-head-claim", {
        queueGroupId,
        itemId: head.item_id,
      });
      const nextDetail = Object.assign({}, intent.detail || {}, {
        phase: "prepared",
      });
      delete nextDetail.lastGroupBlockedCode;
      const nextIntent = Object.assign({}, intent, {
        detail: nextDetail,
        regularSubmission: {
          queueGroupId,
          itemId: head.item_id,
          claimToken,
          claimUntil,
          regularPublicationAttemptId: payload.attemptId,
        },
      });
      const intentChanged = db
        .prepare(
          "UPDATE recovery_intents SET payload_json=?,updated_at=? WHERE attempt_id=? AND state='resolved'",
        )
        .run(text(nextIntent), stamp, payload.attemptId).changes;
      if (intentChanged !== 1) throw fail("REGULAR_QUEUE_FACT_CONFLICT");
      regularQueueFault("after-prepared-intent", {
        queueGroupId,
        itemId: head.item_id,
        attemptId: payload.attemptId,
      });
      const groupChanged = db
        .prepare(
          "UPDATE submission_queue_groups SET revision=revision+1,updated_at=? WHERE queue_group_id=? AND pause_intent='none'",
        )
        .run(stamp, queueGroupId).changes;
      if (groupChanged !== 1) throw fail("REGULAR_QUEUE_CLAIM_CONFLICT");
      regularQueueFault("after-group-current-item", {
        queueGroupId,
        itemId: head.item_id,
      });
      return Object.freeze({
        queueGroupId,
        platformId: group.platform_id,
        accountProfileId: group.account_profile_id,
        itemId: head.item_id,
        batchId: head.batch_id,
        articleIdentityV1: domain.parseArticleIdentityV1({
          version: 1,
          clientId: payload.clientId,
          articleId: head.article_id,
        }),
        targetIdentityV1: domain.parseTargetIdentityV1({
          version: 1,
          ...fromText(head.target_json),
        }),
        publicationSnapshot: Object.freeze({ ...snapshot }),
        regularPublicationAttemptId: payload.attemptId,
        claimToken,
        claimUntil,
        position: head.position,
      });
    });
  }

  function beginRegularRemoteSubmission(input) {
    open();
    const value = input || {};
    const attemptId = domain.AttemptId.serialize(
      domain.AttemptId.parse(
        value.regularPublicationAttemptId || value.attemptId,
      ),
    );
    const claimToken = requiredText(
      value.claimToken,
      128,
      "OPERATIONAL_CLAIM_INVALID",
    );
    const evidence = domain.parsePreparedSubmissionEvidenceV1(
      value.preparedSubmissionEvidenceV1,
    );
    if (evidence.attemptId !== attemptId)
      throw fail("REGULAR_SUBMISSION_EVIDENCE_MISMATCH");
    const stamp = iso(clock);
    return transaction(() => {
      const row = db
        .prepare(
          "SELECT i.state,i.payload_json,s.item_id,s.status,s.claim_token,s.claim_until,s.payload_json item_payload,p.publication_id,p.article_id,p.target_json,a.status attempt_status FROM recovery_intents i JOIN publication_attempts a ON a.attempt_id=i.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id JOIN submission_items s ON json_extract(s.payload_json,'$.attemptId')=i.attempt_id WHERE i.attempt_id=?",
        )
        .get(attemptId);
      if (!row) throw fail("REGULAR_SUBMISSION_ATTEMPT_NOT_FOUND");
      if (row.claim_token !== claimToken)
        throw fail("REGULAR_SUBMISSION_CLAIM_STALE");
      const intent = fromText(row.payload_json) || {};
      const existingEvidence = intent.preparedSubmissionEvidenceV1;
      if (
        row.state === "remote_started" &&
        intent.detail &&
        intent.detail.phase === "remote_call_started"
      ) {
        if (JSON.stringify(existingEvidence) !== JSON.stringify(evidence))
          throw fail("REGULAR_SUBMISSION_EVIDENCE_CONFLICT");
        return Object.freeze({
          regularPublicationAttemptId: attemptId,
          phase: "remote_call_started",
          remoteCallStartedAt: intent.detail.remoteCallStartedAt,
          idempotent: true,
          submitAuthorized: false,
          preparedSubmissionEvidenceV1: evidence,
        });
      }
      if (
        row.state !== "resolved" ||
        !intent.detail ||
        intent.detail.phase !== "prepared" ||
        row.status !== "claimed" ||
        typeof row.claim_until !== "string" ||
        row.claim_until <= stamp ||
        row.attempt_status !== "queued"
      )
        throw fail("REGULAR_SUBMISSION_PHASE_INVALID");
      const itemPayload = fromText(row.item_payload) || {};
      const target = fromText(row.target_json);
      if (
        itemPayload.clientId !== evidence.articleIdentityV1.clientId ||
        row.article_id !== evidence.articleIdentityV1.articleId ||
        JSON.stringify({ version: 1, ...target }) !==
          JSON.stringify(evidence.targetIdentityV1)
      )
        throw fail("REGULAR_SUBMISSION_EVIDENCE_MISMATCH");
      const nextIntent = Object.assign({}, intent, {
        detail: Object.assign({}, intent.detail, {
          phase: "remote_call_started",
          remoteCallStartedAt: stamp,
        }),
        preparedSubmissionEvidenceV1: evidence,
      });
      const intentChanged = db
        .prepare(
          "UPDATE recovery_intents SET state='remote_started',payload_json=?,updated_at=? WHERE attempt_id=? AND state='resolved'",
        )
        .run(text(nextIntent), stamp, attemptId).changes;
      if (intentChanged !== 1) throw fail("REGULAR_SUBMISSION_PHASE_INVALID");
      regularQueueFault("after-evidence-freeze", { attemptId });
      const attemptChanged = db
        .prepare(
          "UPDATE publication_attempts SET status='remote_started' WHERE attempt_id=? AND status='queued'",
        )
        .run(attemptId).changes;
      if (attemptChanged !== 1) throw fail("REGULAR_SUBMISSION_PHASE_INVALID");
      regularQueueFault("after-attempt-remote-started", { attemptId });
      const publicationChanged = db
        .prepare(
          "UPDATE publication_records SET status='remote_started',updated_at=? WHERE publication_id=? AND status='queued'",
        )
        .run(stamp, row.publication_id).changes;
      if (publicationChanged !== 1)
        throw fail("REGULAR_SUBMISSION_PHASE_INVALID");
      regularQueueFault("after-publication-remote-started", { attemptId });
      const targetChanged = db
        .prepare(
          "UPDATE article_active_targets SET state='remote_started',updated_at=? WHERE attempt_id=? AND state='queued'",
        )
        .run(stamp, attemptId).changes;
      if (targetChanged !== 1) throw fail("REGULAR_SUBMISSION_PHASE_INVALID");
      regularQueueFault("after-active-target-remote-started", { attemptId });
      const itemChanged = db
        .prepare(
          "UPDATE submission_items SET status='remote_started',claim_until=NULL,revision=revision+1 WHERE item_id=? AND status='claimed' AND claim_token=?",
        )
        .run(row.item_id, row.claim_token).changes;
      if (itemChanged !== 1) throw fail("REGULAR_SUBMISSION_PHASE_INVALID");
      regularQueueFault("after-submission-start", {
        attemptId,
        itemId: row.item_id,
      });
      return Object.freeze({
        regularPublicationAttemptId: attemptId,
        phase: "remote_call_started",
        remoteCallStartedAt: stamp,
        idempotent: false,
        submitAuthorized: true,
        preparedSubmissionEvidenceV1: evidence,
      });
    });
  }

  function renewRegularQueueGroupClaim(input) {
    open();
    const value = input || {};
    const attemptId = domain.AttemptId.serialize(
      domain.AttemptId.parse(value.regularPublicationAttemptId),
    );
    const claimToken = requiredText(
      value.claimToken,
      128,
      "OPERATIONAL_CLAIM_INVALID",
    );
    const leaseMs =
      Number.isSafeInteger(value.leaseMs) && value.leaseMs > 0
        ? value.leaseMs
        : 30000;
    if (leaseMs > 300000) throw fail("OPERATIONAL_CLAIM_INVALID");
    const stamp = iso(clock);
    const claimUntil = new Date(Date.parse(stamp) + leaseMs).toISOString();
    return transaction(() => {
      const row = db
        .prepare(
          "SELECT s.item_id,s.claim_until,i.payload_json FROM submission_items s JOIN recovery_intents i ON i.attempt_id=json_extract(s.payload_json,'$.attemptId') WHERE json_extract(s.payload_json,'$.attemptId')=? AND s.status='claimed' AND s.claim_token=?",
        )
        .get(attemptId, claimToken);
      if (
        !row ||
        typeof row.claim_until !== "string" ||
        row.claim_until <= stamp
      )
        throw fail("REGULAR_SUBMISSION_CLAIM_STALE");
      const itemChanged = db
        .prepare(
          "UPDATE submission_items SET claim_until=?,revision=revision+1 WHERE item_id=? AND status='claimed' AND claim_token=? AND claim_until>?",
        )
        .run(claimUntil, row.item_id, claimToken, stamp).changes;
      if (itemChanged !== 1) throw fail("REGULAR_SUBMISSION_CLAIM_STALE");
      const intent = fromText(row.payload_json) || {};
      const nextIntent = Object.assign({}, intent, {
        regularSubmission: Object.assign({}, intent.regularSubmission || {}, {
          claimToken,
          claimUntil,
        }),
      });
      const intentChanged = db
        .prepare(
          "UPDATE recovery_intents SET payload_json=?,updated_at=? WHERE attempt_id=? AND state='resolved'",
        )
        .run(text(nextIntent), stamp, attemptId).changes;
      if (intentChanged !== 1) throw fail("REGULAR_SUBMISSION_CLAIM_STALE");
      return Object.freeze({
        regularPublicationAttemptId: attemptId,
        claimToken,
        claimUntil,
      });
    });
  }

  return Object.freeze({
    createSubmissionQueueGroup,
    setSubmissionQueueGroupPause,
    listSubmissionQueueGroups,
    enqueueSubmissionQueueItem,
    listSubmissionQueueItems,
    listRegularQueueGroupSnapshots,
    setRegularQueueGroupRunIntent,
    startAllRegularQueueGroups,
    pauseAllRegularQueueGroups,
    pauseRegularQueueGroupsOnStartup,
    claimRegularQueueGroupHead,
    renewRegularQueueGroupClaim,
    beginRegularRemoteSubmission,
  });
}

module.exports = { createRegularQueueRuntime };
