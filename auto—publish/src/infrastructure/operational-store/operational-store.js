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
    const stamp = iso(clock);
    return transaction(
      db,
      () => {
        const attempt = db
          .prepare(
            "SELECT publication_id FROM publication_attempts WHERE attempt_id=?",
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
        db.prepare(
          "UPDATE recovery_intents SET state=?,payload_json=?,updated_at=? WHERE attempt_id=?",
        ).run(
          outcome.status === "uncertain" ? "manual_check" : "resolved",
          text(outcome.error || outcome.evidence || null),
          stamp,
          attemptId,
        );
        if (["published", "submitted"].includes(outcome.status))
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
            "{}",
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
        for (const item of v.items || []) {
          const target = domain.parsePublicationTarget(item.target),
            articleId = domain.ArticleId.serialize(
              domain.ArticleId.parse(item.articleId),
            );
          rejectSensitive(item.payload || {});
          db.prepare(
            "INSERT INTO submission_items VALUES(?,?,?,?,?,?,?,?,?)",
          ).run(
            crypto.randomUUID(),
            batchId,
            articleId,
            domain.publicationTargetKey(target),
            1,
            "queued",
            null,
            null,
            text(item.payload || {}),
          );
        }
        return { batchId };
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
        db.prepare("INSERT INTO remote_orders VALUES(?,?,?,?,?)").run(
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
        const row = db
          .prepare(
            "SELECT * FROM post_processing_jobs WHERE status IN('queued','failed') OR(status='claimed' AND claim_until<?) ORDER BY created_at LIMIT 1",
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
    reservePublicationTarget,
    commitRemoteOutcome,
    listActionableRecovery,
    createSubmissionBatch,
    claimSubmissionItem,
    updateSubmissionItem,
    attachRemoteOrderEvidence,
    claimPostProcessing,
    completePostProcessing,
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
