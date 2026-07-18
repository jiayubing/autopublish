const { createArticleStore } = require("../../src/content/article-store");
const {
  createSubmissionExportService,
  cancelReservation,
  inspectSubmission,
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

function createContentSubmissionService(opts) {
  const options = opts || {};
  const rootDir = path.resolve(options.workspaceRoot || process.cwd());
  const store = options.articleStore || createArticleStore(rootDir, { paths: options.paths });
  const batchStore = options.batchStore || createSubmissionBatchStore({ workspaceRoot: rootDir, directory: options.paths && options.paths.submissionRecords });
  const publicationLedger = options.publicationLedger || createPublicationLedger({ workspaceRoot: rootDir, paths: options.paths });
  const inputRoot = path.resolve(options.paths && options.paths.input || path.join(rootDir, ".autopublish", "input"));

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
      record
    });
    return Object.assign({
      articleId: article.id,
      targetPlatformId: platformId,
      contentHash,
      filePath: paths.filePath,
      sidecarPath: paths.sidecarPath,
      status: state.status
    }, publicationFields(context, record), state.conflictCode ? { reasonCode: state.conflictCode } : {});
  }

  function previewBatch(value) {
    const input = assertBatchInput(value);
    const platforms = availablePlatforms();
    const platformMap = new Map(platforms.map((platform) => [platform.id, platform]));
    const unsupportedPlatformIds = input.targetPlatformIds.filter((id) => !platformMap.has(id) || platformMap.get(id).contentQueueImport !== true);
    const items = [];
    const unreviewedArticleIds = [];
    const missingArticleIds = [];
    const conflicts = [];
    input.articleIds.forEach((articleId) => {
      let article;
      try { article = store.getArticle(input.clientId, articleId); } catch (_) { missingArticleIds.push(articleId); return; }
      if (article.status !== "saved") unreviewedArticleIds.push(articleId);
      input.targetPlatformIds.forEach((platformId) => {
        const platform = platformMap.get(platformId);
        const item = { articleId, targetPlatformId: platformId, contentHash: hash(articleMarkdown(article)), status: "excluded" };
        if (article.status === "saved" && platform && platform.contentQueueImport === true) {
          const classified = itemForArticle(article, platform, platformId);
          Object.assign(item, classified);
          if (item.status === "conflict") conflicts.push(item);
        }
        items.push(item);
      });
    });
    const count = (status) => items.filter((item) => item.status === status).length;
    return {
      clientId: input.clientId,
      articleIds: input.articleIds.slice(),
      targetPlatformIds: input.targetPlatformIds.slice(),
      totalTaskCount: input.articleIds.length * input.targetPlatformIds.length,
      queueableTaskCount: count("queueable"),
      idempotentCount: count("idempotent"),
      alreadyQueuedCount: count("idempotent"),
      blockedPublishedCount: count("blockedPublished"),
      blockedUncertainCount: count("blockedUncertain"),
      conflictCount: conflicts.length,
      unreviewedArticleIds: [...new Set(unreviewedArticleIds)],
      missingArticleIds,
      unsupportedPlatformIds,
      items
    };
  }

  function listPlatforms() {
    return availablePlatforms().map((platform) => ({ id: platform.id, displayName: platform.displayName || platform.id, scanDir: platform.scanDir || platform.id, contentQueueImport: platform.contentQueueImport === true }));
  }

  function applyReservation(item, context, reservation) {
    Object.assign(item, publicationFields(context, null, reservation), { publicationStatus: reservation.status });
    item.status = "queued";
    return item;
  }

  function saveBatch(batch) { return batchStore.save(batch); }

  function createBatch(value) {
    const input = assertBatchInput(value);
    if (value.confirmed !== true) throw batchError("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED", "Batch confirmation is required");
    const preview = previewBatch(input);
    if (preview.missingArticleIds.length) throw batchError("CONTENT_SUBMISSION_ARTICLE_NOT_FOUND", "Selected article was not found");
    const batchId = batchStore.createId();
    const createdAt = new Date().toISOString();
    const batch = { version: 1, id: batchId, clientId: input.clientId, createdAt, status: "queued", items: [] };
    const createdReservations = [];
    const writtenItems = [];
    let createdCount = 0;
    let idempotentCount = 0;
    saveBatch(batch);
    try {
      preview.items.forEach((previewItem) => {
        if (previewItem.status !== "queueable" && previewItem.status !== "idempotent") {
          batch.items.push(Object.assign({}, previewItem));
          saveBatch(batch);
          return;
        }
        const article = store.getArticle(input.clientId, previewItem.articleId);
        const platform = availablePlatforms().find((candidate) => candidate.id === previewItem.targetPlatformId);
        if (!platform) throw batchError("CONTENT_SUBMISSION_TARGET_INVALID", "Submission target is invalid");
        const markdown = articleMarkdown(article);
        const contentHash = hash(markdown);
        const context = publicationContext(article, previewItem.targetPlatformId);
        let record = publicationRecordFor(publicationLedger, context);
        let reservation = null;
        const needsReservation = context.tracked && (!record || ["failed", "cancelled"].indexOf(record.status) !== -1);
        try {
          if (needsReservation) {
            reservation = publicationLedger.reserve(context.identity, context.target, { displayName: previewItem.targetPlatformId });
            createdReservations.push({ reservation, item: previewItem });
            record = reservation;
          }
        } catch (caught) {
          if (!isBlockingReservationError(caught)) throw caught;
          const freshItem = itemForArticle(article, platform, previewItem.targetPlatformId);
          freshItem.status = itemStatusForRecord(publicationRecordFor(publicationLedger, context), inspectSubmission({
            filePath: freshItem.filePath,
            sidecarPath: freshItem.sidecarPath,
            markdown,
            article,
            contentHash,
            targetPlatform: previewItem.targetPlatformId,
            context,
            record: publicationRecordFor(publicationLedger, context)
          }));
          batch.items.push(freshItem);
          saveBatch(batch);
          return;
        }

        const item = Object.assign({}, previewItem, { status: previewItem.status, submissionBatchId: batchId });
        Object.assign(item, publicationFields(context, record, reservation));
        batch.items.push(item);
        // Persist the reservation before touching queue files. A crash here is
        // discoverable as a batch item plus a queued ledger record.
        item.status = "reserving";
        saveBatch(batch);
        const sidecar = makeSidecar({
          submissionBatchId: batchId,
          article,
          targetPlatform: previewItem.targetPlatformId,
          targetPlatformId: previewItem.targetPlatformId,
          filename: path.basename(item.filePath),
          contentHash,
          queuedAt: createdAt,
          context,
          reservation: reservation || record
        });
        fs.mkdirSync(path.dirname(item.filePath), { recursive: true });
        if (previewItem.status === "idempotent") {
          if (reservation) writeAtomic(item.sidecarPath, JSON.stringify(sidecar, null, 2) + "\n");
          item.status = "skipped";
          idempotentCount += 1;
        } else {
          writePairAtomic(item.filePath, markdown, item.sidecarPath, JSON.stringify(sidecar, null, 2) + "\n");
          item.status = "queued";
          createdCount += 1;
          writtenItems.push(item);
        }
        item.publicationStatus = (reservation || record || {}).status || null;
        saveBatch(batch);
      });
    } catch (caught) {
      writtenItems.forEach((item) => removeSubmissionPair(item.filePath, item.sidecarPath));
      createdReservations.slice().reverse().forEach((entry) => {
        try { cancelReservation(publicationLedger, entry.reservation, "QUEUE_WRITE_FAILED"); } catch (_) {}
      });
      throw caught;
    }
    batch.status = createdCount > 0 ? "queued" : "completed";
    batch.updatedAt = new Date().toISOString();
    saveBatch(batch);
    return Object.assign({}, preview, {
      batchId,
      createdCount,
      idempotentCount,
      items: batch.items,
      queueableTaskCount: createdCount,
      alreadyQueuedCount: idempotentCount
    });
  }

  function publicationForBatchItem(item) {
    if (!item.publicationId || !item.attemptId || typeof publicationLedger.get !== "function") return null;
    try { return publicationLedger.get(item.publicationId); } catch (_) { return null; }
  }

  function pairIsUnchanged(item, batch, sidecar) {
    return sidecar && sidecar.submissionBatchId === batch.id && fs.existsSync(item.filePath) && hash(fs.readFileSync(item.filePath, "utf8")) === item.contentHash;
  }

  function cancelBatch(value) {
    if (!value || value.confirmed !== true || typeof value.batchId !== "string") throw batchError("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED", "Batch confirmation is required");
    const batch = batchStore.get(value.batchId);
    let cancelledCount = 0;
    let skippedCount = 0;
    batch.items.forEach((item) => {
      if (item.status !== "queued" || !item.filePath) { skippedCount += 1; return; }
      let sidecar;
      try { sidecar = JSON.parse(fs.readFileSync(item.sidecarPath, "utf8")); } catch (_) { skippedCount += 1; return; }
      if (!pairIsUnchanged(item, batch, sidecar)) { item.status = "conflict"; skippedCount += 1; return; }
      const record = publicationForBatchItem(item);
      if (record) {
        const attempt = latestAttempt(record);
        if (record.status !== "queued" || !attempt || attempt.attemptId !== item.attemptId) { skippedCount += 1; return; }
        try { cancelReservation(publicationLedger, { publicationId: item.publicationId, attemptId: item.attemptId }, "QUEUE_CANCELLED"); } catch (_) { skippedCount += 1; return; }
      }
      removeSubmissionPair(item.filePath, item.sidecarPath);
      item.status = "cancelled";
      item.publicationStatus = record ? "cancelled" : null;
      cancelledCount += 1;
    });
    batch.status = batch.items.some((item) => item.status === "queued") ? "queued" : "cancelled";
    batch.updatedAt = new Date().toISOString();
    saveBatch(batch);
    return { batchId: batch.id, cancelledCount, skippedCount, items: batch.items };
  }

  function previewCancelBatch(value) {
    if (!value || typeof value.batchId !== "string") throw batchError("CONTENT_SUBMISSION_BATCH_INPUT_INVALID", "Batch id is required");
    const batch = batchStore.get(value.batchId);
    let cancelableCount = 0;
    let uncancelableCount = 0;
    const items = batch.items.map((item) => {
      const copy = Object.assign({}, item);
      delete copy.filePath;
      delete copy.sidecarPath;
      if (item.status !== "queued") { uncancelableCount += 1; return Object.assign(copy, { cancelable: false }); }
      try {
        const sidecar = JSON.parse(fs.readFileSync(item.sidecarPath, "utf8"));
        const unchanged = pairIsUnchanged(item, batch, sidecar);
        const record = publicationForBatchItem(item);
        const publicationCancelable = !record || (record.status === "queued" && latestAttempt(record) && latestAttempt(record).attemptId === item.attemptId);
        const valid = unchanged && publicationCancelable;
        if (valid) cancelableCount += 1; else uncancelableCount += 1;
        return Object.assign(copy, { cancelable: valid });
      } catch (_) { uncancelableCount += 1; return Object.assign(copy, { cancelable: false }); }
    });
    return { batchId: batch.id, cancelableCount, uncancelableCount, items };
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
  return {
    previewExport: function(value) { value = input(value); return exporterFor(value).previewExport(value); },
    exportArticle: function(value) { value = input(value); return exporterFor(value).exportArticle(value); },
    listPlatforms,
    previewBatch,
    createBatch,
    previewCancelBatch,
    cancelBatch,
    getBatch: function(batchId) { return batchStore.get(batchId); },
    listBatches: function(clientId) { return batchStore.list().filter(function(batch) { return !clientId || batch.clientId === clientId; }); }
  };
}

module.exports = { createContentSubmissionService };
