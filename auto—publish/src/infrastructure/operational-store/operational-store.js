"use strict";
// SQLite is deliberately hidden behind aggregate transactions; callers never get db.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const domain = require("../../domain");
const SCHEMA_VERSION = 1;
const owners = new Map();
function fail(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}
function iso(clock) {
  const d = new Date(clock());
  if (!Number.isFinite(d.getTime())) throw fail("OPERATIONAL_CLOCK_INVALID");
  return d.toISOString();
}
function text(value) {
  return JSON.stringify(value);
}
function fromText(value) {
  return value ? JSON.parse(value) : null;
}
function transaction(db, fn, beforeCommit) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    if (beforeCommit) beforeCommit();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch (_) {}
    throw e;
  }
}
function rejectSensitive(value) {
  if (
    /(cookie|api[_-]?key|authorization|\"body\"|\"html\"|absolutePath)/i.test(
      text(value),
    )
  )
    throw fail("OPERATIONAL_SENSITIVE_FIELD");
}
function databasePath(root, filename, temporary) {
  const expected = path.resolve(
    root,
    ".autopublish",
    "operations",
    "operations.db",
  );
  const actual = path.resolve(filename || expected);
  if (
    actual !== expected &&
    (!temporary ||
      path.dirname(actual) !== path.dirname(expected) ||
      !/^operations\.migration-[a-f0-9-]+\.db$/i.test(path.basename(actual)))
  )
    throw fail("OPERATIONAL_PATH_INVALID");
  return actual;
}
function ownerLockPath(filename) {
  return path.join(path.dirname(filename), "runtime.lock");
}
function migrationLockPath(filename) {
  return path.join(path.dirname(filename), "migration.lock");
}
function ownerProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}
function readLock(filename) {
  try {
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    const value = JSON.parse(fs.readFileSync(filename, "utf8"));
    return value && Number.isInteger(value.pid) ? value : null;
  } catch (_) {
    return null;
  }
}
function acquireRuntimeOwner(filename) {
  const lock = ownerLockPath(filename);
  if (fs.existsSync(migrationLockPath(filename)))
    throw fail("OPERATIONAL_MIGRATION_LEASE_ACTIVE");
  const token = crypto.randomUUID();
  try {
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, token }), {
      encoding: "utf8",
      flag: "wx",
    });
    return { lock, token };
  } catch (error) {
    if (!error || error.code !== "EEXIST")
      throw fail("OPERATIONAL_WRITE_OWNER_UNAVAILABLE");
  }
  const owner = readLock(lock);
  if (ownerProcessAlive(owner && owner.pid))
    throw fail("OPERATIONAL_WRITE_OWNER_EXISTS");
  if (fs.existsSync(filename)) verifyOperationalDatabase(filename);
  try {
    fs.unlinkSync(lock);
  } catch (_) {
    throw fail("OPERATIONAL_WRITE_OWNER_EXISTS");
  }
  return acquireRuntimeOwner(filename);
}
function releaseRuntimeOwner(owner) {
  if (!owner) return;
  const value = readLock(owner.lock);
  if (value && value.token === owner.token) {
    try {
      fs.unlinkSync(owner.lock);
    } catch (_) {}
  }
}
function schema(db) {
  db.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;",
  );
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS account_profiles(account_profile_id TEXT PRIMARY KEY, platform_id TEXT NOT NULL, display_name TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS publication_records(publication_id TEXT PRIMARY KEY, article_id TEXT NOT NULL, target_key TEXT NOT NULL, target_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('queued','remote_started','submitted','published','failed','uncertain')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(article_id,target_key));
CREATE TABLE IF NOT EXISTS publication_attempts(attempt_id TEXT PRIMARY KEY, publication_id TEXT NOT NULL REFERENCES publication_records(publication_id), status TEXT NOT NULL CHECK(status IN('queued','remote_started','submitted','published','failed','uncertain')), created_at TEXT NOT NULL, finished_at TEXT);
CREATE TABLE IF NOT EXISTS remote_evidence(evidence_id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES publication_attempts(attempt_id), remote_id TEXT NOT NULL, remote_url TEXT, evidence_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(attempt_id,remote_id));
CREATE TABLE IF NOT EXISTS recovery_intents(intent_id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL UNIQUE REFERENCES publication_attempts(attempt_id), state TEXT NOT NULL CHECK(state IN('remote_started','outcome_pending','resolved','manual_check')), payload_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS submission_batches(batch_id TEXT PRIMARY KEY, status TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS submission_items(item_id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES submission_batches(batch_id), article_id TEXT NOT NULL, target_key TEXT NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL, claim_token TEXT, claim_until TEXT, payload_json TEXT NOT NULL, UNIQUE(batch_id,article_id,target_key));
CREATE TABLE IF NOT EXISTS remote_orders(order_id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES publication_attempts(attempt_id), remote_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(attempt_id,remote_id));
CREATE TABLE IF NOT EXISTS post_processing_jobs(job_id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES publication_attempts(attempt_id), kind TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('queued','claimed','completed','failed')), attempts INTEGER NOT NULL, claim_token TEXT, claim_until TEXT, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(attempt_id,kind));
CREATE INDEX IF NOT EXISTS recovery_actionable ON recovery_intents(state,updated_at); CREATE INDEX IF NOT EXISTS job_actionable ON post_processing_jobs(status,claim_until); CREATE INDEX IF NOT EXISTS submission_claimable ON submission_items(batch_id,status,claim_until,item_id);`);
  db.prepare("INSERT OR IGNORE INTO schema_migrations VALUES(?,?)").run(
    SCHEMA_VERSION,
    new Date().toISOString(),
  );
}
function integrityOk(db) {
  const result = db.prepare("PRAGMA integrity_check").all();
  return result.length === 1 && Object.values(result[0])[0] === "ok";
}
function createOperationalStore(options) {
  const o = options || {};
  if (typeof o.workspaceRoot !== "string")
    throw fail("OPERATIONAL_WORKSPACE_REQUIRED");
  const filename = databasePath(
      o.workspaceRoot,
      o.filename,
      o.migrationTemporary === true,
    ),
    clock = o.clock || (() => new Date()),
    internalBeforeCommit =
      typeof o.internalBeforeCommit === "function"
        ? o.internalBeforeCommit
        : null;
  if (owners.has(filename)) throw fail("OPERATIONAL_WRITE_OWNER_EXISTS");
  if (fs.existsSync(filename) && fs.lstatSync(filename).isSymbolicLink())
    throw fail("OPERATIONAL_PATH_INVALID");
  try {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  } catch (_) {
    throw fail("OPERATIONAL_WRITE_OWNER_UNAVAILABLE");
  }
  const runtimeOwner =
    o.migrationTemporary === true ? null : acquireRuntimeOwner(filename);
  let db;
  try {
    db = new DatabaseSync(filename);
    schema(db);
  } catch (error) {
    try {
      if (db) db.close();
    } catch (_) {}
    releaseRuntimeOwner(runtimeOwner);
    throw error && error.code
      ? error
      : fail("OPERATIONAL_DATABASE_OPEN_FAILED");
  }
  owners.set(filename, true);
  let closed = false;
  const open = () => {
    if (closed) throw fail("OPERATIONAL_STORE_CLOSED");
  };
  function createAccountProfile(input) {
    open();
    const v = input || {};
    if (Object.prototype.hasOwnProperty.call(v, "accountProfileId"))
      throw fail("ACCOUNT_PROFILE_ID_SYSTEM_ASSIGNED");
    if (
      typeof v.platformId !== "string" ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(v.platformId)
    )
      throw fail("ACCOUNT_PROFILE_PLATFORM_INVALID");
    if (
      typeof v.displayName !== "string" ||
      !v.displayName.trim() ||
      v.displayName.trim().length > 128
    )
      throw fail("ACCOUNT_PROFILE_DISPLAY_NAME_INVALID");
    const accountProfileId = `account-${crypto.randomUUID()}`;
    db.prepare(
      "INSERT INTO account_profiles(account_profile_id,platform_id,display_name,created_at) VALUES(?,?,?,?)",
    ).run(accountProfileId, v.platformId, v.displayName.trim(), iso(clock));
    return Object.freeze({
      accountProfileId,
      platformId: v.platformId,
      displayName: v.displayName.trim(),
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
    const v = input || {};
    const accountProfileId = domain.AccountProfileId.serialize(
      domain.AccountProfileId.parse(v.accountProfileId),
    );
    if (
      typeof v.platformId !== "string" ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(v.platformId)
    )
      throw fail("ACCOUNT_PROFILE_PLATFORM_INVALID");
    const profile = db
      .prepare(
        "SELECT account_profile_id,platform_id,display_name FROM account_profiles WHERE account_profile_id=?",
      )
      .get(accountProfileId);
    if (!profile) throw fail("ACCOUNT_PROFILE_NOT_FOUND");
    if (profile.platform_id !== v.platformId)
      throw fail("ACCOUNT_PROFILE_PLATFORM_MISMATCH");
    return Object.freeze({
      accountProfileId: profile.account_profile_id,
      platformId: profile.platform_id,
      displayName: profile.display_name,
    });
  }
  function reservePublicationTarget(input) {
    open();
    const v = input || {},
      articleId = domain.ArticleId.serialize(
        domain.ArticleId.parse(v.articleId),
      ),
      target = domain.parsePublicationTarget(v.target),
      targetKey = domain.publicationTargetKey(target),
      publicationId = domain.PublicationId.serialize(
        domain.PublicationId.parse(v.publicationId),
      ),
      attemptId = domain.AttemptId.serialize(
        domain.AttemptId.parse(v.attemptId),
      ),
      stamp = iso(clock);
    return transaction(
      db,
      () => {
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
          crypto.randomUUID(),
          attemptId,
          "remote_started",
          null,
          stamp,
          stamp,
        );
        return { publicationId, attemptId, targetKey, status: "queued" };
      },
      internalBeforeCommit,
    );
  }
  function commitRemoteOutcome(input) {
    open();
    const v = input || {},
      attemptId = domain.AttemptId.serialize(
        domain.AttemptId.parse(v.attemptId),
      ),
      outcome = v.outcome;
    if (
      !outcome ||
      !["published", "submitted", "failed", "uncertain"].includes(
        outcome.status,
      )
    )
      throw fail("OPERATIONAL_OUTCOME_INVALID");
    rejectSensitive(outcome);
    rejectSensitive(v.postProcessingPayload || {});
    const stamp = iso(clock);
    return transaction(
      db,
      () => {
        const attempt = db
          .prepare(
            "SELECT a.publication_id,p.target_json FROM publication_attempts a JOIN publication_records p ON p.publication_id=a.publication_id WHERE a.attempt_id=?",
          )
          .get(attemptId);
        if (!attempt) throw fail("OPERATIONAL_ATTEMPT_NOT_FOUND");
        db.prepare(
          "UPDATE publication_attempts SET status=?,finished_at=? WHERE attempt_id=?",
        ).run(outcome.status, stamp, attemptId);
        db.prepare(
          "UPDATE publication_records SET status=?,updated_at=? WHERE publication_id=?",
        ).run(outcome.status, stamp, attempt.publication_id);
        if (outcome.evidence)
          db.prepare("INSERT INTO remote_evidence VALUES(?,?,?,?,?,?)").run(
            crypto.randomUUID(),
            attemptId,
            outcome.evidence.remoteId,
            outcome.evidence.remoteUrl || null,
            text(outcome.evidence),
            stamp,
          );
        // A media remote receipt is also the order identity. Keep it in the
        // same transaction as the publication outcome so an archive or
        // projection failure can never lose the order evidence.
        const target = fromText(attempt.target_json);
        if (outcome.evidence && target && target.kind === "media")
          db.prepare(
            "INSERT OR IGNORE INTO remote_orders VALUES(?,?,?,?,?)",
          ).run(
            outcome.evidence.remoteId,
            attemptId,
            outcome.evidence.remoteId,
            text(outcome.evidence),
            stamp,
          );
        if (v.batchItemId !== undefined) {
          if (typeof v.batchItemId !== "string" || !v.batchItemId)
            throw fail("OPERATIONAL_BATCH_ITEM_INVALID");
          const item = db
            .prepare(
              "SELECT payload_json FROM submission_items WHERE item_id=?",
            )
            .get(v.batchItemId);
          if (!item) throw fail("OPERATIONAL_BATCH_ITEM_NOT_FOUND");
          const payload = Object.assign({}, fromText(item.payload_json) || {}, {
            attemptId,
            outcomeStatus: outcome.status,
            ...(outcome.evidence
              ? { remoteId: outcome.evidence.remoteId }
              : {}),
          });
          db.prepare(
            "UPDATE submission_items SET status=?,revision=revision+1,payload_json=? WHERE item_id=?",
          ).run(
            ["published", "submitted"].includes(outcome.status)
              ? "completed"
              : "failed",
            text(payload),
            v.batchItemId,
          );
        }
        db.prepare(
          "UPDATE recovery_intents SET state=?,payload_json=?,updated_at=? WHERE attempt_id=?",
        ).run(
          outcome.status === "uncertain" ? "manual_check" : "resolved",
          text(outcome.error || outcome.evidence || null),
          stamp,
          attemptId,
        );
        if (outcome.status === "published")
          db.prepare(
            "INSERT INTO post_processing_jobs VALUES(?,?,?,?,?,?,?,?,?,?)",
          ).run(
            crypto.randomUUID(),
            attemptId,
            "archive",
            "queued",
            0,
            null,
            null,
            text(v.postProcessingPayload || {}),
            stamp,
            stamp,
          );
        return { attemptId, status: outcome.status };
      },
      internalBeforeCommit,
    );
  }
  function listActionableRecovery() {
    open();
    return db
      .prepare(
        "SELECT i.attempt_id,i.state,i.payload_json,p.publication_id,p.article_id,p.target_key,p.status FROM recovery_intents i JOIN publication_attempts a ON a.attempt_id=i.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id WHERE i.state IN('remote_started','outcome_pending','manual_check') ORDER BY i.updated_at",
      )
      .all()
      .map((r) => ({
        attemptId: r.attempt_id,
        state: r.state,
        publicationId: r.publication_id,
        articleId: r.article_id,
        targetKey: r.target_key,
        status: r.status,
        detail: fromText(r.payload_json),
      }));
  }
  function markRecoveryUncertain(input) {
    open();
    const v = input || {},
      attemptId = domain.AttemptId.serialize(
        domain.AttemptId.parse(v.attemptId),
      ),
      error = domain.parseSafeOperationalError(v.error),
      stamp = iso(clock);
    return transaction(
      db,
      () => {
        const attempt = db
          .prepare(
            "SELECT publication_id FROM publication_attempts WHERE attempt_id=?",
          )
          .get(attemptId);
        if (!attempt) throw fail("OPERATIONAL_ATTEMPT_NOT_FOUND");
        const changed = db
          .prepare(
            "UPDATE recovery_intents SET state='manual_check',payload_json=?,updated_at=? WHERE attempt_id=? AND state IN('remote_started','outcome_pending')",
          )
          .run(text(error), stamp, attemptId).changes;
        if (changed !== 1) throw fail("OPERATIONAL_RECOVERY_NOT_ACTIONABLE");
        db.prepare(
          "UPDATE publication_attempts SET status='uncertain',finished_at=? WHERE attempt_id=?",
        ).run(stamp, attemptId);
        db.prepare(
          "UPDATE publication_records SET status='uncertain',updated_at=? WHERE publication_id=?",
        ).run(stamp, attempt.publication_id);
        return { attemptId, status: "uncertain" };
      },
      internalBeforeCommit,
    );
  }
  function createSubmissionBatch(input) {
    open();
    const v = input || {},
      batchId = domain.BatchId.serialize(domain.BatchId.parse(v.batchId)),
      stamp = iso(clock);
    return transaction(
      db,
      () => {
        db.prepare("INSERT INTO submission_batches VALUES(?,?,?,?,?)").run(
          batchId,
          "queued",
          1,
          stamp,
          stamp,
        );
        const items = [];
        for (const item of v.items || []) {
          const target = domain.parsePublicationTarget(item.target),
            articleId = domain.ArticleId.serialize(
              domain.ArticleId.parse(item.articleId),
            );
          rejectSensitive(item.payload || {});
          const itemId = crypto.randomUUID();
          db.prepare(
            "INSERT INTO submission_items VALUES(?,?,?,?,?,?,?,?,?)",
          ).run(
            itemId,
            batchId,
            articleId,
            domain.publicationTargetKey(target),
            1,
            "queued",
            null,
            null,
            text(item.payload || {}),
          );
          items.push(
            Object.freeze({
              itemId,
              articleId,
              targetKey: domain.publicationTargetKey(target),
              revision: 1,
            }),
          );
        }
        return Object.freeze({ batchId, items: Object.freeze(items) });
      },
      internalBeforeCommit,
    );
  }
  function claimSubmissionItem(input) {
    open();
    const v = input || {},
      stamp = iso(clock);
    if (typeof v.claimToken !== "string" || !v.claimToken)
      throw fail("OPERATIONAL_CLAIM_INVALID");
    return transaction(
      db,
      () => {
        const row = db
          .prepare(
            "SELECT * FROM submission_items WHERE batch_id=? AND (status='queued' OR(status='claimed' AND claim_until<?)) ORDER BY item_id LIMIT 1",
          )
          .get(v.batchId, stamp);
        if (!row) return null;
        const until = new Date(
          Date.parse(stamp) + (v.leaseMs || 30000),
        ).toISOString();
        db.prepare(
          "UPDATE submission_items SET status='claimed',claim_token=?,claim_until=?,revision=revision+1 WHERE item_id=? AND revision=?",
        ).run(v.claimToken, until, row.item_id, row.revision);
        return {
          itemId: row.item_id,
          batchId: row.batch_id,
          articleId: row.article_id,
          targetKey: row.target_key,
          revision: row.revision + 1,
          payload: fromText(row.payload_json),
        };
      },
      internalBeforeCommit,
    );
  }
  function claimSubmissionItemById(input) {
    open();
    const v = input || {},
      stamp = iso(clock);
    if (
      typeof v.claimToken !== "string" ||
      !v.claimToken ||
      typeof v.itemId !== "string" ||
      !v.itemId ||
      typeof v.batchId !== "string" ||
      !v.batchId
    )
      throw fail("OPERATIONAL_CLAIM_INVALID");
    return transaction(
      db,
      () => {
        const row = db
          .prepare(
            "SELECT * FROM submission_items WHERE item_id=? AND batch_id=?",
          )
          .get(v.itemId, v.batchId);
        if (!row) throw fail("OPERATIONAL_BATCH_ITEM_NOT_FOUND");
        if (
          row.status !== "queued" &&
          !(row.status === "claimed" && row.claim_until < stamp)
        )
          throw fail("OPERATIONAL_BATCH_ITEM_NOT_EXECUTABLE");
        const until = new Date(
          Date.parse(stamp) + (v.leaseMs || 30000),
        ).toISOString();
        const changed = db
          .prepare(
            "UPDATE submission_items SET status='claimed',claim_token=?,claim_until=?,revision=revision+1 WHERE item_id=? AND revision=?",
          )
          .run(v.claimToken, until, row.item_id, row.revision).changes;
        if (changed !== 1) throw fail("OPERATIONAL_BATCH_REVISION_CONFLICT");
        return Object.freeze({
          itemId: row.item_id,
          batchId: row.batch_id,
          articleId: row.article_id,
          targetKey: row.target_key,
          revision: row.revision + 1,
          claimToken: v.claimToken,
          payload: fromText(row.payload_json),
        });
      },
      internalBeforeCommit,
    );
  }
  function updateSubmissionItem(input) {
    open();
    const v = input || {};
    if (
      !Number.isInteger(v.revision) ||
      !["queued", "completed", "failed"].includes(v.status)
    )
      throw fail("OPERATIONAL_BATCH_UPDATE_INVALID");
    const changed = db
      .prepare(
        "UPDATE submission_items SET status=?,claim_token=NULL,claim_until=NULL,revision=revision+1,payload_json=? WHERE item_id=? AND revision=? AND claim_token=?",
      )
      .run(
        v.status,
        text(v.payload || {}),
        v.itemId,
        v.revision,
        v.claimToken,
      ).changes;
    if (changed !== 1) throw fail("OPERATIONAL_BATCH_REVISION_CONFLICT");
  }
  function cancelQueuedSubmissionItem(input) {
    open();
    const v = input || {};
    if (
      typeof v.itemId !== "string" ||
      !v.itemId ||
      typeof v.batchId !== "string" ||
      !v.batchId
    )
      throw fail("OPERATIONAL_BATCH_ITEM_INVALID");
    const stamp = iso(clock);
    return transaction(
      db,
      () => {
        const item = db
          .prepare(
            "SELECT item_id,status,claim_token,payload_json FROM submission_items WHERE item_id=? AND batch_id=?",
          )
          .get(v.itemId, v.batchId);
        if (!item) throw fail("OPERATIONAL_BATCH_ITEM_NOT_FOUND");
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
        });
        db.prepare(
          "UPDATE submission_items SET status='cancelled',revision=revision+1,payload_json=? WHERE item_id=?",
        ).run(text(payload), item.item_id);
        const remaining = db
          .prepare(
            "SELECT COUNT(*) count FROM submission_items WHERE batch_id=? AND status!='cancelled'",
          )
          .get(v.batchId).count;
        if (remaining === 0)
          db.prepare(
            "UPDATE submission_batches SET status='cancelled',revision=revision+1,updated_at=? WHERE batch_id=?",
          ).run(stamp, v.batchId);
        return Object.freeze({
          itemId: item.item_id,
          status: "cancelled",
          idempotent: false,
        });
      },
      internalBeforeCommit,
    );
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
    const v = input || {};
    if (
      v.clientId !== undefined &&
      (typeof v.clientId !== "string" || !v.clientId.trim())
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
          if (v.clientId === undefined) return true;
          return batch.items.some(
            (item) =>
              item.payload && item.payload.clientId === v.clientId.trim(),
          );
        }),
    );
  }
  function findSubmissionItem(input) {
    open();
    const v = input || {};
    const batchId = domain.BatchId.serialize(domain.BatchId.parse(v.batchId));
    const articleId = domain.ArticleId.serialize(
      domain.ArticleId.parse(v.articleId),
    );
    const targetKey = domain.publicationTargetKey(
      domain.parsePublicationTarget(v.target),
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
    const v = input || {};
    if (
      typeof v.sourcePlatformId !== "string" ||
      !v.sourcePlatformId ||
      typeof v.filename !== "string" ||
      !v.filename
    )
      throw fail("OPERATIONAL_ARCHIVE_GROUP_INVALID");
    const batch = getSubmissionBatch(v.batchId);
    const items = batch.items.filter(
      (item) =>
        item.payload &&
        item.payload.sourcePlatformId === v.sourcePlatformId &&
        item.payload.filename === v.filename,
    );
    if (!items.length) throw fail("OPERATIONAL_ARCHIVE_GROUP_NOT_FOUND");
    return Object.freeze({
      batchId: batch.batchId,
      sourcePlatformId: v.sourcePlatformId,
      filename: v.filename,
      eligible: items.every(
        (item) =>
          item.status === "completed" &&
          item.payload.outcomeStatus === "published",
      ),
      items: Object.freeze(items),
    });
  }
  function attachRemoteOrderEvidence(input) {
    open();
    const v = input || {};
    rejectSensitive(v.evidence || {});
    const attemptId = domain.AttemptId.serialize(
      domain.AttemptId.parse(v.attemptId),
    );
    if (
      typeof v.orderId !== "string" ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(v.orderId) ||
      typeof v.remoteId !== "string"
    )
      throw fail("OPERATIONAL_ORDER_INVALID");
    transaction(
      db,
      () => {
        if (
          !db
            .prepare("SELECT 1 FROM publication_attempts WHERE attempt_id=?")
            .get(attemptId)
        )
          throw fail("OPERATIONAL_ATTEMPT_NOT_FOUND");
        // commitRemoteOutcome already records a media receipt in the same
        // transaction. Import/reconcile may attach the identical receipt
        // again with a legacy order alias; the `(attempt_id,remote_id)` fact
        // is idempotent and must not make a migration fail.
        db.prepare("INSERT OR IGNORE INTO remote_orders VALUES(?,?,?,?,?)").run(
          v.orderId,
          attemptId,
          v.remoteId,
          text(v.evidence || {}),
          iso(clock),
        );
      },
      internalBeforeCommit,
    );
  }
  function claimPostProcessing(input) {
    open();
    const v = input || {},
      stamp = iso(clock);
    if (typeof v.claimToken !== "string" || !v.claimToken)
      throw fail("OPERATIONAL_CLAIM_INVALID");
    return transaction(
      db,
      () => {
        // A failed local action is deliberately not claimed again by the
        // normal recovery loop.  Retrying it without an explicit operator
        // action made a permanently failing archive job spin forever and,
        // more importantly, blurred the boundary between local recovery and
        // a new publication attempt.
        const states =
          v.retryFailed === true
            ? "status IN('queued','failed') OR(status='claimed' AND claim_until<?)"
            : "status='queued' OR(status='claimed' AND claim_until<?)";
        const row = db
          .prepare(
            "SELECT * FROM post_processing_jobs WHERE " +
              states +
              " ORDER BY created_at LIMIT 1",
          )
          .get(stamp);
        if (!row) return null;
        const until = new Date(
          Date.parse(stamp) + (v.leaseMs || 30000),
        ).toISOString();
        db.prepare(
          "UPDATE post_processing_jobs SET status='claimed',claim_token=?,claim_until=?,attempts=attempts+1,updated_at=? WHERE job_id=?",
        ).run(v.claimToken, until, stamp, row.job_id);
        return {
          jobId: row.job_id,
          attemptId: row.attempt_id,
          kind: row.kind,
          payload: fromText(row.payload_json),
        };
      },
      internalBeforeCommit,
    );
  }
  function completePostProcessing(v) {
    open();
    const x = v || {},
      changed = db
        .prepare(
          "UPDATE post_processing_jobs SET status=?,claim_token=NULL,claim_until=NULL,updated_at=? WHERE job_id=? AND claim_token=?",
        )
        .run(
          x.success === false ? "failed" : "completed",
          iso(clock),
          x.jobId,
          x.claimToken,
        ).changes;
    if (changed !== 1) throw fail("OPERATIONAL_CLAIM_CONFLICT");
  }
  function retryPostProcessing(input) {
    open();
    const v = input || {};
    if (typeof v.jobId !== "string" || !v.jobId)
      throw fail("OPERATIONAL_POST_PROCESSING_INVALID");
    const changed = db
      .prepare(
        "UPDATE post_processing_jobs SET status='queued',claim_token=NULL,claim_until=NULL,updated_at=? WHERE job_id=? AND status='failed'",
      )
      .run(iso(clock), v.jobId).changes;
    if (changed !== 1) throw fail("OPERATIONAL_POST_PROCESSING_NOT_RETRYABLE");
  }
  function listPostProcessingAttention() {
    open();
    return Object.freeze(
      db
        .prepare(
          "SELECT j.job_id,j.attempt_id,j.kind,j.attempts,j.payload_json,j.updated_at,p.article_id,p.target_key FROM post_processing_jobs j JOIN publication_attempts a ON a.attempt_id=j.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id WHERE j.status='failed' ORDER BY j.updated_at",
        )
        .all()
        .map((row) =>
          Object.freeze({
            jobId: row.job_id,
            attemptId: row.attempt_id,
            platformId: /^platform:([^:]+):/.exec(row.target_key)?.[1] || null,
            accountProfileId:
              /^platform:[^:]+:account:(.+)$/.exec(row.target_key)?.[1] || null,
            kind: row.kind,
            attempts: row.attempts,
            articleId: row.article_id,
            targetKey: row.target_key,
            payload: fromText(row.payload_json),
            updatedAt: row.updated_at,
          }),
        ),
    );
  }
  function listPublicationAttention() {
    open();
    return Object.freeze(
      db
        .prepare(
          "SELECT p.publication_id,p.article_id,p.target_key,p.status,p.updated_at,a.attempt_id FROM publication_records p JOIN publication_attempts a ON a.publication_id=p.publication_id WHERE p.status IN('uncertain','failed') AND a.finished_at IS NOT NULL ORDER BY p.updated_at",
        )
        .all()
        .map((row) =>
          Object.freeze({
            publicationId: row.publication_id,
            articleId: row.article_id,
            targetKey: row.target_key,
            status: row.status,
            updatedAt: row.updated_at,
            attemptId: row.attempt_id,
            platformId: /^platform:([^:]+):/.exec(row.target_key)?.[1] || null,
            accountProfileId:
              /^platform:[^:]+:account:(.+)$/.exec(row.target_key)?.[1] || null,
          }),
        ),
    );
  }
  function listPublicationRecords(input) {
    open();
    const v = input || {};
    if (!Array.isArray(v.articleIds) || !v.articleIds.length)
      return Object.freeze([]);
    const articleIds = v.articleIds.map((articleId) =>
      domain.ArticleId.serialize(domain.ArticleId.parse(articleId)),
    );
    const marks = articleIds.map(() => "?").join(",");
    const records = db
      .prepare(
        "SELECT publication_id,article_id,target_key,status,created_at,updated_at FROM publication_records WHERE article_id IN(" +
          marks +
          ") ORDER BY created_at",
      )
      .all(...articleIds);
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
          return Object.freeze({
            orderId: row.order_id,
            orderNid: row.order_id,
            remoteId: row.remote_id,
            publicationId: row.publication_id,
            attemptId: row.attempt_id,
            articleId: row.article_id,
            mediaResourceId: target.mediaResourceId || null,
            status: row.status,
            remoteUrl: evidence.remoteUrl || null,
            createdAt: row.created_at,
          });
        }),
    );
  }
  function reconcileRemoteOrder(input) {
    open();
    const v = input || {};
    if (
      typeof v.orderId !== "string" ||
      !v.orderId ||
      !v.outcome ||
      !["published", "failed", "submitted", "uncertain"].includes(
        v.outcome.status,
      )
    )
      throw fail("OPERATIONAL_ORDER_RECONCILE_INVALID");
    const stamp = iso(clock);
    return transaction(
      db,
      () => {
        const row = db
          .prepare(
            "SELECT o.attempt_id,o.remote_id,p.publication_id,p.target_json FROM remote_orders o JOIN publication_attempts a ON a.attempt_id=o.attempt_id JOIN publication_records p ON p.publication_id=a.publication_id WHERE o.order_id=?",
          )
          .get(v.orderId);
        if (!row || (fromText(row.target_json) || {}).kind !== "media")
          throw fail("OPERATIONAL_ORDER_NOT_FOUND");
        const outcome = v.outcome;
        if (
          outcome.status === "published" &&
          (typeof outcome.remoteUrl !== "string" ||
            !/^https:\/\//.test(outcome.remoteUrl))
        )
          throw fail("OPERATIONAL_ORDER_EVIDENCE_REQUIRED");
        if (
          outcome.status === "failed" &&
          (!outcome.error || typeof outcome.error.code !== "string")
        )
          throw fail("OPERATIONAL_ORDER_RECONCILE_INVALID");
        const evidence = {
          remoteId: row.remote_id,
          ...(outcome.status === "published"
            ? { remoteUrl: outcome.remoteUrl }
            : {}),
        };
        db.prepare(
          "UPDATE publication_attempts SET status=?,finished_at=? WHERE attempt_id=?",
        ).run(outcome.status, stamp, row.attempt_id);
        db.prepare(
          "UPDATE publication_records SET status=?,updated_at=? WHERE publication_id=?",
        ).run(outcome.status, stamp, row.publication_id);
        db.prepare(
          "UPDATE remote_evidence SET remote_url=?,evidence_json=? WHERE attempt_id=? AND remote_id=?",
        ).run(
          evidence.remoteUrl || null,
          text(evidence),
          row.attempt_id,
          row.remote_id,
        );
        db.prepare(
          "UPDATE remote_orders SET payload_json=? WHERE order_id=?",
        ).run(text(evidence), v.orderId);
        db.prepare(
          "UPDATE recovery_intents SET state=?,payload_json=?,updated_at=? WHERE attempt_id=?",
        ).run(
          outcome.status === "uncertain" ? "manual_check" : "resolved",
          text(outcome.error || evidence),
          stamp,
          row.attempt_id,
        );
        return Object.freeze({
          orderId: v.orderId,
          attemptId: row.attempt_id,
          publicationId: row.publication_id,
          status: outcome.status,
        });
      },
      internalBeforeCommit,
    );
  }
  function verify() {
    open();
    const fk = db.prepare("PRAGMA foreign_key_check").all(),
      tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((x) => x.name);
    if (
      fk.length ||
      !integrityOk(db) ||
      !tables.includes("publication_records")
    )
      throw fail("OPERATIONAL_VERIFY_FAILED");
    return {
      schemaVersion: SCHEMA_VERSION,
      databasePath: filename,
      foreignKeyViolations: 0,
      tableCount: tables.length,
    };
  }
  function backup(destination) {
    open();
    if (
      typeof destination !== "string" ||
      !path.isAbsolute(destination) ||
      fs.existsSync(destination)
    )
      throw fail("OPERATIONAL_BACKUP_DESTINATION_INVALID");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    fs.copyFileSync(filename, destination, fs.constants.COPYFILE_EXCL);
    return verifyOperationalDatabase(destination);
  }
  function close() {
    if (!closed) {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      db.close();
      closed = true;
      owners.delete(filename);
      releaseRuntimeOwner(runtimeOwner);
    }
  }
  return Object.freeze({
    databasePath: filename,
    createAccountProfile,
    listAccountProfiles,
    assertExecutableAccountProfile,
    reservePublicationTarget,
    commitRemoteOutcome,
    listActionableRecovery,
    markRecoveryUncertain,
    createSubmissionBatch,
    claimSubmissionItem,
    claimSubmissionItemById,
    updateSubmissionItem,
    cancelQueuedSubmissionItem,
    getSubmissionBatch,
    listSubmissionBatches,
    findSubmissionItem,
    getArchiveEligibility,
    attachRemoteOrderEvidence,
    claimPostProcessing,
    completePostProcessing,
    retryPostProcessing,
    listPostProcessingAttention,
    listPublicationAttention,
    listPublicationRecords,
    listRemoteOrders,
    reconcileRemoteOrder,
    deriveAttentionInput: listActionableRecovery,
    verify,
    backup,
    close,
  });
}
function verifyOperationalDatabase(filename) {
  if (
    typeof filename !== "string" ||
    !fs.existsSync(filename) ||
    fs.lstatSync(filename).isDirectory() ||
    fs.lstatSync(filename).isSymbolicLink()
  )
    throw fail("OPERATIONAL_RESTORE_TARGET_INVALID");
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((x) => x.name),
      fk = db.prepare("PRAGMA foreign_key_check").all();
    if (
      !tables.includes("schema_migrations") ||
      !tables.includes("publication_records") ||
      !integrityOk(db) ||
      fk.length
    )
      throw fail("OPERATIONAL_RESTORE_INVALID");
    return {
      schemaVersion: db
        .prepare("SELECT MAX(version) version FROM schema_migrations")
        .get().version,
      tables: tables.length,
      rows: db.prepare("SELECT COUNT(*) count FROM publication_records").get()
        .count,
    };
  } finally {
    db.close();
  }
}
module.exports = {
  SCHEMA_VERSION,
  createOperationalStore,
  verifyOperationalDatabase,
};
