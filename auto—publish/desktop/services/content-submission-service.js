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
    try { options.onDataInvalidated(["articleManagement", "platformQueue", "navigationSummary", "articleAttention"], reasonCode); } catch (_) {}
  }

  function previewRetryFailedPublication(value) {
    const publicationId = value && value.publicationId;
    if (typeof publicationId !== "string" || !publicationId.trim()) throw batchError("CONTENT_SUBMISSION_PUBLICATION_REQUIRED", "Publication id is required");
    const record = typeof publicationLedger.get === "function" ? publicationLedger.get(publicationId) : null;
    if (!record) throw batchError("PUBLICATION_RECORD_MISSING", "Publication record was not found");
    if (record.status !== "failed") throw batchError("PUBLICATION_STATUS_NOT_FAILED", "Only failed publications can be retried");
    const latest = latestAttempt(record);
    if (!latest || latest.status !== "failed") throw batchError("PUBLICATION_ATTEMPT_NOT_FAILED", "The latest publication attempt is not failed");
    let article;
    try { article = store.getArticle(record.clientId, record.articleId); }
    catch (_) { throw batchError("ARTICLE_NOT_FOUND", "The source article is no longer available"); }
    const eligibility = evaluateArticleSubmissionEligibility(article, { targetPlatform: { id: record.platformId, contentQueueImport: true } });
    if (!eligibility.eligible) throw batchError("ARTICLE_NOT_RETRYABLE", eligibility.reasons.join("、"));
    const platform = availablePlatforms().find(function(candidate) { return candidate.id === record.platformId; });
    if (!platform || platform.contentQueueImport !== true) throw batchError("CONTENT_SUBMISSION_TARGET_UNSUPPORTED", "The publication target does not support content queue import");
    const preview = previewBatch({ clientId: record.clientId, articleIds: [record.articleId], targetPlatformIds: [record.platformId] });
    const retryableItem = preview.items.find(function(item) { return item.articleId === record.articleId && item.targetPlatformId === record.platformId; });
    if (!retryableItem || !["queueable", "idempotent"].includes(retryableItem.status)) {
      throw batchError(retryableItem && retryableItem.reasonCode || "SUBMISSION_QUEUE_CHANGED", "投稿队列已变化，请重新预检");
    }
    const failureCount = Array.isArray(record.attempts) ? record.attempts.filter(function(attempt) { return attempt.status === "failed"; }).length : 1;
    return {
      publicationId: record.publicationId,
      clientId: record.clientId,
      articleId: record.articleId,
      targetPlatformId: record.platformId,
      titleSnapshot: record.titleSnapshot || article.title,
      failureCount: failureCount,
      requiresConfirmation: true,
      message: `确认将“${(record.titleSnapshot || article.title || "文章").slice(0, 80)}”重新投稿到 ${record.platformId}？历史失败 ${failureCount} 次。`,
      details: { titleSnapshot: record.titleSnapshot || article.title, targetPlatformId: record.platformId, failureCount },
      preview: { queueableTaskCount: preview.queueableTaskCount, idempotentCount: preview.idempotentCount, conflictCount: preview.conflictCount }
    };
  }

  function retryFailedPublication(value) {
    if (!value || value.confirmed !== true || typeof value.publicationId !== "string") throw batchError("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED", "Publication retry confirmation is required");
    if (typeof options.getDataRevision === "function" && value.expectedRevision !== undefined && Number(value.expectedRevision) !== Number(options.getDataRevision())) {
      throw batchError("ARTICLE_ATTENTION_STALE", "Publication state changed; review the retry again");
    }
    const preview = previewRetryFailedPublication(value);
    const created = createBatch({ clientId: preview.clientId, articleIds: [preview.articleId], targetPlatformIds: [preview.targetPlatformId], confirmed: true });
    const item = (created.items || []).find(function(candidate) { return candidate.publicationId === preview.publicationId; }) || (created.items || [])[0] || {};
    return {
      batchId: created.batchId,
      publicationId: item.publicationId || preview.publicationId,
      attemptId: item.attemptId || null,
      clientId: preview.clientId,
      articleId: preview.articleId,
      targetPlatformId: preview.targetPlatformId,
      changedScopes: ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"]
    };
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

  function previewBatch(value) {
    const input = assertBatchInput(value);
    const platforms = availablePlatforms();
    const platformMap = new Map(platforms.map((platform) => [platform.id, platform]));
    const unsupportedPlatformIds = input.targetPlatformIds.filter((id) => !platformMap.has(id) || platformMap.get(id).contentQueueImport !== true);
    const items = [];
    const ineligibleArticleIds = [];
    const missingArticleIds = [];
    const conflicts = [];
    input.articleIds.forEach((articleId) => {
      let article;
      try { article = store.getArticle(input.clientId, articleId); } catch (_) { missingArticleIds.push(articleId); return; }
      input.targetPlatformIds.forEach((platformId) => {
        const platform = platformMap.get(platformId);
        const item = { articleId, targetPlatformId: platformId, contentHash: hash(articleMarkdown(article)), status: "excluded" };
        if (platform && platform.contentQueueImport === true) {
          const eligibility = evaluateArticleSubmissionEligibility(article, { targetPlatform: platform });
          if (!eligibility.eligible) {
            if (!ineligibleArticleIds.includes(articleId)) ineligibleArticleIds.push(articleId);
            Object.assign(item, { status: "blocked", reasonCode: eligibility.reasonCodes[0], reasonCodes: eligibility.reasonCodes, reasons: eligibility.reasons });
            items.push(item);
            return;
          }
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
      blockedContentCount: count("blocked"),
      conflictCount: conflicts.length,
      ineligibleArticleIds: [...new Set(ineligibleArticleIds)],
      unreviewedArticleIds: [...new Set(ineligibleArticleIds)],
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
            record: publicationRecordFor(publicationLedger, context),
            rootDir: rootDir
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
    notifyData("SUBMISSION_BATCH_CREATED");
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
            status: record.status, unchanged: false, pairState: null, identityMatched: false, contentMatched: null
          }, item: null, batch: null, record: record, sidecar: null, latest: latest });
        });
      });
    }
    const queuedToCancel = [];
    const failedToClean = [];
    const publishedToClean = [];
    const cancelledToClean = [];
    const blockedItems = [];
    const publicItems = entries.map(function(entry) {
      const value = entry.safe;
      if (["submitting", "submitted", "uncertain"].indexOf(value.status) !== -1) {
        blockedItems.push(Object.assign({}, value, { reasonCode: "ARTICLE_SUBMISSION_ACTIVE" }));
      } else if (value.status === "queued") {
        if (value.batchId && value.publicationId && value.attemptId) {
          const checked = evaluateItemAction(Object.assign({}, value, { action: "cancel" }));
          if (checked.allowed) queuedToCancel.push(Object.assign({}, value, { action: "cancel", evaluationFingerprint: checked.bindingFingerprint }));
          else blockedItems.push(Object.assign({}, value, { reasonCode: checked.reasonCode || "SUBMISSION_QUEUE_CHANGED" }));
        } else blockedItems.push(Object.assign({}, value, { reasonCode: "PUBLICATION_RESERVATION_WITHOUT_QUEUE" }));
      } else if (value.status === "failed") {
        if (value.batchId && value.publicationId && value.attemptId) {
          const checked = evaluateItemAction(Object.assign({}, value, { action: "cleanup" }));
          if (checked.allowed) failedToClean.push(Object.assign({}, value, { action: "cleanup", evaluationFingerprint: checked.bindingFingerprint }));
          else blockedItems.push(Object.assign({}, value, { reasonCode: checked.reasonCode || "SUBMISSION_QUEUE_CHANGED" }));
        }
      } else if (["published", "cancelled"].includes(value.status) && value.batchId) {
        const action = value.status === "published" ? "cleanupPublishedLocal" : "cleanupCancelledLocal";
        if (value.publicationId && value.attemptId) {
          const checked = evaluateItemAction(Object.assign({}, value, { action: action }));
          if (checked.allowed) {
            const target = Object.assign({}, value, { action: action, evaluationFingerprint: checked.bindingFingerprint });
            (value.status === "published" ? publishedToClean : cancelledToClean).push(target);
          } else blockedItems.push(Object.assign({}, value, { reasonCode: checked.reasonCode || "SUBMISSION_QUEUE_CHANGED" }));
        } else blockedItems.push(Object.assign({}, value, { reasonCode: "SUBMISSION_IDENTITY_CONFLICT" }));
      }
      return Object.assign({}, value, { sourceArticleState: "active" });
    });
    return {
      selections: normalized,
      articleCount: normalized.length,
      items: publicItems,
      queuedToCancel: queuedToCancel,
      failedToClean: failedToClean,
      publishedToClean: publishedToClean,
      cancelledToClean: cancelledToClean,
      blockedItems: blockedItems,
      queuedToCancelCount: queuedToCancel.length,
      failedToCleanCount: failedToClean.length,
      publishedToCleanCount: publishedToClean.length,
      cancelledToCleanCount: cancelledToClean.length,
      terminalCleanupCount: failedToClean.length + publishedToClean.length + cancelledToClean.length,
      canCommit: blockedItems.length === 0
    };
  }

  function locateArticleSubmissionItem(action) {
    const entries = articleSubmissionItems([{ clientId: action.clientId, articleId: action.articleId }]);
    return entries.find(function(entry) {
      return entry.safe.batchId === action.batchId && entry.safe.targetPlatformId === action.targetPlatformId &&
        (action.publicationId && action.attemptId
          ? entry.safe.publicationId === action.publicationId && entry.safe.attemptId === action.attemptId
          : entry.safe.articleId === action.articleId);
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
      itemStatus: entry.item && entry.item.status,
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

  function evaluateItemAction(action) {
    if (!action || typeof action !== "object" || !["cancel", "cleanup", "cleanupPublishedLocal", "cleanupCancelledLocal"].includes(action.action)) {
      return { allowed: false, action: action && action.action || null, reasonCode: "SUBMISSION_ACTION_INVALID", resolvedState: null, bindingFingerprint: null, entry: null };
    }
    const entry = locateArticleSubmissionItem(action);
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

  function applyItemAction(action, nextStatus, reasonCode) {
    const entry = locateArticleSubmissionItem(action);
    if (!entry || !entry.item || !entry.batch) throw batchError("SUBMISSION_QUEUE_CHANGED", "Submission queue item is unavailable");
    if (entry.safe.status === nextStatus || ["failed-cleaned", "published-cleaned", "cancelled-cleaned"].includes(entry.safe.status) || entry.safe.status === "cancelled" && action.action === "cancel") return { action: action.action || nextStatus, status: entry.safe.status, idempotent: true, batchId: entry.batch.id, publicationId: action.publicationId, attemptId: action.attemptId, changedScopes: [], domainHandled: true };
    const checked = evaluateItemAction(action);
    if (!checked.allowed) throw batchError(checked.reasonCode || "SUBMISSION_QUEUE_CHANGED", "Submission item action is no longer valid");
    if (action.evaluationFingerprint && checked.bindingFingerprint !== action.evaluationFingerprint) throw batchError("SUBMISSION_ACTION_STALE", "Submission item action is stale");
    let originalFile = null;
    let originalSidecar = null;
    try { if (fs.existsSync(entry.item.filePath)) originalFile = fs.readFileSync(entry.item.filePath); } catch (_) {}
    try { if (fs.existsSync(entry.item.sidecarPath)) originalSidecar = fs.readFileSync(entry.item.sidecarPath); } catch (_) {}
    try {
      if (action.action === "cancel" && entry.record) cancelReservation(publicationLedger, { publicationId: action.publicationId, attemptId: action.attemptId }, reasonCode);
      if (["cleanup", "cleanupPublishedLocal", "cleanupCancelledLocal"].includes(action.action) && entry.record && entry.item.status !== entry.record.status) {
        batchStore.updateItem(entry.batch.id, { publicationId: action.publicationId, attemptId: action.attemptId, targetPlatformId: action.targetPlatformId }, { status: entry.record.status, publicationStatus: entry.record.status, reasonCode: "SUBMISSION_STATUS_RECONCILED" });
      }
      const physicalFilesAlreadyAbsent = entry.safe.pairState === "both_absent";
      if (!physicalFilesAlreadyAbsent) removeSubmissionPairStrict(entry.item.filePath, entry.item.sidecarPath);
      if (!action.deferBatchUpdate) {
        batchStore.updateItem(entry.batch.id, { articleId: action.articleId, publicationId: action.publicationId, attemptId: action.attemptId, targetPlatformId: action.targetPlatformId }, { status: nextStatus, publicationStatus: entry.record ? entry.record.status : undefined, reasonCode: reasonCode });
      }
      if (physicalFilesAlreadyAbsent) {
        if (!action.suppressNotification) notifyData(action.action === "cancel" ? "SUBMISSION_QUEUE_CANCELLED" : "SUBMISSION_QUEUE_CLEANED");
        return { action: action.action || nextStatus, status: nextStatus, idempotent: action.action === "cancel" ? false : true, physicalFilesAlreadyAbsent: true, batchId: entry.batch.id, publicationId: action.publicationId, attemptId: action.attemptId, changedScopes: ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"], domainHandled: true };
      }
    } catch (error) {
      try { if (originalFile !== null && !fs.existsSync(entry.item.filePath)) { fs.mkdirSync(path.dirname(entry.item.filePath), { recursive: true }); fs.writeFileSync(entry.item.filePath, originalFile); } } catch (_) {}
      try { if (originalSidecar !== null && !fs.existsSync(entry.item.sidecarPath)) { fs.mkdirSync(path.dirname(entry.item.sidecarPath), { recursive: true }); fs.writeFileSync(entry.item.sidecarPath, originalSidecar); } } catch (_) {}
      throw error;
    }
    if (!action.suppressNotification) notifyData(action.action === "cancel" ? "SUBMISSION_QUEUE_CANCELLED" : "SUBMISSION_QUEUE_CLEANED");
    return { action: action.action || nextStatus, status: nextStatus, batchId: entry.batch.id, publicationId: action.publicationId, attemptId: action.attemptId, changedScopes: ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"], domainHandled: true };
  }

  function cancelArticleSubmissionItem(action) { return applyItemAction(action, "cancelled", "ARTICLE_TRASHED_BEFORE_SUBMISSION"); }
  function cleanupArticleSubmissionItem(action) { return applyItemAction(action, "failed-cleaned", "ARTICLE_TRASHED_FAILED_QUEUE_CLEANUP"); }
  function cleanupPublishedArticleLocal(action) { return applyItemAction(action, "published-cleaned", "ARTICLE_TRASHED_PUBLISHED_LOCAL_CLEANUP"); }
  function cleanupCancelledArticleLocal(action) { return applyItemAction(action, "cancelled-cleaned", "ARTICLE_TRASHED_CANCELLED_LOCAL_CLEANUP"); }

  function isSubmissionItemExecutable(action) {
    const entry = locateArticleSubmissionItem(action);
    if (!entry) return false;
    if (typeof store.isArticleRemoved === "function" && store.isArticleRemoved(action.clientId, action.articleId) ||
        typeof store.isArticleTrashed === "function" && store.isArticleTrashed(action.clientId, action.articleId)) return false;
    return entry.safe.status === "queued" && entry.safe.pairState === "intact";
  }

  function previewTrashedArticleQueueResidue() {
    const items = [];
    batchStore.list().forEach(function(batch) {
      (batch.items || []).forEach(function(item) {
        if (["failed-cleaned", "published-cleaned", "cancelled-cleaned", "skipped"].includes(item.status)) return;
        var removed = typeof store.isArticleRemoved === "function"
          ? store.isArticleRemoved(batch.clientId, item.articleId)
          : typeof store.isArticleTrashed === "function" && store.isArticleTrashed(batch.clientId, item.articleId);
        if (!removed) return;
        const entry = articleSubmissionItems([{ clientId: batch.clientId, articleId: item.articleId }]).find(function(candidate) {
          return candidate.safe.batchId === batch.id && candidate.safe.publicationId === item.publicationId && candidate.safe.attemptId === item.attemptId;
        });
        if (!entry) return;
        const safe = Object.assign({}, entry.safe, { sourceArticleState: "trashed", reasonCode: "SOURCE_ARTICLE_TRASHED" });
        const requestedAction = entry.safe.status === "queued" ? "cancel" : entry.safe.status === "failed" ? "cleanup" : entry.safe.status === "published" ? "cleanupPublishedLocal" : entry.safe.status === "cancelled" ? "cleanupCancelledLocal" : null;
        const checked = requestedAction ? evaluateItemAction(Object.assign({}, entry.safe, { action: requestedAction })) : { allowed: false, reasonCode: entry.safe.status === "failed" ? "PUBLICATION_STATUS_NOT_FAILED" : "ARTICLE_SUBMISSION_ACTIVE" };
        if (checked.allowed) {
          safe.repairAction = requestedAction;
          safe.evaluationFingerprint = checked.bindingFingerprint;
        } else {
          safe.repairAction = null;
          safe.reasonCode = checked.reasonCode || safe.reasonCode;
        }
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
    let failedCount = 0;
    const results = [];
    preview.items.forEach(function(item) {
      if (!item.repairAction) {
        results.push({ publicationId: item.publicationId, targetPlatformId: item.targetPlatformId, status: item.status, reasonCode: item.reasonCode || "RESIDUE_NOT_CLEANABLE" });
        return;
      }
      try {
        const action = Object.assign({}, item, { action: item.repairAction, evaluationFingerprint: item.evaluationFingerprint });
        const result = item.repairAction === "cancel" ? cancelArticleSubmissionItem(action) : item.repairAction === "cleanupPublishedLocal" ? cleanupPublishedArticleLocal(action) : item.repairAction === "cleanupCancelledLocal" ? cleanupCancelledArticleLocal(action) : cleanupArticleSubmissionItem(action);
        cleanedCount += 1;
        results.push({ publicationId: item.publicationId, targetPlatformId: item.targetPlatformId, status: "cleaned", reasonCode: null, action: item.repairAction, resultStatus: result.status });
      } catch (error) {
        failedCount += 1;
        results.push({ publicationId: item.publicationId, targetPlatformId: item.targetPlatformId, status: item.status, reasonCode: error && error.code || "SUBMISSION_RESIDUE_CLEANUP_FAILED", action: item.repairAction });
      }
    });
    const after = previewTrashedArticleQueueResidue();
    const cleanupResult = {
      status: failedCount > 0 ? "failed" : cleanedCount > 0 ? "completed" : "no-op",
      cleanedCount: cleanedCount,
      failedCount: failedCount,
      remainingCount: after.items.length,
      cleanableCount: after.cleanableCount,
      reportedCount: after.reportedCount,
      items: results,
      remainingItems: after.items.map(function(item) {
        return { publicationId: item.publicationId, targetPlatformId: item.targetPlatformId, status: item.status, reasonCode: item.reasonCode || null };
      })
    };
    if (cleanedCount > 0) notifyData("TRASHED_QUEUE_RESIDUE_RESOLVED");
    return cleanupResult;
  }

  function reconcileBatch(batchId) {
    let batch = batchStore.get(batchId);
    const reconciled = [];
    const transitions = [];
    (batch.items || []).forEach((item) => {
      const copy = Object.assign({}, item);
      // A queue item may be staged before a remote reservation exists.  Its
      // local batch/article/platform identity is sufficient for local actions;
      // this is intentionally platform-agnostic.
      if (!item.publicationId || !item.attemptId) {
        const sidecar = readSidecar(item);
        const pair = inspectSubmissionPairState(item, batch, sidecar, { rootDir: rootDir, record: null });
        const actionInput = { clientId: batch.clientId, articleId: item.articleId, batchId: batch.id, targetPlatformId: item.targetPlatformId, action: "cancel" };
        const cancelEvaluation = evaluateItemAction(actionInput);
        copy.unchanged = pair.pairState === "intact";
        copy.pairState = pair.pairState;
        copy.identityMatched = pair.identityMatched;
        copy.contentMatched = pair.contentMatched;
        copy.mainExists = pair.mainExists;
        copy.sidecarExists = pair.sidecarExists;
        copy.reconciledStatus = item.status;
        copy.publicationStatus = item.status;
        copy.canCancel = Boolean(cancelEvaluation.allowed);
        copy.canCleanup = false;
        copy.actionFingerprint = cancelEvaluation.bindingFingerprint;
        if (!copy.canCancel) copy.reasonCode = cancelEvaluation.reasonCode || "SUBMISSION_QUEUE_CHANGED";
        reconciled.push(copy);
        return;
      }
      const record = publicationForBatchItem(item);
      const latest = latestAttempt(record);
      if (!record || !latest || record.platformId && record.platformId !== item.targetPlatformId) {
        copy.reconciledStatus = "conflict";
        copy.reasonCode = !record ? "PUBLICATION_RECORD_MISSING" : "PUBLICATION_PLATFORM_MISMATCH";
        reconciled.push(copy);
        return;
      }
      const sidecar = readSidecar(item);
      const pair = inspectSubmissionPairState(item, batch, sidecar, { rootDir: rootDir, record: record });
      copy.unchanged = pair.pairState === "intact";
      copy.pairState = pair.pairState;
      copy.identityMatched = pair.identityMatched;
      copy.contentMatched = pair.contentMatched;
      copy.mainExists = pair.mainExists;
      copy.sidecarExists = pair.sidecarExists;
      copy.reconciledStatus = record.status;
      copy.publicationStatus = record.status;
      copy.errorCode = latest.errorCode || item.errorCode || null;
      const locallyCleaned = ["failed-cleaned", "published-cleaned", "cancelled-cleaned"].includes(item.status);
      if (item.status !== record.status && !locallyCleaned) {
        transitions.push({
          identity: { publicationId: item.publicationId, attemptId: item.attemptId, targetPlatformId: item.targetPlatformId },
          transition: { status: record.status, publicationStatus: record.status, errorCode: latest.errorCode || undefined, remoteId: latest.remoteId || undefined, remoteUrl: latest.remoteUrl || undefined, reasonCode: latest.reasonCode || undefined }
        });
      }
      const actionInput = { clientId: batch.clientId, articleId: item.articleId, batchId: batch.id, targetPlatformId: item.targetPlatformId, publicationId: item.publicationId, attemptId: item.attemptId };
      const cancelEvaluation = record.status === "queued" ? evaluateItemAction(Object.assign({}, actionInput, { action: "cancel" })) : null;
      const cleanupEvaluation = record.status === "failed" ? evaluateItemAction(Object.assign({}, actionInput, { action: "cleanup" })) : null;
      const publishedCleanupEvaluation = record.status === "published" ? evaluateItemAction(Object.assign({}, actionInput, { action: "cleanupPublishedLocal" })) : null;
      const cancelledCleanupEvaluation = record.status === "cancelled" ? evaluateItemAction(Object.assign({}, actionInput, { action: "cleanupCancelledLocal" })) : null;
      copy.canCancel = !!(cancelEvaluation && cancelEvaluation.allowed);
      copy.canCleanup = !!(cleanupEvaluation && cleanupEvaluation.allowed);
      copy.canCleanupPublished = !!(publishedCleanupEvaluation && publishedCleanupEvaluation.allowed);
      copy.canCleanupCancelled = !!(cancelledCleanupEvaluation && cancelledCleanupEvaluation.allowed);
      copy.actionFingerprint = copy.canCancel ? cancelEvaluation.bindingFingerprint : copy.canCleanup ? cleanupEvaluation.bindingFingerprint : copy.canCleanupPublished ? publishedCleanupEvaluation.bindingFingerprint : copy.canCleanupCancelled ? cancelledCleanupEvaluation.bindingFingerprint : null;
      if (!copy.canCancel && !copy.canCleanup && !copy.canCleanupPublished && !copy.canCleanupCancelled && (cancelEvaluation || cleanupEvaluation || publishedCleanupEvaluation || cancelledCleanupEvaluation)) copy.reasonCode = (cancelEvaluation || cleanupEvaluation || publishedCleanupEvaluation || cancelledCleanupEvaluation).reasonCode;
      reconciled.push(copy);
    });
    if (transitions.length) {
      try {
        // Reconcile all observations in memory and commit the batch once. This
        // preserves the batch's atomic boundary when several queue items move
        // together after a platform result is observed.
        batch = batchStore.reconcile(batch.id, transitions);
      } catch (_) {
        transitions.forEach(function(change) {
          const conflict = reconciled.find(function(candidate) {
            return candidate.publicationId === change.identity.publicationId && candidate.attemptId === change.identity.attemptId && candidate.targetPlatformId === change.identity.targetPlatformId;
          });
          if (conflict) {
            conflict.reconciledStatus = "conflict";
            conflict.reasonCode = "SUBMISSION_STATUS_CONFLICT";
          }
        });
      }
    }
    const enrichedItems = batch.items.map((item) => {
      const state = reconciled.find((candidate) => candidate.articleId === item.articleId && candidate.targetPlatformId === item.targetPlatformId && candidate.publicationId === item.publicationId && candidate.attemptId === item.attemptId);
      return state ? Object.assign({}, item, {
        reconciledStatus: state.reconciledStatus,
        unchanged: state.unchanged,
        pairState: state.pairState,
        identityMatched: state.identityMatched,
        contentMatched: state.contentMatched,
        mainExists: state.mainExists,
        sidecarExists: state.sidecarExists,
        canCancel: state.canCancel,
        canCleanup: state.canCleanup,
        canCleanupPublished: state.canCleanupPublished,
        canCleanupCancelled: state.canCleanupCancelled,
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
      const cleanable = Boolean(state && state.reconciledStatus === "failed" && state.canCleanup);
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
      if (!state || state.reconciledStatus !== "failed" || !state.canCleanup) { skippedCount += 1; return; }
      let originalFile = null;
      let originalSidecar = null;
      try { if (fs.existsSync(item.filePath)) originalFile = fs.readFileSync(item.filePath); } catch (_) {}
      try { if (fs.existsSync(item.sidecarPath)) originalSidecar = fs.readFileSync(item.sidecarPath); } catch (_) {}
      try {
        cleanupArticleSubmissionItem({
          clientId: result.batch.clientId,
          articleId: item.articleId,
          batchId: result.batch.id,
          targetPlatformId: item.targetPlatformId,
          publicationId: item.publicationId,
          attemptId: item.attemptId,
          action: "cleanup",
          evaluationFingerprint: state.actionFingerprint
        });
        cleanedCount += 1;
      } catch (_) {
        try {
          if (originalFile !== null && !fs.existsSync(item.filePath)) { fs.mkdirSync(path.dirname(item.filePath), { recursive: true }); fs.writeFileSync(item.filePath, originalFile); }
          if (originalSidecar !== null && !fs.existsSync(item.sidecarPath)) { fs.mkdirSync(path.dirname(item.sidecarPath), { recursive: true }); fs.writeFileSync(item.sidecarPath, originalSidecar); }
        } catch (restoreError) {
          if (typeof options.onCleanupRestoreError === "function") options.onCleanupRestoreError({ code: restoreError && restoreError.code || "SUBMISSION_QUEUE_RESTORE_FAILED", batchId: result.batch.id });
        }
        skippedCount += 1;
      }
    });
    const batch = batchStore.get(result.batch.id);
    const cleanupResult = { batchId: batch.id, cleanedCount, skippedCount, items: batch.items };
    if (cleanedCount > 0) notifyData("FAILED_QUEUE_ITEMS_CLEANED");
    return cleanupResult;
  }

  function actionReasonMessage(reasonCode) {
    const messages = {
      SUBMISSION_ACTION_STALE: "动作计划已过期，请重新预览。",
      SUBMISSION_IDENTITY_CONFLICT: "本地队列身份不完整或不匹配。",
      SUBMISSION_CONTENT_CHANGED: "队列文件内容已变化。",
      SUBMISSION_QUEUE_CHANGED: "队列文件状态已变化。",
      PUBLICATION_REMOTE_STARTED: "投稿已经开始，不能撤销。",
      ARTICLE_SUBMISSION_ACTIVE: "投稿正在进行，不能撤销。",
      SUBMISSION_ALREADY_CANCELLED: "该项目已经撤销。"
    };
    return messages[reasonCode] || "当前项目不能执行该操作。";
  }

  // This is the sole action resolver for preview, list summaries and execute.
  // `planId` binds the complete batch revision and every item fingerprint.
  function buildSubmissionActionPlan(batchId, action) {
    if (typeof batchId !== "string" || !batchId) throw batchError("CONTENT_SUBMISSION_BATCH_INPUT_INVALID", "Batch id is required");
    if (action !== "cancel") throw batchError("SUBMISSION_ACTION_INVALID", "Submission action is invalid");
    const reconciled = reconcileBatch(batchId);
    const batch = reconciled.batch;
    const items = batch.items.map(function(item) {
      const request = {
        clientId: batch.clientId, articleId: item.articleId, batchId: batch.id,
        targetPlatformId: item.targetPlatformId, publicationId: item.publicationId,
        attemptId: item.attemptId, action: action
      };
      const checked = evaluateItemAction(request);
      return {
        articleId: item.articleId,
        targetPlatformId: item.targetPlatformId,
        publicationId: item.publicationId || null,
        attemptId: item.attemptId || null,
        action: action,
        allowed: checked.allowed,
        reasonCode: checked.reasonCode || null,
        reasonMessage: checked.allowed ? null : actionReasonMessage(checked.reasonCode),
        fingerprint: checked.bindingFingerprint || null
      };
    });
    const revision = hash(JSON.stringify({ id: batch.id, clientId: batch.clientId, updatedAt: batch.updatedAt || null, status: batch.status, items: batch.items }));
    const planId = hash(JSON.stringify({ batchId: batch.id, action: action, revision: revision, items: items.map(function(item) { return [item.articleId, item.targetPlatformId, item.publicationId, item.attemptId, item.fingerprint, item.allowed]; }) }));
    return {
      batchId: batch.id,
      clientId: batch.clientId,
      action: action,
      revision: revision,
      planId: planId,
      fingerprint: planId,
      items: items,
      allowedCount: items.filter(function(item) { return item.allowed; }).length,
      blockedCount: items.filter(function(item) { return !item.allowed; }).length
    };
  }

  function cancelBatch(value) {
    if (!value || value.confirmed !== true || typeof value.batchId !== "string" || typeof value.planId !== "string") throw batchError("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED", "Batch confirmation and action plan are required");
    const plan = buildSubmissionActionPlan(value.batchId, "cancel");
    if (plan.planId !== value.planId) throw batchError("SUBMISSION_ACTION_STALE", "Submission action plan is stale");
    let cancelledCount = 0;
    let idempotentCount = 0;
    const blockedItems = plan.items.filter(function(item) { return !item.allowed && item.reasonCode !== "SUBMISSION_ALREADY_CANCELLED"; });
    const transitions = [];
    plan.items.filter(function(item) { return item.allowed; }).forEach(function(item) {
      const result = cancelArticleSubmissionItem({
        clientId: plan.clientId, articleId: item.articleId, batchId: plan.batchId,
        targetPlatformId: item.targetPlatformId, publicationId: item.publicationId || undefined,
        attemptId: item.attemptId || undefined, action: "cancel", evaluationFingerprint: item.fingerprint,
        deferBatchUpdate: true, suppressNotification: true
      });
      if (result.idempotent) idempotentCount += 1;
      else {
        cancelledCount += 1;
        transitions.push({
          identity: { articleId: item.articleId, publicationId: item.publicationId || undefined, attemptId: item.attemptId || undefined, targetPlatformId: item.targetPlatformId },
          transition: { status: "cancelled", publicationStatus: "cancelled", reasonCode: "ARTICLE_TRASHED_BEFORE_SUBMISSION" }
        });
      }
    });
    const alreadyCancelled = plan.items.filter(function(item) { return item.reasonCode === "SUBMISSION_ALREADY_CANCELLED"; });
    idempotentCount += alreadyCancelled.length;
    const batch = transitions.length ? batchStore.reconcile(plan.batchId, transitions) : batchStore.get(plan.batchId);
    if (cancelledCount > 0 || idempotentCount > 0) notifyData("SUBMISSION_BATCH_CANCELLED");
    return {
      batchId: batch.id,
      planId: plan.planId,
      cancelledCount: cancelledCount,
      idempotentCount: idempotentCount,
      skippedCount: blockedItems.length,
      blockedItems: blockedItems,
      batchStatus: batch.status,
      changedScopes: cancelledCount > 0 || idempotentCount > 0 ? ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"] : [],
      items: batch.items
    };
  }

  function previewCancelBatch(value) {
    if (!value || typeof value.batchId !== "string") throw batchError("CONTENT_SUBMISSION_BATCH_INPUT_INVALID", "Batch id is required");
    return buildSubmissionActionPlan(value.batchId, "cancel");
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
    buildSubmissionActionPlan,
    previewCancelBatch,
    cancelBatch,
    getBatch: function(batchId) { return reconcileBatch(batchId).batch; },
    listBatches: function(clientId) {
      return batchStore.list().filter(function(batch) { return !clientId || batch.clientId === clientId; }).map(function(batch) {
        const reconciled = reconcileBatch(batch.id).batch;
        const plan = buildSubmissionActionPlan(batch.id, "cancel");
        return Object.assign({}, reconciled, {
          actionPlan: plan,
          items: reconciled.items.map(function(item) {
            const planned = plan.items.find(function(candidate) { return candidate.articleId === item.articleId && candidate.targetPlatformId === item.targetPlatformId && candidate.publicationId === (item.publicationId || null) && candidate.attemptId === (item.attemptId || null); });
            return Object.assign({}, item, { canCancel: !!(planned && planned.allowed), actionFingerprint: planned && planned.fingerprint || null, reasonCode: planned && !planned.allowed ? planned.reasonCode : item.reasonCode });
          })
        });
      });
    },
    reconcileBatch,
    previewCleanupFailedItems,
    cleanupFailedItems,
    previewArticleRemovalImpact,
    cancelArticleSubmissionItem,
    cleanupArticleSubmissionItem,
    cleanupPublishedArticleLocal,
    cleanupCancelledArticleLocal,
    inspectSubmissionPair: inspectPair,
    evaluateItemAction,
    isSubmissionItemExecutable,
    previewTrashedArticleQueueResidue,
    cleanupTrashedArticleQueueResidue,
    previewRetryFailedPublication,
    retryFailedPublication
  };
}

module.exports = { createContentSubmissionService };
