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
  const inputRoot = path.resolve(opts.paths && opts.paths.input || path.join(root, ".autopublish", "input"));
  const platforms = Array.isArray(opts.platforms) && opts.platforms.length ? opts.platforms : TARGETS.map(function(id) { return { id: id, scanDir: id, contentQueueImport: true }; });
  const platformMap = new Map(platforms.map(function(platform) { return [platform.id, platform]; }));
  function prepare(input) {
    if (!input || input.confirmed !== true) throw error("CONTENT_EXPORT_CONFIRMATION_REQUIRED", "Manual confirmation is required");
    const platform = platformMap.get(input.targetPlatform);
    if (!platform || platform.contentQueueImport !== true) throw error("CONTENT_EXPORT_TARGET_INVALID", "Invalid export target");
    const article = getArticle(input.generatedArticleId);
    if (!article || article.status !== "saved") throw error("CONTENT_EXPORT_NOT_SAVED", "Only saved generated articles can be exported");
    const markdown = "# " + String(article.title || "") + "\n\n" + String(article.content || "").trim() + "\n";
    const hash = crypto.createHash("sha256").update(markdown).digest("hex"); const filename = safeFilename(article.title, article.id);
    const dir = path.join(inputRoot, platform.scanDir || platform.id); const filePath = path.join(dir, filename); const sidecarPath = filePath + ".submission.json";
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
      if (!validSidecar) writeAtomic(v.sidecarPath, JSON.stringify(record, null, 2) + "\n");
      return Object.assign({ filePath: v.filePath, sidecarPath: v.sidecarPath, idempotent: true }, record);
    }
    writePairAtomic(v.filePath, v.markdown, v.sidecarPath, JSON.stringify(record, null, 2) + "\n");
    return Object.assign({ filePath: v.filePath, sidecarPath: v.sidecarPath, idempotent: false }, record);
  }
  return { previewExport, exportArticle };
}

function writeAtomic(filename, content) {
  const temporary = filename + ".tmp-" + process.pid + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  try { fs.writeFileSync(temporary, content, "utf8"); fs.renameSync(temporary, filename); }
  finally { try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch (_) {} }
}

function writePairAtomic(filePath, markdown, sidecarPath, sidecar) {
  const token = process.pid + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  const markdownTemp = filePath + ".tmp-" + token;
  const sidecarTemp = sidecarPath + ".tmp-" + token;
  let markdownMoved = false;
  let sidecarMoved = false;
  try {
    fs.writeFileSync(markdownTemp, markdown, "utf8");
    fs.writeFileSync(sidecarTemp, sidecar, "utf8");
    fs.renameSync(markdownTemp, filePath); markdownMoved = true;
    fs.renameSync(sidecarTemp, sidecarPath); sidecarMoved = true;
  } catch (error) {
    try { if (sidecarMoved) fs.unlinkSync(sidecarPath); } catch (_) {}
    try { if (markdownMoved) fs.unlinkSync(filePath); } catch (_) {}
    throw error;
  } finally {
    try { if (fs.existsSync(markdownTemp)) fs.unlinkSync(markdownTemp); } catch (_) {}
    try { if (fs.existsSync(sidecarTemp)) fs.unlinkSync(sidecarTemp); } catch (_) {}
  }
}
module.exports = { createSubmissionExportService, TARGETS };
