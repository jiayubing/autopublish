const crypto = require("node:crypto");

const { resolvePublicationTarget } = require("./publication-targets");
const {
  assertOutcomeStatus,
  assertTransition,
  blocksReservation,
  canReserveAgain
} = require("./publication-state");
const {
  PUBLICATION_RECORD_VERSION,
  createPublicationLedgerStore
} = require("./publication-ledger-store");

const PATH_CHARACTERS = /[<>:"/\\|?*\x00-\x1f]/;
const SAFE_CODE = /^[A-Z0-9][A-Z0-9_.:-]{0,127}$/;

function ledgerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeToken(value, code) {
  if (typeof value !== "string") throw ledgerError(code, "Publication reference is invalid");
  const normalized = value.trim();
  if (!normalized || normalized === "." || normalized === ".." || PATH_CHARACTERS.test(normalized)) {
    throw ledgerError(code, "Publication reference is invalid");
  }
  return normalized;
}

function safeOptional(value, code, maxLength) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim() === "" || value.length > (maxLength || 2048) || /[\x00-\x1f\x7f]/.test(value)) {
    throw ledgerError(code, "Publication value is invalid");
  }
  return value.trim();
}

function safeCode(value, code) {
  const normalized = safeOptional(value, code, 128);
  if (normalized !== null && !SAFE_CODE.test(normalized)) {
    throw ledgerError(code, "Publication code is invalid");
  }
  return normalized;
}

function nowValue(now) {
  const value = typeof now === "function" ? now() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw ledgerError("PUBLICATION_CLOCK_INVALID", "Publication clock is invalid");
  return date.toISOString();
}

function makeId(factory, kind) {
  const value = factory(kind);
  return safeToken(String(value), kind === "publication" ? "PUBLICATION_ID_INVALID" : "PUBLICATION_ATTEMPT_INVALID");
}

function normalizeArticle(article) {
  if (!article || typeof article !== "object") throw ledgerError("PUBLICATION_ARTICLE_INVALID", "Article identity is invalid");
  if (typeof article.articleKey !== "string" || !article.articleKey.trim() || /[\\/\x00-\x1f]/.test(article.articleKey)) {
    throw ledgerError("PUBLICATION_ARTICLE_INVALID", "Article identity is invalid");
  }
  const articleKey = article.articleKey.trim();
  const clientId = safeToken(article.clientId, "PUBLICATION_ARTICLE_INVALID");
  const articleId = article.articleId === undefined ? null : article.articleId;
  if (articleId !== null) safeToken(articleId, "PUBLICATION_ARTICLE_INVALID");
  const contentHash = article.contentHash === undefined ? null : article.contentHash;
  if (contentHash !== null && (typeof contentHash !== "string" || !/^[a-f0-9]{64}$/.test(contentHash))) {
    throw ledgerError("PUBLICATION_ARTICLE_INVALID", "Article identity is invalid");
  }
  return { articleKey, clientId, articleId, contentHash };
}

function normalizeTarget(target) {
  if (!target || typeof target !== "object") throw ledgerError("PUBLICATION_TARGET_INVALID", "Publication target is invalid");
  let resolved;
  if (target.kind === "resource" || target.mediaResourceId !== undefined && target.mediaResourceId !== null || target.resourceId !== undefined && target.resourceId !== null) {
    const mediaResourceId = target.mediaResourceId !== undefined ? target.mediaResourceId : target.resourceId;
    resolved = resolvePublicationTarget({ mediaResourceId: mediaResourceId });
  } else {
    resolved = resolvePublicationTarget({ platformId: target.platformId });
  }
  if (target.targetKey !== undefined && target.targetKey !== resolved.targetKey) {
    throw ledgerError("PUBLICATION_TARGET_INVALID", "Publication target is invalid");
  }
  return resolved;
}

function contextFields(context) {
  const values = context || {};
  const displayName = safeOptional(values.displayName, "PUBLICATION_CONTEXT_INVALID", 256);
  const accountValue = values.accountFingerprint !== undefined ? values.accountFingerprint : values.accountId;
  let accountFingerprint = null;
  if (accountValue !== undefined && accountValue !== null && String(accountValue).trim() !== "") {
    if (typeof accountValue !== "string" && typeof accountValue !== "number") {
      throw ledgerError("PUBLICATION_CONTEXT_INVALID", "Publication context is invalid");
    }
    accountFingerprint = crypto.createHash("sha256").update(String(accountValue), "utf8").digest("hex");
  }
  let titleSnapshot = null;
  if (values.titleSnapshot !== undefined && values.titleSnapshot !== null) {
    if (typeof values.titleSnapshot !== "string" || !values.titleSnapshot.trim()) throw ledgerError("PUBLICATION_CONTEXT_INVALID", "Publication title snapshot is invalid");
    titleSnapshot = values.titleSnapshot.trim().slice(0, 200);
  }
  return { displayName, accountFingerprint, titleSnapshot };
}

