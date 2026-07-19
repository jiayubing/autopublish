const { it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"); const os = require("os"); const path = require("path");
const { createSubmissionExportService } = require("../src/content/submission-export-service");

function readyArticle(overrides) {
  return Object.assign({
    id: "saved", clientId: "client", title: "Title", content: "Body", status: "saved",
    source: { client_material: true, doubao_answer: true, references: false, template: true },
    materialSnapshots: [{ id: "material-1", name: "资料", extension: ".md", content: "资料", contentHash: "hash", source: "text" }],
    researchSnapshots: [{ questionId: "question-1", answerText: "回答", references: [], collectionMethod: "manual" }],
    templateSnapshot: { platform: "fixture", id: "template-1", name: "模板", scenario: "场景", body: "模板", bodyHash: "template-hash" }
  }, overrides || {});
}

it("exports only saved generated articles as idempotent queued Markdown with safe provenance", function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-export-"));
  try {
    const service = createSubmissionExportService({ rootDir: root, getArticle: function(id) {
      return id === "saved" ? readyArticle({ title: "标题", content: "正文" }) : readyArticle({ id: id, status: "draft" });
    } });
    const result = service.exportArticle({ generatedArticleId: "saved", targetPlatform: "media", confirmed: true });
    assert.equal(result.status, "queued");
    assert.match(fs.readFileSync(result.filePath, "utf8"), /^# 标题\r?\n\r?\n正文/);
    assert.deepStrictEqual(Object.keys(JSON.parse(fs.readFileSync(result.sidecarPath, "utf8"))).sort(), ["clientId", "contentHash", "exportedAt", "filename", "generatedArticleId", "status", "targetPlatform"]);
    assert.equal(service.exportArticle({ generatedArticleId: "saved", targetPlatform: "media", confirmed: true }).idempotent, true);
    fs.unlinkSync(result.sidecarPath);
    assert.equal(service.exportArticle({ generatedArticleId: "saved", targetPlatform: "media", confirmed: true }).idempotent, true);
    assert.ok(fs.existsSync(result.sidecarPath));
    assert.throws(function() { service.exportArticle({ generatedArticleId: "draft", targetPlatform: "media", confirmed: true }); }, { code: "CONTENT_EXPORT_NOT_READY" });
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
        return readyArticle();
      }
    });

    const result = service.exportArticle({ generatedArticleId: "saved", targetPlatform: "new-platform", confirmed: true });

    assert.equal(result.filePath, path.join(inputRoot, "new-platform", "Title-saved.md"));
    assert.equal(fs.existsSync(result.filePath), true);
    assert.equal(fs.existsSync(path.join(root, "input", "new-platform")), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it("reserves a declared publication target and records v2 sidecar identity", function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-export-ledger-"));
  try {
    const service = createSubmissionExportService({
      rootDir: root,
      getArticle: function() { return readyArticle(); }
    });
    const preview = service.previewExport({ generatedArticleId: "saved", targetPlatform: "toutiao", confirmed: true });
    assert.equal(preview.status, "queueable");
    const result = service.exportArticle({ generatedArticleId: "saved", targetPlatform: "toutiao", confirmed: true });
    const sidecar = JSON.parse(fs.readFileSync(result.sidecarPath, "utf8"));
    assert.equal(result.publicationId, sidecar.publicationId);
    assert.equal(result.attemptId, sidecar.attemptId);
    assert.equal(sidecar.articleKey, "generated:client:saved");
    assert.equal(sidecar.targetKey, "platform:toutiao");
    assert.equal(service.previewExport({ generatedArticleId: "saved", targetPlatform: "toutiao", confirmed: true }).status, "idempotent");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it("uses a media resource as the publication target when one is supplied", function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-export-resource-"));
  try {
    const service = createSubmissionExportService({
      rootDir: root,
      getArticle: function() { return readyArticle(); }
    });
    const result = service.exportArticle({ generatedArticleId: "saved", targetPlatform: "media", mediaResourceId: "1001", confirmed: true });
    const sidecar = JSON.parse(fs.readFileSync(result.sidecarPath, "utf8"));
    assert.equal(result.targetKey, "media-resource:1001");
    assert.equal(sidecar.targetKey, "media-resource:1001");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it("cancels an unsubmitted reservation when writing the queue pair fails", function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-export-write-failure-"));
  const originalRename = fs.renameSync;
  try {
    const service = createSubmissionExportService({
      rootDir: root,
      getArticle: function() { return readyArticle(); }
    });
    fs.renameSync = function(source, target) {
      if (String(target).endsWith(".submission.json")) throw new Error("simulated sidecar write failure");
      return originalRename(source, target);
    };
    assert.throws(function() { service.exportArticle({ generatedArticleId: "saved", targetPlatform: "toutiao", confirmed: true }); });
    fs.renameSync = originalRename;
    const records = require("../src/publication/publication-ledger").createPublicationLedger({ workspaceRoot: root }).list();
    assert.equal(records.length, 1);
    assert.equal(records[0].status, "cancelled");
    const queueDir = path.join(root, ".autopublish", "input", "toutiao");
    assert.equal(fs.existsSync(path.join(queueDir, "Title-saved.md")), false);
    assert.equal(fs.existsSync(path.join(queueDir, "Title-saved.md.submission.json")), false);
  } finally {
    fs.renameSync = originalRename;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
