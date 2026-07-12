const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const TARGETS = ["media", "lieju", "toutiao", "hepan"];

function error(code, message) { const e = new Error(message); e.code = code; return e; }
function safeFilename(title, id) {
  const base = String(title || "article").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, "-").replace(/^[. -]+|[. -]+$/g, "").slice(0, 80) || "article";
  return base + "-" + String(id).replace(/[^a-zA-Z0-9_-]/g, "") + ".md";
}
function createSubmissionExportService(options) {
  const opts = options || {}; const root = opts.rootDir || process.env.AUTO_PUBLISH_WORKSPACE || process.cwd(); const getArticle = opts.getArticle;
  function prepare(input) {
    if (!input || input.confirmed !== true) throw error("CONTENT_EXPORT_CONFIRMATION_REQUIRED", "Manual confirmation is required");
    if (TARGETS.indexOf(input.targetPlatform) === -1) throw error("CONTENT_EXPORT_TARGET_INVALID", "Invalid export target");
    const article = getArticle(input.generatedArticleId);
    if (!article || article.status !== "saved") throw error("CONTENT_EXPORT_NOT_SAVED", "Only saved generated articles can be exported");
    const markdown = "# " + String(article.title || "") + "\n\n" + String(article.content || "").trim() + "\n";
    const hash = crypto.createHash("sha256").update(markdown).digest("hex"); const filename = safeFilename(article.title, article.id);
    const dir = path.join(root, "input", input.targetPlatform); const filePath = path.join(dir, filename); const sidecarPath = filePath + ".submission.json";
    return { article, markdown, hash, filename, dir, filePath, sidecarPath };
  }
  function previewExport(input) { const v = prepare(input); return { filename: v.filename, targetPlatform: input.targetPlatform, contentHash: v.hash, markdown: v.markdown, status: "queued" }; }
  function exportArticle(input) {
    const v = prepare(input); fs.mkdirSync(v.dir, { recursive: true });
    if (fs.existsSync(v.filePath) && fs.readFileSync(v.filePath, "utf8") !== v.markdown) throw error("CONTENT_EXPORT_CONFLICT", "Export file already exists with different content");
    const record = { generatedArticleId: v.article.id, clientId: v.article.clientId, targetPlatform: input.targetPlatform, filename: v.filename, contentHash: v.hash, exportedAt: new Date().toISOString(), status: "queued" };
    if (fs.existsSync(v.filePath)) {
      var validSidecar = false;
      try { var existing = JSON.parse(fs.readFileSync(v.sidecarPath, "utf8")); validSidecar = existing && existing.contentHash === v.hash && existing.generatedArticleId === v.article.id; } catch (_) {}
      if (!validSidecar) fs.writeFileSync(v.sidecarPath, JSON.stringify(record, null, 2), "utf8");
      return Object.assign({ filePath: v.filePath, sidecarPath: v.sidecarPath, idempotent: true }, record);
    }
    fs.writeFileSync(v.filePath, v.markdown, "utf8"); fs.writeFileSync(v.sidecarPath, JSON.stringify(record, null, 2), "utf8");
    return Object.assign({ filePath: v.filePath, sidecarPath: v.sidecarPath, idempotent: false }, record);
  }
  return { previewExport, exportArticle };
}
module.exports = { createSubmissionExportService, TARGETS };