function outcomeFields(outcome) {
  const values = outcome || {};
  return {
    remoteId: safeOptional(values.remoteId, "PUBLICATION_OUTCOME_INVALID", 512),
    remoteUrl: safeOptional(values.remoteUrl, "PUBLICATION_OUTCOME_INVALID", 2048),
    errorCode: safeCode(values.errorCode, "PUBLICATION_OUTCOME_INVALID")
  };
}

function attemptRecord(attemptId, status, timestamp) {
  return {
    attemptId: attemptId,
    status: status,
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: null,
    finishedAt: null,
    remoteId: null,
    remoteUrl: null,
    errorCode: null,
    reasonCode: null
  };
}

function publicResult(record, attemptId) {
  const result = clone(record);
  result.attemptId = attemptId || record.attempts[record.attempts.length - 1].attemptId;
  return result;
}

function createPublicationLedger(options) {
  const opts = options || {};
  const store = opts.store || createPublicationLedgerStore({ workspaceRoot: opts.workspaceRoot, paths: opts.paths, fs: opts.fs });
  const clock = opts.now || function() { return new Date(); };
  const idFactory = opts.createId || function() { return crypto.randomUUID(); };

  function reserve(articleInput, targetInput, context) {
    const article = normalizeArticle(articleInput);
    const target = normalizeTarget(targetInput);
    const contextValues = contextFields(context);
    const existing = store.findByAggregate(article.articleKey, target.targetKey);
    if (existing) return reserveExisting(existing.record, article, target, contextValues);

    const createdAt = nowValue(clock);
    const record = {
      version: PUBLICATION_RECORD_VERSION,
      publicationId: makeId(idFactory, "publication"),
      articleKey: article.articleKey,
      clientId: article.clientId,
      articleId: article.articleId,
      contentHash: article.contentHash,
      targetKey: target.targetKey,
      platformId: target.platformId,
      mediaResourceId: target.mediaResourceId,
      displayName: contextValues.displayName,
      accountFingerprint: contextValues.accountFingerprint,
      titleSnapshot: contextValues.titleSnapshot,
      status: "queued",
      attempts: [attemptRecord(makeId(idFactory, "attempt"), "queued", createdAt)],
      createdAt: createdAt,
      updatedAt: createdAt
    };

    try {
      const saved = store.create(record);
      return publicResult(saved);
    } catch (error) {
      if (!error || error.code !== "PUBLICATION_RECORD_EXISTS") throw error;
      const raced = store.findByAggregate(article.articleKey, target.targetKey);
      if (!raced) throw ledgerError("PUBLICATION_RESERVATION_FAILED", "Publication reservation failed");
      return reserveExisting(raced.record, article, target, contextValues);
    }
  }

  function reserveExisting(record, article, target, contextValues) {
    if (record.articleKey !== article.articleKey || record.targetKey !== target.targetKey) {
      throw ledgerError("PUBLICATION_RECORD_CORRUPT", "Publication record is invalid");
    }
    if (record.status === "uncertain") {
      throw ledgerError("PUBLICATION_UNCERTAIN", "Publication result must be reconciled before retry");
    }
    if (blocksReservation(record.status)) {
      throw ledgerError("PUBLICATION_DUPLICATE", "Publication target is already reserved");
    }
    if (!canReserveAgain(record.status)) {
      throw ledgerError("PUBLICATION_STATE_INVALID", "Publication state is invalid");
    }

    const updated = store.update(record.publicationId, function(current) {
      if (current.status === "uncertain") throw ledgerError("PUBLICATION_UNCERTAIN", "Publication result must be reconciled before retry");
      if (blocksReservation(current.status)) throw ledgerError("PUBLICATION_DUPLICATE", "Publication target is already reserved");
      if (!canReserveAgain(current.status)) throw ledgerError("PUBLICATION_STATE_INVALID", "Publication state is invalid");
      const timestamp = nowValue(clock);
      const attempt = attemptRecord(makeId(idFactory, "attempt"), "queued", timestamp);
      current.status = "queued";
      current.attempts.push(attempt);
      current.updatedAt = timestamp;
      if (contextValues.displayName !== null) current.displayName = contextValues.displayName;
      if (contextValues.accountFingerprint !== null) current.accountFingerprint = contextValues.accountFingerprint;
      if ((current.titleSnapshot === undefined || current.titleSnapshot === null) && contextValues.titleSnapshot !== null) current.titleSnapshot = contextValues.titleSnapshot;
      return current;
    });
    return publicResult(updated);
  }

  function markSubmitting(publicationId, attemptId) {
    const result = store.update(publicationId, function(record) {
      const attempt = currentAttempt(record, attemptId);
      assertTransition(record.status, "submitting");
      const timestamp = nowValue(clock);
      record.status = "submitting";
      attempt.status = "submitting";
      attempt.startedAt = timestamp;
      attempt.updatedAt = timestamp;
      record.updatedAt = timestamp;
      return record;
    });
    return publicResult(result, attemptId);
  }

  function recordOutcome(publicationId, attemptId, outcome) {
    const values = outcome || {};
    assertOutcomeStatus(values.status);
    const fields = outcomeFields(values);
    const result = store.update(publicationId, function(record) {
      const attempt = currentAttempt(record, attemptId);
      if (record.status === "uncertain") {
        throw ledgerError("PUBLICATION_RECONCILE_REQUIRED", "Uncertain publications must be reconciled");
      }
      assertTransition(record.status, values.status);
      const timestamp = nowValue(clock);
      record.status = values.status;
      attempt.status = values.status;
      attempt.updatedAt = timestamp;
      attempt.finishedAt = timestamp;
      if (fields.remoteId !== null) attempt.remoteId = fields.remoteId;
      if (fields.remoteUrl !== null) attempt.remoteUrl = fields.remoteUrl;
      if (fields.errorCode !== null) attempt.errorCode = fields.errorCode;
      record.updatedAt = timestamp;
      return record;
    });
    return publicResult(result, attemptId);
  }

  function reconcile(publicationId, decision) {
    const values = decision || {};
    if (["failed", "published"].indexOf(values.status) === -1) {
      throw ledgerError("PUBLICATION_RECONCILE_INVALID", "Publication reconciliation is invalid");
    }
    const reasonCode = safeCode(values.reasonCode, "PUBLICATION_RECONCILE_INVALID");
    const fields = outcomeFields(values);
    const result = store.update(publicationId, function(record) {
      if (record.status !== "uncertain") {
        throw ledgerError("PUBLICATION_RECONCILE_REQUIRED", "Only uncertain publications can be reconciled");
      }
      assertTransition(record.status, values.status);
      const timestamp = nowValue(clock);
      const attempt = record.attempts[record.attempts.length - 1];
      record.status = values.status;
      attempt.status = values.status;
      attempt.reasonCode = reasonCode;
      if (fields.remoteId !== null) attempt.remoteId = fields.remoteId;
      if (fields.remoteUrl !== null) attempt.remoteUrl = fields.remoteUrl;
      if (fields.errorCode !== null) attempt.errorCode = fields.errorCode;
      attempt.updatedAt = timestamp;
      attempt.finishedAt = timestamp;
      record.updatedAt = timestamp;
      return record;
    });
    return publicResult(result);
  }

  function currentAttempt(record, attemptId) {
    const requested = safeToken(attemptId, "PUBLICATION_ATTEMPT_INVALID");
    const latest = record.attempts[record.attempts.length - 1];
    if (!latest || latest.attemptId !== requested) {
      throw ledgerError("PUBLICATION_ATTEMPT_NOT_CURRENT", "Publication attempt is not current");
    }
    return latest;
  }

  function listForArticles(clientId, articleIds) {
    const client = safeToken(clientId, "PUBLICATION_ARTICLE_ID_INVALID");
    if (!Array.isArray(articleIds)) throw ledgerError("PUBLICATION_ARTICLE_IDS_INVALID", "Article ids are invalid");
    const ids = new Set(articleIds.map(function(articleId) { return safeToken(articleId, "PUBLICATION_ARTICLE_ID_INVALID"); }));
    return store.list()
      .filter(function(record) {
        return record.clientId === client && (ids.has(record.articleId) || ids.has(record.articleKey));
      })
      .sort(function(left, right) {
        const time = Date.parse(left.createdAt) - Date.parse(right.createdAt);
        return time || left.targetKey.localeCompare(right.targetKey);
      })
      .map(clone);
  }

  function ensureTitleSnapshot(publicationId, title) {
    if (typeof title !== "string" || !title.trim()) return null;
    const snapshot = title.trim().slice(0, 200);
    const result = store.update(publicationId, function(record) {
      if (record.titleSnapshot === undefined || record.titleSnapshot === null) record.titleSnapshot = snapshot;
      return record;
    });
    return publicResult(result);
  }

  return {
    reserve: reserve,
    markSubmitting: markSubmitting,
    recordOutcome: recordOutcome,
    reconcile: reconcile,
    ensureTitleSnapshot: ensureTitleSnapshot,
    listForArticles: listForArticles,
    get: function(publicationId) { return store.get(publicationId); },
    list: function() { return store.list(); },
    store: store
  };
}

module.exports = { createPublicationLedger };
