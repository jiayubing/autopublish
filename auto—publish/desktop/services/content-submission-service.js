const { createArticleStore } = require("../../src/content/article-store");
const { createSubmissionExportService } = require("../../src/content/submission-export-service");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createSubmissionBatchStore } = require("../../src/content/submission-batch-store");

function batchError(code, message) { const error = new Error(message); error.code = code; return error; }
function hash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function safeName(value) { return String(value || "article").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, "-").replace(/^[. -]+|[. -]+$/g, "").slice(0, 80) || "article"; }
function articleMarkdown(article) { return "# " + String(article.title || "") + "\n\n" + String(article.content || "").trim() + "\n"; }

function createContentSubmissionService(opts) {
  const options = opts || {}; const store = options.articleStore || createArticleStore(options.workspaceRoot, { paths: options.paths });
  const rootDir = path.resolve(options.workspaceRoot || process.cwd());
  const batchStore = options.batchStore || createSubmissionBatchStore({ workspaceRoot: rootDir });
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
      const markdown = articleMarkdown(article);
      const contentHash = hash(markdown);
      if (article.status !== "saved") unreviewedArticleIds.push(articleId);
      input.targetPlatformIds.forEach((platformId) => {
        const platform = platformMap.get(platformId);
        const item = { articleId, targetPlatformId: platformId, contentHash, status: "excluded" };
        if (article.status === "saved" && platform && platform.contentQueueImport === true) {
          const directory = path.resolve(rootDir, "input", platform.scanDir || platform.id);
          const filePath = path.resolve(directory, safeName(article.title) + "-" + article.id + ".md");
          item.filePath = filePath;
          item.sidecarPath = filePath + ".submission.json";
          if (fs.existsSync(filePath)) {
            let existing;
            try { existing = JSON.parse(fs.readFileSync(item.sidecarPath, "utf8")); } catch (_) {}
            if (fs.readFileSync(filePath, "utf8") === markdown && existing && existing.contentHash === contentHash && existing.generatedArticleId === article.id) item.status = "idempotent";
            else { item.status = "conflict"; conflicts.push(item); }
          } else item.status = "queueable";
        }
        items.push(item);
      });
    });
    return { clientId: input.clientId, articleIds: input.articleIds.slice(), targetPlatformIds: input.targetPlatformIds.slice(), totalTaskCount: input.articleIds.length * input.targetPlatformIds.length, queueableTaskCount: items.filter((item) => item.status === "queueable" || item.status === "idempotent").length, idempotentCount: items.filter((item) => item.status === "idempotent").length, conflictCount: conflicts.length, unreviewedArticleIds: [...new Set(unreviewedArticleIds)], missingArticleIds, unsupportedPlatformIds, items };
  }
  function listPlatforms() {
    return availablePlatforms().map((platform) => ({ id: platform.id, displayName: platform.displayName || platform.id, scanDir: platform.scanDir || platform.id, contentQueueImport: platform.contentQueueImport === true }));
  }
  function createBatch(value) {
    const input = assertBatchInput(value);
    if (value.confirmed !== true) throw batchError("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED", "Batch confirmation is required");
    const preview = previewBatch(input);
    if (preview.missingArticleIds.length) throw batchError("CONTENT_SUBMISSION_ARTICLE_NOT_FOUND", "Selected article was not found");
    const batchId = batchStore.createId();
    const batch = { version: 1, id: batchId, clientId: input.clientId, createdAt: new Date().toISOString(), status: "queued", items: [] };
    let createdCount = 0; let idempotentCount = 0;
    try {
      preview.items.forEach((item) => {
        if (item.status !== "queueable" && item.status !== "idempotent") { batch.items.push(Object.assign({}, item)); return; }
        if (item.status === "idempotent") { idempotentCount += 1; batch.items.push(Object.assign({}, item, { status: "queued", submissionBatchId: batchId })); return; }
        fs.mkdirSync(path.dirname(item.filePath), { recursive: true });
        const article = store.getArticle(input.clientId, item.articleId);
        const markdown = articleMarkdown(article);
        fs.writeFileSync(item.filePath, markdown, "utf8");
        fs.writeFileSync(item.sidecarPath, JSON.stringify({ submissionBatchId: batchId, generatedArticleId: article.id, clientId: article.clientId, targetPlatformId: item.targetPlatformId, contentHash: item.contentHash, status: "queued", queuedAt: batch.createdAt }, null, 2) + "\n", "utf8");
        createdCount += 1;
        batch.items.push(Object.assign({}, item, { status: "queued", submissionBatchId: batchId }));
      });
    } catch (error) {
      batch.items.filter((item) => item.submissionBatchId === batchId && item.status === "queued").forEach((item) => { try { fs.unlinkSync(item.filePath); } catch (_) {} try { fs.unlinkSync(item.sidecarPath); } catch (_) {} });
      throw error;
    }
    batchStore.save(batch);
    return Object.assign({ batchId, createdCount, idempotentCount, items: batch.items }, preview);
  }
  function cancelBatch(value) {
    if (!value || value.confirmed !== true || typeof value.batchId !== "string") throw batchError("CONTENT_SUBMISSION_CONFIRMATION_REQUIRED", "Batch confirmation is required");
    const batch = batchStore.get(value.batchId); let cancelledCount = 0; let skippedCount = 0;
    batch.items.forEach((item) => {
      if (item.status !== "queued" || !item.filePath) { skippedCount += 1; return; }
      let sidecar;
      try { sidecar = JSON.parse(fs.readFileSync(item.sidecarPath, "utf8")); } catch (_) { skippedCount += 1; return; }
      if (sidecar.submissionBatchId !== batch.id || !fs.existsSync(item.filePath) || hash(fs.readFileSync(item.filePath, "utf8")) !== item.contentHash) { item.status = "conflict"; skippedCount += 1; return; }
      fs.unlinkSync(item.filePath); fs.unlinkSync(item.sidecarPath); item.status = "cancelled"; cancelledCount += 1;
    });
    batch.status = batch.items.some((item) => item.status === "queued") ? "queued" : "cancelled";
    batch.updatedAt = new Date().toISOString(); batchStore.save(batch);
    return { batchId: batch.id, cancelledCount, skippedCount, items: batch.items };
  }
  function previewCancelBatch(value) {
    if (!value || typeof value.batchId !== "string") throw batchError("CONTENT_SUBMISSION_BATCH_INPUT_INVALID", "Batch id is required");
    const batch = batchStore.get(value.batchId);
    let cancelableCount = 0; let uncancelableCount = 0;
    const items = batch.items.map((item) => {
      const copy = Object.assign({}, item); delete copy.filePath; delete copy.sidecarPath;
      if (item.status !== "queued") { uncancelableCount += 1; return Object.assign(copy, { cancelable: false }); }
      try {
        const sidecar = JSON.parse(fs.readFileSync(item.sidecarPath, "utf8"));
        const valid = sidecar.submissionBatchId === batch.id && fs.existsSync(item.filePath) && hash(fs.readFileSync(item.filePath, "utf8")) === item.contentHash;
        if (valid) cancelableCount += 1; else uncancelableCount += 1;
        return Object.assign(copy, { cancelable: valid });
      } catch (_) { uncancelableCount += 1; return Object.assign(copy, { cancelable: false }); }
    });
    return { batchId: batch.id, cancelableCount, uncancelableCount, items };
  }
  function input(value) { if (!value || value.confirmed !== true || !value.clientId) { const e = new Error("Manual confirmation is required"); e.code = "CONTENT_EXPORT_CONFIRMATION_REQUIRED"; throw e; } return value; }
  function exporterFor(value) { return options.exporter || createSubmissionExportService({ rootDir: options.workspaceRoot, getArticle: function(id) { return store.getArticle(value.clientId, id); } }); }
  return { previewExport: function(value) { value = input(value); return exporterFor(value).previewExport(value); }, exportArticle: function(value) { value = input(value); return exporterFor(value).exportArticle(value); }, listPlatforms, previewBatch, createBatch, previewCancelBatch, cancelBatch, getBatch: function(batchId) { return batchStore.get(batchId); }, listBatches: function() { return batchStore.list(); } };
}
module.exports = { createContentSubmissionService };
