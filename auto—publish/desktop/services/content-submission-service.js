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

  function input(value) { if (!value || value.confirmed !== true || !value.clientId) { const e = new Error("Manual confirmation is required"); e.code = "CONTENT_EXPORT_CONFIRMATION_REQUIRED"; throw e; } return value; }

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
    readSidecar: function(item) { try { return JSON.parse(fs.readFileSync(item.sidecarPath, "utf8")); } catch (_) { return null; } },
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
    inspectSubmissionPair: query.inspectSubmissionPair,
    evaluateItemAction: query.evaluateItemAction,
    isSubmissionItemExecutable: action.isSubmissionItemExecutable,
    previewTrashedArticleQueueResidue: action.previewTrashedArticleQueueResidue,
    cleanupTrashedArticleQueueResidue: action.cleanupTrashedArticleQueueResidue,
    previewRetryFailedPublication: preparation.previewRetryFailedPublication,
    retryFailedPublication: preparation.retryFailedPublication,
    listArchiveFailures: query.listArchiveFailures
  };
}

module.exports = { createContentSubmissionService };
