"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const {
  inspectSubmissionPair,
} = require("../../src/diagnostics/submission-pair-inspector");

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function createSubmissionItemProjection(options) {
  const value = options || {};
  if (!value.operationalStore) throw fail("OPERATIONAL_STORE_REQUIRED");
  if (typeof value.queuePaths !== "function")
    throw fail("SUBMISSION_QUEUE_PATH_PORT_REQUIRED");
  const root = path.resolve(value.workspaceRoot || process.cwd());

  function publicationRecords(articleIds) {
    try {
      return value.operationalStore.listPublicationRecords({
        articleIds: Array.from(new Set(articleIds)),
      });
    } catch (_) {
      return [];
    }
  }

  function latestAttempt(record) {
    return record && Array.isArray(record.attempts) && record.attempts.length
      ? record.attempts[record.attempts.length - 1]
      : null;
  }

  function recordFor(records, stored) {
    const payload = stored.payload || {};
    if (payload.attemptId) {
      const byAttempt = records.find(
        (record) =>
          Array.isArray(record.attempts) &&
          record.attempts.some(
            (attempt) => attempt.attemptId === payload.attemptId,
          ),
      );
      if (byAttempt) return byAttempt;
    }
    return (
      records.find((record) => record.targetKey === stored.targetKey) || null
    );
  }

  function batchClientId(batch) {
    const item = batch.items.find(
      (candidate) =>
        candidate.payload && typeof candidate.payload.clientId === "string",
    );
    return (item && item.payload.clientId) || null;
  }

  function safeQueuePaths(payload) {
    const paths = value.queuePaths(payload || {});
    const directory = path.resolve(path.dirname(paths.filePath));
    if (
      path.basename(paths.filePath) !== payload.filename ||
      path.dirname(path.resolve(paths.filePath)) !== directory
    )
      throw fail(
        "SUBMISSION_QUEUE_CHANGED",
        "Submission queue path is invalid",
      );
    return paths;
  }

  function itemView(batch, stored, records) {
    const payload = stored.payload || {};
    const targetPlatformId =
      payload.targetPlatformId ||
      (/^platform:([^:]+)/.exec(stored.targetKey || "") || [])[1] ||
      null;
    const record = recordFor(records, stored);
    const latest = latestAttempt(record);
    const rawStatus = stored.status;
    let status = rawStatus;
    if (rawStatus === "completed")
      status =
        (record && record.status) || payload.outcomeStatus || "completed";
    if (rawStatus === "failed")
      status = (record && record.status) || payload.outcomeStatus || "failed";
    if (rawStatus === "failed-cleaned") status = "failed";
    if (rawStatus === "published-cleaned") status = "published";
    if (rawStatus === "cancelled-cleaned") status = "cancelled";
    let files = null;
    try {
      files = safeQueuePaths(Object.assign({}, payload, { targetPlatformId }));
    } catch (_) {}
    const item = Object.assign({}, payload, {
      itemId: stored.itemId,
      batchId: batch.batchId,
      clientId: payload.clientId || batchClientId(batch),
      articleId: stored.articleId,
      targetPlatformId,
      accountProfileId: payload.accountProfileId || null,
      publicationId:
        payload.publicationId || (record && record.publicationId) || null,
      attemptId: payload.attemptId || (latest && latest.attemptId) || null,
      status,
      storedStatus: rawStatus,
      contentHash: payload.contentHash || null,
      filePath: (files && files.filePath) || null,
      sidecarPath: (files && files.sidecarPath) || null,
    });
    const pair = files
      ? inspectSubmissionPair(
          item,
          { id: batch.batchId, clientId: item.clientId },
          undefined,
          { rootDir: root },
        )
      : {
          pairState: "identity_conflict",
          identityMatched: false,
          contentMatched: false,
          mainExists: false,
          sidecarExists: false,
          unsafePath: true,
        };
    return Object.assign(item, { record, latest, pair });
  }

  function batchViews(batch) {
    const records = publicationRecords(
      batch.items.map((item) => item.articleId),
    );
    return batch.items.map((item) => itemView(batch, item, records));
  }

  function allItemViews() {
    return value.operationalStore.listSubmissionBatches().flatMap(batchViews);
  }

  function findItemView(action) {
    if (!action || typeof action.batchId !== "string" || !action.batchId)
      return null;
    let batch;
    try {
      batch = value.operationalStore.getSubmissionBatch(action.batchId);
    } catch (_) {
      return null;
    }
    return (
      batchViews(batch).find(
        (item) =>
          (!action.itemId || item.itemId === action.itemId) &&
          (!action.articleId || item.articleId === action.articleId) &&
          (!action.targetPlatformId ||
            item.targetPlatformId === action.targetPlatformId) &&
          (!action.publicationId ||
            item.publicationId === action.publicationId) &&
          (!action.attemptId || item.attemptId === action.attemptId),
      ) || null
    );
  }

  function publicItem(item) {
    return {
      itemId: item.itemId,
      clientId: item.clientId,
      articleId: item.articleId,
      batchId: item.batchId,
      targetPlatformId: item.targetPlatformId,
      accountProfileId: item.accountProfileId,
      publicationId: item.publicationId,
      attemptId: item.attemptId,
      contentHash: item.contentHash,
      status: item.status,
      storedStatus: item.storedStatus,
      pairState: item.pair.pairState,
      identityMatched: item.pair.identityMatched,
      contentMatched: item.pair.contentMatched,
      mainExists: item.pair.mainExists,
      sidecarExists: item.pair.sidecarExists,
    };
  }

  function actionFingerprint(item, action) {
    return hash(
      JSON.stringify({
        action: action.action,
        itemId: item.itemId,
        batchId: item.batchId,
        articleId: item.articleId,
        targetPlatformId: item.targetPlatformId,
        publicationId: item.publicationId,
        attemptId: item.attemptId,
        status: item.status,
        storedStatus: item.storedStatus,
        revision: item.revision,
        contentHash: item.contentHash,
        pairState: item.pair.pairState,
        identityMatched: item.pair.identityMatched,
        contentMatched: item.pair.contentMatched,
        recordStatus: (item.record && item.record.status) || null,
        latestStatus: (item.latest && item.latest.status) || null,
      }),
    );
  }

  return Object.freeze({
    hash,
    batchClientId,
    safeQueuePaths,
    itemView,
    batchViews,
    allItemViews,
    findItemView,
    publicItem,
    actionFingerprint,
  });
}

module.exports = { createSubmissionItemProjection };
