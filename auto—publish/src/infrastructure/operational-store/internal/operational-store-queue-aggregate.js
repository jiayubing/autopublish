const domain = require("../../../domain");

const {
  cancellationResolutionFromIntent,
  fromText,
  rejectSensitive,
  safeOperationalPayload,
  text,
} = require("./operational-store-utils");

const PLATFORM_ID = /^[a-z][a-z0-9-]{0,63}$/;
const PAUSE_INTENTS = new Set(["none", "manual", "system"]);
const FINGERPRINT = /^[a-f0-9]{64}$/;

function createOperationalStoreQueueAggregate(context) {
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
        "SELECT g.*,s.item_id current_item_id,s.batch_id current_batch_id,s.article_id current_article_id,s.claim_until current_claim_until,json_extract(s.payload_json,'$.attemptId') current_attempt_id,json_extract(i.payload_json,'$.detail.phase') current_phase FROM submission_queue_groups g LEFT JOIN submission_queue_items q ON q.queue_group_id=g.queue_group_id LEFT JOIN submission_items s ON s.item_id=q.item_id AND s.status IN('claimed','submitting') LEFT JOIN recovery_intents i ON i.attempt_id=json_extract(s.payload_json,'$.attemptId') " +
          where +
          " ORDER BY g.platform_id,g.account_profile_id,g.queue_group_id,q.position",
      )
      .all(...params)
      .filter(
        (row, index, rows) =>
          index === 0 || row.queue_group_id !== rows[index - 1].queue_group_id,
      );
  }

  function regularQueueGroupSnapshot(row) {
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
    const remaining = db
      .prepare(
        "SELECT q.item_id,s.batch_id,s.article_id,json_extract(s.payload_json,'$.attemptId') attempt_id,q.position FROM submission_queue_items q JOIN submission_items s ON s.item_id=q.item_id WHERE q.queue_group_id=? AND s.status='queued' ORDER BY q.position LIMIT 20000",
      )
      .all(row.queue_group_id)
      .map((item) =>
        Object.freeze({
          itemId: item.item_id,
          batchId: item.batch_id,
          articleId: item.article_id,
          regularPublicationAttemptId: item.attempt_id,
          position: item.position,
        }),
      );
    const hasWork = Boolean(current) || remaining.length > 0;
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
        reasonCode: hasWork ? null : "REGULAR_QUEUE_GROUP_EMPTY",
      }),
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
    return Object.freeze(
      regularQueueGroupRows(input).map(regularQueueGroupSnapshot),
    );
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
      return regularQueueGroupSnapshot(
        regularQueueGroupRows({ queueGroupId })[0],
      );
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
        groups: Object.freeze(
          regularQueueGroupRows({}).map(regularQueueGroupSnapshot),
        ),
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
      const nextIntent = Object.assign({}, intent, {
        detail: Object.assign({}, intent.detail || {}, { phase: "prepared" }),
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
          "UPDATE submission_items SET status='submitting',claim_until=NULL,revision=revision+1 WHERE item_id=? AND status='claimed' AND claim_token=?",
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
        "system",
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
      customerSnapshotV1:
        value.customerSnapshotV1 === undefined
          ? null
          : domain.parseCustomerSnapshotV1(value.customerSnapshotV1),
      targetSnapshotV1:
        value.targetSnapshotV1 === undefined
          ? null
          : domain.parseTargetSnapshotV1(value.targetSnapshotV1),
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

  function paidTarget(input) {
    let target;
    try {
      target = domain.parsePublicationTarget(input);
    } catch (_) {
      throw fail("PAID_ADMISSION_TARGET_INVALID");
    }
    if (target.kind !== "media") throw fail("PAID_ADMISSION_MEDIA_REQUIRED");
    return target;
  }

  function paidSnapshot(input) {
    const value = input || {};
    const snapshot = value.publicationSnapshot;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
      throw fail("PAID_ADMISSION_SNAPSHOT_INVALID");
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
      throw fail("PAID_ADMISSION_SNAPSHOT_INVALID");
    return Object.freeze({
      articleId: domain.ArticleId.serialize(
        domain.ArticleId.parse(snapshot.articleId),
      ),
      title: snapshot.title.trim(),
      body: snapshot.body,
      fingerprint: snapshot.fingerprint,
    });
  }

  function paidAdmissionItem(
    input,
    target,
    mediaResourceId,
    quotedPrice,
    estimatedTotal,
    systemSubmissionCode,
    batchId,
  ) {
    const value = input || {};
    if (
      typeof value.articleId !== "string" ||
      typeof value.clientId !== "string"
    )
      throw fail("PAID_ADMISSION_ARTICLE_INVALID");
    const articleId = domain.ArticleId.serialize(
      domain.ArticleId.parse(value.articleId),
    );
    const clientId = domain.ClientId.serialize(
      domain.ClientId.parse(value.clientId),
    );
    let customerSnapshotV1;
    try {
      customerSnapshotV1 = domain.parseCustomerSnapshotV1(
        value.customerSnapshotV1,
      );
    } catch (_) {
      throw fail("PAID_ADMISSION_CUSTOMER_SNAPSHOT_INVALID");
    }
    if (customerSnapshotV1.clientId !== clientId)
      throw fail("PAID_ADMISSION_CUSTOMER_SNAPSHOT_INVALID");
    const publicationId = domain.PublicationId.serialize(
      domain.PublicationId.parse(value.publicationId),
    );
    const attemptId = domain.AttemptId.serialize(
      domain.AttemptId.parse(value.attemptId),
    );
    const itemId = requiredText(
      value.itemId,
      128,
      "PAID_ADMISSION_ITEM_INVALID",
    );
    const snapshot = paidSnapshot(value);
    if (snapshot.articleId !== articleId)
      throw fail("PAID_ADMISSION_SNAPSHOT_INVALID");
    const payload =
      value.payload &&
      typeof value.payload === "object" &&
      !Array.isArray(value.payload)
        ? Object.assign({}, value.payload)
        : {};
    const storedPayload = Object.assign({}, payload, {
      clientId,
      articleRef: value.articleRef || { clientId, articleId },
      attemptId,
      batchItemId: itemId,
      paidBatchId: batchId,
      sourcePlatformId: "media",
      targetPlatformId: "media",
      mediaResourceId,
      titleSnapshot: snapshot.title,
      resourceNameSnapshot: value.resourceNameSnapshot || "",
      quotedPrice,
      estimatedTotal,
      systemSubmissionCode,
      publicationSnapshot: snapshot,
      customerSnapshotV1,
    });
    rejectSensitive(storedPayload);
    return Object.freeze({
      articleId,
      clientId,
      articleRef: Object.freeze({ clientId, articleId }),
      publicationId,
      attemptId,
      itemId,
      target,
      targetKey: domain.publicationTargetKey(target),
      snapshot,
      payload: storedPayload,
    });
  }

  function paidBatchResult(
    batchId,
    targetKey,
    mediaResourceId,
    rows,
    idempotent,
  ) {
    return Object.freeze({
      batchId,
      targetKey,
      mediaResourceId,
      status: "queued",
      articleCount: rows.length,
      idempotent: idempotent === true,
      items: Object.freeze(
        rows.map((row) =>
          Object.freeze({
            itemId: row.item_id || row.itemId,
            batchId: row.batch_id || row.batchId || batchId,
            articleId: row.article_id || row.articleId,
            publicationId: row.publication_id || row.publicationId,
            attemptId: row.attempt_id || row.attemptId,
            targetKey: row.target_key || row.targetKey || targetKey,
            status: row.status || "queued",
            idempotent: idempotent === true,
          }),
        ),
      ),
    });
  }

  function admitPaidBatch(input) {
    open();
    const value = input || {};
    const target = paidTarget(
      value.target || { kind: "media", mediaResourceId: value.mediaResourceId },
    );
    const mediaResourceId = target.mediaResourceId;
    const batchId = domain.BatchId.serialize(
      domain.BatchId.parse(value.batchId),
    );
    const confirmationFingerprint = requiredText(
      value.confirmationFingerprint,
      128,
      "PAID_ADMISSION_CONFIRMATION_FINGERPRINT_INVALID",
    );
    const systemSubmissionCode = requiredText(
      value.systemSubmissionCode,
      128,
      "OPERATIONAL_SYSTEM_SUBMISSION_CODE_REQUIRED",
    );
    const confirmation = value.confirmation;
    if (
      !confirmation ||
      typeof confirmation !== "object" ||
      Array.isArray(confirmation)
    )
      throw fail("PAID_ADMISSION_CONFIRMATION_INVALID");
    rejectSensitive(confirmation);
    if (text(confirmation).length > 32768)
      throw fail("PAID_ADMISSION_CONFIRMATION_INVALID");
    const quotedPrice = value.quotedPrice;
    const estimatedTotal = value.estimatedTotal;
    if (
      ![quotedPrice, estimatedTotal].every(
        (number) =>
          typeof number === "number" &&
          Number.isFinite(number) &&
          number >= 0 &&
          number <= 100000000,
      )
    )
      throw fail("PAID_ADMISSION_PRICE_INVALID");
    if (
      !Array.isArray(value.items) ||
      value.items.length < 1 ||
      value.items.length > 1000
    )
      throw fail("PAID_ADMISSION_ARTICLES_REQUIRED");
    const seenArticleIds = new Set();
    const items = value.items.map((item) => {
      const parsed = paidAdmissionItem(
        item,
        target,
        mediaResourceId,
        quotedPrice,
        estimatedTotal,
        systemSubmissionCode,
        batchId,
      );
      if (seenArticleIds.has(parsed.articleId))
        throw fail("PAID_ADMISSION_ARTICLE_DUPLICATE");
      seenArticleIds.add(parsed.articleId);
      if (parsed.targetKey !== `media-resource:${mediaResourceId}`)
        throw fail("PAID_ADMISSION_TARGET_INVALID");
      return parsed;
    });
    if (value.articleCount !== undefined && value.articleCount !== items.length)
      throw fail("PAID_ADMISSION_ARTICLE_COUNT_INVALID");
    const stamp = iso(clock);
    const targetKey = `media-resource:${mediaResourceId}`;
    try {
      return transaction(() => {
        const existingPaid = db
          .prepare("SELECT * FROM paid_submission_batches WHERE batch_id=?")
          .get(batchId);
        if (existingPaid) {
          if (
            existingPaid.media_resource_id !== mediaResourceId ||
            existingPaid.confirmation_fingerprint !== confirmationFingerprint ||
            existingPaid.system_submission_code !== systemSubmissionCode ||
            existingPaid.quoted_price !== quotedPrice ||
            existingPaid.estimated_total !== estimatedTotal ||
            existingPaid.article_count !== items.length
          )
            throw fail("PAID_ADMISSION_BATCH_CONFLICT");
          const existingItems = db
            .prepare(
              "SELECT s.item_id,s.batch_id,s.article_id,s.target_key,p.publication_id,a.attempt_id,s.status FROM submission_items s JOIN publication_records p ON p.article_id=s.article_id AND p.target_key=s.target_key JOIN publication_attempts a ON a.publication_id=p.publication_id WHERE s.batch_id=? ORDER BY s.item_id",
            )
            .all(batchId);
          if (
            existingItems.length !== items.length ||
            existingItems.some(
              (row) =>
                !seenArticleIds.has(row.article_id) ||
                row.target_key !== targetKey,
            )
          )
            throw fail("PAID_ADMISSION_BATCH_CONFLICT");
          return paidBatchResult(
            batchId,
            targetKey,
            mediaResourceId,
            existingItems,
            true,
          );
        }
        const existingBatch = db
          .prepare("SELECT batch_id FROM submission_batches WHERE batch_id=?")
          .get(batchId);
        if (existingBatch) throw fail("PAID_ADMISSION_BATCH_CONFLICT");

        for (const item of items) {
          const active = db
            .prepare(
              "SELECT state FROM article_active_targets WHERE article_id=?",
            )
            .get(item.articleId);
          if (active) throw fail("PUBLICATION_TARGET_CONFLICT");
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
        }

        db.prepare("INSERT INTO submission_batches VALUES(?,?,?,?,?)").run(
          batchId,
          "queued",
          1,
          stamp,
          stamp,
        );
        for (const item of items) {
          db.prepare(
            "INSERT INTO publication_records VALUES(?,?,?,?,?,?,?)",
          ).run(
            item.publicationId,
            item.articleId,
            targetKey,
            text(target),
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
                postProcessingPayload: { articleRef: item.articleRef },
              },
              detail: { phase: "paid-admitted", batchId },
            }),
            stamp,
            stamp,
          );
          db.prepare(
            "INSERT INTO submission_items VALUES(?,?,?,?,?,?,?,?,?)",
          ).run(
            item.itemId,
            batchId,
            item.articleId,
            targetKey,
            1,
            "queued",
            null,
            null,
            text(item.payload),
          );
          db.prepare(
            "INSERT INTO article_active_targets(article_id,publication_id,attempt_id,target_key,target_json,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
          ).run(
            item.articleId,
            item.publicationId,
            item.attemptId,
            targetKey,
            text(target),
            "queued",
            stamp,
            stamp,
          );
        }
        db.prepare(
          "INSERT INTO paid_submission_batches(batch_id,media_resource_id,confirmation_fingerprint,confirmation_json,system_submission_code,quoted_price,estimated_total,article_count,pause_intent,created_at,confirmed_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        ).run(
          batchId,
          mediaResourceId,
          confirmationFingerprint,
          text(confirmation),
          systemSubmissionCode,
          quotedPrice,
          estimatedTotal,
          items.length,
          "manual",
          stamp,
          stamp,
          stamp,
        );
        return paidBatchResult(
          batchId,
          targetKey,
          mediaResourceId,
          items.map((item) => ({
            itemId: item.itemId,
            batchId,
            articleId: item.articleId,
            publicationId: item.publicationId,
            attemptId: item.attemptId,
            targetKey,
            status: "queued",
          })),
          false,
        );
      });
    } catch (error) {
      const code = String((error && error.code) || "");
      const message = String((error && error.message) || "");
      if (
        code.startsWith("SQLITE_CONSTRAINT") ||
        message.includes("constraint failed")
      )
        throw fail("PAID_ADMISSION_TRANSACTION_FAILED");
      throw error;
    }
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
      const oldPublication = db
        .prepare(
          "SELECT p.publication_id,p.status,a.attempt_id,a.finished_at,i.payload_json AS intent_payload FROM publication_records p LEFT JOIN publication_attempts a ON a.attempt_id=(SELECT latest.attempt_id FROM publication_attempts latest WHERE latest.publication_id=p.publication_id ORDER BY latest.rowid DESC LIMIT 1) LEFT JOIN recovery_intents i ON i.attempt_id=a.attempt_id WHERE p.article_id=? AND p.target_key=?",
        )
        .get(item.articleId, targetKey);
      const cancelledPublication =
        oldPublication &&
        oldPublication.status === "queued" &&
        oldPublication.attempt_id &&
        oldPublication.finished_at &&
        cancellationResolutionFromIntent(oldPublication.intent_payload);
      if (oldPublication && !cancelledPublication)
        throw fail(
          oldPublication.status === "uncertain"
            ? "PUBLICATION_UNCERTAIN"
            : "PUBLICATION_DUPLICATE",
        );
      const publicationId = oldPublication
        ? oldPublication.publication_id
        : item.publicationId;
      const profile = db
        .prepare(
          "SELECT display_name FROM account_profiles WHERE account_profile_id=?",
        )
        .get(item.target.accountProfileId);
      const payload = Object.assign({}, item.payload || {}, {
        clientId: item.clientId,
        sourcePlatformId: item.target.platformId,
        targetPlatformId: item.target.platformId,
        accountProfileId: item.target.accountProfileId,
        publicationSnapshot: item.snapshot,
        publicationId,
        attemptId: item.attemptId,
        customerSnapshotV1:
          item.customerSnapshotV1 ||
          domain.parseCustomerSnapshotV1({
            version: 1,
            clientId: item.clientId,
            displayName: item.clientId,
          }),
        targetSnapshotV1:
          item.targetSnapshotV1 ||
          domain.parseTargetSnapshotV1({
            version: 1,
            kind: "platform",
            platformId: item.target.platformId,
            platformName: item.target.platformId,
            accountProfileId: item.target.accountProfileId,
            accountLabel:
              (profile && profile.display_name) || item.target.accountProfileId,
          }),
      });
      rejectSensitive(payload);
      const batchItem = db
        .prepare("SELECT item_id FROM submission_items WHERE item_id=?")
        .get(item.itemId);
      if (batchItem) throw fail("REGULAR_QUEUE_ITEM_CONFLICT");
      if (!oldPublication)
        db.prepare("INSERT INTO publication_records VALUES(?,?,?,?,?,?,?)").run(
          publicationId,
          item.articleId,
          targetKey,
          text(item.target),
          "queued",
          stamp,
          stamp,
        );
      else
        db.prepare(
          "UPDATE publication_records SET status='queued',target_json=?,updated_at=? WHERE publication_id=?",
        ).run(text(item.target), stamp, publicationId);
      db.prepare("INSERT INTO publication_attempts VALUES(?,?,?,?,?)").run(
        item.attemptId,
        publicationId,
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
          publicationId,
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
        publicationId,
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
          "SELECT s.item_id,s.batch_id,s.article_id,s.target_key,s.status,s.claim_token,s.payload_json,q.queue_group_id,q.position,p.publication_id,p.status publication_status,a.attempt_id,a.status attempt_status FROM submission_items s LEFT JOIN submission_queue_items q ON q.item_id=s.item_id LEFT JOIN publication_attempts a ON a.attempt_id=json_extract(s.payload_json,'$.attemptId') LEFT JOIN publication_records p ON p.publication_id=a.publication_id AND p.article_id=s.article_id AND p.target_key=s.target_key WHERE s.item_id=? AND s.batch_id=?",
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
    listRegularQueueGroupSnapshots,
    setRegularQueueGroupRunIntent,
    startAllRegularQueueGroups,
    pauseAllRegularQueueGroups,
    pauseRegularQueueGroupsOnStartup,
    claimRegularQueueGroupHead,
    renewRegularQueueGroupClaim,
    beginRegularRemoteSubmission,
    admitRegularQueueItem,
    removePendingQueueItem,
    admitPaidBatch,
    createPaidSubmissionBatch,
    getPaidSubmissionBatch,
    listPaidSubmissionBatches,
    setPaidSubmissionBatchPause,
  });
}

module.exports = { createOperationalStoreQueueAggregate };
