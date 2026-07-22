const { createArticleStore } = require("../../src/content/article-store");
const {
  createSubmissionExportService,
  cancelReservation,
  inspectSubmission,
  inspectSubmissionPair: inspectSubmissionPairState,
  makeSidecar,
  publicationContext,
  publicationFields,
  publicationRecordFor,
  articleMarkdown,
  writeAtomic,
  writePairAtomic
} = require("../../src/content/submission-export-service");
const { createPublicationLedger } = require("../../src/publication/publication-ledger");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createSubmissionBatchStore } = require("../../src/content/submission-batch-store");
const { evaluateArticleSubmissionEligibility } = require("../../src/content/article-submission-eligibility");
const { createSubmissionReadSnapshot } = require("./submission/submission-read-snapshot");
const { createSubmissionQuery } = require("./submission/submission-query");
const { createSubmissionPreparation } = require("./submission/submission-preparation");
const { createSubmissionAction } = require("./submission/submission-action");

function batchError(code, message) { const error = new Error(message); error.code = code; return error; }
function hash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function safeName(value) { return String(value || "article").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, "-").replace(/^[. -]+|[. -]+$/g, "").slice(0, 80) || "article"; }
function latestAttempt(record) { return record && Array.isArray(record.attempts) && record.attempts.length ? record.attempts[record.attempts.length - 1] : null; }
function isBlockingReservationError(error) { return !!error && ["PUBLICATION_DUPLICATE", "PUBLICATION_UNCERTAIN"].indexOf(error.code) !== -1; }
function itemStatusForRecord(record, state) {
  if (record && record.status === "uncertain") return "blockedUncertain";
  if (record && ["submitting", "submitted", "published"].indexOf(record.status) !== -1) return "blockedPublished";
  if (record && record.status === "queued") return state && state.queueStatus === "idempotent" ? "idempotent" : "conflict";
  if (state && state.conflictCode && (!record || ["failed", "cancelled"].indexOf(record.status) === -1)) return "conflict";
  return state && state.queueStatus === "idempotent" && !record ? "idempotent" : "queueable";
}
function articleQueuePath(inputRoot, platform, article) {
  const filePath = path.resolve(inputRoot, platform.scanDir || platform.id, safeName(article.title) + "-" + article.id + ".md");
  return { filePath, sidecarPath: filePath + ".submission.json" };
}
function removeSubmissionPair(filePath, sidecarPath) {
  if (!filePath || !sidecarPath) return;
  try { if (fs.existsSync(sidecarPath)) fs.unlinkSync(sidecarPath); } catch (_) {}
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
}

function removeSubmissionPairStrict(filePath, sidecarPath) {
  [sidecarPath, filePath].forEach(function(file) {
    if (!file || !fs.existsSync(file)) return;
    fs.unlinkSync(file);
  });
}

