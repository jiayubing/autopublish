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
      filename: path.basename(paths.filePath),
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
            reservation = publicationLedger.reserve(context.identity, context.target, { displayName: previewItem.targetPlatformId, titleSnapshot: context.titleSnapshot });
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
    if (!sidecar || sidecar.submissionBatchId !== batch.id || !item.filePath || !item.sidecarPath) return false;
    if (sidecar.contentHash !== item.contentHash || sidecar.targetPlatformId !== item.targetPlatformId) return false;
    if (item.publicationId && sidecar.publicationId !== item.publicationId) return false;
    if (item.attemptId && sidecar.attemptId !== item.attemptId) return false;
    try { return fs.existsSync(item.filePath) && hash(fs.readFileSync(item.filePath, "utf8")) === item.contentHash; } catch (_) { return false; }
  }

  function readSidecar(item) {
    try { return JSON.parse(fs.readFileSync(item.sidecarPath, "utf8")); } catch (_) { return null; }
  }

  function articleSelectionKey(item) { return item.clientId + "\0" + item.articleId; }

  function articleSubmissionItems(selections) {
    const requested = new Set(selections.map(articleSelectionKey));
    const found = [];
    const seen = new Set();
    batchStore.list().forEach(function(batch) {
      (batch.items || []).forEach(function(item) {
        const key = batch.clientId + "\0" + item.articleId;
        if (!requested.has(key)) return;
        const identityKey = (item.publicationId || batch.id + ":" + item.targetPlatformId + ":" + item.articleId) + "\0" + (item.attemptId || "");
        if (seen.has(identityKey)) return;
        seen.add(identityKey);
        const record = publicationForBatchItem(item);
        const latest = latestAttempt(record);
        const sidecar = readSidecar(item);
        const unchanged = pairIsUnchanged(item, batch, sidecar);
        const status = record ? record.status : item.publicationStatus || item.status;
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
          unchanged: unchanged
        };
        found.push({ safe: safe, item: item, batch: batch, record: record, sidecar: sidecar, latest: latest });
      });
    });
    return found;
  }

  function previewArticleRemovalImpact(value) {
    const selections = value && (value.selections || value.articles);
    if (!Array.isArray(selections) || !selections.length) throw batchError("CONTENT_INPUT_INVALID", "At least one article is required");
    const normalized = selections.map(function(item) {
      if (!item || typeof item.clientId !== "string" || !item.clientId.trim() || typeof item.articleId !== "string" || !item.articleId.trim()) throw batchError("CONTENT_INPUT_INVALID", "Article selection is invalid");
      return { clientId: item.clientId, articleId: item.articleId };
    });
    const entries = articleSubmissionItems(normalized);
    const byKey = new Set(entries.map(function(entry) { return entry.safe.publicationId + "\0" + entry.safe.attemptId; }));
    if (typeof publicationLedger.listForArticles === "function") {
      normalized.forEach(function(selection) {
        let records = [];
        try { records = publicationLedger.listForArticles(selection.clientId, [selection.articleId]); } catch (_) {}
        records.forEach(function(record) {
          const latest = latestAttempt(record);
          const key = record.publicationId + "\0" + (latest && latest.attemptId || "");
          if (byKey.has(key)) return;
          entries.push({ safe: {
            clientId: selection.clientId, articleId: selection.articleId, batchId: null,
            targetPlatformId: record.platformId || null, publicationId: record.publicationId,
            attemptId: latest && latest.attemptId || null, contentHash: record.contentHash || null,
            status: record.status, unchanged: false
          }, item: null, batch: null, record: record, sidecar: null, latest: latest });
        });
      });
    }
    const queuedToCancel = [];
    const failedToClean = [];
    const blockedItems = [];
    const publicItems = entries.map(function(entry) {
      const value = entry.safe;
      if (["submitting", "submitted", "uncertain"].indexOf(value.status) !== -1) {
        blockedItems.push(Object.assign({}, value, { reasonCode: "ARTICLE_SUBMISSION_ACTIVE" }));
      } else if (value.status === "queued") {
        if (value.unchanged && value.batchId && value.publicationId && value.attemptId) queuedToCancel.push(Object.assign({}, value, { action: "cancel" }));
        else blockedItems.push(Object.assign({}, value, { reasonCode: value.batchId ? "SUBMISSION_QUEUE_CHANGED" : "PUBLICATION_RESERVATION_WITHOUT_QUEUE" }));
      } else if (value.status === "failed") {
        if (value.unchanged && value.batchId) failedToClean.push(Object.assign({}, value, { action: "cleanup" }));
        else if (value.batchId) blockedItems.push(Object.assign({}, value, { reasonCode: "SUBMISSION_QUEUE_CHANGED" }));
      } else if (value.status === "published" && value.batchId) {
        blockedItems.push(Object.assign({}, value, { reasonCode: "SUBMISSION_QUEUE_STATUS_CONFLICT" }));
      }
      return Object.assign({}, value, { sourceArticleState: "active" });
    });
    return {
      selections: normalized,
      articleCount: normalized.length,
      items: publicItems,
      queuedToCancel: queuedToCancel,
      failedToClean: failedToClean,
      blockedItems: blockedItems,
      queuedToCancelCount: queuedToCancel.length,
      failedToCleanCount: failedToClean.length,
      canCommit: blockedItems.length === 0
    };
  }

  function locateArticleSubmissionItem(action) {
    const entries = articleSubmissionItems([{ clientId: action.clientId, articleId: action.articleId }]);
    return entries.find(function(entry) {
      return entry.safe.batchId === action.batchId && entry.safe.publicationId === action.publicationId && entry.safe.attemptId === action.attemptId && entry.safe.targetPlatformId === action.targetPlatformId;
    });
  }

  function applyArticleSubmissionItem(action, expectedStatus, nextStatus, reasonCode) {
    const entry = locateArticleSubmissionItem(action);
    if (!entry || !entry.item || !entry.batch) throw batchError("SUBMISSION_QUEUE_CHANGED", "Submission queue item is unavailable");
    if (entry.safe.status === nextStatus || entry.safe.status === "failed-cleaned" || entry.safe.status === "cancelled") return { action: action.action || nextStatus, status: entry.safe.status, idempotent: true };
    if (entry.safe.status !== expectedStatus || !entry.safe.unchanged) throw batchError("SUBMISSION_QUEUE_CHANGED", "Submission queue item changed");
    if (entry.record && entry.latest && entry.latest.attemptId !== action.attemptId) throw batchError("PUBLICATION_ATTEMPT_MISMATCH", "Publication attempt is not current");
    if (nextStatus === "cancelled" && entry.record) cancelReservation(publicationLedger, { publicationId: action.publicationId, attemptId: action.attemptId }, reasonCode);
    removeSubmissionPair(entry.item.filePath, entry.item.sidecarPath);
    batchStore.updateItem(entry.batch.id, { publicationId: action.publicationId, attemptId: action.attemptId, targetPlatformId: action.targetPlatformId }, { status: nextStatus, publicationStatus: entry.record ? nextStatus === "failed-cleaned" ? "failed" : nextStatus : undefined, reasonCode: reasonCode });
    return { action: action.action || nextStatus, status: nextStatus, batchId: entry.batch.id, publicationId: action.publicationId, attemptId: action.attemptId };
  }

  function cancelArticleSubmissionItem(action) { return applyArticleSubmissionItem(action, "queued", "cancelled", "ARTICLE_TRASHED_BEFORE_SUBMISSION"); }
  function cleanupArticleSubmissionItem(action) { return applyArticleSubmissionItem(action, "failed", "failed-cleaned", "ARTICLE_TRASHED_FAILED_QUEUE_CLEANUP"); }

  function isSubmissionItemExecutable(action) {
    const entry = locateArticleSubmissionItem(action);
    if (!entry) return false;
    if (typeof store.isArticleRemoved === "function" && store.isArticleRemoved(action.clientId, action.articleId) ||
        typeof store.isArticleTrashed === "function" && store.isArticleTrashed(action.clientId, action.articleId)) return false;
    return entry.safe.status === "queued" && entry.safe.unchanged;
  }

  function previewTrashedArticleQueueResidue() {
    const items = [];
    batchStore.list().forEach(function(batch) {
      (batch.items || []).forEach(function(item) {
        var removed = typeof store.isArticleRemoved === "function"
          ? store.isArticleRemoved(batch.clientId, item.articleId)
          : typeof store.isArticleTrashed === "function" && store.isArticleTrashed(batch.clientId, item.articleId);
        if (!removed) return;
        const entry = articleSubmissionItems([{ clientId: batch.clientId, articleId: item.articleId }]).find(function(candidate) {
          return candidate.safe.batchId === batch.id && candidate.safe.publicationId === item.publicationId && candidate.safe.attemptId === item.attemptId;
        });
        if (!entry) return;
        const safe = Object.assign({}, entry.safe, { sourceArticleState: "trashed", reasonCode: "SOURCE_ARTICLE_TRASHED" });
        if (entry.safe.status === "queued" && entry.safe.unchanged) safe.repairAction = "cancel";
        else if (entry.safe.status === "failed" && entry.safe.unchanged) safe.repairAction = "cleanup";
        else safe.repairAction = null;
        items.push(safe);
      });
    });
    return {
      items: items,
      cleanableItems: items.filter(function(item) { return !!item.repairAction; }),
      reportedItems: items.filter(function(item) { return !item.repairAction; }),
      cleanableCount: items.filter(function(item) { return !!item.repairAction; }).length,
      reportedCount: items.filter(function(item) { return !item.repairAction; }).length
    };
  }

  function cleanupTrashedArticleQueueResidue(value) {
    if (!value || value.confirmed !== true) throw batchError("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED", "Queue residue confirmation is required");
    const preview = previewTrashedArticleQueueResidue();
    let cleanedCount = 0;
    preview.cleanableItems.forEach(function(item) {
      try {
        if (item.repairAction === "cancel") cancelArticleSubmissionItem(Object.assign({}, item, { action: "cancel" }));
        else cleanupArticleSubmissionItem(Object.assign({}, item, { action: "cleanup" }));
        cleanedCount += 1;
      } catch (_) {}
    });
    return Object.assign(previewTrashedArticleQueueResidue(), { cleanedCount: cleanedCount });
  }

  function reconcileBatch(batchId) {
    let batch = batchStore.get(batchId);
    const reconciled = [];
    (batch.items || []).forEach((item) => {
      const copy = Object.assign({}, item);
      if (!item.publicationId || !item.attemptId) {
        copy.reconciledStatus = "conflict";
        copy.reasonCode = copy.reasonCode || "SUBMISSION_IDENTITY_MISSING";
        reconciled.push(copy);
        return;
      }
      const record = publicationForBatchItem(item);
      const latest = latestAttempt(record);
      if (!record || !latest || latest.attemptId !== item.attemptId || record.platformId && record.platformId !== item.targetPlatformId) {
        copy.reconciledStatus = "conflict";
        copy.reasonCode = "PUBLICATION_ATTEMPT_MISMATCH";
        reconciled.push(copy);
        return;
      }
      const sidecar = readSidecar(item);
      copy.unchanged = pairIsUnchanged(item, batch, sidecar);
      copy.reconciledStatus = record.status;
      copy.publicationStatus = record.status;
      copy.errorCode = latest.errorCode || item.errorCode || null;
      if (item.status !== record.status && item.status !== "failed-cleaned") {
        try {
          batch = batchStore.updateItem(batch.id, { publicationId: item.publicationId, attemptId: item.attemptId, targetPlatformId: item.targetPlatformId }, { status: record.status, publicationStatus: record.status, errorCode: latest.errorCode || undefined, remoteId: latest.remoteId || undefined, remoteUrl: latest.remoteUrl || undefined, reasonCode: latest.reasonCode || undefined });
        } catch (_) {
          copy.reconciledStatus = "conflict";
          copy.reasonCode = "SUBMISSION_STATUS_CONFLICT";
        }
      }
      copy.canCancel = record.status === "queued" && copy.unchanged;
      copy.canCleanup = record.status === "failed" && copy.unchanged;
      reconciled.push(copy);
    });
    const enrichedItems = batch.items.map((item) => {
      const state = reconciled.find((candidate) => candidate.publicationId === item.publicationId && candidate.attemptId === item.attemptId && candidate.targetPlatformId === item.targetPlatformId);
      return state ? Object.assign({}, item, {
        reconciledStatus: state.reconciledStatus,
        unchanged: state.unchanged,
        canCancel: state.canCancel,
        canCleanup: state.canCleanup,
        reasonCode: state.reasonCode,
        publicationStatus: state.publicationStatus || item.publicationStatus,
        errorCode: state.errorCode || item.errorCode || null
      }) : item;
    });
    return { batch: Object.assign({}, batch, { items: enrichedItems }), items: reconciled };
  }

  function previewCleanupFailedItems(value) {
    if (!value || typeof value.batchId !== "string") throw batchError("CONTENT_SUBMISSION_BATCH_INPUT_INVALID", "Batch id is required");
    const result = reconcileBatch(value.batchId);
    let cleanableCount = 0;
    let uncleanableCount = 0;
    const items = result.batch.items.map((item) => {
      const copy = Object.assign({}, item);
      delete copy.filePath;
      delete copy.sidecarPath;
      const state = result.items.find((candidate) => candidate.publicationId === item.publicationId && candidate.attemptId === item.attemptId && candidate.targetPlatformId === item.targetPlatformId);
      const cleanable = Boolean(state && state.reconciledStatus === "failed" && state.unchanged);
      if (cleanable) cleanableCount += 1; else uncleanableCount += 1;
      return Object.assign(copy, { cleanable, reasonCode: cleanable ? null : (state && state.reasonCode) || (state && state.reconciledStatus === "failed" ? "SUBMISSION_QUEUE_CHANGED" : "SUBMISSION_NOT_FAILED") });
    });
    return { batchId: result.batch.id, cleanableCount, uncleanableCount, items };
  }

  function cleanupFailedItems(value) {
    if (!value || value.confirmed !== true || typeof value.batchId !== "string") throw batchError("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED", "Batch confirmation is required");
    const result = reconcileBatch(value.batchId);
    let cleanedCount = 0;
    let skippedCount = 0;
    result.batch.items.forEach((item) => {
      const state = result.items.find((candidate) => candidate.publicationId === item.publicationId && candidate.attemptId === item.attemptId && candidate.targetPlatformId === item.targetPlatformId);
      if (!state || state.reconciledStatus !== "failed" || !state.unchanged) { skippedCount += 1; return; }
      let originalFile = null;
      let originalSidecar = null;
      try { if (fs.existsSync(item.filePath)) originalFile = fs.readFileSync(item.filePath); } catch (_) {}
      try { if (fs.existsSync(item.sidecarPath)) originalSidecar = fs.readFileSync(item.sidecarPath); } catch (_) {}
      removeSubmissionPair(item.filePath, item.sidecarPath);
      try {
        batchStore.updateItem(result.batch.id, { publicationId: item.publicationId, attemptId: item.attemptId, targetPlatformId: item.targetPlatformId }, { status: "failed-cleaned", publicationStatus: "failed", errorCode: state.errorCode || item.errorCode || undefined });
        cleanedCount += 1;
      } catch (_) {
        try {
          if (originalFile !== null) { fs.mkdirSync(path.dirname(item.filePath), { recursive: true }); fs.writeFileSync(item.filePath, originalFile); }
          if (originalSidecar !== null) { fs.mkdirSync(path.dirname(item.sidecarPath), { recursive: true }); fs.writeFileSync(item.sidecarPath, originalSidecar); }
        } catch (restoreError) {
          if (typeof options.onCleanupRestoreError === "function") options.onCleanupRestoreError({ code: restoreError && restoreError.code || "SUBMISSION_QUEUE_RESTORE_FAILED", batchId: result.batch.id });
        }
        skippedCount += 1;
      }
    });
    const batch = batchStore.get(result.batch.id);
    return { batchId: batch.id, cleanedCount, skippedCount, items: batch.items };
  }

  function cancelBatch(value) {
    if (!value || value.confirmed !== true || typeof value.batchId !== "string") throw batchError("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED", "Batch confirmation is required");
    const reconciled = reconcileBatch(value.batchId);
    const batch = reconciled.batch;
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
    const reconciled = reconcileBatch(value.batchId);
    const batch = reconciled.batch;
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
    getBatch: function(batchId) { return reconcileBatch(batchId).batch; },
    listBatches: function(clientId) { return batchStore.list().filter(function(batch) { return !clientId || batch.clientId === clientId; }).map(function(batch) { return reconcileBatch(batch.id).batch; }); },
    reconcileBatch,
    previewCleanupFailedItems,
    cleanupFailedItems,
    previewArticleRemovalImpact,
    cancelArticleSubmissionItem,
    cleanupArticleSubmissionItem,
    isSubmissionItemExecutable,
    previewTrashedArticleQueueResidue,
    cleanupTrashedArticleQueueResidue
  };
}

module.exports = { createContentSubmissionService };
