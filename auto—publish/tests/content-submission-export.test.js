const { it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"); const os = require("os"); const path = require("path");
const { createSubmissionExportService } = require("../src/content/submission-export-service");

it("exports only saved generated articles as idempotent queued Markdown with safe provenance", function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-export-"));
  try {
    const service = createSubmissionExportService({ rootDir: root, getArticle: function(id) {
      return id === "saved" ? { id: "saved", clientId: "client", title: "标题", content: "正文", status: "saved" } : { id: id, status: "draft" };
    } });
    const result = service.exportArticle({ generatedArticleId: "saved", targetPlatform: "media", confirmed: true });
    assert.equal(result.status, "queued");
    assert.match(fs.readFileSync(result.filePath, "utf8"), /^# 标题\r?\n\r?\n正文/);
    assert.deepStrictEqual(Object.keys(JSON.parse(fs.readFileSync(result.sidecarPath, "utf8"))).sort(), ["clientId", "contentHash", "exportedAt", "filename", "generatedArticleId", "status", "targetPlatform"]);
    assert.equal(service.exportArticle({ generatedArticleId: "saved", targetPlatform: "media", confirmed: true }).idempotent, true);
    fs.unlinkSync(result.sidecarPath);
    assert.equal(service.exportArticle({ generatedArticleId: "saved", targetPlatform: "media", confirmed: true }).idempotent, true);
    assert.ok(fs.existsSync(result.sidecarPath));
    assert.throws(function() { service.exportArticle({ generatedArticleId: "draft", targetPlatform: "media", confirmed: true }); }, { code: "CONTENT_EXPORT_NOT_SAVED" });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it("uses the injected portable input root and accepts declared dynamic platforms", function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-export-portable-"));
  try {
    const inputRoot = path.join(root, ".autopublish", "input");
    const service = createSubmissionExportService({
      rootDir: root,
      paths: { input: inputRoot },
      platforms: [{ id: "new-platform", scanDir: "new-platform", contentQueueImport: true }],
      getArticle: function() {
        return { id: "saved", clientId: "client", title: "Title", content: "Body", status: "saved" };
      }
    });

    const result = service.exportArticle({ generatedArticleId: "saved", targetPlatform: "new-platform", confirmed: true });

    assert.equal(result.filePath, path.join(inputRoot, "new-platform", "Title-saved.md"));
    assert.equal(fs.existsSync(result.filePath), true);
    assert.equal(fs.existsSync(path.join(root, "input", "new-platform")), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