function createContentSubmissionService(opts) {
  const options = opts || {};
  const rootDir = path.resolve(options.workspaceRoot || process.cwd());
  const store = options.articleStore || createArticleStore(rootDir, { paths: options.paths });
  const batchStore = options.batchStore || createSubmissionBatchStore({ workspaceRoot: rootDir, directory: options.paths && options.paths.submissionRecords });
  const publicationLedger = options.publicationLedger || createPublicationLedger({ workspaceRoot: rootDir, paths: options.paths });
  const inputRoot = path.resolve(options.paths && options.paths.input || path.join(rootDir, ".autopublish", "input"));

  function notifyData(reasonCode) {
    if (typeof options.onDataInvalidated !== "function") return;
    try { options.onDataInvalidated(reasonCode); } catch (_) {}
  }

  function availablePlatforms() {
    if (Array.isArray(options.platforms)) return options.platforms.slice();
    const { loadPlatforms } = require("../../src/core/platforms");
    return loadPlatforms().map((platform) => ({ id: platform.id, scanDir: platform.scanDir || platform.id, contentQueueImport: platform.contentQueueImport === true }));
  }

  function assertBatchInput(value) {
    if (!value || typeof value !== "object" || typeof value.clientId !== "string" || !value.clientId.trim() || !Array.isArray(value.articleIds) || !Array.isArray(value.targetPlatformIds) || !value.articleIds.length || !value.targetPlatformIds.length) throw batchError("CONTENT_SUBMISSION_BATCH_INPUT_INVALID", "Batch selection is invalid");
    const unique = (values) => new Set(values).size === values.length && values.every((item) => typeof item === "string" && /^[A-Za-z0-9_.-]+$/.test(item));
    if (!unique(value.articleIds) || !unique(value.targetPlatformIds)) throw batchError("CONTENT_SUBMISSION_BATCH_INPUT_INVALID", "Batch selection is invalid");
    return value;
  }

  function itemForArticle(article, platform, platformId) {
    const markdown = articleMarkdown(article);
    const contentHash = hash(markdown);
    const paths = articleQueuePath(inputRoot, platform, article);
    const context = publicationContext(article, platformId);
    const record = publicationRecordFor(publicationLedger, context);
    const state = inspectSubmission({
      filePath: paths.filePath,
      sidecarPath: paths.sidecarPath,
      markdown,
      article,
      contentHash,
      targetPlatform: platformId,
      context,
      record,
      rootDir: rootDir
    });
    return Object.assign({
      articleId: article.id,
      targetPlatformId: platformId,
      filename: path.basename(paths.filePath),
      contentHash,
      filePath: paths.filePath,
      sidecarPath: paths.sidecarPath,
      status: state.status,
      pairState: state.pairState,
      identityMatched: state.identityMatched,
      contentMatched: state.contentMatched,
      mainExists: state.mainExists,
      sidecarExists: state.sidecarExists
    }, publicationFields(context, record), state.conflictCode ? { reasonCode: state.conflictCode } : {});
  }

  function listPlatforms() {
    return availablePlatforms().map((platform) => ({ id: platform.id, displayName: platform.displayName || platform.id, scanDir: platform.scanDir || platform.id, contentQueueImport: platform.contentQueueImport === true }));
  }

  function publicationForBatchItem(item) {
    if (!item.publicationId || !item.attemptId || typeof publicationLedger.get !== "function") return null;
    try { return publicationLedger.get(item.publicationId); } catch (_) { return null; }
  }

  function readSidecar(item) {
    try { return JSON.parse(fs.readFileSync(item.sidecarPath, "utf8")); } catch (_) { return null; }
  }

  function articleSelectionKey(item) { return item.clientId + "\0" + item.articleId; }

  // Read snapshots are deliberately private to this service.  They make a
  // query internally consistent, but are never accepted from callers that
  // mutate state: mutations must observe the filesystem again.
  function createReadSnapshot(input) {
    return createSubmissionReadSnapshot({ batchStore: batchStore, getDataRevision: options.getDataRevision, onSnapshotCreated: options.onSubmissionSnapshotCreated }, input);
  }

  function snapshotPublication(snapshot, item) {
    if (!item.publicationId || !item.attemptId) return null;
    if (!snapshot.publicationsById.has(item.publicationId)) snapshot.publicationsById.set(item.publicationId, publicationForBatchItem(item));
    return snapshot.publicationsById.get(item.publicationId);
  }

  function snapshotSidecar(snapshot, entry) {
    if (!snapshot.sidecarsByItem.has(entry.itemKey)) snapshot.sidecarsByItem.set(entry.itemKey, readSidecar(entry.item));
    return snapshot.sidecarsByItem.get(entry.itemKey);
  }

  function articleSubmissionItems(selections, snapshot) {
    const readSnapshot = snapshot || createReadSnapshot();
    const requested = new Set(selections.map(articleSelectionKey));
    const found = [];
    const seen = new Set();
    requested.forEach(function(key) {
      (readSnapshot.itemsByArticle.get(key) || []).forEach(function(entry) {
        const batch = entry.batch;
        const item = entry.item;
        const identityKey = (item.publicationId || batch.id + ":" + item.targetPlatformId + ":" + item.articleId) + "\0" + (item.attemptId || "");
        if (seen.has(identityKey)) return;
        seen.add(identityKey);
        const record = snapshotPublication(readSnapshot, item);
        const latest = latestAttempt(record);
        const sidecar = snapshotSidecar(readSnapshot, entry);
        const pair = inspectSubmissionPairState(item, batch, sidecar, { rootDir: rootDir, record: record });
        const cleanedStatuses = ["failed-cleaned", "published-cleaned", "cancelled-cleaned"];
        const status = cleanedStatuses.includes(item.status) ? item.status : record ? record.status : item.publicationStatus || item.status;
        if (record && (record.titleSnapshot === undefined || record.titleSnapshot === null) && typeof publicationLedger.ensureTitleSnapshot === "function") {
          try {
            const sourceArticle = store.getArticle(batch.clientId, item.articleId);
            publicationLedger.ensureTitleSnapshot(record.publicationId, sourceArticle.title);
          } catch (_) {}
        }
        const safe = {
          clientId: batch.clientId,
          articleId: item.articleId,
          batchId: batch.id,
          targetPlatformId: item.targetPlatformId,
          publicationId: item.publicationId || null,
          attemptId: item.attemptId || null,
          contentHash: item.contentHash || (sidecar && sidecar.contentHash) || null,
          status: status,
          unchanged: pair.pairState === "intact",
          pairState: pair.pairState,
          identityMatched: pair.identityMatched,
          contentMatched: pair.contentMatched,
          mainExists: pair.mainExists,
          sidecarExists: pair.sidecarExists
        };
        found.push({ safe: safe, item: item, batch: batch, record: record, sidecar: sidecar, latest: latest });
      });
    });
    return found;
  }


  function locateArticleSubmissionItem(action, snapshot) {
    const readSnapshot = snapshot || createReadSnapshot({ batchId: action.batchId });
    const identityKey = (action.publicationId || action.batchId + ":" + action.targetPlatformId + ":" + action.articleId) + "\0" + (action.attemptId || "");
    const indexed = readSnapshot.itemsByIdentity.get(identityKey);
    const entries = indexed ? articleSubmissionItems([{ clientId: action.clientId, articleId: action.articleId }], readSnapshot).filter(function(entry) { return entry.item === indexed.item; }) : articleSubmissionItems([{ clientId: action.clientId, articleId: action.articleId }], readSnapshot);
    return entries.find(function(entry) {
      return entry.safe.batchId === action.batchId && entry.safe.targetPlatformId === action.targetPlatformId &&
        (action.publicationId && action.attemptId ? entry.safe.publicationId === action.publicationId && entry.safe.attemptId === action.attemptId : entry.safe.articleId === action.articleId);
    });
  }

  function actionBindingFingerprint(entry, action) {
    const record = entry.record || {};
    return hash(JSON.stringify({
      action: action.action,
      clientId: entry.safe.clientId,
      articleId: entry.safe.articleId,
      batchId: entry.safe.batchId,
      targetPlatformId: entry.safe.targetPlatformId,
      publicationId: entry.safe.publicationId,
      attemptId: entry.safe.attemptId,
      publicationStatus: entry.safe.status,
      contentHash: entry.safe.contentHash,
      sidecarAttemptId: entry.sidecar && entry.sidecar.attemptId || null,
      unchanged: entry.safe.unchanged,
      pairState: entry.safe.pairState,
      identityMatched: entry.safe.identityMatched,
      contentMatched: entry.safe.contentMatched,
      recordStatus: record.status || null,
      attempts: Array.isArray(record.attempts) ? record.attempts.map(function(attempt) { return { attemptId: attempt.attemptId, status: attempt.status }; }) : []
    }));
  }

  function evaluation(action, entry, allowed, reasonCode, resolvedState) {
    const safeState = Object.assign({}, entry && entry.safe || {}, { reasonCode: reasonCode || null });
    return {
      allowed: allowed === true,
      action: action.action,
      reasonCode: reasonCode || null,
      resolvedState: resolvedState || safeState,
      bindingFingerprint: entry ? actionBindingFingerprint(entry, action) : null,
      entry: entry || null
    };
  }

  function evaluateItemAction(action, snapshot) {
    if (!action || typeof action !== "object" || !["cancel", "cleanup", "cleanupPublishedLocal", "cleanupCancelledLocal"].includes(action.action)) {
      return { allowed: false, action: action && action.action || null, reasonCode: "SUBMISSION_ACTION_INVALID", resolvedState: null, bindingFingerprint: null, entry: null };
    }
    const entry = locateArticleSubmissionItem(action, snapshot);
    if (!entry || !entry.item || !entry.batch) return { allowed: false, action: action.action, reasonCode: "SUBMISSION_QUEUE_ITEM_NOT_FOUND", resolvedState: null, bindingFingerprint: null, entry: null };
    const currentFingerprint = actionBindingFingerprint(entry, action);
    if (action.evaluationFingerprint && action.evaluationFingerprint !== currentFingerprint) {
      return evaluation(action, entry, false, "SUBMISSION_ACTION_STALE");
    }
    if (!["failed-cleaned", "published-cleaned", "cancelled-cleaned"].includes(entry.safe.status) && !["intact", "both_absent", "main_absent", "sidecar_absent"].includes(entry.safe.pairState)) {
      const reason = entry.safe.pairState === "identity_conflict" ? "SUBMISSION_IDENTITY_CONFLICT"
        : entry.safe.pairState === "content_changed" ? "SUBMISSION_CONTENT_CHANGED" : "SUBMISSION_QUEUE_CHANGED";
      return evaluation(action, entry, false, reason);
    }
    if (entry.safe.pairState === "both_absent" && entry.safe.identityMatched !== true) {
      return evaluation(action, entry, false, "SUBMISSION_IDENTITY_CONFLICT");
    }
    if (["main_absent", "sidecar_absent"].includes(entry.safe.pairState) && entry.safe.identityMatched !== true) {
      return evaluation(action, entry, false, "SUBMISSION_IDENTITY_CONFLICT");
    }
    if (action.action === "cancel" && entry.safe.status === "cancelled") {
      return evaluation(action, entry, false, "SUBMISSION_ALREADY_CANCELLED");
    }
    if (["failed-cleaned", "published-cleaned", "cancelled-cleaned"].includes(entry.safe.status)) return evaluation(action, entry, true, null);

    if (action.action === "cancel") {
      if (entry.safe.status !== "queued") return evaluation(action, entry, false, entry.safe.status === "failed" ? "PUBLICATION_STATUS_NOT_QUEUED" : "ARTICLE_SUBMISSION_ACTIVE");
      if (entry.record && (entry.record.status !== "queued" || !entry.latest || entry.latest.attemptId !== action.attemptId)) {
        return evaluation(action, entry, false, "PUBLICATION_ATTEMPT_MISMATCH");
      }
      if (entry.latest && entry.latest.status !== "queued") return evaluation(action, entry, false, "PUBLICATION_REMOTE_STARTED");
      return evaluation(action, entry, true, null);
    }

    const localCleanupAction = ["cleanup", "cleanupPublishedLocal", "cleanupCancelledLocal"].includes(action.action);
    if (!localCleanupAction) return evaluation(action, entry, false, "SUBMISSION_ACTION_INVALID");
    const expectedStatus = action.action === "cleanup" ? "failed" : action.action === "cleanupPublishedLocal" ? "published" : "cancelled";
    if (entry.safe.status !== expectedStatus) return evaluation(action, entry, false, ["queued", "submitting", "submitted", "uncertain"].includes(entry.safe.status) ? "ARTICLE_SUBMISSION_ACTIVE" : "PUBLICATION_STATUS_NOT_FAILED");
    if (entry.record) {
      if (entry.record.status !== expectedStatus) return evaluation(action, entry, false, action.action === "cleanup" ? "PUBLICATION_STATUS_NOT_FAILED" : "PUBLICATION_ATTEMPT_MISMATCH");
      const historicalAttempt = Array.isArray(entry.record.attempts) && entry.record.attempts.find(function(attempt) { return attempt.attemptId === action.attemptId && attempt.status === expectedStatus; });
      if (!historicalAttempt) return evaluation(action, entry, false, "PUBLICATION_ATTEMPT_MISMATCH");
    } else if (entry.safe.publicationId) {
      return evaluation(action, entry, false, "PUBLICATION_RECORD_MISSING");
    }
    return evaluation(action, entry, true, null);
  }

  function input(value) { if (!value || value.confirmed !== true || !value.clientId) { const e = new Error("Manual confirmation is required"); e.code = "CONTENT_EXPORT_CONFIRMATION_REQUIRED"; throw e; } return value; }

  function inspectPair(value) {
    const request = value || {};
    const entry = request.item && request.batch
      ? { item: request.item, batch: request.batch, sidecar: request.sidecar }
      : locateArticleSubmissionItem(request);
    if (!entry) throw batchError("SUBMISSION_QUEUE_ITEM_NOT_FOUND", "Submission batch item was not found");
    return inspectSubmissionPairState(entry.item, entry.batch, entry.sidecar, { rootDir: rootDir, record: entry.record || request.record || null });
  }
  // Local archival is a persisted batch fact.  Reading it is deliberately
  // side-effect free so historical batches without this optional field remain
  // compatible and are never rewritten merely by opening the attention view.
  function listArchiveFailures() {
    return batchStore.list().reduce(function(result, batch) {
      (batch.items || []).forEach(function(item) {
        if (!item.localArchive || item.localArchive.status !== "failed" || item.status !== "published" || item.publicationStatus !== "published") return;
        const record = publicationForBatchItem(item);
        if (!record || record.status !== "published") return;
        const pair = inspectSubmissionPairState(item, batch, readSidecar(item), { rootDir: rootDir, record: record });
        result.push({
          batchId: batch.id,
          clientId: batch.clientId,
          articleId: item.articleId,
          platformId: item.targetPlatformId,
          targetPlatformId: item.targetPlatformId,
          publicationId: item.publicationId,
          attemptId: item.attemptId,
          status: "published",
          reasonCode: item.localArchive.errorCode,
          updatedAt: item.localArchive.updatedAt,
          pairState: pair.pairState
        });
      });
      return result;
    }, []);
  }
  function exporterFor(value) {
    return options.exporter || createSubmissionExportService({
      rootDir,
      paths: options.paths,
      platforms: availablePlatforms(),
      publicationLedger,
      getArticle: function(id) { return store.getArticle(value.clientId, id); }
    });
  }
  const query = createSubmissionQuery({
    batchStore: batchStore,
    getDataRevision: options.getDataRevision,
    onSnapshotCreated: options.onSubmissionSnapshotCreated,
    publicationLedger: publicationLedger,
    latestAttempt: latestAttempt,
    readSidecar: readSidecar,
    inspectSubmissionPair: inspectSubmissionPairState,
    rootDir: rootDir,
    getArticle: function(clientId, articleId) { return store.getArticle(clientId, articleId); },
    hash: hash
  });
  const preparation = createSubmissionPreparation({
    publicationLedger: publicationLedger, articleStore: store, latestAttempt: latestAttempt,
    getDataRevision: options.getDataRevision, getArticle: function(clientId, articleId) { return store.getArticle(clientId, articleId); },
    assertBatchInput: assertBatchInput, availablePlatforms: availablePlatforms, hash: hash, articleMarkdown: articleMarkdown,
    batchStore: batchStore, publicationContext: publicationContext,
    publicationRecordFor: function(context) { return publicationRecordFor(publicationLedger, context); },
    publicationFields: publicationFields, makeSidecar: makeSidecar, basename: path.basename,
    mkdirFor: function(filePath) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); },
    writeAtomic: writeAtomic, writePairAtomic: writePairAtomic, removeSubmissionPair: removeSubmissionPair,
    cancelReservation: function(reservation, reason) { return cancelReservation(publicationLedger, reservation, reason); },
    isBlockingReservationError: isBlockingReservationError, itemStatusForRecord: itemStatusForRecord,
    inspectSubmission: function(item, markdown, article, contentHash, targetPlatform, context) { return inspectSubmission({ filePath: item.filePath, sidecarPath: item.sidecarPath, markdown: markdown, article: article, contentHash: contentHash, targetPlatform: targetPlatform, context: context, record: publicationRecordFor(publicationLedger, context), rootDir: rootDir }); },
    itemForArticle: itemForArticle, notifyData: notifyData,
    platformFor: function(id) { return availablePlatforms().find(function(platform) { return platform.id === id && platform.contentQueueImport === true; }); },
    evaluateEligibility: function(article, platformId) { return evaluateArticleSubmissionEligibility(article, { targetPlatform: { id: platformId, contentQueueImport: true } }); }
  });
  const action = createSubmissionAction({
    batchStore: batchStore,
    query: query,
    notifyData: notifyData,
    cancelReservation: function(reservation, reason) { return cancelReservation(publicationLedger, reservation, reason); },
    readPair: function(item) {
      let file = null; let sidecar = null;
      try { if (fs.existsSync(item.filePath)) file = fs.readFileSync(item.filePath); } catch (_) {}
      try { if (fs.existsSync(item.sidecarPath)) sidecar = fs.readFileSync(item.sidecarPath); } catch (_) {}
      return { file: file, sidecar: sidecar };
    },
    removePair: function(item) { removeSubmissionPairStrict(item.filePath, item.sidecarPath); },
    restorePair: function(item, original) {
      try { if (original.file !== null && !fs.existsSync(item.filePath)) { fs.mkdirSync(path.dirname(item.filePath), { recursive: true }); fs.writeFileSync(item.filePath, original.file); } } catch (_) {}
      try { if (original.sidecar !== null && !fs.existsSync(item.sidecarPath)) { fs.mkdirSync(path.dirname(item.sidecarPath), { recursive: true }); fs.writeFileSync(item.sidecarPath, original.sidecar); } } catch (_) {}
    },
    isArticleTrashed: function(clientId, articleId) {
      return typeof store.isArticleRemoved === "function" ? store.isArticleRemoved(clientId, articleId) : typeof store.isArticleTrashed === "function" && store.isArticleTrashed(clientId, articleId);
    }
  });
  return {
    previewExport: function(value) { value = input(value); return exporterFor(value).previewExport(value); },
    exportArticle: function(value) {
      value = input(value);
      const result = exporterFor(value).exportArticle(value);
      notifyData("CONTENT_EXPORT_QUEUED");
      return result;
    },
    listPlatforms,
    previewBatch: preparation.previewBatch,
    createBatch: preparation.createBatch,
    buildSubmissionActionPlan: query.buildActionPlan,
    previewCancelBatch: action.previewCancelBatch,
    cancelBatch: action.cancelBatch,
    getBatch: query.getBatch,
    listBatches: query.listBatches,
    reconcileBatch: query.reconcileBatch,
    previewCleanupFailedItems: action.previewCleanupFailedItems,
    cleanupFailedItems: action.cleanupFailedItems,
    previewArticleRemovalImpact: query.previewArticleRemovalImpact,
    cancelArticleSubmissionItem: action.cancelArticleSubmissionItem,
    cleanupArticleSubmissionItem: action.cleanupArticleSubmissionItem,
    cleanupPublishedArticleLocal: action.cleanupPublishedArticleLocal,
    cleanupCancelledArticleLocal: action.cleanupCancelledArticleLocal,
    inspectSubmissionPair: inspectPair,
    evaluateItemAction: query.evaluateItemAction,
    isSubmissionItemExecutable: action.isSubmissionItemExecutable,
    previewTrashedArticleQueueResidue: action.previewTrashedArticleQueueResidue,
    cleanupTrashedArticleQueueResidue: action.cleanupTrashedArticleQueueResidue,
    previewRetryFailedPublication: preparation.previewRetryFailedPublication,
    retryFailedPublication: preparation.retryFailedPublication
    ,listArchiveFailures
  };
}

module.exports = { createContentSubmissionService };
