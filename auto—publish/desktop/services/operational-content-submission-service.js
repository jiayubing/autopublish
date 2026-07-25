"use strict";

// Content files remain portable queue copies. Batch execution state belongs to
// OperationalStore; this service deliberately never creates a JSON batch or
// publication ledger.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createArticleStore } = require("../../src/content/article-store");
const { articleMarkdown, writePairAtomic } = require("./submission-file-helpers");
const { evaluateArticleSubmissionEligibility } = require("../../src/content/article-submission-eligibility");

function fail(code, message) { const error = new Error(message || code); error.code = code; return error; }
function hash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function safeName(value) { return String(value || "article").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, "-").replace(/^[. -]+|[. -]+$/g, "").slice(0, 80) || "article"; }

function createOperationalContentSubmissionService(options) {
  const value = options || {};
  if (!value.operationalStore) throw fail("OPERATIONAL_STORE_REQUIRED");
  const root = path.resolve(value.workspaceRoot || process.cwd());
  const articleStore = value.articleStore || createArticleStore(root, { paths: value.paths });
  const inputRoot = path.resolve(value.paths && value.paths.input || path.join(root, ".autopublish", "input"));
  const cancellationPlans = new Map();
  function allPlatforms() {
    return Array.isArray(value.platforms) ? value.platforms.slice() : require("../../src/core/platforms").loadPlatforms();
  }
  function platforms() {
    return allPlatforms().filter((platform) => !platform.publicationTarget || platform.publicationTarget.kind === "platform").map((platform) => ({ id: platform.id, displayName: platform.displayName, scanDir: platform.scanDir || platform.id, contentQueueImport: platform.contentQueueImport === true, publicationTarget: platform.publicationTarget || { kind: "platform" } }));
  }
  function listPlatforms() { return platforms().map((platform) => ({ id: platform.id, displayName: platform.displayName || platform.id, scanDir: platform.scanDir || platform.id, contentQueueImport: platform.contentQueueImport === true })); }
  function regularFile(filename) {
    try {
      const stat = fs.lstatSync(filename);
      return stat.isFile() && !stat.isSymbolicLink();
    } catch (_) { return false; }
  }
  function prepareMediaExport(input) {
    if (!input || input.confirmed !== true || typeof input.clientId !== "string" || !input.clientId.trim() || typeof input.generatedArticleId !== "string" || !input.generatedArticleId.trim()) throw fail("CONTENT_EXPORT_CONFIRMATION_REQUIRED", "Manual confirmation is required");
    if (input.targetPlatform !== "media" || input.mediaResourceId !== undefined) throw fail("CONTENT_EXPORT_TARGET_INVALID", "Paid-media staging does not select a media resource");
    const platform = allPlatforms().find((candidate) => candidate.id === "media" && candidate.contentQueueImport === true);
    if (!platform) throw fail("CONTENT_EXPORT_TARGET_INVALID", "Paid-media staging is unavailable");
    let article;
    try { article = articleStore.getArticle(input.clientId, input.generatedArticleId); }
    catch (_) { throw fail("CONTENT_SUBMISSION_ARTICLE_NOT_FOUND", "Selected article was not found"); }
    const eligibility = evaluateArticleSubmissionEligibility(article, { targetPlatform: { id: "media", contentQueueImport: true } });
    if (!eligibility.eligible) throw fail("CONTENT_EXPORT_NOT_READY", eligibility.reasons.join("、"));
    const markdown = articleMarkdown(article);
    const contentHash = hash(markdown);
    const filename = safeName(article.title) + "-" + article.id + ".md";
    const directory = path.join(inputRoot, platform.scanDir || "media");
    const filePath = path.join(directory, filename);
    const sidecarPath = filePath + ".submission.json";
    const mainExists = fs.existsSync(filePath);
    const sidecarExists = fs.existsSync(sidecarPath);
    let status = "queueable";
    if (mainExists || sidecarExists) {
      let sidecar = null;
      try { sidecar = regularFile(sidecarPath) ? JSON.parse(fs.readFileSync(sidecarPath, "utf8")) : null; } catch (_) { sidecar = null; }
      const matches = regularFile(filePath) && regularFile(sidecarPath) && fs.readFileSync(filePath, "utf8") === markdown && sidecar && sidecar.version === 2 && sidecar.clientId === article.clientId && sidecar.generatedArticleId === article.id && sidecar.targetPlatform === "media" && sidecar.contentHash === contentHash;
      status = matches ? "idempotent" : "conflict";
    }
    return { article, markdown, contentHash, filename, directory, filePath, sidecarPath, status };
  }
  function previewExport(input) {
    const prepared = prepareMediaExport(input);
    return { filename: prepared.filename, targetPlatform: "media", contentHash: prepared.contentHash, markdown: prepared.markdown, status: prepared.status };
  }
  function exportArticle(input) {
    const prepared = prepareMediaExport(input);
    if (prepared.status === "conflict") throw fail("CONTENT_EXPORT_CONFLICT", "Paid-media queue copy conflicts with the selected article");
    if (prepared.status === "queueable") {
      fs.mkdirSync(prepared.directory, { recursive: true });
      const sidecar = { version: 2, generatedArticleId: prepared.article.id, clientId: prepared.article.clientId, targetPlatform: "media", targetPlatformId: "media", filename: prepared.filename, contentHash: prepared.contentHash, status: "queued", exportedAt: new Date().toISOString() };
      writePairAtomic(prepared.filePath, prepared.markdown, prepared.sidecarPath, JSON.stringify(sidecar, null, 2) + "\n");
    }
    if (typeof value.onDataInvalidated === "function") value.onDataInvalidated("CONTENT_EXPORT_QUEUED");
    return { filename: prepared.filename, targetPlatform: "media", contentHash: prepared.contentHash, markdown: prepared.markdown, status: prepared.status, idempotent: prepared.status === "idempotent" };
  }
  function assertInput(input, confirmed) {
    if (!input || typeof input !== "object" || typeof input.clientId !== "string" || !input.clientId.trim() || !Array.isArray(input.articleIds) || !input.articleIds.length || !Array.isArray(input.targetPlatformIds) || !input.targetPlatformIds.length) throw fail("CONTENT_SUBMISSION_BATCH_INPUT_INVALID", "Batch selection is invalid");
    if (confirmed && input.confirmed !== true) throw fail("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED", "Batch confirmation is required");
    if (!input.accountProfiles || typeof input.accountProfiles !== "object" || Array.isArray(input.accountProfiles) || input.targetPlatformIds.some((platformId) => typeof input.accountProfiles[platformId] !== "string" || !input.accountProfiles[platformId].trim())) throw fail("ACCOUNT_PROFILE_REQUIRED", "A platform account profile is required");
    return input;
  }
  function item(article, platform, platformId, accountProfileId) {
    const markdown = articleMarkdown(article);
    const filename = safeName(article.title) + "-" + article.id + ".md";
    const filePath = path.join(inputRoot, platform.scanDir || platform.id, filename);
    return { articleId: article.id, targetPlatformId: platformId, accountProfileId, filename, filePath, sidecarPath: filePath + ".submission.json", contentHash: hash(markdown), markdown, status: "queueable" };
  }
  function previewBatch(input) {
    const request = assertInput(input, false); const byId = new Map(platforms().map((platform) => [platform.id, platform]));
    const items = []; const missingArticleIds = []; const unsupportedPlatformIds = [];
    for (const articleId of request.articleIds) {
      let article; try { article = articleStore.getArticle(request.clientId, articleId); } catch (_) { missingArticleIds.push(articleId); continue; }
      for (const platformId of request.targetPlatformIds) {
        const platform = byId.get(platformId); const accountProfileId = request.accountProfiles[platformId];
        if (!platform || platform.contentQueueImport !== true) { if (!unsupportedPlatformIds.includes(platformId)) unsupportedPlatformIds.push(platformId); items.push({ articleId, targetPlatformId: platformId, accountProfileId, status: "excluded" }); continue; }
        const eligibility = evaluateArticleSubmissionEligibility(article, { targetPlatform: { id: platformId, contentQueueImport: true } });
        if (!eligibility.eligible) { items.push({ articleId, targetPlatformId: platformId, accountProfileId, status: "blocked", reasonCodes: eligibility.reasonCodes, reasons: eligibility.reasons }); continue; }
        items.push(item(article, platform, platformId, accountProfileId));
      }
    }
    return { clientId: request.clientId, articleIds: request.articleIds.slice(), targetPlatformIds: request.targetPlatformIds.slice(), accountProfiles: Object.assign({}, request.accountProfiles), totalTaskCount: request.articleIds.length * request.targetPlatformIds.length, queueableTaskCount: items.filter((x) => x.status === "queueable").length, idempotentCount: 0, alreadyQueuedCount: 0, blockedPublishedCount: 0, blockedUncertainCount: 0, blockedContentCount: items.filter((x) => x.status === "blocked").length, conflictCount: 0, missingArticleIds, unsupportedPlatformIds, items };
  }
  function toPublicBatch(batch) {
    return { id: batch.batchId, batchId: batch.batchId, status: batch.status, revision: batch.revision, createdAt: batch.createdAt, updatedAt: batch.updatedAt, items: batch.items.map((stored) => Object.assign({ itemId: stored.itemId, articleId: stored.articleId, targetKey: stored.targetKey, status: stored.status, revision: stored.revision }, stored.payload || {})) };
  }
  function createBatch(input) {
    const preview = previewBatch(assertInput(input, true));
    if (preview.missingArticleIds.length) throw fail("CONTENT_SUBMISSION_ARTICLE_NOT_FOUND", "Selected article was not found");
    const queued = preview.items.filter((candidate) => candidate.status === "queueable");
    const batchId = `batch-${crypto.randomUUID()}`;
    const created = value.operationalStore.createSubmissionBatch({ batchId, items: queued.map((candidate) => ({ articleId: candidate.articleId, target: { kind: "platform", platformId: candidate.targetPlatformId, accountProfileId: candidate.accountProfileId }, payload: { clientId: preview.clientId, targetPlatformId: candidate.targetPlatformId, accountProfileId: candidate.accountProfileId, sourcePlatformId: candidate.targetPlatformId, filename: candidate.filename, contentHash: candidate.contentHash } })) });
    try {
      queued.forEach((candidate, index) => {
        fs.mkdirSync(path.dirname(candidate.filePath), { recursive: true });
        const sidecar = {
          version: 2,
          submissionBatchId: created.batchId,
          generatedArticleId: candidate.articleId,
          clientId: preview.clientId,
          targetPlatform: candidate.targetPlatformId,
          targetPlatformId: candidate.targetPlatformId,
          accountProfileId: candidate.accountProfileId,
          filename: candidate.filename,
          contentHash: candidate.contentHash,
          status: "queued",
          queuedAt: new Date().toISOString(),
        };
        writePairAtomic(candidate.filePath, candidate.markdown, candidate.sidecarPath, JSON.stringify(sidecar, null, 2) + "\n");
        candidate.itemId = created.items[index].itemId;
      });
    } catch (error) {
      queued.forEach((candidate) => { try { fs.unlinkSync(candidate.sidecarPath); } catch (_) {} try { fs.unlinkSync(candidate.filePath); } catch (_) {} });
      throw error;
    }
    if (typeof value.onDataInvalidated === "function") value.onDataInvalidated("SUBMISSION_BATCH_CREATED");
    return Object.assign({}, preview, { batchId: created.batchId, createdCount: queued.length, idempotentCount: 0, items: queued.map((candidate) => { const copy = Object.assign({}, candidate); delete copy.markdown; return copy; }) });
  }
  function listBatches(clientId) { return value.operationalStore.listSubmissionBatches(clientId === undefined ? {} : { clientId }).map(toPublicBatch); }
  function getBatch(batchId) { return toPublicBatch(value.operationalStore.getSubmissionBatch(batchId)); }
  function queuePaths(payload) {
    const platform = platforms().find((candidate) => candidate.id === payload.targetPlatformId && candidate.contentQueueImport === true);
    if (!platform || typeof payload.filename !== "string" || !payload.filename) throw fail("CONTENT_SUBMISSION_QUEUE_ITEM_INVALID");
    const filePath = path.join(inputRoot, platform.scanDir || platform.id, payload.filename);
    return { filePath, sidecarPath: filePath + ".submission.json" };
  }
  function previewCancelBatch(input) {
    if (!input || typeof input.batchId !== "string" || !input.batchId) throw fail("CONTENT_SUBMISSION_BATCH_INPUT_INVALID");
    const batch = value.operationalStore.getSubmissionBatch(input.batchId);
    const allowed = batch.items.filter((candidate) => candidate.status === "queued" && candidate.payload && candidate.payload.filename);
    const planId = `cancel-${crypto.randomUUID()}`;
    cancellationPlans.set(planId, { batchId: batch.batchId, revision: batch.revision, itemIds: allowed.map((candidate) => candidate.itemId) });
    return { batchId: batch.batchId, planId, allowedCount: allowed.length, items: allowed.map((candidate) => ({ itemId: candidate.itemId, articleId: candidate.articleId, targetPlatformId: candidate.payload.targetPlatformId, accountProfileId: candidate.payload.accountProfileId })) };
  }
  function cancelBatch(input) {
    if (!input || input.confirmed !== true || typeof input.batchId !== "string" || typeof input.planId !== "string") throw fail("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED");
    const plan = cancellationPlans.get(input.planId);
    if (!plan || plan.batchId !== input.batchId) throw fail("SUBMISSION_ACTION_PLAN_INVALID");
    const current = value.operationalStore.getSubmissionBatch(input.batchId);
    if (current.revision !== plan.revision) throw fail("SUBMISSION_ACTION_STALE");
    let cancelledCount = 0; let idempotentCount = 0;
    for (const itemId of plan.itemIds) {
      const item = current.items.find((candidate) => candidate.itemId === itemId);
      if (!item) continue;
      const outcome = value.operationalStore.cancelQueuedSubmissionItem({ batchId: current.batchId, itemId });
      if (outcome.idempotent) { idempotentCount += 1; continue; }
      const files = queuePaths(item.payload || {});
      try { if (fs.existsSync(files.sidecarPath)) fs.unlinkSync(files.sidecarPath); if (fs.existsSync(files.filePath)) fs.unlinkSync(files.filePath); }
      catch (error) { throw fail("CONTENT_SUBMISSION_QUEUE_REMOVE_FAILED", "Queue copy could not be removed"); }
      cancelledCount += 1;
    }
    cancellationPlans.delete(input.planId);
    if (typeof value.onDataInvalidated === "function") value.onDataInvalidated("SUBMISSION_BATCH_CANCELLED");
    return { batchId: current.batchId, cancelledCount, idempotentCount, batchStatus: value.operationalStore.getSubmissionBatch(current.batchId).status, changedScopes: ["articleManagement", "articleAttention", "platformQueue", "navigationSummary"] };
  }
  function empty() { return { items: [], count: 0 }; }
  return Object.freeze({ previewExport, exportArticle, listPlatforms, previewBatch, createBatch, listBatches, getBatch,
    buildSubmissionActionPlan: empty, previewCancelBatch, cancelBatch, reconcileBatch: empty,
    previewCleanupFailedItems: empty, cleanupFailedItems: empty, previewArticleRemovalImpact: empty,
    cancelArticleSubmissionItem: empty, cleanupArticleSubmissionItem: empty, cleanupPublishedArticleLocal: empty, cleanupCancelledArticleLocal: empty,
    inspectSubmissionPair: empty, evaluateItemAction: empty, isSubmissionItemExecutable: () => false,
    previewTrashedArticleQueueResidue: empty, cleanupTrashedArticleQueueResidue: empty,
    previewRetryFailedPublication: empty, retryFailedPublication: empty, listArchiveFailures: () => [] });
}

module.exports = { createOperationalContentSubmissionService };
